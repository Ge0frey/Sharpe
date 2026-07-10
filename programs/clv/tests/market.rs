//! Deterministic tests for the resolution/validation logic.
//!
//! Every function under test is pure: no clock, no accounts, no network. The
//! settlement path is a function of these outputs plus an on-chain Merkle root,
//! so pinning them here pins settlement.
//!
//! Reference data comes from devnet fixture 18172379 (USA 2-0 Bosnia), whose
//! proven stats are: goals 2-0, yellows 0-1, reds 1-0, corners 4-3, H1 goals 1-0.

use anchor_lang::prelude::*;

use clv::constants::{CMP_EQ, CMP_GT, CMP_LT, PERIOD_FULL, PERIOD_H1, PERIOD_H2};
use clv::error::ClvError;
use clv::market::{bind_odds, derive_terms, parse_line_x10, prob_bps, stat_keys, Terms};
use clv::state::{MarketKind, StatFamily};
use clv::txoracle::types::Odds;

/// Anchor error codes start at 6000, in declaration order.
fn code_of(e: Error) -> u32 {
    match e {
        Error::AnchorError(ae) => ae.error_code_number,
        other => panic!("expected AnchorError, got {other:?}"),
    }
}
fn expect_err<T: std::fmt::Debug>(r: Result<T>, want: ClvError) {
    let got = code_of(r.expect_err("expected an error").into());
    assert_eq!(got, 6000 + want as u32, "wrong error variant: {want:?}");
}

fn odds(super_type: &str, period: Option<&str>, params: Option<&str>, names: &[&str], prices: &[i32]) -> Odds {
    Odds {
        fixture_id: 18172379,
        message_id: "m".into(),
        ts: 1_782_950_000_000,
        bookmaker: "TXLineStablePriceDemargined".into(),
        bookmaker_id: 10021,
        super_odds_type: super_type.into(),
        game_state: None,
        in_running: false,
        market_parameters: params.map(Into::into),
        market_period: period.map(Into::into),
        price_names: names.iter().map(|s| s.to_string()).collect(),
        prices: prices.to_vec(),
    }
}
fn full_1x2() -> Odds {
    odds("1X2_PARTICIPANT_RESULT", None, None, &["part1", "draw", "part2"], &[1619, 4181, 6982])
}
fn h1_1x2() -> Odds {
    odds("1X2_PARTICIPANT_RESULT", Some("half=1"), None, &["part1", "draw", "part2"], &[2306, 2375, 6885])
}

// ─────────────────────────── stat key encoding ───────────────────────────

#[test]
fn stat_keys_encode_period_in_the_key() {
    // Confirmed on devnet: H1 goals are 1001/1002, H1 corners 1007/1008.
    assert_eq!(stat_keys(StatFamily::Goals, PERIOD_FULL).unwrap(), (1, 2));
    assert_eq!(stat_keys(StatFamily::Goals, PERIOD_H1).unwrap(), (1001, 1002));
    assert_eq!(stat_keys(StatFamily::Goals, PERIOD_H2).unwrap(), (2001, 2002));
    assert_eq!(stat_keys(StatFamily::Corners, PERIOD_FULL).unwrap(), (7, 8));
    assert_eq!(stat_keys(StatFamily::Corners, PERIOD_H1).unwrap(), (1007, 1008));
    assert_eq!(stat_keys(StatFamily::Yellows, PERIOD_FULL).unwrap(), (3, 4));
    assert_eq!(stat_keys(StatFamily::Reds, PERIOD_FULL).unwrap(), (5, 6));
    expect_err(stat_keys(StatFamily::Goals, 3), ClvError::UnsupportedPeriod);
}

// ───────────────────────────── derive_terms ─────────────────────────────

#[test]
fn result_1x2_is_a_goal_difference_predicate() {
    let home = derive_terms(MarketKind::Result1x2, 0, 0, PERIOD_FULL, StatFamily::Goals).unwrap();
    assert_eq!(
        home,
        Terms { stat_a_key: 1, stat_b_key: 2, has_stat_b: true, op_add: false, comparison: CMP_GT, threshold: 0 }
    );
    let draw = derive_terms(MarketKind::Result1x2, 1, 0, PERIOD_FULL, StatFamily::Goals).unwrap();
    assert_eq!(draw.comparison, CMP_EQ);
    let away = derive_terms(MarketKind::Result1x2, 2, 0, PERIOD_FULL, StatFamily::Goals).unwrap();
    assert_eq!(away.comparison, CMP_LT);

    // USA 2-0 Bosnia: P1 - P2 = 2 > 0, so `home` is the winning side.
    assert!(2 - 0 > home.threshold);
}

