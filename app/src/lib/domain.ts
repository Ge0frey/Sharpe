import { txline } from "./txline";

export const probBps = (price: number) => Math.round(10_000_000 / price);
export const probPct = (price: number) => 10_000_000 / price / 100;
export const decimal = (price: number) => (price / 1000).toFixed(3);
export const clvBps = (entry: number, close: number) => close - entry;

/**
 * Mirrors `programs/clv/src/market.rs`. Any divergence here is a settlement bug:
 * the program derives the predicate from these same inputs and stores it, so a
 * mismatched `selection` or `lineX10` means the UI shows one bet and the chain
 * settles another. `src/lib/codec.test.ts` pins the mapping.
 *
 * anchor-ts camelCases IDL variant names, so `Result1x2` becomes `result1X2`
 * (capital X) while `TotalsOu` becomes `totalsOu`.
 */
export const GOALS = { goals: {} };
export const YELLOWS = { yellows: {} };
export const REDS = { reds: {} };
export const CORNERS = { corners: {} };

export const RESULT_1X2 = { result1X2: {} };
export const TOTALS_OU = { totalsOu: {} };
export const COMBINED_TOTAL = { combinedTotal: {} };
export const TEAM_TOTAL = { teamTotal: {} };

export type MarketDef = {
  key: string;
  label: string;
  short: string;
  marketArg: any;
  family: any;
  period: number;
  selection: number;
  lineX10: number;
  /** `price_names` is [part1,draw,part2] or [over,under]; the program requires index === selection. */
  priceIndex: number;
};

/** Priced markets — these have a consensus line, so they can carry CLV. */
export const MARKETS: MarketDef[] = [
  { key: "home", label: "Home win", short: "1", marketArg: RESULT_1X2, family: GOALS, period: 0, selection: 0, lineX10: 0, priceIndex: 0 },
  { key: "draw", label: "Draw", short: "X", marketArg: RESULT_1X2, family: GOALS, period: 0, selection: 1, lineX10: 0, priceIndex: 1 },
  { key: "away", label: "Away win", short: "2", marketArg: RESULT_1X2, family: GOALS, period: 0, selection: 2, lineX10: 0, priceIndex: 2 },
];

/** First-half 1X2 — priced by the `half=1` variant, settled on stat keys 1001/1002. */
export const H1_MARKETS: MarketDef[] = [
  { key: "h1home", label: "1H Home", short: "1", marketArg: RESULT_1X2, family: GOALS, period: 1, selection: 0, lineX10: 0, priceIndex: 0 },
  { key: "h1draw", label: "1H Draw", short: "X", marketArg: RESULT_1X2, family: GOALS, period: 1, selection: 1, lineX10: 0, priceIndex: 1 },
  { key: "h1away", label: "1H Away", short: "2", marketArg: RESULT_1X2, family: GOALS, period: 1, selection: 2, lineX10: 0, priceIndex: 2 },
];

/** Over/Under goals at a given line. Priced by `OVERUNDER_PARTICIPANT_GOALS`. */
export function totalsMarket(lineX10: number, over: boolean, period = 0): MarketDef {
  const l = (lineX10 / 10).toFixed(1);
  return {
    key: `ou${period}_${lineX10}_${over ? "o" : "u"}`,
    label: `${over ? "Over" : "Under"} ${l}`,
    short: over ? "O" : "U",
    marketArg: TOTALS_OU,
    family: GOALS,
    period,
    selection: over ? 0 : 1,
    lineX10,
    priceIndex: over ? 0 : 1,
  };
}

/** The odds record that prices a given market, as the program's `bind_odds` sees it. */
export const SUPER_TYPE: Record<string, string> = {
  result1X2: "1X2_PARTICIPANT_RESULT",
  totalsOu: "OVERUNDER_PARTICIPANT_GOALS",
};
export const marketKey = (m: any) => Object.keys(m)[0];
export const periodStr = (p: number) => (p === 0 ? null : p === 1 ? "half=1" : "half=2");

