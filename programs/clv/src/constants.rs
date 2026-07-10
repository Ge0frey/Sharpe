use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const PREDICTION_SEED: &[u8] = b"prediction";

#[constant]
pub const FIXTURE_SEED: &[u8] = b"fixture";

#[constant]
pub const DUEL_SEED: &[u8] = b"duel";

#[constant]
pub const DUEL_VAULT_SEED: &[u8] = b"duel_vault";

/// How long after kickoff a matched duel must wait before both sides may take
/// their stake back. Long enough that a late scores root still settles normally;
/// short enough that funds are never trapped.
pub const DUEL_REFUND_GRACE_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// The TxLINE `Fixture` record packs a sport tag in the high bits and the public
/// fixture id (the one /odds and /scores key off) in the low 48. Observed sport
/// tag 3 on a finished R32 fixture and 1 on the upcoming ones, so only the low
/// 48 bits may be compared against the id a Prediction is keyed by.
pub const FIXTURE_ID_MASK: i64 = (1i64 << 48) - 1;

/// Match period. The stat key encodes it as `period * 1000 + base_key`; the odds
/// record carries it as `MarketPeriod` (`null` for full match, `half=1` for H1).
pub const PERIOD_FULL: u16 = 0;
pub const PERIOD_H1: u16 = 1;
pub const PERIOD_H2: u16 = 2;

/// Comparison codes stored on-chain, mirrored into `txoracle::types::Comparison`.
pub const CMP_GT: u8 = 0;
pub const CMP_LT: u8 = 1;
pub const CMP_EQ: u8 = 2;
