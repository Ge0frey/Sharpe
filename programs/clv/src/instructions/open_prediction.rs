use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, PREDICTION_SEED};
use crate::error::ClvError;
use crate::market::{derive_terms, prob_bps};
use crate::state::{Config, MarketKind, PredStatus, Prediction, PredictionOpened};
use crate::txoracle::program::Txoracle;
use crate::txoracle::types::{Odds, OddsBatchSummary, ProofNode};

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct OpenPrediction<'info> {
    #[account(mut)]
    pub predictor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = predictor,
        space = 8 + Prediction::INIT_SPACE,
        seeds = [PREDICTION_SEED, predictor.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub prediction: Account<'info, Prediction>,
    /// CHECK: The daily odds Merkle roots PDA; validated inside txoracle by its seeds/owner.
    pub daily_odds_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, Txoracle>,
    pub system_program: Program<'info, System>,
}

/// Open a prediction and prove the entry line is authentic (CPI validate_odds).
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<OpenPrediction>,
    id: u64,
    fixture_id: i64,
    market: MarketKind,
    selection: u8,
    line_x10: i16,
    price_index: u8,
    entry_ts: i64,
    odds: Odds,
    summary: OddsBatchSummary,
    sub_tree_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
) -> Result<()> {
    // Bind the supplied odds record to this prediction before proving it.
    require!(odds.fixture_id == fixture_id, ClvError::FixtureMismatch);
    require!(odds.ts == entry_ts, ClvError::TimestampMismatch);
    let idx = price_index as usize;
    require!(idx < odds.prices.len(), ClvError::InvalidPriceIndex);
    let price = odds.prices[idx];
    let terms = derive_terms(market, selection, line_x10)?;

    // Prove the entry line against the on-chain odds Merkle root.
    let txp = ctx.accounts.txoracle_program.to_account_info();
    let root = ctx.accounts.daily_odds_merkle_roots.to_account_info();
    let ok = crate::cpi::validate_odds(&txp, &root, entry_ts, &odds, &summary, &sub_tree_proof, &main_tree_proof)?;
    require!(ok, ClvError::OddsProofRejected);

    let entry_prob_bps = prob_bps(price)?;
    let now = Clock::get()?.unix_timestamp;
    let bump = ctx.bumps.prediction;

    {
        let config = &mut ctx.accounts.config;
        config.prediction_count = config.prediction_count.saturating_add(1);
    }

    let p = &mut ctx.accounts.prediction;
    p.predictor = ctx.accounts.predictor.key();
    p.id = id;
    p.fixture_id = fixture_id;
    p.market = market;
    p.selection = selection;
    p.line_x10 = line_x10;
    p.stat_a_key = terms.stat_a_key;
    p.stat_b_key = terms.stat_b_key;
    p.op_add = terms.op_add;
    p.comparison = terms.comparison;
    p.threshold = terms.threshold;
    p.entry_ts = entry_ts;
    p.entry_prob_bps = entry_prob_bps;
    p.close_ts = 0;
    p.close_prob_bps = 0;
    p.clv_bps = 0;
    p.outcome_win = false;
    p.status = PredStatus::EntryProven;
    p.created_at = now;
    p.settled_at = 0;
    p.bump = bump;

    emit!(PredictionOpened { predictor: p.predictor, id, fixture_id, entry_prob_bps, entry_ts });
    Ok(())
}
