import { BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
// @noble/hashes v2 moved sha256 into sha2, and only exports the `.js` specifier.
import { sha256 } from "@noble/hashes/sha2.js";

/**
 * 32-byte Merkle hash/root -> number[] for Anchor.
 * TxLINE's /validation endpoints return roots and proof hashes as JSON byte
 * arrays (despite the schema saying string), but may also send base64 or 0x-hex.
 * Accept all three shapes.
 */
export function b64ToBytes(s: any): number[] {
  let b: Buffer;
  if (Array.isArray(s) || s instanceof Uint8Array) b = Buffer.from(s as any);
  else if (typeof s === "string") b = s.startsWith("0x") ? Buffer.from(s.slice(2), "hex") : Buffer.from(s, "base64");
  else throw new Error(`unexpected hash type: ${typeof s}`);
  if (b.length !== 32) throw new Error(`expected 32 bytes, got ${b.length}`);
  return [...b];
}

export function nodes(list: any): { hash: number[]; isRightSibling: boolean }[] {
  return Array.isArray(list) ? list.map((n) => ({ hash: b64ToBytes(n.hash), isRightSibling: !!n.isRightSibling })) : [];
}

/** TxLINE odds JSON (PascalCase) -> program `Odds` (camelCase, options as null). */
export function oddsToProgram(o: any) {
  return {
    fixtureId: new BN(o.FixtureId),
    messageId: o.MessageId,
    ts: new BN(o.Ts),
    bookmaker: o.Bookmaker,
    bookmakerId: o.BookmakerId,
    superOddsType: o.SuperOddsType,
    gameState: o.GameState ?? null,
    inRunning: !!o.InRunning,
    marketParameters: o.MarketParameters ?? null,
    marketPeriod: o.MarketPeriod ?? null,
    priceNames: o.PriceNames ?? [],
    prices: o.Prices ?? [],
  };
}

export function oddsSummary(s: any) {
  return {
    fixtureId: new BN(s.fixtureId),
    updateStats: {
      updateCount: s.updateStats.updateCount,
      minTimestamp: new BN(s.updateStats.minTimestamp),
      maxTimestamp: new BN(s.updateStats.maxTimestamp),
    },
    oddsSubTreeRoot: b64ToBytes(s.oddsSubTreeRoot),
  };
}

export function scoresSummary(s: any) {
  return {
    fixtureId: new BN(s.fixtureId),
    updateStats: {
      updateCount: s.updateStats.updateCount,
      minTimestamp: new BN(s.updateStats.minTimestamp),
      maxTimestamp: new BN(s.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: b64ToBytes(s.eventStatsSubTreeRoot), // API name -> program name
  };
}

/** Build a program `StatTerm` from a stat-validation response (which = 1 or 2). */
export function statTerm(v: any, which: 1 | 2) {
  return {
    statToProve: which === 1 ? v.statToProve : v.statToProve2,
    eventStatRoot: b64ToBytes(v.eventStatRoot),
    statProof: nodes(which === 1 ? v.statProof : v.statProof2),
  };
}

/** TxLINE fixture JSON (PascalCase) -> program `Fixture` (camelCase). */
export function fixtureToProgram(f: any) {
  return {
    ts: new BN(f.Ts),
    startTime: new BN(f.StartTime),
    competition: f.Competition,
    competitionId: f.CompetitionId,
    fixtureGroupId: f.FixtureGroupId,
    participant1Id: f.Participant1Id,
    participant1: f.Participant1,
    participant2Id: f.Participant2Id,
    participant2: f.Participant2,
    fixtureId: new BN(f.FixtureId),
    participant1IsHome: !!f.Participant1IsHome,
  };
}

/**
 * `/fixtures/validation` returns `updateSubTreeRoot` as a JSON byte array, unlike
 * the odds/scores summaries which are base64. `b64ToBytes` accepts both shapes.
 */
export function fixtureSummary(s: any) {
  return {
    fixtureId: new BN(s.fixtureId),
    competitionId: s.competitionId,
    competition: s.competition,
    updateStats: {
      updateCount: s.updateStats.updateCount,
      minTimestamp: new BN(s.updateStats.minTimestamp),
      maxTimestamp: new BN(s.updateStats.maxTimestamp),
    },
    updateSubTreeRoot: b64ToBytes(s.updateSubTreeRoot),
  };
}

/**
 * Pins which quote a prediction was opened against. The program recomputes
 * `sha256(odds.message_id)` in `prove_entry` and refuses any other record, so a
 * deferred proof cannot substitute a better line quoted in the same millisecond.
 */
export function msgHash(messageId: string): number[] {
  return [...sha256(new TextEncoder().encode(messageId))];
}