#[test]
fn result_1x2_first_half_shifts_the_keys() {
    let t = derive_terms(MarketKind::Result1x2, 0, 0, PERIOD_H1, StatFamily::Goals).unwrap();
    assert_eq!((t.stat_a_key, t.stat_b_key), (1001, 1002));
}

#[test]
fn result_1x2_rejects_non_goal_families_and_lines() {
    expect_err(
        derive_terms(MarketKind::Result1x2, 0, 0, PERIOD_FULL, StatFamily::Corners),
        ClvError::MarketFamilyMismatch,
    );
    expect_err(
        derive_terms(MarketKind::Result1x2, 0, 25, PERIOD_FULL, StatFamily::Goals),
        ClvError::LineMismatch,
    );
    expect_err(
        derive_terms(MarketKind::Result1x2, 3, 0, PERIOD_FULL, StatFamily::Goals),
        ClvError::InvalidSelection,
    );
}

#[test]
fn totals_over_under_2_5_goals() {
    let over = derive_terms(MarketKind::TotalsOu, 0, 25, PERIOD_FULL, StatFamily::Goals).unwrap();
    assert_eq!(
        over,
        Terms { stat_a_key: 1, stat_b_key: 2, has_stat_b: true, op_add: true, comparison: CMP_GT, threshold: 2 }
    );
    let under = derive_terms(MarketKind::TotalsOu, 1, 25, PERIOD_FULL, StatFamily::Goals).unwrap();
    assert_eq!((under.comparison, under.threshold), (CMP_LT, 3));

    // USA 2-0 Bosnia: 2 goals. Over 2.5 loses (2 > 2 false), Under 2.5 wins (2 < 3).
    assert!(!(2 > over.threshold));
    assert!(2 < under.threshold);
}

#[test]
fn whole_and_quarter_lines_are_not_settleable() {
    // 3.0 can push; a push has no boolean answer.
    expect_err(
        derive_terms(MarketKind::TotalsOu, 0, 30, PERIOD_FULL, StatFamily::Goals),
        ClvError::UnsupportedLine,
    );
    expect_err(
        derive_terms(MarketKind::TotalsOu, 0, 0, PERIOD_FULL, StatFamily::Goals),
        ClvError::LineMismatch,
    );
}

#[test]
fn combined_corners_is_the_brief_s_example() {
    // "Team A Corners + Team B Corners > 10"
    let over = derive_terms(MarketKind::CombinedTotal, 0, 105, PERIOD_FULL, StatFamily::Corners).unwrap();
    assert_eq!(
        over,
        Terms { stat_a_key: 7, stat_b_key: 8, has_stat_b: true, op_add: true, comparison: CMP_GT, threshold: 10 }
    );
    // Real corners on 18172379: 4 + 3 = 7. Over 10.5 loses; over 6.5 wins.
    assert!(!(4 + 3 > over.threshold));
    let over_65 = derive_terms(MarketKind::CombinedTotal, 0, 65, PERIOD_FULL, StatFamily::Corners).unwrap();
    assert!(4 + 3 > over_65.threshold);
}

#[test]
fn combined_cards_uses_the_card_families() {
    let yellows = derive_terms(MarketKind::CombinedTotal, 0, 35, PERIOD_FULL, StatFamily::Yellows).unwrap();
    assert_eq!((yellows.stat_a_key, yellows.stat_b_key), (3, 4));
    let reds = derive_terms(MarketKind::CombinedTotal, 1, 5, PERIOD_FULL, StatFamily::Reds).unwrap();
    assert_eq!((reds.stat_a_key, reds.stat_b_key, reds.comparison, reds.threshold), (5, 6, CMP_LT, 1));
    // Reds on 18172379: 1 + 0 = 1. Under 0.5 loses (1 < 1 false).
    assert!(!(1 + 0 < reds.threshold));
}

