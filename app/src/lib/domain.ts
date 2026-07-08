import { txline } from "./txline";

export const probBps = (price: number) => Math.round(10_000_000 / price);
export const probPct = (price: number) => 10_000_000 / price / 100;
export const decimal = (price: number) => (price / 1000).toFixed(3);
export const clvBps = (entry: number, close: number) => close - entry;

export type MarketDef = {
  key: string; label: string; short: string;
  marketArg: any; selection: number; lineX10: number; priceIndex: number;
};

/** MVP markets: full-match 1X2. Anchor enum key is camelCased `result1X2`. */
export const MARKETS: MarketDef[] = [
  { key: "home", label: "Home win", short: "1", marketArg: { result1X2: {} }, selection: 0, lineX10: 0, priceIndex: 0 },
  { key: "draw", label: "Draw", short: "X", marketArg: { result1X2: {} }, selection: 1, lineX10: 0, priceIndex: 1 },
  { key: "away", label: "Away win", short: "2", marketArg: { result1X2: {} }, selection: 2, lineX10: 0, priceIndex: 2 },
];

/** Predicate/op used for both the settle CPI and the read-only Verify badge. */
export function predicateFor(market: MarketDef): { comparison: any; op: any; threshold: number } {
  const op = { subtract: {} }; // 1X2 uses P1 - P2
  if (market.selection === 0) return { comparison: { greaterThan: {} }, op, threshold: 0 };
  if (market.selection === 1) return { comparison: { equalTo: {} }, op, threshold: 0 };
  return { comparison: { lessThan: {} }, op, threshold: 0 };
}

/** A full-match 1X2 record at/as-of a time (odds/snapshot is live-only pre/post match). */
export async function pickOdds(fixtureId: number, asOf: number): Promise<any | null> {
  const d = await txline.oddsSnapshot(fixtureId, asOf).catch(() => []);
  if (!Array.isArray(d)) return null;
  return d.find((o) => /1X2/i.test(o.SuperOddsType) && o.MarketPeriod == null && Array.isArray(o.Prices) && o.Prices.length >= 3) ?? null;
}

export type TrajPoint = { t: number; home: number; draw: number; away: number; price0: number };

/** Implied-prob trajectory of the consensus 1X2 line over the pre-match window. */
export async function oddsTrajectory(fixtureId: number, start: number): Promise<TrajPoint[]> {
  const seen = new Set<number>();
  const pts: TrajPoint[] = [];
  for (let m = -180; m <= 0; m += 10) {
    const rec = await pickOdds(fixtureId, start + m * 60000);
    if (rec && !seen.has(Number(rec.Ts))) {
      seen.add(Number(rec.Ts));
      pts.push({ t: Number(rec.Ts), home: probPct(rec.Prices[0]), draw: probPct(rec.Prices[1]), away: probPct(rec.Prices[2]), price0: rec.Prices[0] });
    }
  }
  return pts.sort((a, b) => a.t - b.t);
}

/** Final result stat-validation (P1/P2 goals, keys 1 & 2). */
export async function finalResult(fixtureId: number): Promise<{ val: any; seq: number; p1: number; p2: number }> {
  const snap = await txline.scoresSnapshot(fixtureId);
  const entries = (Array.isArray(snap) ? snap : []).filter((e: any) => e.Seq != null).sort((a: any, b: any) => Number(b.Seq) - Number(a.Seq));
  for (const e of entries.slice(0, 12)) {
    try {
      const val = await txline.statValidation(fixtureId, e.Seq, 1, 2);
      return { val, seq: Number(e.Seq), p1: val.statToProve.value, p2: val.statToProve2.value };
    } catch { /* try next seq */ }
  }
  throw new Error("no stat-validation available for this fixture yet");
}

export function marketWon(market: MarketDef, p1: number, p2: number): boolean {
  if (market.selection === 0) return p1 > p2;
  if (market.selection === 1) return p1 === p2;
  return p1 < p2;
}