/**
 * Parse `MarketParameters` of the form `line=2.5` into tenths, mirroring
 * `market.rs::parse_line_x10`. Returns null for anything the program refuses:
 * quarter lines (`line=0.75`) are split stakes, and both they and whole lines
 * (`line=3`) lack a boolean answer.
 */
export function parseLineX10(raw: string | null | undefined): number | null {
  if (!raw?.startsWith("line=")) return null;
  const v = Number(raw.slice(5));
  if (!Number.isFinite(v)) return null;
  const x100 = Math.round(v * 100);
  if (x100 % 10 !== 0) return null; // quarter line
  return x100 / 10;
}
/** Over/Under needs a half-integer line, or a push has no boolean answer. */
export const isSettleableLine = (x10: number) => x10 > 0 && Math.abs(x10) % 10 === 5;

/**
 * Duel markets have NO consensus line — no bookmaker prices "both teams' corners
 * over 10.5". That is the point: they need only a provable stat, so they settle
 * from `validate_stat` alone and carry a USDT stake instead of a CLV score.
 *
 * `sides` names the two outcomes the creator chooses between.
 */
export type DuelMarket = {
  key: string;
  label: string;
  marketArg: any;
  family: any;
  period: number;
  selection: number;
  lineX10: number;
  sides: [string, string];
  describe: (line: number) => string;
};

export const DUEL_MARKETS: DuelMarket[] = [
  { key: "corners", label: "Combined corners", marketArg: COMBINED_TOTAL, family: CORNERS, period: 0, selection: 0, lineX10: 105, sides: ["Over", "Under"], describe: (l) => `Both teams' corners over ${(l / 10).toFixed(1)}` },
  { key: "yellows", label: "Combined yellow cards", marketArg: COMBINED_TOTAL, family: YELLOWS, period: 0, selection: 0, lineX10: 35, sides: ["Over", "Under"], describe: (l) => `Both teams' yellows over ${(l / 10).toFixed(1)}` },
  { key: "reds", label: "Combined red cards", marketArg: COMBINED_TOTAL, family: REDS, period: 0, selection: 0, lineX10: 5, sides: ["Over", "Under"], describe: (l) => `Both teams' reds over ${(l / 10).toFixed(1)}` },
  { key: "h1corners", label: "1st-half corners", marketArg: COMBINED_TOTAL, family: CORNERS, period: 1, selection: 0, lineX10: 55, sides: ["Over", "Under"], describe: (l) => `1st-half corners over ${(l / 10).toFixed(1)}` },
  { key: "goals", label: "Combined goals", marketArg: COMBINED_TOTAL, family: GOALS, period: 0, selection: 0, lineX10: 25, sides: ["Over", "Under"], describe: (l) => `Total goals over ${(l / 10).toFixed(1)}` },
  // TeamTotal: a single participant's stat. selection 0/1 = P1 over/under, 2/3 = P2 over/under.
  { key: "p1corners", label: "Home team corners", marketArg: TEAM_TOTAL, family: CORNERS, period: 0, selection: 0, lineX10: 45, sides: ["Over", "Under"], describe: (l) => `Home corners over ${(l / 10).toFixed(1)}` },
  { key: "p2corners", label: "Away team corners", marketArg: TEAM_TOTAL, family: CORNERS, period: 0, selection: 2, lineX10: 45, sides: ["Over", "Under"], describe: (l) => `Away corners over ${(l / 10).toFixed(1)}` },
  { key: "p1goals", label: "Home team goals", marketArg: TEAM_TOTAL, family: GOALS, period: 0, selection: 0, lineX10: 15, sides: ["Over", "Under"], describe: (l) => `Home goals over ${(l / 10).toFixed(1)}` },
  { key: "p2goals", label: "Away team goals", marketArg: TEAM_TOTAL, family: GOALS, period: 0, selection: 2, lineX10: 15, sides: ["Over", "Under"], describe: (l) => `Away goals over ${(l / 10).toFixed(1)}` },
];