#[test]
fn team_total_is_single_stat() {
    let p1_over = derive_terms(MarketKind::TeamTotal, 0, 35, PERIOD_FULL, StatFamily::Corners).unwrap();
    assert_eq!(
        p1_over,
        Terms { stat_a_key: 7, stat_b_key: 0, has_stat_b: false, op_add: false, comparison: CMP_GT, threshold: 3 }
    );
    let p2_under = derive_terms(MarketKind::TeamTotal, 3, 35, PERIOD_FULL, StatFamily::Corners).unwrap();
    assert_eq!((p2_under.stat_a_key, p2_under.has_stat_b, p2_under.comparison, p2_under.threshold), (8, false, CMP_LT, 4));

    // USA corners 4 > 3 wins; Bosnia corners 3 < 4 wins.
    assert!(4 > p1_over.threshold);
    assert!(3 < p2_under.threshold);
    expect_err(
        derive_terms(MarketKind::TeamTotal, 4, 35, PERIOD_FULL, StatFamily::Corners),
        ClvError::InvalidSelection,
    );
}

// ───────────────────────────── parse_line_x10 ─────────────────────────────

#[test]
fn parses_half_and_whole_lines() {
    assert_eq!(parse_line_x10("line=2.5").unwrap(), 25);
    assert_eq!(parse_line_x10("line=10.5").unwrap(), 105);
    assert_eq!(parse_line_x10("line=-0.5").unwrap(), -5);
    assert_eq!(parse_line_x10("line=-1.5").unwrap(), -15);
    assert_eq!(parse_line_x10("line=0").unwrap(), 0);
    assert_eq!(parse_line_x10("line=3").unwrap(), 30);
}

#[test]
fn rejects_quarter_lines() {
    // Real values from the devnet feed. A quarter line splits the stake across two
    // adjacent lines; it cannot be one predicate, so it must never reach the CPI.
    expect_err(parse_line_x10("line=0.75"), ClvError::UnsupportedLine);
    expect_err(parse_line_x10("line=0.25"), ClvError::UnsupportedLine);
    expect_err(parse_line_x10("line=-0.25"), ClvError::UnsupportedLine);
    expect_err(parse_line_x10("line=-1.75"), ClvError::UnsupportedLine);
}

#[test]
fn rejects_malformed_market_parameters() {
    expect_err(parse_line_x10("total=2.5"), ClvError::LineMismatch);
    expect_err(parse_line_x10("line="), ClvError::LineMismatch);
    expect_err(parse_line_x10("line=abc"), ClvError::LineMismatch);
    expect_err(parse_line_x10("line=1.234"), ClvError::LineMismatch);
    expect_err(parse_line_x10("line=2."), ClvError::LineMismatch);
}

// ─────────────────────────────── prob_bps ───────────────────────────────

#[test]
fn implied_probability_from_decimal_x1000_price() {
    assert_eq!(prob_bps(1000).unwrap(), 10_000); // 1.000 -> 100.00%
    assert_eq!(prob_bps(2000).unwrap(), 5_000); //  2.000 ->  50.00%
    assert_eq!(prob_bps(1889).unwrap(), 5_294); //  1.889 ->  52.94% (truncation gives 5293)
    assert_eq!(prob_bps(1619).unwrap(), 6_177); //  France home; truncation gives 6176
    expect_err(prob_bps(0), ClvError::InvalidPrice);
    expect_err(prob_bps(-1), ClvError::InvalidPrice);
}

/// The on-chain rounding must agree with `Math.round(10_000_000 / price)` in
/// `app/src/lib/domain.ts`, or the Verify modal shows a number the chain never stored.
#[test]
fn prob_bps_rounds_half_up_like_the_frontend() {
    for price in 1001..=10_000i32 {
        let expected = ((10_000_000f64 / price as f64).round()) as u32;
        assert_eq!(prob_bps(price).unwrap(), expected, "price {price}");
    }
}

// ───────────────────────── bind_odds: the headline bug ─────────────────────────

#[test]
fn binds_a_correct_full_match_1x2_record() {
    let price = bind_odds(&full_1x2(), MarketKind::Result1x2, 0, PERIOD_FULL, 0, 0).unwrap();
    assert_eq!(price, 1619);
    assert_eq!(bind_odds(&full_1x2(), MarketKind::Result1x2, 2, PERIOD_FULL, 0, 2).unwrap(), 6982);
}

