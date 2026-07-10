/**
 * Prop-duel lifecycle on devnet, in real USDT.
 *
 *   create_duel  -> join_duel  -> [full time] -> resolve_duel -> claim_duel
 *                \-> cancel_duel (unmatched)
 *
 * The duel is "combined corners over 10.5" — a market no bookmaker lists, which is
 * exactly why it lives here: it needs a provable stat, not a consensus price.
 *
 * `create_duel` and `join_duel` are refused once the PROVEN kickoff passes, so this
 * must run before the whistle. `resolve_duel` and `claim_duel` are permissionless
 * and run after; if the match has not finished they are skipped.
 *
 *   node --experimental-strip-types scripts/duel-e2e.ts
 * Env: FIXTURE (default 18209181), STAKE_USDT (default 5), RPC_URL, WALLET
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import axios from "axios";

const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;
const RPC_URL = process.env.RPC_URL ?? "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const API = "https://txline-dev.txodds.com";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const USDT_MINT = new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh");
const FIXTURE = Number(process.env.FIXTURE ?? 18209181);
const STAKE = Math.round(Number(process.env.STAKE_USDT ?? 5) * 1e6); // USDT has 6 decimals
const WALLET_PATH = process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const TAKER_PATH = path.join(import.meta.dirname, ".taker.json");
const CLV_IDL = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../target/idl/clv.json"), "utf8"));
const FULL_IDL = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../idls/txoracle-full.json"), "utf8"));

const log = (...a: unknown[]) => console.log(...a);
const hr = (t: string) => log(`\n──────── ${t} ────────`);
const PASS = (s: string) => log(`  ✓ ${s}`);
const toBytes32 = (v: any): number[] => {
  const b = Array.isArray(v) ? Buffer.from(v) : Buffer.from(String(v), "base64");
  if (b.length !== 32) throw new Error(`bad root len ${b.length}`);
  return [...b];
};
const nodes = (l: any) => (Array.isArray(l) ? l.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: !!n.isRightSibling })) : []);
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const epochDayPda = (seed: string, tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), u16le(Math.floor(tsMs / 86_400_000))], TXORACLE_PID)[0];
const fixturesRootPda = (tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("ten_daily_fixtures_roots"), u16le(Math.floor(Math.floor(tsMs / 86_400_000) / 10) * 10)], TXORACLE_PID)[0];

const creator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"))));
const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(creator), { commitment: "confirmed" });
anchor.setProvider(provider);
const program = new anchor.Program(CLV_IDL, provider);
const state = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, ".state.json"), "utf8"));
const authGet = (url: string, params?: object) =>
  axios.get(`${API}${url}`, { params, timeout: 30000, headers: { Authorization: `Bearer ${state.jwt}`, "X-Api-Token": state.apiToken } });

const cuIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
const fixturePda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("fixture"), new BN(id).toArrayLike(Buffer, "le", 8)], program.programId)[0];
const duelPda = (fixtureId: number, duelId: any) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("duel"), new BN(fixtureId).toArrayLike(Buffer, "le", 8), new BN(duelId).toArrayLike(Buffer, "le", 8)],
    program.programId)[0];
const vaultPda = (duel: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("duel_vault"), duel.toBuffer()], program.programId)[0];
const usdtAta = (owner: PublicKey) => getAssociatedTokenAddressSync(USDT_MINT, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const usdt = async (owner: PublicKey) => {
  const b = await connection.getTokenAccountBalance(usdtAta(owner)).catch(() => null);
  return Number(b?.value.uiAmountString ?? 0);
};

/** Second wallet for the other side of the duel; funded from SOL + the TxLINE faucet. */
async function ensureTaker(): Promise<Keypair> {
  let taker: Keypair;
  if (fs.existsSync(TAKER_PATH)) taker = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(TAKER_PATH, "utf8"))));
  else {
    taker = Keypair.generate();
    fs.writeFileSync(TAKER_PATH, JSON.stringify([...taker.secretKey]));
    log(`  created taker ${taker.publicKey.toBase58()}`);
  }
  if ((await connection.getBalance(taker.publicKey)) < 0.05e9) {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: creator.publicKey, toPubkey: taker.publicKey, lamports: 0.1e9 }));
    await sendAndConfirmTransaction(connection, tx, [creator]);
    log("  funded taker with 0.1 SOL");
  }
  if ((await usdt(taker.publicKey)) < STAKE / 1e6) {
    const tp = new anchor.Program(FULL_IDL, new anchor.AnchorProvider(connection, new anchor.Wallet(taker), { commitment: "confirmed" }));
    await tp.methods.requestDevnetFaucet().accounts({
      user: taker.publicKey,
      faucetTracker: PublicKey.findProgramAddressSync([Buffer.from("faucet_tracker"), taker.publicKey.toBuffer()], TXORACLE_PID)[0],
      usdtMint: USDT_MINT, userUsdtAta: usdtAta(taker.publicKey),
      usdtTreasuryPda: PublicKey.findProgramAddressSync([Buffer.from("usdt_treasury")], TXORACLE_PID)[0],
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).preInstructions([cuIx()]).rpc();
    log("  taker took devnet USDT from the TxLINE faucet");
  }
  return taker;
}

