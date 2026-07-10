/**
 * The frontend market model must mirror `programs/clv/src/market.rs` exactly.
 *
 * These tests exist because of a real bug: the Verify modal reconstructed a market
 * from `selection` alone, so a Totals bet was re-proven with `Subtract` (the 1X2
 * operator) and a first-half bet was re-proven against full-match stat keys. The
 * proofs still passed — they just answered a different question than the one the
 * chain had settled.
 */
import { describe, expect, it } from "vitest";

import {
  MARKETS, H1_MARKETS, DUEL_MARKETS, totalsMarket, marketFromAccount, storedPredicate,
  predicateFor, statKeys, parseLineX10, isSettleableLine, findOdds, availableMarkets,
  marketKey, GOALS, CORNERS,
} from "./domain";

const odds = (superType: string, period: string | null, params: string | null, names: string[], prices: number[]) => ({
  SuperOddsType: superType, MarketPeriod: period, MarketParameters: params, PriceNames: names, Prices: prices,
  MessageId: `${superType}|${period}|${params}`,
});
const BOOK = [
  odds("1X2_PARTICIPANT_RESULT", null, null, ["part1", "draw", "part2"], [1619, 4181, 6982]),
  odds("1X2_PARTICIPANT_RESULT", "half=1", null, ["part1", "draw", "part2"], [2306, 2375, 6885]),
  odds("OVERUNDER_PARTICIPANT_GOALS", null, "line=2.5", ["over", "under"], [1705, 2419]),
  odds("OVERUNDER_PARTICIPANT_GOALS", null, "line=3", ["over", "under"], [2600, 1500]),   // whole: can push
  odds("OVERUNDER_PARTICIPANT_GOALS", null, "line=0.75", ["over", "under"], [1300, 3400]), // quarter: split stake
  odds("ASIANHANDICAP_PARTICIPANT_GOALS", null, "line=-0.5", ["part1", "part2"], [1612, 2635]),
];

// ─────────────────────────── line parsing (mirrors market.rs) ───────────────────────────

describe("parseLineX10 / isSettleableLine", () => {
  it("parses half and whole lines into tenths", () => {
    expect(parseLineX10("line=2.5")).toBe(25);
    expect(parseLineX10("line=10.5")).toBe(105);
    expect(parseLineX10("line=-0.5")).toBe(-5);
    expect(parseLineX10("line=3")).toBe(30);
  });

  it("rejects quarter lines outright — a split stake has no boolean answer", () => {
    expect(parseLineX10("line=0.75")).toBeNull();
    expect(parseLineX10("line=-1.75")).toBeNull();
    expect(parseLineX10("line=0.25")).toBeNull();
  });

  it("rejects malformed parameters", () => {
    expect(parseLineX10("total=2.5")).toBeNull();
    expect(parseLineX10(null)).toBeNull();
    expect(parseLineX10("line=abc")).toBeNull();
  });

  it("only half-integer lines are settleable — a whole line can push", () => {
    expect(isSettleableLine(25)).toBe(true);
    expect(isSettleableLine(105)).toBe(true);
    expect(isSettleableLine(30)).toBe(false);
    expect(isSettleableLine(0)).toBe(false);
  });
});

// ─────────────────────────── stat keys ───────────────────────────

describe("statKeys", () => {
  it("encodes the period into the key, matching market.rs::stat_keys", () => {
    expect(statKeys(GOALS, 0)).toEqual([1, 2]);
    expect(statKeys(GOALS, 1)).toEqual([1001, 1002]);
    expect(statKeys(CORNERS, 0)).toEqual([7, 8]);
    expect(statKeys(CORNERS, 1)).toEqual([1007, 1008]);
  });
});

// ─────────────────────────── odds binding ───────────────────────────

describe("findOdds", () => {
  it("distinguishes the full-match line from the authentic first-half line", () => {
    // Both records are real and both pass validate_odds. Only the period tells them apart.
    expect(findOdds(BOOK, MARKETS[0])!.Prices[0]).toBe(1619);
    expect(findOdds(BOOK, H1_MARKETS[0])!.Prices[0]).toBe(2306);
  });

  it("matches a totals record only at its own line", () => {
    expect(findOdds(BOOK, totalsMarket(25, true))!.Prices[0]).toBe(1705);
    expect(findOdds(BOOK, totalsMarket(35, true))).toBeNull();
  });

  it("never returns a 1X2 record carrying a line parameter", () => {
    const bogus = [odds("1X2_PARTICIPANT_RESULT", null, "line=2.5", ["part1", "draw", "part2"], [1, 2, 3])];
    expect(findOdds(bogus, MARKETS[0])).toBeNull();
  });
});

