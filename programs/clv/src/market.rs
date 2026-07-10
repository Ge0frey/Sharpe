//! Market model: the single source of truth for how a user-facing market maps to
//! (a) a deterministic two-stat predicate settled by `validate_stat`, and
//! (b) the exact odds record that is allowed to price it.
//!
//! Everything here is a pure function of its arguments. `derive_terms` runs once
//! at open/create time and its output is persisted, so settlement never re-derives
//! anything — it replays stored terms against an on-chain Merkle root.

use anchor_lang::prelude::*;

use crate::constants::{CMP_EQ, CMP_GT, CMP_LT, PERIOD_FULL, PERIOD_H1, PERIOD_H2};
use crate::error::ClvError;
use crate::state::{MarketKind, StatFamily};
use crate::txoracle::types::{Comparison, Odds};

/// The deterministic settlement terms for a market/selection, stored at open time
/// so resolution is a pure function of on-chain roots plus these fields.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Terms {
    pub stat_a_key: u32,
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    pub op_add: bool, // true = Add, false = Subtract (ignored when !has_stat_b)
    pub comparison: u8,
    pub threshold: i32,
}

/// Base stat keys per family, `(participant1, participant2)`.
/// Soccer: goals 1/2, yellows 3/4, reds 5/6, corners 7/8.
pub fn base_keys(family: StatFamily) -> (u32, u32) {
    match family {
        StatFamily::Goals => (1, 2),
        StatFamily::Yellows => (3, 4),
        StatFamily::Reds => (5, 6),
        StatFamily::Corners => (7, 8),
    }
}

/// `key = period * 1000 + base_key`. Confirmed on devnet: H1 goals are 1001/1002,
/// H1 corners 1007/1008. (`ScoreStat.period` is always 0 — the period lives in the key.)
pub fn stat_keys(family: StatFamily, period: u16) -> Result<(u32, u32)> {
    require!(
        period == PERIOD_FULL || period == PERIOD_H1 || period == PERIOD_H2,
        ClvError::UnsupportedPeriod
    );
    let (a, b) = base_keys(family);
    let off = (period as u32) * 1000;
    Ok((off + a, off + b))
}

/// Over/Under threshold from a half-integer line.
///
/// `line_x10 = 105` is 10.5 goals/corners:
///   Over  → total > 10  (GreaterThan, 10)
///   Under → total < 11  (LessThan, 11)
///
/// Whole lines (10.0) are rejected because they can push, and a push has no
/// boolean answer — `validate_stat` returns one bit, so a market that can draw
/// is not settleable. Quarter lines (10.25) are split bets and are rejected in
/// `parse_line_x10` before they reach here.
fn over_under(line_x10: i16, over: bool) -> Result<(u8, i32)> {
    require!(line_x10 > 0, ClvError::LineMismatch);
    require!(line_x10 % 10 == 5, ClvError::UnsupportedLine);
    let whole = (line_x10 as i32) / 10;
    Ok(if over { (CMP_GT, whole) } else { (CMP_LT, whole + 1) })
}