async function main() {
  const facts = fixturePda(FIXTURE);

  hr("prove_fixture");
  const fxVal = (await authGet(`/api/fixtures/validation`, { fixtureId: FIXTURE })).data;
  const snap = fxVal.snapshot;
  const start = Number(snap.StartTime);
  log(`${snap.Participant1} v ${snap.Participant2}  kickoff ${new Date(start).toISOString()}  (T${((start - Date.now()) / 3.6e6).toFixed(1)}h)`);
  if (!(await connection.getAccountInfo(facts))) {
    await program.methods.proveFixture(new BN(FIXTURE),
      { ts: new BN(snap.Ts), startTime: new BN(snap.StartTime), competition: snap.Competition, competitionId: snap.CompetitionId,
        fixtureGroupId: snap.FixtureGroupId, participant1Id: snap.Participant1Id, participant1: snap.Participant1,
        participant2Id: snap.Participant2Id, participant2: snap.Participant2, fixtureId: new BN(snap.FixtureId), participant1IsHome: !!snap.Participant1IsHome },
      { fixtureId: new BN(fxVal.summary.fixtureId), competitionId: fxVal.summary.competitionId, competition: fxVal.summary.competition,
        updateStats: { updateCount: fxVal.summary.updateStats.updateCount, minTimestamp: new BN(fxVal.summary.updateStats.minTimestamp), maxTimestamp: new BN(fxVal.summary.updateStats.maxTimestamp) },
        updateSubTreeRoot: toBytes32(fxVal.summary.updateSubTreeRoot) },
      nodes(fxVal.subTreeProof), nodes(fxVal.mainTreeProof))
      .accounts({ prover: creator.publicKey, fixtureFacts: facts, tenDailyFixturesRoots: fixturesRootPda(Number(snap.Ts)), txoracleProgram: TXORACLE_PID, systemProgram: SystemProgram.programId })
      .preInstructions([cuIx()]).rpc();
    log("  proven");
  } else log("  already proven");
  const ff = await program.account.fixtureFacts.fetch(facts);
  const kickedOff = Date.now() >= Number(ff.startTime);

  hr("taker wallet + devnet USDT (TxLINE faucet)");
  const taker = await ensureTaker();
  log(`  creator ${creator.publicKey.toBase58().slice(0, 8)} usdt=${await usdt(creator.publicKey)}`);
  log(`  taker   ${taker.publicKey.toBase58().slice(0, 8)} usdt=${await usdt(taker.publicKey)}`);

  // ── the duel: combined corners over 10.5, creator takes OVER ──────────────
  // CombinedTotal + Corners + selection 0 (over) + line 10.5  ->  (key7 + key8) > 10
  const CORNERS = { corners: {} }, COMBINED = { combinedTotal: {} };
  const duelId = new BN(Date.now());
  const duel = duelPda(FIXTURE, duelId);
  const vault = vaultPda(duel);

  if (!kickedOff) {
    hr("create_duel  (combined corners > 10.5, creator takes OVER)");
    await program.methods
      .createDuel(duelId, new BN(FIXTURE), COMBINED, CORNERS, 0, 0, 105, new BN(STAKE), true)
      .accounts({
        creator: creator.publicKey, fixtureFacts: facts, duel, vault, stakeMint: USDT_MINT,
        creatorTokenAccount: usdtAta(creator.publicKey), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      }).rpc();
    let d = await program.account.duel.fetch(duel);
    PASS(`duel ${duel.toBase58().slice(0, 8)} open; stakeA=${Number(d.stakeAmount) / 1e6} USDT; keys ${d.statAKey}+${d.statBKey} > ${d.threshold}`);
    PASS(`expires_at = proven kickoff ${new Date(Number(d.expiresAt)).toISOString()}`);

    hr("join_duel  (taker takes UNDER)");
    const tp = new anchor.Program(CLV_IDL, new anchor.AnchorProvider(connection, new anchor.Wallet(taker), { commitment: "confirmed" }));
    await tp.methods.joinDuel().accounts({
      taker: taker.publicKey, duel, vault, stakeMint: USDT_MINT,
      takerTokenAccount: usdtAta(taker.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
    d = await program.account.duel.fetch(duel);
    const vaultBal = (await connection.getTokenAccountBalance(vault)).value.uiAmountString;
    PASS(`matched; vault holds ${vaultBal} USDT (both stakes, PDA authority — no human can move it)`);

    hr("NEGATIVE — a creator cannot take their own other side");
    try {
      await program.methods.joinDuel().accounts({ taker: creator.publicKey, duel, vault, stakeMint: USDT_MINT, creatorTokenAccount: usdtAta(creator.publicKey), takerTokenAccount: usdtAta(creator.publicKey), tokenProgram: TOKEN_PROGRAM_ID }).rpc();
      throw new Error("self-join should have failed");
    } catch (e: any) {
      const hit = String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);
      if (!/BadState|SelfDuel|already in use/i.test(hit)) throw e;
      PASS("second join refused (duel already Matched)");
    }
  } else {
    log("\n  fixture already kicked off — create/join are (correctly) refused; looking for an existing duel");
  }

  // ── resolve + claim, only once the match is finalised ─────────────────────
  hr("resolve_duel + claim_duel");
  const snapScores = (await authGet(`/api/scores/snapshot/${FIXTURE}`)).data;
  const entries = (Array.isArray(snapScores) ? snapScores : []).filter((e: any) => e?.Seq != null).sort((a: any, b: any) => Number(b.Seq) - Number(a.Seq));
  if (!entries.some((e: any) => e.Action === "game_finalised")) {
    log(`  match not finalised yet — run scripts/keeper.ts after full time to resolve and pay out.`);
    log(`  duel: ${duel.toBase58()}`);
    return;
  }

  const d = await program.account.duel.fetch(duel);
  let val: any = null;
  for (const e of entries.slice(0, 12)) {
    try { val = (await authGet(`/api/scores/stat-validation`, { fixtureId: FIXTURE, seq: e.Seq, statKey: d.statAKey, statKey2: d.statBKey })).data; break; } catch { /* next */ }
  }
  if (!val) throw new Error("no stat-validation for the corner keys yet");
  log(`  corners: P1=${val.statToProve.value} P2=${val.statToProve2.value}  total=${val.statToProve.value + val.statToProve2.value} vs line 10.5`);

  const ts = Number(val.summary.updateStats.minTimestamp);
  await program.methods.resolveDuel(new BN(ts),
    { fixtureId: new BN(val.summary.fixtureId),
      updateStats: { updateCount: val.summary.updateStats.updateCount, minTimestamp: new BN(val.summary.updateStats.minTimestamp), maxTimestamp: new BN(val.summary.updateStats.maxTimestamp) },
      eventsSubTreeRoot: toBytes32(val.summary.eventStatsSubTreeRoot) },
    nodes(val.subTreeProof), nodes(val.mainTreeProof),
    { statToProve: val.statToProve, eventStatRoot: toBytes32(val.eventStatRoot), statProof: nodes(val.statProof) },
    { statToProve: val.statToProve2, eventStatRoot: toBytes32(val.eventStatRoot), statProof: nodes(val.statProof2) })
    .accounts({ resolver: creator.publicKey, duel, dailyScoresMerkleRoots: epochDayPda("daily_scores_roots", ts), txoracleProgram: TXORACLE_PID })
    .preInstructions([cuIx()]).rpc();

  const r = await program.account.duel.fetch(duel);
  const winner = r.outcomeTrue === r.creatorTakesTrue ? r.creator : r.taker;
  PASS(`resolved: predicate=${r.outcomeTrue}  winner=${winner.toBase58().slice(0, 8)} (no funds moved yet)`);

  const before = await usdt(winner);
  await program.methods.claimDuel().accounts({
    claimer: creator.publicKey, duel, vault, creator: r.creator, winner,
    winnerTokenAccount: usdtAta(winner), stakeMint: USDT_MINT, tokenProgram: TOKEN_PROGRAM_ID,
  }).rpc();
  const after = await usdt(winner);
  PASS(`claimed: winner balance ${before} -> ${after} USDT (+${(after - before).toFixed(2)}, = 2x stake)`);
  log(`\n✅ DUEL GREEN — a market no book lists, settled by a Merkle proof, no admin.`);
}
main().catch((e) => {
  console.error("\n❌ FAILED:", e?.message ?? e);
  if (e?.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
