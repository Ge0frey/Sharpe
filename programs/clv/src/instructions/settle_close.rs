use anchor_lang::prelude::*;

use crate::constants::PREDICTION_SEED;
use crate::error::ClvError;
use crate::market::prob_bps;
use crate::state::{PredStatus, Prediction, PredictionClosed};
use crate::txoracle::program::Txoracle;
use crate::txoracle::types::{Odds, OddsBatchSummary, ProofNode};

#[derive(Accounts)]
pub struct SettleClose<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,
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

/// Prove the closing line (CPI validate_odds) and record CLV = close - entry.
pub fn handler(
    ctx: Context<SettleClose>,
    close_ts: i64,
    price_index: u8,
    odds: Odds,
    summary: OddsBatchSummary,
    sub_tree_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
) -> Result<()> {
    let (status, fixture_id, entry_prob_bps) = {
        let p = &ctx.accounts.prediction;
        (p.status, p.fixture_id, p.entry_prob_bps)
    };
    require!(status == PredStatus::EntryProven, ClvError::BadState);
    require!(odds.fixture_id == fixture_id, ClvError::FixtureMismatch);
    require!(odds.ts == close_ts, ClvError::TimestampMismatch);
    let idx = price_index as usize;
    require!(idx < odds.prices.len(), ClvError::InvalidPriceIndex);
    let price = odds.prices[idx];

    let txp = ctx.accounts.txoracle_program.to_account_info();
    let root = ctx.accounts.daily_odds_merkle_roots.to_account_info();
    let ok = crate::cpi::validate_odds(&txp, &root, close_ts, &odds, &summary, &sub_tree_proof, &main_tree_proof)?;
    require!(ok, ClvError::OddsProofRejected);

    let close_prob_bps = prob_bps(price)?;
    let clv_bps = (close_prob_bps as i32)
        .checked_sub(entry_prob_bps as i32)
        .ok_or(error!(ClvError::Overflow))?;

    let p = &mut ctx.accounts.prediction;
    p.close_ts = close_ts;
    p.close_prob_bps = close_prob_bps;
    p.clv_bps = clv_bps;
    p.status = PredStatus::Closed;
    emit!(PredictionClosed { predictor: p.predictor, id: p.id, close_prob_bps, clv_bps });
    Ok(())
}
