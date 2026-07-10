use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub txoracle_program: Pubkey,
    pub prediction_count: u64,
    pub bump: u8,
}

/// Which stat family a market resolves against. Base keys per participant:
/// goals 1/2, yellows 3/4, reds 5/6, corners 7/8 (soccer).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum StatFamily {
    Goals,
    Yellows,
    Reds,
    Corners,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketKind {
    /// (P1 − P2) vs 0. Priced by `1X2_PARTICIPANT_RESULT`.
    Result1x2,
    /// (P1 + P2) goals vs a half-integer line. Priced by `OVERUNDER_PARTICIPANT_GOALS`.
    TotalsOu,
    /// (P1 + P2) of any family vs a line. Unpriced — duels only (e.g. combined corners).
    CombinedTotal,
    /// One participant's stat vs a line. Unpriced — duels only.
    TeamTotal,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PredStatus {
    Open,
    EntryProven,
    Closed,
    Settled,
    Void,
}

/// Kickoff time and identity for one fixture, proven once via `validate_fixture`
/// and then reused by every prediction on that fixture.
///
/// Write-once by construction (`init`, never `init_if_needed`): the kickoff a
/// prediction was judged against can never be rewritten underneath it.
#[account]
#[derive(InitSpace)]
pub struct FixtureFacts {
    /// The public id `/odds` and `/scores` key off, taken from `summary.fixture_id`,
    /// which the Merkle proof binds to the snapshot.
    pub fixture_id: i64,
    /// PROVEN kickoff — the anchor for every timing guard in this program.
    pub start_time: i64,
    pub participant1_id: i32,
    pub participant2_id: i32,
    pub competition_id: i32,
    pub proven_at: i64,
    pub bump: u8,
}

/// A single CLV prediction. Entry/close implied probabilities and the outcome are
/// all written only after a txoracle Merkle proof verifies.
#[account]
#[derive(InitSpace)]
pub struct Prediction {
    pub predictor: Pubkey,
    pub id: u64,
    pub fixture_id: i64,
    pub market: MarketKind,
    pub family: StatFamily,
    pub period: u16,
    pub selection: u8,
    pub line_x10: i16,
    // deterministic settlement terms, derived once at open
    pub stat_a_key: u32,
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    pub op_add: bool,
    pub comparison: u8,
    pub threshold: i32,
    // entry: committed at open, proven later via validate_odds
    pub entry_ts: i64,
    /// sha256 of the entry odds record's `MessageId`. Pins *which* quote was taken,
    /// so `prove_entry` cannot substitute a different record sharing the same ts.
    pub entry_msg_hash: [u8; 32],
    pub entry_prob_bps: u32,
    /// True iff the predictor committed *before* the proven kickoff, in real
    /// wall-clock. Unranked predictions still settle; they just don't score.
    pub ranked: bool,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DuelStatus {
    /// Created, waiting for someone to take the other side.
    Open,
    /// Both stakes escrowed. Locked until the result is proven.
    Matched,
    /// The predicate has been proven against the scores root. Funds not yet moved.
    Resolved,
    /// Winner paid, vault closed.
    Settled,
    /// Never matched; creator's stake returned.
    Cancelled,
    /// Matched but never provable; both stakes returned.
    Refunded,
}

/// A head-to-head wager on any stat predicate, escrowed in a neutral vault and
/// released by a Merkle proof. No admin, no oracle, no rake.
///
/// This is the surface for markets no bookmaker lists — combined corners, cards,
/// per-half totals — because it needs only `validate_stat`, never a consensus line.
///
/// Note the stake is **never TxL**: the TxLINE credit token is locked to its own
/// program for data authorisation and may not be transferred peer-to-peer.
#[account]
#[derive(InitSpace)]
pub struct Duel {
    pub duel_id: u64,
    pub fixture_id: i64,
    pub creator: Pubkey,
    /// `Pubkey::default()` until someone joins.
    pub taker: Pubkey,
    pub stake_mint: Pubkey,
    /// Each side stakes this; the winner takes both.
    pub stake_amount: u64,
    // the bet
    pub market: MarketKind,
    pub family: StatFamily,
    pub period: u16,
    pub selection: u8,
    pub line_x10: i16,
    // deterministic settlement terms, derived once at create
    pub stat_a_key: u32,
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    pub op_add: bool,
    pub comparison: u8,
    pub threshold: i32,
    /// The creator wins iff the proven predicate equals this.
    pub creator_takes_true: bool,
    /// Written by `resolve_duel` from the CPI's return value. Meaningless until Resolved.
    pub outcome_true: bool,
    pub status: DuelStatus,
    /// The PROVEN kickoff. A duel cannot be created or joined past it.
    pub expires_at: i64,
    pub created_at: i64,
    pub settled_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[event]
pub struct DuelCreated {
    pub duel_id: u64,
    pub fixture_id: i64,
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    pub stake_amount: u64,
    pub creator_takes_true: bool,
}

#[event]
pub struct DuelJoined {
    pub duel_id: u64,
    pub taker: Pubkey,
}

#[event]
pub struct DuelResolved {
    pub duel_id: u64,
    pub outcome_true: bool,
    pub winner: Pubkey,
}

#[event]
pub struct DuelSettled {
    pub duel_id: u64,
    pub winner: Pubkey,
    pub payout: u64,
}

#[event]
pub struct FixtureProven {
    pub fixture_id: i64,
    pub start_time: i64,
    pub prover: Pubkey,
}

#[event]
pub struct PredictionOpened {
    pub predictor: Pubkey,
    pub id: u64,
    pub fixture_id: i64,
    pub entry_ts: i64,
    pub ranked: bool,
}

#[event]
pub struct EntryProven {
    pub predictor: Pubkey,
    pub id: u64,
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
    pub ranked: bool,
}
