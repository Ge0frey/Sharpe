use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub txoracle_program: Pubkey,
    pub prediction_count: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketKind {
    Result1x2,
    TotalsOu,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PredStatus {
    Open,
    EntryProven,
    Closed,
    Settled,
    Void,
}

/// A single CLV prediction. Entry/close implied probabilities and the outcome
/// are all written only after a txoracle Merkle proof verifies.
#[account]
#[derive(InitSpace)]
pub struct Prediction {
    pub predictor: Pubkey,
    pub id: u64,
    pub fixture_id: i64,
    pub market: MarketKind,
    pub selection: u8,
    pub line_x10: i16,
    // deterministic settlement terms, derived at open
    pub stat_a_key: u32,
    pub stat_b_key: u32,
    pub op_add: bool,
    pub comparison: u8,
    pub threshold: i32,
    // entry (proven via validate_odds)
    pub entry_ts: i64,
    pub entry_prob_bps: u32,
    // close (proven via validate_odds)
    pub close_ts: i64,
    pub close_prob_bps: u32,
    // result
    pub clv_bps: i32,
    pub outcome_win: bool,
    pub status: PredStatus,
    pub created_at: i64,
    pub settled_at: i64,
    pub bump: u8,
}

#[event]
pub struct PredictionOpened {
    pub predictor: Pubkey,
    pub id: u64,
    pub fixture_id: i64,
    pub entry_prob_bps: u32,
    pub entry_ts: i64,
}

#[event]
pub struct PredictionClosed {
    pub predictor: Pubkey,
    pub id: u64,
    pub close_prob_bps: u32,
    pub clv_bps: i32,
}

#[event]
pub struct PredictionSettled {
    pub predictor: Pubkey,
    pub id: u64,
    pub outcome_win: bool,
    pub clv_bps: i32,
    pub entry_prob_bps: u32,
    pub close_prob_bps: u32,
}