/// Map a market + selection to its settlement predicate.
///
/// | market        | selections                                   | shape                |
/// |---------------|----------------------------------------------|----------------------|
/// | Result1x2     | 0 home, 1 draw, 2 away                       | (A − B) ⋛ 0          |
/// | TotalsOu      | 0 over, 1 under                              | (A + B) ⋛ line       |
/// | CombinedTotal | 0 over, 1 under                              | (A + B) ⋛ line       |
/// | TeamTotal     | 0 P1 over, 1 P1 under, 2 P2 over, 3 P2 under | A ⋛ line (no stat B) |
///
/// `Result1x2` and `TotalsOu` are the *priced* markets — they have a consensus
/// odds line, so they can carry CLV. `CombinedTotal` and `TeamTotal` exist for
/// corners/cards duels, where no bookmaker line exists to beat.
pub fn derive_terms(
    market: MarketKind,
    selection: u8,
    line_x10: i16,
    period: u16,
    family: StatFamily,
) -> Result<Terms> {
    let (key_a, key_b) = stat_keys(family, period)?;

    match market {
        MarketKind::Result1x2 => {
            require!(family == StatFamily::Goals, ClvError::MarketFamilyMismatch);
            require!(line_x10 == 0, ClvError::LineMismatch);
            let comparison = match selection {
                0 => CMP_GT, // home: P1 − P2 > 0
                1 => CMP_EQ, // draw: P1 − P2 == 0
                2 => CMP_LT, // away: P1 − P2 < 0
                _ => return err!(ClvError::InvalidSelection),
            };
            Ok(Terms {
                stat_a_key: key_a,
                stat_b_key: key_b,
                has_stat_b: true,
                op_add: false,
                comparison,
                threshold: 0,
            })
        }

        MarketKind::TotalsOu => {
            require!(family == StatFamily::Goals, ClvError::MarketFamilyMismatch);
            let over = match selection {
                0 => true,
                1 => false,
                _ => return err!(ClvError::InvalidSelection),
            };
            let (comparison, threshold) = over_under(line_x10, over)?;
            Ok(Terms {
                stat_a_key: key_a,
                stat_b_key: key_b,
                has_stat_b: true,
                op_add: true,
                comparison,
                threshold,
            })
        }

        MarketKind::CombinedTotal => {
            let over = match selection {
                0 => true,
                1 => false,
                _ => return err!(ClvError::InvalidSelection),
            };
            let (comparison, threshold) = over_under(line_x10, over)?;
            Ok(Terms {
                stat_a_key: key_a,
                stat_b_key: key_b,
                has_stat_b: true,
                op_add: true,
                comparison,
                threshold,
            })
        }

        MarketKind::TeamTotal => {
            let (key, over) = match selection {
                0 => (key_a, true),
                1 => (key_a, false),
                2 => (key_b, true),
                3 => (key_b, false),
                _ => return err!(ClvError::InvalidSelection),
            };
            let (comparison, threshold) = over_under(line_x10, over)?;
            Ok(Terms {
                stat_a_key: key,
                stat_b_key: 0,
                has_stat_b: false,
                op_add: false,
                comparison,
                threshold,
            })
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Odds-record binding.
//
// A Merkle proof only says "this record is authentic". It says nothing about
// *which* market the record prices. The devnet feed carries, for one fixture:
//   1X2_PARTICIPANT_RESULT          MarketPeriod=null      PriceNames=[part1,draw,part2]
//   1X2_PARTICIPANT_RESULT          MarketPeriod=half=1    PriceNames=[part1,draw,part2]
//   OVERUNDER_PARTICIPANT_GOALS     MarketParameters=line=0.75
//   ASIANHANDICAP_PARTICIPANT_GOALS MarketParameters=line=-1.75
// Without the checks below, an authentic first-half line settles a full-match bet.
// ─────────────────────────────────────────────────────────────────────────────

/// Markets that a consensus odds line prices, and can therefore carry CLV.
pub fn is_priced_market(market: MarketKind) -> bool {
    matches!(market, MarketKind::Result1x2 | MarketKind::TotalsOu)
}

fn expected_super_odds_type(market: MarketKind) -> Result<&'static str> {
    match market {
        MarketKind::Result1x2 => Ok("1X2_PARTICIPANT_RESULT"),
        MarketKind::TotalsOu => Ok("OVERUNDER_PARTICIPANT_GOALS"),
        _ => err!(ClvError::MarketHasNoOddsLine),
    }
}

fn expected_market_period(period: u16) -> Result<Option<&'static str>> {
    match period {
        PERIOD_FULL => Ok(None),
        PERIOD_H1 => Ok(Some("half=1")),
        // The feed exposes no `half=2` odds market, so a H2 prediction cannot be priced.
        _ => err!(ClvError::UnsupportedPeriod),
    }
}

fn expected_price_name(market: MarketKind, selection: u8) -> Result<&'static str> {
    match (market, selection) {
        (MarketKind::Result1x2, 0) => Ok("part1"),
        (MarketKind::Result1x2, 1) => Ok("draw"),
        (MarketKind::Result1x2, 2) => Ok("part2"),
        (MarketKind::TotalsOu, 0) => Ok("over"),
        (MarketKind::TotalsOu, 1) => Ok("under"),
        _ => err!(ClvError::InvalidSelection),
    }
}

