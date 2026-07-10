/**
 * Open a RANKED prediction on a match that has not kicked off.
 *
 * `ranked` is set on-chain as `Clock::now < FixtureFacts.start_time`, where
 * start_time was proven by `validate_fixture`. It cannot be faked, and it cannot
 * be earned after the fact — which is why this has to run before a real kickoff.
 *
 * The entry proof is deferred: the odds Merkle root covering the quote you just
 * took is only published in the next 5-minute batch. This script commits first,
 * then polls until the root exists and lands `prove_entry`.
 *
 *   node --experimental-strip-types scripts/open-ranked.ts
 * Env: FIXTURE (default 18209181 France v Morocco), SELECTION (0 home | 1 draw | 2 away),
 *      RPC_URL, WALLET, NO_WAIT=1 to skip the prove_entry poll.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import axios from "axios";

const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;
const RPC_URL = process.env.RPC_URL ?? "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const API = "https://txline-dev.txodds.com";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const FIXTURE = Number(process.env.FIXTURE ?? 18209181);
const SELECTION = Number(process.env.SELECTION ?? 0);
const WALLET_PATH = process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const CLV_IDL = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../target/idl/clv.json"), "utf8"));

const log = (...a: unknown[]) => console.log(...a);
const hr = (t: string) => log(`\n──────── ${t} ────────`);
const toBytes32 = (v: any): number[] => {
  const b = Array.isArray(v) ? Buffer.from(v) : Buffer.from(String(v), "base64");
  if (b.length !== 32) throw new Error(`bad root len ${b.length}`);
  return [...b];
};
const nodes = (l: any) => (Array.isArray(l) ? l.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: !!n.isRightSibling })) : []);
const msgHash = (m: string): number[] => [...createHash("sha256").update(m, "utf8").digest()];
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const epochDayPda = (seed: string, tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), u16le(Math.floor(tsMs / 86_400_000))], TXORACLE_PID)[0];
const fixturesRootPda = (tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("ten_daily_fixtures_roots"), u16le(Math.floor(Math.floor(tsMs / 86_400_000) / 10) * 10)], TXORACLE_PID)[0];

const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: "confirmed" });
anchor.setProvider(provider);
const program = new anchor.Program(CLV_IDL, provider);
const state = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, ".state.json"), "utf8"));
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
const fixtureToProgram = (f: any) => ({
  ts: new BN(f.Ts), startTime: new BN(f.StartTime), competition: f.Competition, competitionId: f.CompetitionId,
  fixtureGroupId: f.FixtureGroupId, participant1Id: f.Participant1Id, participant1: f.Participant1,
  participant2Id: f.Participant2Id, participant2: f.Participant2, fixtureId: new BN(f.FixtureId), participant1IsHome: !!f.Participant1IsHome,
});
const fixtureSummaryToProgram = (s: any) => ({
  fixtureId: new BN(s.fixtureId), competitionId: s.competitionId, competition: s.competition,
  updateStats: { updateCount: s.updateStats.updateCount, minTimestamp: new BN(s.updateStats.minTimestamp), maxTimestamp: new BN(s.updateStats.maxTimestamp) },
  updateSubTreeRoot: toBytes32(s.updateSubTreeRoot),
});

const cuIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
const fixturePda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("fixture"), new BN(id).toArrayLike(Buffer, "le", 8)], program.programId)[0];
const predictionPda = (id: any) => PublicKey.findProgramAddressSync([Buffer.from("prediction"), keypair.publicKey.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)], program.programId)[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const label = ["home (part1)", "draw", "away (part2)"][SELECTION];
  log(`wallet ${keypair.publicKey.toBase58()}  fixture ${FIXTURE}  selection ${SELECTION} = ${label}`);

  hr("prove_fixture");
  const fxVal = (await authGet(`/api/fixtures/validation`, { fixtureId: FIXTURE })).data;
  const snap = fxVal.snapshot;
  const start = Number(snap.StartTime);
  const hoursOut = (start - Date.now()) / 3_600_000;
  log(`${snap.Participant1} vs ${snap.Participant2}   kickoff ${new Date(start).toISOString()}  (T-${hoursOut.toFixed(1)}h)`);
  if (hoursOut <= 0) throw new Error("match already kicked off — a ranked prediction is no longer possible");

  const facts = fixturePda(FIXTURE);
  if (!(await connection.getAccountInfo(facts))) {
    const sig = await program.methods
      .proveFixture(new BN(FIXTURE), fixtureToProgram(snap), fixtureSummaryToProgram(fxVal.summary), nodes(fxVal.subTreeProof), nodes(fxVal.mainTreeProof))
      .accounts({ prover: keypair.publicKey, fixtureFacts: facts, tenDailyFixturesRoots: fixturesRootPda(Number(snap.Ts)), txoracleProgram: TXORACLE_PID, systemProgram: SystemProgram.programId })
      .preInstructions([cuIx()]).rpc();
    log(`  proven: ${sig}`);
  } else log("  already proven (write-once)");

  hr("open_prediction  (the commitment)");
  const offers = (await authGet(`/api/odds/snapshot/${FIXTURE}`)).data;
  const rec = offers.find((o: any) => o.SuperOddsType === "1X2_PARTICIPANT_RESULT" && o.MarketPeriod == null && o.Prices?.length >= 3);
  if (!rec) throw new Error("no full-match 1X2 quote available yet");
  const pct = (10_000_000 / rec.Prices[SELECTION] / 100).toFixed(2);
  log(`  quote ts=${new Date(Number(rec.Ts)).toISOString()}  prices=${rec.Prices}  ${label} @ ${(rec.Prices[SELECTION] / 1000).toFixed(3)} = ${pct}%`);

  const id = new BN(Date.now());
  const pred = predictionPda(id);
  const cfg = configPda();
  const sig = await program.methods
    .openPrediction(id, new BN(FIXTURE), { result1X2: {} }, { goals: {} }, 0, SELECTION, 0, new BN(rec.Ts), msgHash(rec.MessageId))
    .accounts({ predictor: keypair.publicKey, config: cfg, fixtureFacts: facts, prediction: pred, systemProgram: SystemProgram.programId })
    .rpc();
  let p = await program.account.prediction.fetch(pred);
  log(`  opened: ${sig}`);
  log(`  prediction ${pred.toBase58()}  id=${id.toString()}`);
  if (!p.ranked) throw new Error("expected ranked=true before kickoff — check the clock/kickoff units");
  log(`  ✓ ranked = TRUE  (committed ${hoursOut.toFixed(1)}h before the proven kickoff)`);

  if (process.env.NO_WAIT) { log("\nNO_WAIT set — run prove-entry later."); return; }

  hr("prove_entry  (waits for the 5-minute odds root)");
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    try {
      const val = (await authGet(`/api/odds/validation`, { messageId: rec.MessageId, ts: rec.Ts })).data;
      const rootPda = epochDayPda("daily_batch_roots", Number(val.odds.Ts));
      if (!(await connection.getAccountInfo(rootPda))) throw new Error("root PDA not posted yet");
      await program.methods
        .proveEntry(SELECTION, oddsToProgram(val.odds), oddsSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
        .accounts({ prover: keypair.publicKey, prediction: pred, dailyOddsMerkleRoots: rootPda, txoracleProgram: TXORACLE_PID })
        .preInstructions([cuIx()]).rpc();
      p = await program.account.prediction.fetch(pred);
      log(`  ✓ entry proven: ${p.entryProbBps} bps (${(p.entryProbBps / 100).toFixed(2)}%)`);
      log(`\n✅ RANKED prediction live on ${snap.Participant1} v ${snap.Participant2}.`);
      log(`   After full time run:  FIXTURE=${FIXTURE} node --experimental-strip-types scripts/keeper.ts`);
      return;
    } catch (e: any) {
      const why = e?.response?.status ? `HTTP ${e.response.status}` : (e?.message ?? e);
      log(`  root not ready (${String(why).slice(0, 60)}) — retrying in 60s`);
      await sleep(60_000);
    }
  }
  log("  ⚠ entry not proven within 12 min; the commitment stands. Re-run prove_entry later.");
}
main().catch((e) => {
  console.error("\n❌ FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
