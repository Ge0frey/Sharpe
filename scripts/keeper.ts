/**
 * KEEPER — drives every open prediction to settlement from the TxLINE feed.
 *
 * Nothing here is privileged. `prove_entry`, `settle_close` and `settle_outcome`
 * are permissionless and each writes exactly one value that a Merkle proof forces.
 * A keeper only saves users a click; it cannot change an outcome.
 *
 *   Open        -> prove_entry     once the entry quote's 5-minute odds root posts
 *   EntryProven -> settle_close    once the last pre-kickoff quote is archived
 *   Closed      -> settle_outcome  once the fixture reports `game_finalised`
 *
 *   node --experimental-strip-types scripts/keeper.ts            # one pass
 *   WATCH=1 node --experimental-strip-types scripts/keeper.ts    # poll every 60s
 * Env: RPC_URL, WALLET, FIXTURE (restrict to one fixture)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import axios from "axios";

const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;
const RPC_URL = process.env.RPC_URL ?? "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const API = "https://txline-dev.txodds.com";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const ONLY_FIXTURE = process.env.FIXTURE ? Number(process.env.FIXTURE) : null;
const WALLET_PATH = process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const CLV_IDL = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../target/idl/clv.json"), "utf8"));

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const toBytes32 = (v: any): number[] => {
  const b = Array.isArray(v) ? Buffer.from(v) : Buffer.from(String(v), "base64");
  if (b.length !== 32) throw new Error(`bad root len ${b.length}`);
  return [...b];
};
const nodes = (l: any) => (Array.isArray(l) ? l.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: !!n.isRightSibling })) : []);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const epochDayPda = (seed: string, tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), u16le(Math.floor(tsMs / 86_400_000))], TXORACLE_PID)[0];

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
const scoresSummary = (s: any) => ({
  fixtureId: new BN(s.fixtureId),
  updateStats: { updateCount: s.updateStats.updateCount, minTimestamp: new BN(s.updateStats.minTimestamp), maxTimestamp: new BN(s.updateStats.maxTimestamp) },
  eventsSubTreeRoot: toBytes32(s.eventStatsSubTreeRoot),
});

const cuIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
const fixturePda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("fixture"), new BN(id).toArrayLike(Buffer, "le", 8)], program.programId)[0];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── market model, mirrored from programs/clv/src/market.rs ────────────────────
const marketKey = (m: any) => Object.keys(m)[0]; // result1X2 | totalsOu | combinedTotal | teamTotal
const SUPER_TYPE: Record<string, string> = { result1X2: "1X2_PARTICIPANT_RESULT", totalsOu: "OVERUNDER_PARTICIPANT_GOALS" };
const periodStr = (p: number) => (p === 0 ? null : p === 1 ? "half=1" : "half=2");
/** price_names are [part1,draw,part2] / [over,under]; the program requires index == selection. */
const priceIndexFor = (selection: number) => selection;

/** Does this odds record price exactly the market this prediction bet? */
function matchesMarket(o: any, p: any): boolean {
  if (o.SuperOddsType !== SUPER_TYPE[marketKey(p.market)]) return false;
  if ((o.MarketPeriod ?? null) !== periodStr(p.period)) return false;
  if (marketKey(p.market) === "result1X2") return o.MarketParameters == null;
  // totals: MarketParameters is `line=2.5`
  const raw = String(o.MarketParameters ?? "");
  if (!raw.startsWith("line=")) return false;
  return Math.round(parseFloat(raw.slice(5)) * 10) === p.lineX10;
}

/**
 * Decode every account of one type. Anchor's `.all()` throws when it meets a
 * pre-v2 account that shares the discriminator but not the layout, so decode
 * defensively and skip what we cannot read.
 */
async function loadAccounts(kind: "prediction" | "duel") {
  const raw = await connection.getProgramAccounts(program.programId);
  const out: { pubkey: PublicKey; p: any }[] = [];
  for (const a of raw) {
    try { out.push({ pubkey: a.pubkey, p: program.coder.accounts.decode(kind, a.account.data) }); } catch { /* other type or legacy */ }
  }
  return ONLY_FIXTURE ? out.filter((x) => Number(x.p.fixtureId) === ONLY_FIXTURE) : out;
}

const statusOf = (p: any) => Object.keys(p.status)[0];
const usdtAta = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const vaultPda = (duel: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("duel_vault"), duel.toBuffer()], program.programId)[0];
const duelStatus = (d: any) => Object.keys(d.status)[0];

