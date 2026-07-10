/**
 * Golden-vector tests for the off-chain → on-chain codec.
 *
 * These are frozen, real `/validation` responses from devnet fixture 18172379.
 * A Merkle leaf is hashed from the record's exact bytes, so any reformatting here
 * — a renamed field, a base64 string left undecoded, a number widened to a BN in
 * the wrong place — changes the leaf and the proof fails with `InvalidSubTreeProof`.
 * That failure surfaces as an opaque on-chain error, hours later, on someone
 * else's money. So it gets pinned here instead.
 *
 * Also pins the two shapes the API is inconsistent about:
 *   - `summary.eventStatsSubTreeRoot` (API) -> `eventsSubTreeRoot` (program)
 *   - `/fixtures/validation` returns roots as byte arrays; /odds and /scores base64
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BN } from "@coral-xyz/anchor";

import { b64ToBytes, nodes, oddsToProgram, oddsSummary, scoresSummary, statTerm, fixtureToProgram, fixtureSummary, msgHash } from "./codec";
import oddsVal from "./__fixtures__/odds-validation.json";
import statVal from "./__fixtures__/stat-validation.json";
import fixtureVal from "./__fixtures__/fixture-validation.json";

const bn = (v: any) => (v as BN).toString();

describe("b64ToBytes", () => {
  it("accepts base64, byte arrays and 0x-hex, always yielding 32 bytes", () => {
    const b64 = Buffer.alloc(32, 7).toString("base64");
    expect(b64ToBytes(b64)).toEqual(Array(32).fill(7));
    expect(b64ToBytes(Array(32).fill(3))).toEqual(Array(32).fill(3));
    expect(b64ToBytes("0x" + "ab".repeat(32))).toEqual(Array(32).fill(0xab));
  });

  it("refuses anything that is not 32 bytes — a short root would silently mis-prove", () => {
    expect(() => b64ToBytes(Buffer.alloc(31).toString("base64"))).toThrow(/32 bytes/);
    expect(() => b64ToBytes(Array(33).fill(0))).toThrow(/32 bytes/);
  });
});

describe("nodes", () => {
  it("maps a proof path, preserving sibling order", () => {
    const out = nodes((oddsVal as any).mainTreeProof);
    expect(out.length).toBe((oddsVal as any).mainTreeProof.length);
    for (const n of out) {
      expect(n.hash).toHaveLength(32);
      expect(typeof n.isRightSibling).toBe("boolean");
    }
  });

  it("treats an absent proof as an empty path (the `Nil` case)", () => {
    // /fixtures/validation returns updateCount=1, so the snapshot IS the sub-tree root.
    expect(nodes((fixtureVal as any).subTreeProof)).toEqual([]);
    expect(nodes(undefined)).toEqual([]);
    expect(nodes(null)).toEqual([]);
  });
});

describe("oddsToProgram", () => {
  const o = oddsToProgram((oddsVal as any).odds);

  it("renames PascalCase to camelCase without touching the values", () => {
    expect(o.messageId).toBe("1835911702:00003:000062-10021-stab");
    expect(bn(o.ts)).toBe("1782946778900");
    expect(bn(o.fixtureId)).toBe("18172379");
    expect(o.superOddsType).toBe("1X2_PARTICIPANT_RESULT");
    expect(o.prices).toEqual([1387, 5600, 9971]);
    expect(o.priceNames).toEqual(["part1", "draw", "part2"]);
  });

  it("carries the market discriminators the program binds against", () => {
    // A null marketPeriod is a full-match line; "half=1" would settle a different bet.
    expect(o.marketPeriod).toBeNull();
    expect(o.marketParameters).toBeNull();
    expect(o.inRunning).toBe(false);
  });

  it("maps absent optionals to null, not undefined — Borsh cannot encode undefined", () => {
    const stripped = oddsToProgram({ ...(oddsVal as any).odds, GameState: undefined, MarketPeriod: undefined, MarketParameters: undefined });
    expect(stripped.gameState).toBeNull();
    expect(stripped.marketPeriod).toBeNull();
    expect(stripped.marketParameters).toBeNull();
  });
});

describe("oddsSummary", () => {
  it("decodes the sub-tree root and widens the timestamps", () => {
    const s = oddsSummary((oddsVal as any).summary);
    expect(s.oddsSubTreeRoot).toHaveLength(32);
    expect(bn(s.fixtureId)).toBe("18172379");
    expect(bn(s.updateStats.minTimestamp)).toBe(String((oddsVal as any).summary.updateStats.minTimestamp));
    expect(typeof s.updateStats.updateCount).toBe("number");
  });
});

describe("scoresSummary", () => {
  it("renames eventStatsSubTreeRoot to eventsSubTreeRoot", () => {
    // The API and the program disagree on this field's name. Getting it wrong
    // produces a valid-looking struct whose leaf hash is nonsense.
    const api = (statVal as any).summary;
    expect(api).toHaveProperty("eventStatsSubTreeRoot");
    const s = scoresSummary(api);
    expect(s).toHaveProperty("eventsSubTreeRoot");
    expect(s).not.toHaveProperty("eventStatsSubTreeRoot");
    expect(s.eventsSubTreeRoot).toHaveLength(32);
  });
});

describe("statTerm", () => {
  it("selects the first or second stat and its own proof path", () => {
    const a = statTerm(statVal as any, 1);
    const b = statTerm(statVal as any, 2);
    expect(a.statToProve).toEqual({ key: 1, value: 2, period: 0 });
    expect(b.statToProve).toEqual({ key: 2, value: 0, period: 0 });
    // USA 2-0 Bosnia. Both stats share one event-stat root but have distinct proofs.
    expect(a.eventStatRoot).toEqual(b.eventStatRoot);
    expect(a.statProof).not.toEqual(b.statProof);
  });

  it("keeps the period inside the key, not the period field", () => {
    // Full-match goals are keys 1/2 with period 0; H1 goals would be keys 1001/1002,
    // still with period 0. The program's stat_keys() encodes it the same way.
    expect(statTerm(statVal as any, 1).statToProve.period).toBe(0);
  });
});

describe("fixtureToProgram / fixtureSummary", () => {
  const snap = (fixtureVal as any).snapshot;
  const sum = (fixtureVal as any).summary;

  it("proves the kickoff the timing guards depend on", () => {
    const f = fixtureToProgram(snap);
    expect(bn(f.startTime)).toBe("1782950400000");
    expect(f.participant1).toBe("USA");
    expect(f.participant1IsHome).toBe(true);
  });

  it("keeps the snapshot's sport-tagged id distinct from the public one", () => {
    // snapshot.FixtureId packs a sport tag in the high bits (3 here, 1 on other
    // fixtures). Only summary.fixture_id matches the id /odds and /scores use, and
    // only the low 48 bits of the snapshot id agree with it.
    const f = fixtureToProgram(snap);
    expect(bn(f.fixtureId)).toBe("844424948304347");
    expect(bn(fixtureSummary(sum).fixtureId)).toBe("18172379");
    expect(BigInt(bn(f.fixtureId)) & ((1n << 48n) - 1n)).toBe(18172379n);
  });

  it("decodes a root delivered as a byte array, not base64", () => {
    expect(Array.isArray(sum.updateSubTreeRoot)).toBe(true);
    expect(fixtureSummary(sum).updateSubTreeRoot).toHaveLength(32);
  });
});

describe("msgHash", () => {
  it("matches the sha256 the program recomputes over odds.message_id", () => {
    const h = msgHash("1835911702:00003:000062-10021-stab");
    expect(h).toHaveLength(32);
    // sha256 of the exact MessageId string, as `prove_entry` computes it.
    expect(Buffer.from(h).toString("hex")).toBe(
      createHash("sha256").update("1835911702:00003:000062-10021-stab", "utf8").digest("hex"),
    );
  });

  it("separates two quotes that differ only in their message id", () => {
    expect(msgHash("a")).not.toEqual(msgHash("b"));
  });
});
