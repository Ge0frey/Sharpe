use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, FIXTURE_SEED, PREDICTION_SEED};
use crate::error::ClvError;
use crate::market::{derive_terms, is_priced_market};
use crate::state::{
    Config, FixtureFacts, MarketKind, PredStatus, Prediction, PredictionOpened, StatFamily,
};

/// TxLINE timestamps (`Fixture.start_time`, `Odds.ts`) are epoch **milliseconds**;
/// `Clock::unix_timestamp` is epoch **seconds**. Every comparison below is in ms.
pub fn now_ms() -> Result<i64> {
    Clock::get()?
        .unix_timestamp
        .checked_mul(1000)
        .ok_or(error!(ClvError::Overflow))
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct OpenPrediction<'info> {
    #[account(mut)]
    pub predictor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [FIXTURE_SEED, &fixture_facts.fixture_id.to_le_bytes()],
        bump = fixture_facts.bump
    )]
    pub fixture_facts: Account<'info, FixtureFacts>,
    #[account(
        init,
        payer = predictor,
        space = 8 + Prediction::INIT_SPACE,
        seeds = [PREDICTION_SEED, predictor.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub prediction: Account<'info, Prediction>,
    pub system_program: Program<'info, System>,
}

/// Commit to a call. No proof, no CPI — this is the moment of *commitment*, and it
/// must be cheap and always available.
///
/// The entry line is proven separately by `prove_entry`, because the odds Merkle
/// root covering the quote you just took is not published until the next 5-minute
/// batch. Proving at open would therefore make it impossible to open a prediction
/// on a match that has not started — which is the only kind of prediction that
/// counts.
///
/// Two things are fixed here and never revisited:
///   * `entry_ts < start_time` — a line quoted after the proven kickoff is not a call;
///   * `ranked = now < start_time` — did the predictor commit before kickoff, in real
///     wall-clock? Replayed and backtested predictions still settle, but do not score.
#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<OpenPrediction>,
    id: u64,
    fixture_id: i64,
    market: MarketKind,
    family: StatFamily,
    period: u16,
    selection: u8,
    line_x10: i16,
    entry_ts: i64,
    entry_msg_hash: [u8; 32],
) -> Result<()> {
    let start_time = ctx.accounts.fixture_facts.start_time;
    require!(ctx.accounts.fixture_facts.fixture_id == fixture_id, ClvError::FixtureMismatch);
    // Only markets a consensus line prices can carry CLV; corners/cards live on duels.
    require!(is_priced_market(market), ClvError::MarketHasNoOddsLine);
    require!(entry_ts < start_time, ClvError::EntryAfterKickoff);

    // Validates the (market, selection, line, period, family) combination and fixes
    // the settlement predicate for good.
    let terms = derive_terms(market, selection, line_x10, period, family)?;

    let now = now_ms()?;
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
    p.family = family;
    p.period = period;
    p.selection = selection;
    p.line_x10 = line_x10;
    p.stat_a_key = terms.stat_a_key;
    p.stat_b_key = terms.stat_b_key;
    p.has_stat_b = terms.has_stat_b;
    p.op_add = terms.op_add;
    p.comparison = terms.comparison;
    p.threshold = terms.threshold;
    p.entry_ts = entry_ts;
    p.entry_msg_hash = entry_msg_hash;
    p.entry_prob_bps = 0;
    p.ranked = now < start_time;
    p.close_ts = 0;
    p.close_prob_bps = 0;
    p.clv_bps = 0;
    p.outcome_win = false;
    p.status = PredStatus::Open;
    p.created_at = now;
    p.settled_at = 0;
    p.bump = bump;

    emit!(PredictionOpened { predictor: p.predictor, id, fixture_id, entry_ts, ranked: p.ranked });
    Ok(())
}
