use anchor_lang::prelude::*;

use crate::constants::PREDICTION_SEED;
use crate::error::ClvError;
use crate::state::{PredStatus, Prediction};

#[derive(Accounts)]
pub struct VoidPrediction<'info> {
    #[account(mut)]
    pub predictor: Signer<'info>,
    #[account(
        mut,
        close = predictor,
        has_one = predictor,
        seeds = [PREDICTION_SEED, predictor.key().as_ref(), &prediction.id.to_le_bytes()],
        bump = prediction.bump
    )]
    pub prediction: Account<'info, Prediction>,
}

/// Reclaim rent for an unsettled prediction (e.g. no data / abandoned).
pub fn handler(ctx: Context<VoidPrediction>) -> Result<()> {
    require!(ctx.accounts.prediction.status != PredStatus::Settled, ClvError::BadState);
    Ok(())
}
