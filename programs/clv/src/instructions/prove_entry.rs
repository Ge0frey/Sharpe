use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::PREDICTION_SEED;
use crate::error::ClvError;
use crate::market::{bind_odds, prob_bps};
use crate::state::{EntryProven, PredStatus, Prediction};
use crate::txoracle::program::Txoracle;
use crate::txoracle::types::{Odds, OddsBatchSummary, ProofNode};

#[derive(Accounts)]
pub struct ProveEntry<'info> {
    /// Permissionless: the predictor, a keeper, or anyone may land the proof.
    /// It can only ever write the one price the record commits to.
    #[account(mut)]
    pub prover: Signer<'info>,
    #[account(
        mut,
        seeds = [PREDICTION_SEED, prediction.predictor.as_ref(), &prediction.id.to_le_bytes()],
        bump = prediction.bump
    )]
    pub prediction: Account<'info, Prediction>,
    /// CHECK: The daily odds Merkle roots PDA; validated inside txoracle by its seeds/owner.
    pub daily_odds_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, Txoracle>,
}

/// Prove the entry line the predictor committed to (CPI validate_odds).
///
/// Deferred from `open_prediction` on purpose: the odds root covering a given quote
/// is only published in the next 5-minute batch, so at commitment time there is
/// nothing to prove against yet. A keeper lands this once the root appears.
///
/// The prediction pinned `entry_ts` and `entry_msg_hash` at open, so the prover has
/// no freedom: only the exact quote that was taken can satisfy both, and `bind_odds`
/// insists that quote prices the market that was bet.
pub fn handler(
    ctx: Context<ProveEntry>,
    price_index: u8,
    odds: Odds,
    summary: OddsBatchSummary,
    sub_tree_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
) -> Result<()> {
    let (status, fixture_id, entry_ts, entry_msg_hash, market, selection, period, line_x10) = {
        let p = &ctx.accounts.prediction;
        (p.status, p.fixture_id, p.entry_ts, p.entry_msg_hash, p.market, p.selection, p.period, p.line_x10)
    };
    require!(status == PredStatus::Open, ClvError::BadState);
    require!(odds.fixture_id == fixture_id, ClvError::FixtureMismatch);
    require!(odds.ts == entry_ts, ClvError::TimestampMismatch);
    require!(
        hash(odds.message_id.as_bytes()).to_bytes() == entry_msg_hash,
        ClvError::EntryRecordMismatch
    );

    // Bind the record to the market before spending a verifier CPI on it.
    let price = bind_odds(&odds, market, selection, period, line_x10, price_index)?;

    let txp = ctx.accounts.txoracle_program.to_account_info();
    let root = ctx.accounts.daily_odds_merkle_roots.to_account_info();
    let ok = crate::cpi::validate_odds(&txp, &root, entry_ts, &odds, &summary, &sub_tree_proof, &main_tree_proof)?;
    require!(ok, ClvError::OddsProofRejected);

    let entry_prob_bps = prob_bps(price)?;
    let p = &mut ctx.accounts.prediction;
    p.entry_prob_bps = entry_prob_bps;
    p.status = PredStatus::EntryProven;
    emit!(EntryProven { predictor: p.predictor, id: p.id, entry_prob_bps, entry_ts });
    Ok(())
}
