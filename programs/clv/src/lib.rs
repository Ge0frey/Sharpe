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
pub use txoracle::types::{
    Fixture, FixtureBatchSummary, Odds, OddsBatchSummary, ProofNode, ScoresBatchSummary, StatTerm,
};

declare_id!("734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz");

#[program]
pub mod clv {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handler(ctx)
    }

    /// Prove a fixture's kickoff once (CPI validate_fixture). Every timing guard
    /// in this program is anchored to the `start_time` recorded here.
    pub fn prove_fixture(
        ctx: Context<ProveFixture>,
        fixture_id: i64,
        snapshot: Fixture,
        summary: FixtureBatchSummary,
        sub_tree_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
    ) -> Result<()> {
        instructions::prove_fixture::handler(ctx, fixture_id, snapshot, summary, sub_tree_proof, main_tree_proof)
    }

    /// Commit to a call. Cheap, no CPI — see `prove_entry` for why the proof is deferred.
    #[allow(clippy::too_many_arguments)]
    pub fn open_prediction(
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
        instructions::open_prediction::handler(
            ctx, id, fixture_id, market, family, period, selection, line_x10, entry_ts, entry_msg_hash,
        )
    }

    /// Prove the committed entry line once its 5-minute odds root is published.
    pub fn prove_entry(
        ctx: Context<ProveEntry>,
        price_index: u8,
        odds: Odds,
        summary: OddsBatchSummary,
        sub_tree_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
    ) -> Result<()> {
        instructions::prove_entry::handler(ctx, price_index, odds, summary, sub_tree_proof, main_tree_proof)
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

    // ── prop duels: trustless head-to-head on any stat predicate ──

    /// Offer a duel and escrow the creator's stake. Any market; no odds line needed.
    #[allow(clippy::too_many_arguments)]
    pub fn create_duel(
        ctx: Context<CreateDuel>,
        duel_id: u64,
        fixture_id: i64,
        market: MarketKind,
        family: StatFamily,
        period: u16,
        selection: u8,
        line_x10: i16,
        stake_amount: u64,
        creator_takes_true: bool,
    ) -> Result<()> {
        instructions::duel::create(
            ctx, duel_id, fixture_id, market, family, period, selection, line_x10, stake_amount, creator_takes_true,
        )
    }

    /// Take the other side. Locked once the proven kickoff passes.
    pub fn join_duel(ctx: Context<JoinDuel>) -> Result<()> {
        instructions::duel::join(ctx)
    }

    /// Prove the duel's predicate (CPI validate_stat). Permissionless; moves no funds.
    pub fn resolve_duel(
        ctx: Context<ResolveDuel>,
        ts: i64,
        fixture_summary: ScoresBatchSummary,
        fixture_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
        stat_a: StatTerm,
        stat_b: Option<StatTerm>,
    ) -> Result<()> {
        instructions::duel::resolve(ctx, ts, fixture_summary, fixture_proof, main_tree_proof, stat_a, stat_b)
    }

    /// Pay both stakes to the proven winner. Permissionless; destination is on-chain.
    pub fn claim_duel(ctx: Context<ClaimDuel>) -> Result<()> {
        instructions::duel::claim(ctx)
    }

    /// Withdraw an unmatched offer.
    pub fn cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
        instructions::duel::cancel(ctx)
    }

    /// Escape hatch for a matched duel whose result never became provable.
    pub fn refund_duel(ctx: Context<RefundDuel>) -> Result<()> {
        instructions::duel::refund(ctx)
    }
}