/// Parse `MarketParameters` of the form `line=2.5` / `line=-0.5` into tenths.
///
/// Rejects quarter lines (`line=0.75`, `line=-1.75`): those are split stakes across
/// two adjacent lines and cannot be expressed as a single boolean predicate.
pub fn parse_line_x10(raw: &str) -> Result<i16> {
    let body = raw.strip_prefix("line=").ok_or(error!(ClvError::LineMismatch))?;
    let (neg, body) = match body.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, body),
    };

    let mut parts = body.splitn(2, '.');
    let int_str = parts.next().unwrap_or("");
    require!(!int_str.is_empty(), ClvError::LineMismatch);
    let int_part: i32 = int_str.parse().map_err(|_| error!(ClvError::LineMismatch))?;

    let frac_x100 = match parts.next() {
        None => 0,
        Some(frac_str) => {
            require!(
                !frac_str.is_empty() && frac_str.len() <= 2,
                ClvError::LineMismatch
            );
            let frac: i32 = frac_str.parse().map_err(|_| error!(ClvError::LineMismatch))?;
            if frac_str.len() == 1 { frac * 10 } else { frac }
        }
    };

    let x100 = int_part
        .checked_mul(100)
        .and_then(|v| v.checked_add(frac_x100))
        .ok_or(error!(ClvError::Overflow))?;
    // A line the feed can express in hundredths but we cannot settle as one bit.
    require!(x100 % 10 == 0, ClvError::UnsupportedLine);

    let x10 = i16::try_from(x100 / 10).map_err(|_| error!(ClvError::Overflow))?;
    Ok(if neg { -x10 } else { x10 })
}

/// Assert the proven odds record actually prices `(market, selection, period, line)`
/// and that `price_index` names the selection we took. Call this *before* the CPI:
/// a rejected record should never cost a verifier invocation.
pub fn bind_odds(
    odds: &Odds,
    market: MarketKind,
    selection: u8,
    period: u16,
    line_x10: i16,
    price_index: u8,
) -> Result<i32> {
    require!(is_priced_market(market), ClvError::MarketHasNoOddsLine);
    require!(
        odds.super_odds_type == expected_super_odds_type(market)?,
        ClvError::MarketTypeMismatch
    );
    require!(
        odds.market_period.as_deref() == expected_market_period(period)?,
        ClvError::MarketPeriodMismatch
    );

    match market {
        MarketKind::Result1x2 => {
            require!(odds.market_parameters.is_none(), ClvError::LineMismatch);
        }
        MarketKind::TotalsOu => {
            let raw = odds
                .market_parameters
                .as_deref()
                .ok_or(error!(ClvError::LineMismatch))?;
            require!(parse_line_x10(raw)? == line_x10, ClvError::LineMismatch);
        }
        _ => return err!(ClvError::MarketHasNoOddsLine),
    }

    let idx = price_index as usize;
    require!(idx < odds.prices.len(), ClvError::InvalidPriceIndex);
    require!(idx < odds.price_names.len(), ClvError::InvalidPriceIndex);
    require!(
        odds.price_names[idx] == expected_price_name(market, selection)?,
        ClvError::PriceNameMismatch
    );

    Ok(odds.prices[idx])
}

pub fn comparison_ty(c: u8) -> Comparison {
    match c {
        CMP_LT => Comparison::LessThan,
        CMP_EQ => Comparison::EqualTo,
        _ => Comparison::GreaterThan,
    }
}

/// Implied probability in basis points from a decimal-x1000 price.
/// price 1889 (= 1.889 decimal) -> round(10_000_000 / 1889) = 5294 bps (52.94%).
///
/// Rounds half-up rather than truncating so this agrees exactly with the
/// frontend's `Math.round(10_000_000 / price)` (`app/src/lib/domain.ts`). If the
/// two disagreed, the Verify modal would display a probability that differs from
/// the one stored in the account it is verifying.
pub fn prob_bps(price: i32) -> Result<u32> {
    require!(price > 0, ClvError::InvalidPrice);
    let d = price as i64;
    Ok(((10_000_000i64 + d / 2) / d) as u32)
}
