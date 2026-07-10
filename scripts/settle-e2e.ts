/**
 * M1 devnet integration test — drive the full clv lifecycle against REAL txoracle roots:
 *
 *   prove_fixture   (CPI validate_fixture — the kickoff)
 *   open_prediction (no CPI               — the commitment)
 *   prove_entry     (CPI validate_odds    — the entry line, once its root is posted)
 *   settle_close    (CPI validate_odds    — the closing line)
 *   settle_outcome  (CPI validate_stat    — the result)
 *
 * The positive path is only half the test. Each guard is also asserted to REJECT:
 * an authentic first-half line cannot prove a full-match bet, a line quoted after
 * the proven kickoff cannot open a prediction, a price index must name the outcome
 * that was selected, and the proven quote must be the one that was committed to.
 * A guard nobody has watched fail is not a guard.
 *
 *   node --experimental-strip-types scripts/settle-e2e.ts
 * Env: RPC_URL, WALLET, FIXTURE
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import axios from "axios";

const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;
const RPC_URL = process.env.RPC_URL ?? "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const API = "https://txline-dev.txodds.com";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const FIXTURE = Number(process.env.FIXTURE ?? 18172379); // USA 2-0 Bosnia
const WALLET_PATH = process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const STATE_PATH = path.join(import.meta.dirname, ".state.json");
const CLV_IDL = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../target/idl/clv.json"), "utf8"));

const ERR: Record<string, number> = Object.fromEntries(CLV_IDL.errors.map((e: any) => [e.name, e.code]));

const log = (...a: unknown[]) => console.log(...a);
const hr = (t: string) => log(`\n──────── ${t} ────────`);
const PASS = (s: string) => log(`  ✓ ${s}`);

/** Merkle roots arrive base64 from /odds and /scores, but as a byte array from /fixtures. */
const toBytes32 = (v: any): number[] => {
  const b = Array.isArray(v) ? Buffer.from(v) : Buffer.from(String(v), "base64");
  if (b.length !== 32) throw new Error(`bad root len ${b.length}`);
  return [...b];
};
const nodes = (l: any) => (Array.isArray(l) ? l.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: !!n.isRightSibling })) : []);
const epochDayPda = (seed: string, tsMs: number) => {
  const d = Math.floor(tsMs / 86_400_000);
  const b = Buffer.alloc(2); b.writeUInt16LE(d);
  return PublicKey.findProgramAddressSync([Buffer.from(seed), b], TXORACLE_PID)[0];
};
/** Fixtures roots are bucketed into 10-day windows. */
const fixturesRootPda = (tsMs: number) => {
  const aligned = Math.floor(Math.floor(tsMs / 86_400_000) / 10) * 10;
  const b = Buffer.alloc(2); b.writeUInt16LE(aligned);
  return PublicKey.findProgramAddressSync([Buffer.from("ten_daily_fixtures_roots"), b], TXORACLE_PID)[0];
};

const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: "confirmed" });
anchor.setProvider(provider);
const program = new anchor.Program(CLV_IDL, provider);
const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const authGet = (url: string, params?: object) =>
  axios.get(`${API}${url}`, { params, timeout: 30000, headers: { Authorization: `Bearer ${state.jwt}`, "X-Api-Token": state.apiToken } });

