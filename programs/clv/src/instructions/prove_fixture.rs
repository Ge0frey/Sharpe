use anchor_lang::prelude::*;

use crate::constants::{FIXTURE_ID_MASK, FIXTURE_SEED};
use crate::error::ClvError;
use crate::state::{FixtureFacts, FixtureProven};
use crate::txoracle::program::Txoracle;
use crate::txoracle::types::{Fixture, FixtureBatchSummary, ProofNode};

#[derive(Accounts)]
#[instruction(fixture_id: i64)]
pub struct ProveFixture<'info> {
    #[account(mut)]
    pub prover: Signer<'info>,
    #[account(
        init,
        payer = prover,
        space = 8 + FixtureFacts::INIT_SPACE,
        seeds = [FIXTURE_SEED, &fixture_id.to_le_bytes()],
        bump
    )]
    pub fixture_facts: Account<'info, FixtureFacts>,
    /// CHECK: The ten-daily fixtures Merkle roots PDA; validated inside txoracle by its seeds/owner.
    pub ten_daily_fixtures_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, Txoracle>,
    pub system_program: Program<'info, System>,
}

/// Prove a fixture's kickoff time against the on-chain fixtures Merkle root, once.
///
/// Everything downstream — "your entry line predates kickoff", "your closing line
/// is not an in-play quote", "you committed before the match started" — is measured
/// against `start_time` recorded here. Without this the program would be trusting
/// the API's word for when a match began, and a predictor could enter a line drawn
/// after the result was effectively known.
///
/// `init` (not `init_if_needed`) makes this write-once: a kickoff cannot be
/// rewritten under predictions that were already judged against it.
pub fn handler(
    ctx: Context<ProveFixture>,
    fixture_id: i64,
    snapshot: Fixture,
    summary: FixtureBatchSummary,
    sub_tree_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
) -> Result<()> {
    // `summary.fixture_id` is the public id used by /odds and /scores, and the proof
    // binds it to `snapshot`. The snapshot's own id packs a sport tag in its high
    // bits (observed 3 and 1 across fixtures), so only the low 48 may be compared.
    require!(summary.fixture_id == fixture_id, ClvError::FixtureIdMismatch);
    require!(
        snapshot.fixture_id & FIXTURE_ID_MASK == fixture_id,
        ClvError::FixtureIdMismatch
    );
    require!(
        snapshot.competition_id == summary.competition_id,
        ClvError::FixtureIdMismatch
    );

    let txp = ctx.accounts.txoracle_program.to_account_info();
    let roots = ctx.accounts.ten_daily_fixtures_roots.to_account_info();
    let ok = crate::cpi::validate_fixture(&txp, &roots, &snapshot, &summary, &sub_tree_proof, &main_tree_proof)?;
    require!(ok, ClvError::FixtureProofRejected);

    let now = Clock::get()?.unix_timestamp;
    let f = &mut ctx.accounts.fixture_facts;
    f.fixture_id = fixture_id;
    f.start_time = snapshot.start_time;
    f.participant1_id = snapshot.participant1_id;
    f.participant2_id = snapshot.participant2_id;
    f.competition_id = snapshot.competition_id;
    f.proven_at = now;
    f.bump = ctx.bumps.fixture_facts;

    emit!(FixtureProven {
        fixture_id,
        start_time: snapshot.start_time,
        prover: ctx.accounts.prover.key(),
    });
    Ok(())
}
