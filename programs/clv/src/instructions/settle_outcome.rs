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
pub fn handler(
    ctx: Context<SettleOutcome>,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
) -> Result<()> {
    let (status, sa_key, sb_key, op_add, comparison, threshold) = {
        let p = &ctx.accounts.prediction;
        (p.status, p.stat_a_key, p.stat_b_key, p.op_add, p.comparison, p.threshold)
    };
    require!(status == PredStatus::Closed, ClvError::BadState);
    // The caller supplies proven stats, but the predicate/keys are what we stored at open.
    require!(stat_a.stat_to_prove.key == sa_key, ClvError::StatKeyMismatch);
    let stat_b = stat_b.ok_or(error!(ClvError::MissingSecondStat))?;
    require!(stat_b.stat_to_prove.key == sb_key, ClvError::StatKeyMismatch);

    let predicate = TraderPredicate { threshold, comparison: comparison_ty(comparison) };
    let op = if op_add { BinaryExpression::Add } else { BinaryExpression::Subtract };

    let stat_b_opt = Some(stat_b);
    let op_opt = Some(op);
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
    });
    Ok(())
}
