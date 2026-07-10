use anchor_lang::prelude::*;

#[error_code]
pub enum ClvError {
    #[msg("Odds proof rejected by txoracle")]
    OddsProofRejected,
    #[msg("Stat proof rejected by txoracle")]
    StatProofRejected,
    #[msg("Odds record fixture does not match prediction")]
    FixtureMismatch,
    #[msg("Record timestamp does not match argument")]
    TimestampMismatch,
    #[msg("Invalid market kind")]
    InvalidMarket,
    #[msg("Invalid selection for market")]
    InvalidSelection,
    #[msg("Invalid price index")]
    InvalidPriceIndex,
    #[msg("Price must be positive")]
    InvalidPrice,
    #[msg("Stat key does not match prediction terms")]
    StatKeyMismatch,
    #[msg("Second stat required for this market")]
    MissingSecondStat,
    #[msg("Prediction is not in the required state")]
    BadState,
    #[msg("Arithmetic overflow")]
    Overflow,

    // ── fixture proof ──
    #[msg("Fixture proof rejected by txoracle")]
    FixtureProofRejected,
    #[msg("Proven fixture record does not match the requested fixture id")]
    FixtureIdMismatch,

    // ── odds-record binding: the proof is valid but prices the wrong market ──
    #[msg("Odds record is for a different market type")]
    MarketTypeMismatch,
    #[msg("Odds record is for a different match period")]
    MarketPeriodMismatch,
    #[msg("Odds record line does not match the prediction line")]
    LineMismatch,
    #[msg("Line is not settleable as a single predicate (whole or quarter line)")]
    UnsupportedLine,
    #[msg("Price index does not name the selected outcome")]
    PriceNameMismatch,
    #[msg("This market has no consensus odds line and cannot carry CLV")]
    MarketHasNoOddsLine,
    #[msg("Market cannot be resolved against this stat family")]
    MarketFamilyMismatch,
    #[msg("Unsupported match period")]
    UnsupportedPeriod,

    // ── timing, anchored to the proven kickoff ──
    #[msg("Entry line is timestamped at or after the proven kickoff")]
    EntryAfterKickoff,
    #[msg("Closing line is timestamped after the proven kickoff")]
    CloseAfterKickoff,
    #[msg("Closing line was quoted in-play; it is not a closing line")]
    LineIsInPlay,
    #[msg("Second stat supplied for a single-stat market")]
    UnexpectedSecondStat,
    #[msg("Odds record is not the quote this prediction was opened against")]
    EntryRecordMismatch,

    // ── duels ──
    #[msg("Stake must be greater than zero")]
    InvalidStake,
    #[msg("The fixture has kicked off; this duel can no longer be created or joined")]
    DuelExpired,
    #[msg("A duel needs two sides")]
    SelfDuel,
    #[msg("Stake mint does not match the duel")]
    StakeMintMismatch,
    #[msg("Account is not the winner implied by the proven outcome")]
    WrongWinner,
    #[msg("The refund grace period has not elapsed")]
    RefundTooEarly,
}
