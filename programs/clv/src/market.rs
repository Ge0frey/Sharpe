use anchor_lang::prelude::*;

use crate::error::ClvError;
use crate::state::MarketKind;
use crate::txoracle::types::Comparison;

/// The deterministic settlement terms for a market/selection, stored on the
/// Prediction at open time so resolution is a pure function of on-chain roots.
pub struct Terms {
    pub stat_a_key: u32,
    pub stat_b_key: u32,
    pub op_add: bool, // true = Add, false = Subtract
    pub comparison: u8, // 0 = GreaterThan, 1 = LessThan, 2 = EqualTo
    pub threshold: i32,
}

/// Map a user-facing market + selection to a two-stat goal predicate.
/// Full-game goals: statKey 1 = P1 goals, 2 = P2 goals (period 0).
pub fn derive_terms(market: MarketKind, selection: u8, line_x10: i16) -> Result<Terms> {
    match market {
        MarketKind::Result1x2 => {
            // (P1 - P2) vs 0
            let (comparison, threshold) = match selection {
                0 => (0u8, 0i32), // Home: P1 - P2 > 0
                1 => (2u8, 0i32), // Draw: P1 - P2 == 0
                2 => (1u8, 0i32), // Away: P1 - P2 < 0
                _ => return err!(ClvError::InvalidSelection),
            };
            Ok(Terms { stat_a_key: 1, stat_b_key: 2, op_add: false, comparison, threshold })
        }
        MarketKind::TotalsOu => {
            // (P1 + P2) vs line. line_x10 = 25 => 2.5
            let whole = (line_x10 as i32) / 10;
            let (comparison, threshold) = match selection {
                0 => (0u8, whole),     // Over 2.5:  total > 2
                1 => (1u8, whole + 1), // Under 2.5: total < 3
                _ => return err!(ClvError::InvalidSelection),
            };
            Ok(Terms { stat_a_key: 1, stat_b_key: 2, op_add: true, comparison, threshold })
        }
    }
}

pub fn comparison_ty(c: u8) -> Comparison {
    match c {
        1 => Comparison::LessThan,
        2 => Comparison::EqualTo,
        _ => Comparison::GreaterThan,
    }
}

/// Implied probability in basis points from a decimal-x1000 price.
/// price 1889 (=1.889 decimal) -> 10_000_000 / 1889 = 5294 bps (52.94%).
pub fn prob_bps(price: i32) -> Result<u32> {
    require!(price > 0, ClvError::InvalidPrice);
    Ok((10_000_000i64 / price as i64) as u32)
}