#[test]
fn an_authentic_first_half_line_cannot_settle_a_full_match_bet() {
    // Both records are real and would both pass validate_odds. Only the period
    // check tells them apart. This is the bug the guard exists for.
    expect_err(
        bind_odds(&h1_1x2(), MarketKind::Result1x2, 0, PERIOD_FULL, 0, 0),
        ClvError::MarketPeriodMismatch,
    );
    expect_err(
        bind_odds(&full_1x2(), MarketKind::Result1x2, 0, PERIOD_H1, 0, 0),
        ClvError::MarketPeriodMismatch,
    );
    // ...and the H1 record does bind to an H1 prediction.
    assert_eq!(bind_odds(&h1_1x2(), MarketKind::Result1x2, 0, PERIOD_H1, 0, 0).unwrap(), 2306);
}

#[test]
fn a_totals_record_cannot_settle_a_1x2_bet() {
    let ou = odds("OVERUNDER_PARTICIPANT_GOALS", None, Some("line=2.5"), &["over", "under"], &[1705, 2419]);
    expect_err(bind_odds(&ou, MarketKind::Result1x2, 0, PERIOD_FULL, 0, 0), ClvError::MarketTypeMismatch);
    expect_err(bind_odds(&full_1x2(), MarketKind::TotalsOu, 0, PERIOD_FULL, 25, 0), ClvError::MarketTypeMismatch);
}

#[test]
fn totals_line_must_match_the_prediction_line() {
    let ou = odds("OVERUNDER_PARTICIPANT_GOALS", None, Some("line=2.5"), &["over", "under"], &[1705, 2419]);
    assert_eq!(bind_odds(&ou, MarketKind::TotalsOu, 0, PERIOD_FULL, 25, 0).unwrap(), 1705);
    expect_err(bind_odds(&ou, MarketKind::TotalsOu, 0, PERIOD_FULL, 35, 0), ClvError::LineMismatch);

    // A quarter line in the feed is refused outright, whatever the prediction says.
    let quarter = odds("OVERUNDER_PARTICIPANT_GOALS", None, Some("line=0.75"), &["over", "under"], &[1705, 2419]);
    expect_err(bind_odds(&quarter, MarketKind::TotalsOu, 0, PERIOD_FULL, 7, 0), ClvError::UnsupportedLine);
}

#[test]
fn price_index_must_name_the_selected_outcome() {
    // An authentic record whose price_names are permuted: prices[0] is no longer "part1".
    let permuted = odds(
        "1X2_PARTICIPANT_RESULT", None, None,
        &["draw", "part1", "part2"], &[4181, 1619, 6982],
    );
    expect_err(
        bind_odds(&permuted, MarketKind::Result1x2, 0, PERIOD_FULL, 0, 0),
        ClvError::PriceNameMismatch,
    );
    // Index 1 does name part1 here, and yields the home price.
    assert_eq!(bind_odds(&permuted, MarketKind::Result1x2, 0, PERIOD_FULL, 0, 1).unwrap(), 1619);
    expect_err(
        bind_odds(&full_1x2(), MarketKind::Result1x2, 0, PERIOD_FULL, 0, 9),
        ClvError::InvalidPriceIndex,
    );
}

#[test]
fn unpriced_markets_have_no_odds_line_to_bind() {
    // Corners/cards duels settle on validate_stat alone; there is no consensus line.
    expect_err(
        bind_odds(&full_1x2(), MarketKind::CombinedTotal, 0, PERIOD_FULL, 105, 0),
        ClvError::MarketHasNoOddsLine,
    );
    expect_err(
        bind_odds(&full_1x2(), MarketKind::TeamTotal, 0, PERIOD_FULL, 35, 0),
        ClvError::MarketHasNoOddsLine,
    );
}

#[test]
fn a_1x2_record_must_carry_no_line_parameter() {
    let bogus = odds("1X2_PARTICIPANT_RESULT", None, Some("line=2.5"), &["part1", "draw", "part2"], &[1619, 4181, 6982]);
    expect_err(bind_odds(&bogus, MarketKind::Result1x2, 0, PERIOD_FULL, 0, 0), ClvError::LineMismatch);
}

// ─────────────────────── duel payout rule (pure) ───────────────────────

/// `claim_duel` pays the creator iff the proven predicate matches the side they took.
/// Wrong here means the escrow pays the loser, so it gets its own truth table.
#[test]
fn creator_wins_exactly_when_the_proof_matches_the_side_taken() {
    use clv::instructions::duel::creator_wins;
    //          proven  | took   | creator wins
    assert!(creator_wins(true, true));    // backed OVER, went over
    assert!(!creator_wins(true, false));  // backed UNDER, went over
    assert!(!creator_wins(false, true));  // backed OVER, went under
    assert!(creator_wins(false, false));  // backed UNDER, went under
}
