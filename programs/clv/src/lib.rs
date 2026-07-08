pub mod constants;
pub mod cpi;
pub mod error;
pub mod instructions;
pub mod market;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

// Generate the txoracle CPI client + types from the vendored IDL (idls/txoracle.json).
declare_program!(txoracle);

// Re-export the txoracle CPI arg types at crate root so the #[program] fn
// signatures (and the macro-generated `instruction` module) can resolve them.
pub use txoracle::types::{Odds, OddsBatchSummary, ProofNode, ScoresBatchSummary, StatTerm};

declare_id!("734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz");

#[program]
pub mod clv {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handler(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn open_prediction(
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
        instructions::open_prediction::handler(
            ctx, id, fixture_id, market, selection, line_x10, price_index, entry_ts, odds, summary,
            sub_tree_proof, main_tree_proof,
        )
    }

    pub fn settle_close(
        ctx: Context<SettleClose>,
        close_ts: i64,
        price_index: u8,
        odds: Odds,
        summary: OddsBatchSummary,
        sub_tree_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
    ) -> Result<()> {
        instructions::settle_close::handler(ctx, close_ts, price_index, odds, summary, sub_tree_proof, main_tree_proof)
    }

    pub fn settle_outcome(
        ctx: Context<SettleOutcome>,
        ts: i64,
        fixture_summary: ScoresBatchSummary,
        fixture_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
        stat_a: StatTerm,
        stat_b: Option<StatTerm>,
    ) -> Result<()> {
        instructions::settle_outcome::handler(ctx, ts, fixture_summary, fixture_proof, main_tree_proof, stat_a, stat_b)
    }

    pub fn void_prediction(ctx: Context<VoidPrediction>) -> Result<()> {
        instructions::void_prediction::handler(ctx)
    }
}