/** Final-time stat proof for an arbitrary key pair, or null if not yet provable. */
async function finalStatProof(fixtureId: number, statKey: number, statKey2?: number) {
  const snap = (await authGet(`/api/scores/snapshot/${fixtureId}`)).data;
  const entries = (Array.isArray(snap) ? snap : []).filter((e: any) => e?.Seq != null).sort((a: any, b: any) => Number(b.Seq) - Number(a.Seq));
  if (!entries.some((e: any) => e.Action === "game_finalised")) return null;
  for (const e of entries.slice(0, 12)) {
    try { return (await authGet(`/api/scores/stat-validation`, { fixtureId, seq: e.Seq, statKey, statKey2 })).data; } catch { /* next seq */ }
  }
  return null;
}

async function proveEntry(pubkey: PublicKey, p: any) {
  const entryTs = Number(p.entryTs);
  // The commitment stored only sha256(MessageId), so find the quote by content.
  const offers = (await authGet(`/api/odds/snapshot/${p.fixtureId}`, { asOf: entryTs })).data;
  const want = Buffer.from(p.entryMsgHash);
  const rec = (Array.isArray(offers) ? offers : []).find((o: any) => sha256(o.MessageId).equals(want));
  if (!rec) return log(`  ${pubkey.toBase58().slice(0, 8)} prove_entry: committed quote not yet archived`);

  const val = (await authGet(`/api/odds/validation`, { messageId: rec.MessageId, ts: rec.Ts })).data;
  const rootPda = epochDayPda("daily_batch_roots", Number(val.odds.Ts));
  if (!(await connection.getAccountInfo(rootPda))) return log(`  ${pubkey.toBase58().slice(0, 8)} prove_entry: odds root not posted yet`);

  await program.methods
    .proveEntry(priceIndexFor(p.selection), oddsToProgram(val.odds), oddsSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({ prover: keypair.publicKey, prediction: pubkey, dailyOddsMerkleRoots: rootPda, txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();
  const q = await program.account.prediction.fetch(pubkey);
  log(`  ✓ prove_entry ${pubkey.toBase58().slice(0, 8)} entry=${q.entryProbBps}bps`);
}

async function settleClose(pubkey: PublicKey, p: any) {
  const facts = await program.account.fixtureFacts.fetch(fixturePda(Number(p.fixtureId)));
  const start = Number(facts.startTime);
  if (Date.now() < start) return log(`  ${pubkey.toBase58().slice(0, 8)} settle_close: kickoff is in the future`);

  // The closing line is the last quote before the whistle. asOf just under kickoff.
  const offers = (await authGet(`/api/odds/snapshot/${p.fixtureId}`, { asOf: start - 1000 })).data;
  const rec = (Array.isArray(offers) ? offers : [])
    .filter((o: any) => matchesMarket(o, p) && !o.InRunning && Number(o.Ts) <= start)
    .sort((a: any, b: any) => Number(b.Ts) - Number(a.Ts))[0];
  if (!rec) return log(`  ${pubkey.toBase58().slice(0, 8)} settle_close: no pre-kickoff quote archived`);

  const val = (await authGet(`/api/odds/validation`, { messageId: rec.MessageId, ts: rec.Ts })).data;
  const rootPda = epochDayPda("daily_batch_roots", Number(val.odds.Ts));
  await program.methods
    .settleClose(new BN(val.odds.Ts), priceIndexFor(p.selection), oddsToProgram(val.odds), oddsSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({ settler: keypair.publicKey, prediction: pubkey, fixtureFacts: fixturePda(Number(p.fixtureId)), dailyOddsMerkleRoots: rootPda, txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();
  const q = await program.account.prediction.fetch(pubkey);
  log(`  ✓ settle_close ${pubkey.toBase58().slice(0, 8)} close=${q.closeProbBps}bps  CLV=${q.clvBps >= 0 ? "+" : ""}${q.clvBps}bps`);
}

/**
 * Full time. The documented `gameState: 5` never appears on this feed — `GameState`
 * stays "scheduled" — so finality is the `game_finalised` action on a scores update.
 */
async function settleOutcome(pubkey: PublicKey, p: any) {
  const snap = (await authGet(`/api/scores/snapshot/${p.fixtureId}`)).data;
  const entries = (Array.isArray(snap) ? snap : []).filter((e: any) => e?.Seq != null).sort((a: any, b: any) => Number(b.Seq) - Number(a.Seq));
  if (!entries.some((e: any) => e.Action === "game_finalised")) {
    return log(`  ${pubkey.toBase58().slice(0, 8)} settle_outcome: match not finalised`);
  }

  const statKey = p.statAKey, statKey2 = p.hasStatB ? p.statBKey : undefined;
  let val: any = null;
  for (const e of entries.slice(0, 12)) {
    try { val = (await authGet(`/api/scores/stat-validation`, { fixtureId: Number(p.fixtureId), seq: e.Seq, statKey, statKey2 })).data; break; } catch { /* next seq */ }
  }
  if (!val) return log(`  ${pubkey.toBase58().slice(0, 8)} settle_outcome: scores root not posted yet`);

  const statA = { statToProve: val.statToProve, eventStatRoot: toBytes32(val.eventStatRoot), statProof: nodes(val.statProof) };
  const statB = p.hasStatB ? { statToProve: val.statToProve2, eventStatRoot: toBytes32(val.eventStatRoot), statProof: nodes(val.statProof2) } : null;
  const ts = Number(val.summary.updateStats.minTimestamp);
  await program.methods
    .settleOutcome(new BN(ts), scoresSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof), statA, statB)
    .accounts({ settler: keypair.publicKey, prediction: pubkey, dailyScoresMerkleRoots: epochDayPda("daily_scores_roots", ts), txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();
  const q = await program.account.prediction.fetch(pubkey);
  log(`  ✓ settle_outcome ${pubkey.toBase58().slice(0, 8)} won=${q.outcomeWin} CLV=${q.clvBps}bps ranked=${q.ranked}`);
}

// ── duels ────────────────────────────────────────────────────────────────────

async function resolveDuel(pubkey: PublicKey, d: any) {
  const val = await finalStatProof(Number(d.fixtureId), d.statAKey, d.hasStatB ? d.statBKey : undefined);
  if (!val) return log(`  ${pubkey.toBase58().slice(0, 8)} resolve_duel: not finalised / root not posted`);

  const statA = { statToProve: val.statToProve, eventStatRoot: toBytes32(val.eventStatRoot), statProof: nodes(val.statProof) };
  const statB = d.hasStatB ? { statToProve: val.statToProve2, eventStatRoot: toBytes32(val.eventStatRoot), statProof: nodes(val.statProof2) } : null;
  const ts = Number(val.summary.updateStats.minTimestamp);
  await program.methods
    .resolveDuel(new BN(ts), scoresSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof), statA, statB)
    .accounts({ resolver: keypair.publicKey, duel: pubkey, dailyScoresMerkleRoots: epochDayPda("daily_scores_roots", ts), txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();
  const q = await program.account.duel.fetch(pubkey);
  log(`  ✓ resolve_duel ${pubkey.toBase58().slice(0, 8)} predicate=${q.outcomeTrue} (no funds moved)`);
}

async function claimDuel(pubkey: PublicKey, d: any) {
  const winner = d.outcomeTrue === d.creatorTakesTrue ? d.creator : d.taker;
  await program.methods
    .claimDuel()
    .accounts({
      claimer: keypair.publicKey, duel: pubkey, vault: vaultPda(pubkey), creator: d.creator, winner,
      winnerTokenAccount: usdtAta(winner, d.stakeMint), stakeMint: d.stakeMint, tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
  log(`  ✓ claim_duel ${pubkey.toBase58().slice(0, 8)} paid ${(Number(d.stakeAmount) * 2) / 1e6} to ${winner.toBase58().slice(0, 8)}`);
}

async function pass() {
  const preds = await loadAccounts("prediction");
  const pendingP = preds.filter((x) => !["settled", "void"].includes(statusOf(x.p)));
  const duels = await loadAccounts("duel");
  const pendingD = duels.filter((x) => ["matched", "resolved"].includes(duelStatus(x.p)));
  log(`${preds.length} predictions (${pendingP.length} pending), ${duels.length} duels (${pendingD.length} pending)`);

  for (const { pubkey, p } of pendingP) {
    const st = statusOf(p);
    try {
      if (st === "open") await proveEntry(pubkey, p);
      else if (st === "entryProven") await settleClose(pubkey, p);
      else if (st === "closed") await settleOutcome(pubkey, p);
    } catch (e: any) {
      log(`  ✗ ${pubkey.toBase58().slice(0, 8)} ${st}: ${e?.message ?? e}`);
    }
  }
  for (const { pubkey, p } of pendingD) {
    const st = duelStatus(p);
    try {
      if (st === "matched") await resolveDuel(pubkey, p);
      else if (st === "resolved") await claimDuel(pubkey, p);
    } catch (e: any) {
      log(`  ✗ duel ${pubkey.toBase58().slice(0, 8)} ${st}: ${e?.message ?? e}`);
    }
  }
  return pendingP.length + pendingD.length;
}

log(`keeper up. wallet=${keypair.publicKey.toBase58().slice(0, 8)} program=${program.programId.toBase58().slice(0, 8)}${ONLY_FIXTURE ? ` fixture=${ONLY_FIXTURE}` : ""}`);
if (process.env.WATCH) {
  for (;;) { await pass().catch((e) => log("pass failed:", e?.message ?? e)); await sleep(60_000); }
} else {
  await pass();
}
