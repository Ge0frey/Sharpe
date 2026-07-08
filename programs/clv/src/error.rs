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
}
