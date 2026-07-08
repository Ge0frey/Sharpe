//! Manual CPI into txoracle's view verifiers. We build the instruction by hand
//! (discriminator + Borsh args using the declare_program! types) and read the
//! returned `bool` via `get_return_data`. An invalid proof makes the callee
//! error, which propagates and fails our instruction — exactly what we want.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{get_return_data, invoke};

use crate::error::ClvError;
use crate::txoracle::types::{
    BinaryExpression, Odds, OddsBatchSummary, ProofNode, ScoresBatchSummary, StatTerm, TraderPredicate,
};

const VALIDATE_ODDS_DISC: [u8; 8] = [192, 19, 91, 138, 104, 100, 212, 86];
const VALIDATE_STAT_DISC: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

fn read_return_bool() -> bool {
    match get_return_data() {
        Some((_program, data)) => data.first().copied() == Some(1),
        None => false,
    }
}

/// CPI txoracle::validate_odds. Returns true iff the record is committed under
/// the on-chain odds root (callee errors on an invalid proof).
pub fn validate_odds<'info>(
    txoracle_program: &AccountInfo<'info>,
    daily_odds_roots: &AccountInfo<'info>,
    ts: i64,
    odds: &Odds,
    summary: &OddsBatchSummary,
    sub_tree_proof: &Vec<ProofNode>,
    main_tree_proof: &Vec<ProofNode>,
) -> Result<bool> {
    let data = (|| -> std::io::Result<Vec<u8>> {
        let mut d = VALIDATE_ODDS_DISC.to_vec();
        ts.serialize(&mut d)?;
        odds.serialize(&mut d)?;
        summary.serialize(&mut d)?;
        sub_tree_proof.serialize(&mut d)?;
        main_tree_proof.serialize(&mut d)?;
        Ok(d)
    })()
    .map_err(|_| error!(ClvError::OddsProofRejected))?;

    let ix = Instruction {
        program_id: *txoracle_program.key,
        accounts: vec![AccountMeta::new_readonly(*daily_odds_roots.key, false)],
        data,
    };
    invoke(&ix, &[daily_odds_roots.clone(), txoracle_program.clone()])?;
    Ok(read_return_bool())
}

/// CPI txoracle::validate_stat. Returns the predicate result (true/false) when
/// the score proof is valid; callee errors on an invalid proof.
#[allow(clippy::too_many_arguments)]
pub fn validate_stat<'info>(
    txoracle_program: &AccountInfo<'info>,
    daily_scores_roots: &AccountInfo<'info>,
    ts: i64,
    fixture_summary: &ScoresBatchSummary,
    fixture_proof: &Vec<ProofNode>,
    main_tree_proof: &Vec<ProofNode>,
    predicate: &TraderPredicate,
    stat_a: &StatTerm,
    stat_b: &Option<StatTerm>,
    op: &Option<BinaryExpression>,
) -> Result<bool> {
    let data = (|| -> std::io::Result<Vec<u8>> {
        let mut d = VALIDATE_STAT_DISC.to_vec();
        ts.serialize(&mut d)?;
        fixture_summary.serialize(&mut d)?;
        fixture_proof.serialize(&mut d)?;
        main_tree_proof.serialize(&mut d)?;
        predicate.serialize(&mut d)?;
        stat_a.serialize(&mut d)?;
        stat_b.serialize(&mut d)?;
        op.serialize(&mut d)?;
        Ok(d)
    })()
    .map_err(|_| error!(ClvError::StatProofRejected))?;

    let ix = Instruction {
        program_id: *txoracle_program.key,
        accounts: vec![AccountMeta::new_readonly(*daily_scores_roots.key, false)],
        data,
    };
    invoke(&ix, &[daily_scores_roots.clone(), txoracle_program.clone()])?;
    Ok(read_return_bool())
}