/** Base stat keys per family, mirroring `market.rs::base_keys`. */
export function statKeys(family: any, period: number): [number, number] {
  const base: Record<string, [number, number]> = { goals: [1, 2], yellows: [3, 4], reds: [5, 6], corners: [7, 8] };
  const [a, b] = base[Object.keys(family)[0]];
  return [period * 1000 + a, period * 1000 + b];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a stored account back.
//
// A Prediction persists `market`, `period`, `selection` and `line_x10`, plus the
// derived predicate. Reconstructing a MarketDef from `selection` alone silently
// mislabels every Totals bet, so it is rebuilt from all four fields.
// ─────────────────────────────────────────────────────────────────────────────

export function marketFromAccount(p: any): MarketDef {
  const kind = marketKey(p.market);
  const period: number = p.period ?? 0;
  if (kind === "totalsOu") return totalsMarket(p.lineX10, p.selection === 0, period);
  const table = period === 1 ? H1_MARKETS : MARKETS;
  return table[p.selection] ?? table[0];
}

/**
 * The predicate the CHAIN stored, not one re-derived from a label. The Verify
 * modal must ask `validate_stat` the exact question `settle_outcome` asked, or it
 * proves a different bet and reports a different answer.
 *
 * `comparison` is 0 GT | 1 LT | 2 EQ (see `constants.rs`).
 */
export function storedPredicate(p: any): { predicate: any; op: any; hasStatB: boolean } {
  const comparison = p.comparison === 1 ? { lessThan: {} } : p.comparison === 2 ? { equalTo: {} } : { greaterThan: {} };
  return {
    predicate: { threshold: p.threshold, comparison },
    op: p.hasStatB ? (p.opAdd ? { add: {} } : { subtract: {} }) : null,
    hasStatB: !!p.hasStatB,
  };
}

/** Predicate for a market that has not been opened yet (preview only). */
export function predicateFor(market: MarketDef): { comparison: any; op: any; threshold: number } {
  const kind = marketKey(market.marketArg);
  if (kind === "result1X2") {
    const op = { subtract: {} }; // (P1 - P2) vs 0
    if (market.selection === 0) return { comparison: { greaterThan: {} }, op, threshold: 0 };
    if (market.selection === 1) return { comparison: { equalTo: {} }, op, threshold: 0 };
    return { comparison: { lessThan: {} }, op, threshold: 0 };
  }
  // Totals / CombinedTotal: (A + B) vs line. Over 2.5 -> total > 2; Under 2.5 -> total < 3.
  const whole = Math.trunc(market.lineX10 / 10);
  const over = market.selection % 2 === 0;
  return {
    comparison: over ? { greaterThan: {} } : { lessThan: {} },
    op: { add: {} },
    threshold: over ? whole : whole + 1,
  };
}

/**
 * The odds record for a market at/as-of a time. Must match `bind_odds` exactly:
 * an authentic `half=1` quote is a real record that settles a different bet.
 */
export function findOdds(offers: any[], market: MarketDef): any | null {
  const kind = marketKey(market.marketArg);
  const wantType = SUPER_TYPE[kind];
  const wantPeriod = periodStr(market.period);
  return offers.find((o) => {
    if (o.SuperOddsType !== wantType) return false;
    if ((o.MarketPeriod ?? null) !== wantPeriod) return false;
    if (!Array.isArray(o.Prices) || o.Prices.length <= market.priceIndex) return false;
    if (kind === "result1X2") return o.MarketParameters == null;
    return parseLineX10(o.MarketParameters) === market.lineX10;
  }) ?? null;
}

export async function pickOddsFor(fixtureId: number, asOf: number, market: MarketDef): Promise<any | null> {
  const d = await txline.oddsSnapshot(fixtureId, asOf).catch(() => []);
  return Array.isArray(d) ? findOdds(d, market) : null;
}

/** Full-match 1X2 at/as-of a time. */
export const pickOdds = (fixtureId: number, asOf: number) => pickOddsFor(fixtureId, asOf, MARKETS[0]);

/**
 * Every market a fixture is currently priced for, grouped for the ticket.
 * Totals lines are discovered from the feed rather than hardcoded, and lines the
 * program cannot settle (quarter lines, whole lines) are dropped here so the user
 * is never offered a bet that would be rejected on-chain.
 */
export type MarketGroup = { key: string; label: string; markets: MarketDef[] };

export function availableMarkets(offers: any[]): MarketGroup[] {
  const groups: MarketGroup[] = [];
  if (findOdds(offers, MARKETS[0])) groups.push({ key: "result", label: "Result", markets: MARKETS });

  const lines = [...new Set(
    offers
      .filter((o) => o.SuperOddsType === SUPER_TYPE.totalsOu && (o.MarketPeriod ?? null) === null)
      .map((o) => parseLineX10(o.MarketParameters))
      .filter((x): x is number => x !== null && isSettleableLine(x)),
  )].sort((a, b) => a - b);
  const totals = lines.flatMap((l) => [totalsMarket(l, true), totalsMarket(l, false)]);
  if (totals.length) groups.push({ key: "totals", label: "Total goals", markets: totals });

  if (findOdds(offers, H1_MARKETS[0])) groups.push({ key: "h1", label: "1st half", markets: H1_MARKETS });
  return groups;
}

/**
 * A match is over when a scores update carries `Action: "game_finalised"`.
 * The documented `gameState: 5` never appears on this feed — `GameState` stays
 * the string "scheduled" even on a settled fixture.
 */
export function isFinalised(entries: any[]): boolean {
  return entries.some((e) => e?.Action === "game_finalised");
}

/** Final stat-validation for an arbitrary key pair. */
export async function finalStat(fixtureId: number, statKey: number, statKey2?: number) {
  const snap = await txline.scoresSnapshot(fixtureId);
  const entries = (Array.isArray(snap) ? snap : []).filter((e: any) => e.Seq != null).sort((a: any, b: any) => Number(b.Seq) - Number(a.Seq));
  for (const e of entries.slice(0, 12)) {
    try {
      const val = await txline.statValidation(fixtureId, e.Seq, statKey, statKey2);
      return { val, seq: Number(e.Seq), a: val.statToProve.value, b: val.statToProve2?.value, finalised: isFinalised(entries) };
    } catch { /* try next seq */ }
  }
  throw new Error("no stat-validation available for this fixture yet");
}

/** Final result (P1/P2 goals, keys 1 & 2). */
export async function finalResult(fixtureId: number): Promise<{ val: any; seq: number; p1: number; p2: number }> {
  const { val, seq, a, b } = await finalStat(fixtureId, 1, 2);
  return { val, seq, p1: a, p2: b };
}

export function marketWon(market: MarketDef, p1: number, p2: number): boolean {
  if (marketKey(market.marketArg) === "result1X2") {
    if (market.selection === 0) return p1 > p2;
    if (market.selection === 1) return p1 === p2;
    return p1 < p2;
  }
  const { threshold, comparison } = predicateFor(market);
  const total = p1 + p2;
  return "greaterThan" in comparison ? total > threshold : total < threshold;
}

export type TrajPoint = { t: number; home: number; draw: number; away: number; price0: number };

/** Implied-prob trajectory of the consensus 1X2 line over the pre-match window. */
export async function oddsTrajectory(fixtureId: number, start: number): Promise<TrajPoint[]> {
  const seen = new Set<number>();
  const pts: TrajPoint[] = [];
  const recs = await Promise.all(
    Array.from({ length: 19 }, (_, i) => pickOdds(fixtureId, start + (-180 + i * 10) * 60000).catch(() => null)),
  );
  for (const rec of recs) {
    if (rec && !seen.has(Number(rec.Ts))) {
      seen.add(Number(rec.Ts));
      pts.push({ t: Number(rec.Ts), home: probPct(rec.Prices[0]), draw: probPct(rec.Prices[1]), away: probPct(rec.Prices[2]), price0: rec.Prices[0] });
    }
  }
  return pts.sort((a, b) => a.t - b.t);
}