describe("availableMarkets", () => {
  const groups = availableMarkets(BOOK);

  it("offers exactly the groups the book prices", () => {
    expect(groups.map((g) => g.key)).toEqual(["result", "totals", "h1"]);
  });

  it("drops lines the program would reject, so no user is offered an unsettleable bet", () => {
    const totals = groups.find((g) => g.key === "totals")!;
    // line=2.5 survives; line=3 (push) and line=0.75 (split stake) do not.
    expect(totals.markets.map((m) => m.lineX10)).toEqual([25, 25]);
    expect(totals.markets.map((m) => m.label)).toEqual(["Over 2.5", "Under 2.5"]);
  });

  it("returns nothing for a book with no settleable markets", () => {
    expect(availableMarkets([BOOK[4], BOOK[5]])).toEqual([]);
  });
});

// ─────────────── reading a stored account back (the bug these tests exist for) ───────────────

describe("marketFromAccount", () => {
  it("recovers a full-match 1X2 bet", () => {
    const m = marketFromAccount({ market: { result1X2: {} }, period: 0, selection: 2, lineX10: 0 });
    expect([m.label, m.priceIndex]).toEqual(["Away win", 2]);
  });

  it("recovers a first-half bet, not the full-match one at the same selection", () => {
    const m = marketFromAccount({ market: { result1X2: {} }, period: 1, selection: 0, lineX10: 0 });
    expect([m.label, m.period]).toEqual(["1H Home", 1]);
  });

  it("recovers a Totals bet, which `selection` alone cannot describe", () => {
    // selection 0 means "home win" for 1X2 and "over" for totals. Reading `selection`
    // without `market` mislabels the bet and looks up the wrong odds record.
    const over = marketFromAccount({ market: { totalsOu: {} }, period: 0, selection: 0, lineX10: 25 });
    expect([over.label, over.priceIndex, over.lineX10]).toEqual(["Over 2.5", 0, 25]);
    const under = marketFromAccount({ market: { totalsOu: {} }, period: 0, selection: 1, lineX10: 25 });
    expect([under.label, under.priceIndex]).toEqual(["Under 2.5", 1]);
    expect(marketKey(over.marketArg)).toBe("totalsOu");
  });
});

describe("storedPredicate", () => {
  it("replays the exact predicate the chain stored, not one re-derived from a label", () => {
    // 1X2 home: (P1 - P2) > 0  -> Subtract, GreaterThan, 0
    expect(storedPredicate({ comparison: 0, threshold: 0, opAdd: false, hasStatB: true })).toEqual({
      predicate: { threshold: 0, comparison: { greaterThan: {} } },
      op: { subtract: {} },
      hasStatB: true,
    });
    // Totals under 2.5: (P1 + P2) < 3  -> Add, LessThan, 3
    expect(storedPredicate({ comparison: 1, threshold: 3, opAdd: true, hasStatB: true })).toEqual({
      predicate: { threshold: 3, comparison: { lessThan: {} } },
      op: { add: {} },
      hasStatB: true,
    });
    // 1X2 draw: (P1 - P2) == 0
    expect(storedPredicate({ comparison: 2, threshold: 0, opAdd: false, hasStatB: true }).predicate.comparison)
      .toEqual({ equalTo: {} });
  });

  it("sends no operator for a single-stat market — validate_stat takes Option<op>", () => {
    const { op, hasStatB } = storedPredicate({ comparison: 0, threshold: 3, opAdd: false, hasStatB: false });
    expect(op).toBeNull();
    expect(hasStatB).toBe(false);
  });
});

describe("predicateFor (preview, pre-open)", () => {
  it("uses Subtract for 1X2 and Add for totals", () => {
    expect(predicateFor(MARKETS[0]).op).toEqual({ subtract: {} });
    expect(predicateFor(totalsMarket(25, true)).op).toEqual({ add: {} });
  });

  it("agrees with market.rs on the over/under thresholds", () => {
    // Over 2.5 -> total > 2 ; Under 2.5 -> total < 3
    expect(predicateFor(totalsMarket(25, true))).toMatchObject({ threshold: 2, comparison: { greaterThan: {} } });
    expect(predicateFor(totalsMarket(25, false))).toMatchObject({ threshold: 3, comparison: { lessThan: {} } });
    // Over 10.5 corners -> total > 10
    expect(predicateFor(totalsMarket(105, true)).threshold).toBe(10);
  });
});

// ─────────────────────────── duel markets ───────────────────────────

describe("DUEL_MARKETS", () => {
  it("covers both unpriced MarketKinds", () => {
    const kinds = new Set(DUEL_MARKETS.map((m) => marketKey(m.marketArg)));
    expect(kinds).toEqual(new Set(["combinedTotal", "teamTotal"]));
  });

  it("covers every stat family", () => {
    const families = new Set(DUEL_MARKETS.map((m) => Object.keys(m.family)[0]));
    expect(families).toEqual(new Set(["goals", "yellows", "reds", "corners"]));
  });

  it("ships only settleable default lines", () => {
    for (const m of DUEL_MARKETS) expect(isSettleableLine(m.lineX10)).toBe(true);
  });

  it("addresses participant 2 with selection >= 2, per market.rs::derive_terms", () => {
    const away = DUEL_MARKETS.find((m) => m.key === "p2corners")!;
    expect(away.selection).toBe(2);
    const [, keyB] = statKeys(away.family, away.period);
    expect(keyB).toBe(8); // away corners
  });
});