const oddsToProgram = (o: any) => ({
  fixtureId: new BN(o.FixtureId), messageId: o.MessageId, ts: new BN(o.Ts), bookmaker: o.Bookmaker,
  bookmakerId: o.BookmakerId, superOddsType: o.SuperOddsType, gameState: o.GameState ?? null, inRunning: !!o.InRunning,
  marketParameters: o.MarketParameters ?? null, marketPeriod: o.MarketPeriod ?? null, priceNames: o.PriceNames ?? [], prices: o.Prices ?? [],
});
const oddsSummary = (s: any) => ({
  fixtureId: new BN(s.fixtureId),
  updateStats: { updateCount: s.updateStats.updateCount, minTimestamp: new BN(s.updateStats.minTimestamp), maxTimestamp: new BN(s.updateStats.maxTimestamp) },
  oddsSubTreeRoot: toBytes32(s.oddsSubTreeRoot),
});
const scoresSummary = (s: any) => ({
  fixtureId: new BN(s.fixtureId),
  updateStats: { updateCount: s.updateStats.updateCount, minTimestamp: new BN(s.updateStats.minTimestamp), maxTimestamp: new BN(s.updateStats.maxTimestamp) },
  eventsSubTreeRoot: toBytes32(s.eventStatsSubTreeRoot),
});
const fixtureToProgram = (f: any) => ({
  ts: new BN(f.Ts), startTime: new BN(f.StartTime), competition: f.Competition, competitionId: f.CompetitionId,
  fixtureGroupId: f.FixtureGroupId, participant1Id: f.Participant1Id, participant1: f.Participant1,
  participant2Id: f.Participant2Id, participant2: f.Participant2, fixtureId: new BN(f.FixtureId),
  participant1IsHome: !!f.Participant1IsHome,
});
const fixtureSummaryToProgram = (s: any) => ({
  fixtureId: new BN(s.fixtureId), competitionId: s.competitionId, competition: s.competition,
  updateStats: { updateCount: s.updateStats.updateCount, minTimestamp: new BN(s.updateStats.minTimestamp), maxTimestamp: new BN(s.updateStats.maxTimestamp) },
  updateSubTreeRoot: toBytes32(s.updateSubTreeRoot),
});

/** Pins which quote was taken; the program recomputes this over `odds.message_id`. */
const msgHash = (messageId: string): number[] => [...createHash("sha256").update(messageId, "utf8").digest()];

const cuIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
const fixturePda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("fixture"), new BN(id).toArrayLike(Buffer, "le", 8)], program.programId)[0];
const predictionPda = (id: any) => PublicKey.findProgramAddressSync([Buffer.from("prediction"), keypair.publicKey.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)], program.programId)[0];

/** Simulate an instruction and assert it fails with a specific ClvError. */
async function expectReject(label: string, ix: any, errName: string) {
  const want = ERR[errName];
  if (want === undefined) throw new Error(`unknown error name ${errName}`);
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: keypair.publicKey, recentBlockhash: blockhash, instructions: [cuIx(), ix] }).compileToV0Message();
  const sim = await connection.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  const err: any = sim.value.err;
  const custom = err?.InstructionError?.[1]?.Custom;
  if (custom !== want) {
    log("  logs:\n   " + (sim.value.logs ?? []).slice(-8).join("\n   "));
    throw new Error(`${label}: expected ${errName} (${want}), got ${JSON.stringify(err)}`);
  }
  PASS(`${label} → rejected with ${errName}`);
}

/** Full-match 1X2 record at/as-of a point in time. */
async function pickOdds(start: number, offMs: number, period: string | null = null): Promise<any | null> {
  const d = (await authGet(`/api/odds/snapshot/${FIXTURE}`, { asOf: start + offMs })).data;
  if (!Array.isArray(d)) return null;
  return d.find((o) => /1X2/i.test(o.SuperOddsType) && (o.MarketPeriod ?? null) === period && Array.isArray(o.Prices) && o.Prices.length >= 3) ?? null;
}
const validateOdds = async (rec: any) => (await authGet(`/api/odds/validation`, { messageId: rec.MessageId, ts: rec.Ts })).data;

