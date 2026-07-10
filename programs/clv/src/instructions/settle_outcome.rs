use anchor_lang::prelude::*;

use crate::constants::PREDICTION_SEED;
use crate::error::ClvError;
use crate::market::comparison_ty;
use crate::state::{PredStatus, Prediction, PredictionSettled};
use crate::txoracle::program::Txoracle;
use crate::txoracle::types::{BinaryExpression, ProofNode, ScoresBatchSummary, StatTerm, TraderPredicate};

#[derive(Accounts)]
pub struct SettleOutcome<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(
        mut,
        seeds = [PREDICTION_SEED, prediction.predictor.as_ref(), &prediction.id.to_le_bytes()],
        bump = prediction.bump
    )]
    pub prediction: Account<'info, Prediction>,
    /// CHECK: The daily scores Merkle roots PDA; validated inside txoracle by its seeds/owner.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, Txoracle>,
}

/// Prove the match outcome (CPI validate_stat) using the predicate stored at open.
///
/// The caller supplies proven stats and their Merkle branches; it does *not* get to
/// choose what is being asked. Keys, operator, comparison and threshold all come
/// from the Prediction account, so settlement is a pure function of the on-chain
/// root and the terms fixed when the bet was made.
pub fn handler(
    ctx: Context<SettleOutcome>,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
) -> Result<()> {
    let (status, fixture_id, sa_key, sb_key, has_stat_b, op_add, comparison, threshold) = {
        let p = &ctx.accounts.prediction;
        (p.status, p.fixture_id, p.stat_a_key, p.stat_b_key, p.has_stat_b, p.op_add, p.comparison, p.threshold)
    };
    require!(status == PredStatus::Closed, ClvError::BadState);
    require!(fixture_summary.fixture_id == fixture_id, ClvError::FixtureMismatch);
    require!(stat_a.stat_to_prove.key == sa_key, ClvError::StatKeyMismatch);

    // Single-stat markets (TeamTotal) pass `None`; two-stat markets must pass the
    // exact second key stored at open.
    let (stat_b_opt, op_opt) = if has_stat_b {
        let b = stat_b.ok_or(error!(ClvError::MissingSecondStat))?;
        require!(b.stat_to_prove.key == sb_key, ClvError::StatKeyMismatch);
        let op = if op_add { BinaryExpression::Add } else { BinaryExpression::Subtract };
        (Some(b), Some(op))
    } else {
        require!(stat_b.is_none(), ClvError::UnexpectedSecondStat);
        (None, None)
    };

    let predicate = TraderPredicate { threshold, comparison: comparison_ty(comparison) };
    let txp = ctx.accounts.txoracle_program.to_account_info();
    let root = ctx.accounts.daily_scores_merkle_roots.to_account_info();
    let win = crate::cpi::validate_stat(
        &txp, &root, ts, &fixture_summary, &fixture_proof, &main_tree_proof, &predicate, &stat_a, &stat_b_opt, &op_opt,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let p = &mut ctx.accounts.prediction;
    p.outcome_win = win;
    p.status = PredStatus::Settled;
    p.settled_at = now;
    emit!(PredictionSettled {
        predictor: p.predictor,
        id: p.id,
        outcome_win: win,
        clv_bps: p.clv_bps,
        entry_prob_bps: p.entry_prob_bps,
        close_prob_bps: p.close_prob_bps,
        ranked: p.ranked,
    });
    Ok(())
}