async function main() {
  log("wallet:", keypair.publicKey.toBase58(), "clv:", program.programId.toBase58(), "fixture:", FIXTURE);
  const cfg = configPda();

  hr("initialize_config (idempotent)");
  if (!(await connection.getAccountInfo(cfg))) {
    const sig = await program.methods.initializeConfig().accounts({ admin: keypair.publicKey, config: cfg, systemProgram: SystemProgram.programId }).rpc();
    log("initialized config:", sig);
  } else log("config already initialized");

  // ── prove_fixture ────────────────────────────────────────────────────────
  // /fixtures/snapshot is forward-looking and omits finished fixtures; the
  // validation endpoint resolves any id AND proves it.
  hr("prove_fixture  (CPI validate_fixture — the kickoff)");
  const fxVal = (await authGet(`/api/fixtures/validation`, { fixtureId: FIXTURE })).data;
  const snap = fxVal.snapshot;
  const start = Number(snap.StartTime);
  log(`fixture: ${snap.Participant1} vs ${snap.Participant2}   kickoff=${new Date(start).toISOString()}`);

  const facts = fixturePda(FIXTURE);
  const rootsPda = fixturesRootPda(Number(snap.Ts));
  if (!(await connection.getAccountInfo(facts))) {
    const sig = await program.methods
      .proveFixture(new BN(FIXTURE), fixtureToProgram(snap), fixtureSummaryToProgram(fxVal.summary), nodes(fxVal.subTreeProof), nodes(fxVal.mainTreeProof))
      .accounts({ prover: keypair.publicKey, fixtureFacts: facts, tenDailyFixturesRoots: rootsPda, txoracleProgram: TXORACLE_PID, systemProgram: SystemProgram.programId })
      .preInstructions([cuIx()]).rpc();
    log("proved fixture:", sig);
  } else log("fixture already proven (write-once)");
  const ff = await program.account.fixtureFacts.fetch(facts);
  PASS(`on-chain kickoff = ${new Date(Number(ff.startTime)).toISOString()} (proven, not trusted)`);

  // ── gather odds records ──────────────────────────────────────────────────
  const entryRec = (await pickOdds(start, -3_600_000)) ?? (await pickOdds(start, -1_800_000));
  if (!entryRec) throw new Error("no entry 1X2 odds");
  let closeRec = (await pickOdds(start, -60_000)) ?? (await pickOdds(start, -300_000));
  if (closeRec && closeRec.Ts === entryRec.Ts) closeRec = await pickOdds(start, -900_000);
  if (!closeRec) throw new Error("no closing 1X2 odds");
  const h1Rec = await pickOdds(start, -1_800_000, "half=1");
  const inPlayRec = await pickOdds(start, +900_000);

  const entryVal = await validateOdds(entryRec);
  const closeVal = await validateOdds(closeRec);
  log(`entry  ts=${entryVal.odds.Ts} prices=${entryVal.odds.Prices}`);
  log(`close  ts=${closeVal.odds.Ts} prices=${closeVal.odds.Prices}`);

  // anchor-ts camelCases IDL variant names: `Result1x2` -> `result1X2` (note the capital X).
  const GOALS = { goals: {} }, R1X2 = { result1X2: {} };

  const openIx = (id: any, rec: any, opts: { period?: number; market?: any; selection?: number; line?: number } = {}) =>
    program.methods
      .openPrediction(
        id, new BN(FIXTURE), opts.market ?? R1X2, GOALS, opts.period ?? 0, opts.selection ?? 0,
        opts.line ?? 0, new BN(rec.Ts), msgHash(rec.MessageId),
      )
      .accounts({ predictor: keypair.publicKey, config: cfg, fixtureFacts: facts, prediction: predictionPda(id), systemProgram: SystemProgram.programId })
      .instruction();

  const proveEntryIx = (id: any, v: any, priceIndex = 0) =>
    program.methods
      .proveEntry(priceIndex, oddsToProgram(v.odds), oddsSummary(v.summary), nodes(v.subTreeProof), nodes(v.mainTreeProof))
      .accounts({ prover: keypair.publicKey, prediction: predictionPda(id), dailyOddsMerkleRoots: epochDayPda("daily_batch_roots", Number(v.odds.Ts)), txoracleProgram: TXORACLE_PID })
      .instruction();

  // ── negative: open_prediction guards ─────────────────────────────────────
  hr("NEGATIVE — commitment guards (open_prediction)");
  const throwaway = new BN(Date.now() + 777);
  if (inPlayRec) {
    log(`  in-play record: ts=${inPlayRec.Ts} (kickoff+${((Number(inPlayRec.Ts) - start) / 60000).toFixed(0)}m) inRunning=${inPlayRec.InRunning}`);
    await expectReject("entry line quoted after the proven kickoff", await openIx(throwaway, inPlayRec), "EntryAfterKickoff");
  } else log("  (no in-play record archived; skipping EntryAfterKickoff)");
  await expectReject("corners market opened as a CLV prediction", await openIx(throwaway, entryRec, { market: { combinedTotal: {} }, line: 105 }), "MarketHasNoOddsLine");
  await expectReject("1X2 opened with a totals line", await openIx(throwaway, entryRec, { line: 25 }), "LineMismatch");

  // ── open the real prediction (commitment; no proof yet) ──────────────────
  hr("open_prediction  (commitment — no CPI, always available)");
  const id = new BN(Date.now());
  const pred = predictionPda(id);
  await program.methods
    .openPrediction(id, new BN(FIXTURE), R1X2, GOALS, 0, 0, 0, new BN(entryVal.odds.Ts), msgHash(entryVal.odds.MessageId))
    .accounts({ predictor: keypair.publicKey, config: cfg, fixtureFacts: facts, prediction: pred, systemProgram: SystemProgram.programId })
    .rpc();
  let p = await program.account.prediction.fetch(pred);
  PASS(`committed; ranked=${p.ranked} — kickoff was ${((Date.now() - start) / 86400000).toFixed(1)}d ago, so this scores as BACKTEST`);

  // ── negative: prove_entry guards ─────────────────────────────────────────
  // The attack: commit to a full-match bet, then prove it with an authentic
  // *first-half* line. Both records are real and both pass validate_odds.
  hr("NEGATIVE — proof guards (prove_entry)");
  if (h1Rec) {
    const h1Val = await validateOdds(h1Rec);
    log(`  first-half 1X2: ts=${h1Val.odds.Ts} prices=${h1Val.odds.Prices} period=${h1Val.odds.MarketPeriod}`);
    const trapId = new BN(Date.now() + 999);
    // Commit as a FULL-MATCH bet, but pin the entry to the half=1 quote.
    await program.methods
      .openPrediction(trapId, new BN(FIXTURE), R1X2, GOALS, 0, 0, 0, new BN(h1Val.odds.Ts), msgHash(h1Val.odds.MessageId))
      .accounts({ predictor: keypair.publicKey, config: cfg, fixtureFacts: facts, prediction: predictionPda(trapId), systemProgram: SystemProgram.programId })
      .rpc();
    await expectReject("authentic half=1 line proving a full-match bet", await proveEntryIx(trapId, h1Val), "MarketPeriodMismatch");
    // Reclaim the trap's rent, exercising void_prediction.
    await program.methods.voidPrediction().accounts({ predictor: keypair.publicKey, prediction: predictionPda(trapId) }).rpc();
    PASS("void_prediction reclaimed the trap prediction's rent");
  } else log("  (no half=1 record archived; skipping period tests)");

  // A quote from a different minute never reaches the hash check.
  await expectReject("an authentic quote from another timestamp", await proveEntryIx(id, closeVal), "TimestampMismatch");

  // Same timestamp, different quote: only the committed message hash separates them.
  const decoyId = new BN(Date.now() + 555);
  await program.methods
    .openPrediction(decoyId, new BN(FIXTURE), R1X2, GOALS, 0, 0, 0, new BN(entryVal.odds.Ts), msgHash("not-the-quote-that-was-taken"))
    .accounts({ predictor: keypair.publicKey, config: cfg, fixtureFacts: facts, prediction: predictionPda(decoyId), systemProgram: SystemProgram.programId })
    .rpc();
  await expectReject("right timestamp, wrong quote", await proveEntryIx(decoyId, entryVal), "EntryRecordMismatch");
  await program.methods.voidPrediction().accounts({ predictor: keypair.publicKey, prediction: predictionPda(decoyId) }).rpc();

  await expectReject("home selection proven at the draw price index", await proveEntryIx(id, entryVal, 1), "PriceNameMismatch");

  // ── positive path ────────────────────────────────────────────────────────
  hr("prove_entry  (CPI validate_odds — entry line)");
  await program.methods
    .proveEntry(0, oddsToProgram(entryVal.odds), oddsSummary(entryVal.summary), nodes(entryVal.subTreeProof), nodes(entryVal.mainTreeProof))
    .accounts({ prover: keypair.publicKey, prediction: pred, dailyOddsMerkleRoots: epochDayPda("daily_batch_roots", Number(entryVal.odds.Ts)), txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();
  p = await program.account.prediction.fetch(pred);
  log(`  entry_prob_bps = ${p.entryProbBps} (${(p.entryProbBps / 100).toFixed(2)}%)`);

  hr("settle_close  (CPI validate_odds — closing line)");
  await program.methods
    .settleClose(new BN(closeVal.odds.Ts), 0, oddsToProgram(closeVal.odds), oddsSummary(closeVal.summary), nodes(closeVal.subTreeProof), nodes(closeVal.mainTreeProof))
    .accounts({ settler: keypair.publicKey, prediction: pred, fixtureFacts: facts, dailyOddsMerkleRoots: epochDayPda("daily_batch_roots", Number(closeVal.odds.Ts)), txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();
  p = await program.account.prediction.fetch(pred);
  log(`  close_prob_bps = ${p.closeProbBps} (${(p.closeProbBps / 100).toFixed(2)}%)   CLV = ${p.clvBps} bps`);

  hr("settle_outcome  (CPI validate_stat — result)");
  const snapScores = (await authGet(`/api/scores/snapshot/${FIXTURE}`)).data.filter((e: any) => e.Seq != null).sort((a: any, b: any) => Number(b.Seq) - Number(a.Seq));
  let statVal: any = null, seq = 0;
  for (const e of snapScores.slice(0, 12)) {
    try { statVal = (await authGet(`/api/scores/stat-validation`, { fixtureId: FIXTURE, seq: e.Seq, statKey: 1, statKey2: 2 })).data; seq = e.Seq; break; } catch { /* next */ }
  }
  if (!statVal) throw new Error("no stat-validation");
  log(`  result: P1=${statVal.statToProve.value} P2=${statVal.statToProve2.value}  seq=${seq}`);
  const statA = { statToProve: statVal.statToProve, eventStatRoot: toBytes32(statVal.eventStatRoot), statProof: nodes(statVal.statProof) };
  const statB = { statToProve: statVal.statToProve2, eventStatRoot: toBytes32(statVal.eventStatRoot), statProof: nodes(statVal.statProof2) };
  await program.methods
    .settleOutcome(new BN(statVal.summary.updateStats.minTimestamp), scoresSummary(statVal.summary), nodes(statVal.subTreeProof), nodes(statVal.mainTreeProof), statA, statB)
    .accounts({ settler: keypair.publicKey, prediction: pred, dailyScoresMerkleRoots: epochDayPda("daily_scores_roots", Number(statVal.summary.updateStats.minTimestamp)), txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();

  p = await program.account.prediction.fetch(pred);
  hr("ON-CHAIN PREDICTION (final)");
  log(JSON.stringify({
    fixture: FIXTURE, market: "Result 1X2 / Home", proven_kickoff: new Date(Number(ff.startTime)).toISOString(),
    entry_prob_bps: Number(p.entryProbBps), close_prob_bps: Number(p.closeProbBps),
    clv_bps: Number(p.clvBps), outcome_win: p.outcomeWin, ranked: p.ranked, status: p.status,
  }, null, 2));
  log(`\n✅ M1 GREEN — three proofs, four guards, one deterministic settlement.`);
  log(`   Home ${p.outcomeWin ? "WON" : "did not win"}; CLV ${Number(p.clvBps) >= 0 ? "+" : ""}${(Number(p.clvBps) / 100).toFixed(2)}%.`);
}
main().catch((e) => {
  console.error("\n❌ FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
