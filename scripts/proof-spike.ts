/**
 * M0 PROOF SPIKE — the gate for Sharpe.
 *
 * Proves, end-to-end on devnet, that we can:
 *   1. onboard the free World Cup tier (guest JWT -> subscribe(1,4) -> activate)
 *   2. pull a finished fixture's scores + odds
 *   3. fetch Merkle proofs from /scores/stat-validation and /odds/validation
 *   4. get txoracle `validate_stat` AND `validate_odds` to return TRUE on-chain (via simulate + returnData)
 *
 * Run:  node --experimental-strip-types scripts/proof-spike.ts
 * Env:  RPC_URL, WALLET (keypair json), FIXTURE (default 18172489 Brazil-Japan R32)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, ComputeBudgetProgram,
  TransactionMessage, VersionedTransaction, SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import axios from "axios";

const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;

// ---------- config ----------
const RPC_URL = process.env.RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const API = "https://txline-dev.txodds.com";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const FIXTURE = Number(process.env.FIXTURE ?? 18172379); // USA vs Bosnia, R32 (has devnet data)
const WALLET_PATH = process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const STATE_PATH = path.join(import.meta.dirname, ".state.json");
const IDL_PATH = path.join(import.meta.dirname, "../programs/clv/idls/txoracle.json");

const log = (...a: unknown[]) => console.log(...a);
const hr = (t: string) => log(`\n──────── ${t} ────────`);
const b64ToBytes = (s: string): number[] => {
  const b = Buffer.from(s, "base64");
  if (b.length !== 32) throw new Error(`expected 32 bytes, got ${b.length} from "${s.slice(0, 12)}…"`);
  return [...b];
};
const nodes = (list: any): { hash: number[]; isRightSibling: boolean }[] =>
  Array.isArray(list) ? list.map((n) => ({ hash: b64ToBytes(n.hash), isRightSibling: !!n.isRightSibling })) : [];
const toMs = (ts: number): number => (ts < 1e12 ? ts * 1000 : ts);
const epochDayPda = (seed: string, tsAny: number): PublicKey => {
  const epochDay = Math.floor(toMs(Number(tsAny)) / 86_400_000);
  const buf = Buffer.alloc(2); buf.writeUInt16LE(epochDay);
  return PublicKey.findProgramAddressSync([Buffer.from(seed), buf], TXORACLE_PID)[0];
};

// ---------- setup ----------
const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
const program = new anchor.Program(idl, provider);

let state: { jwt?: string; apiToken?: string } = {};
try { state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch {}
const saveState = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

const authGet = (url: string, params?: object) =>
  axios.get(`${API}${url}`, {
    params, timeout: 30000,
    headers: { Authorization: `Bearer ${state.jwt}`, "X-Api-Token": state.apiToken },
  });

// ---------- onboarding ----------
async function startGuest(): Promise<string> {
  const r = await axios.post(`${API}/auth/guest/start`);
  return r.data.token as string;
}

async function subscribeFreeTier(): Promise<string> {
  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], TXORACLE_PID);
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], TXORACLE_PID);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userTokenAccount = getAssociatedTokenAddressSync(TXL_MINT, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    keypair.publicKey, userTokenAccount, keypair.publicKey, TXL_MINT, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  log("subscribe(serviceLevel=1, weeks=4) …");
  const sig = await program.methods
    .subscribe(1, 4)
    .accounts({
      user: keypair.publicKey, pricingMatrix, tokenMint: TXL_MINT, userTokenAccount,
      tokenTreasuryVault, tokenTreasuryPda, tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .preInstructions([ataIx])
    .rpc();
  log("  subscribe tx:", sig);
  return sig;
}

async function activate(txSig: string, jwt: string): Promise<string> {
  const message = `${txSig}::${jwt}`; // leagues empty -> `${txSig}:` + '' + `:${jwt}`
  const sigBytes = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey);
  const walletSignature = Buffer.from(sigBytes).toString("base64");
  const r = await axios.post(`${API}/api/token/activate`,
    { txSig, walletSignature, leagues: [] },
    { headers: { Authorization: `Bearer ${jwt}` }, timeout: 30000, transformResponse: (d) => d });
  return String(r.data).trim().replace(/^"|"$/g, "");
}

async function ensureOnboarded(): Promise<void> {
  hr("ONBOARD (free World Cup tier)");
  if (state.jwt && state.apiToken) {
    try { await authGet(`/api/fixtures/snapshot`); log("reusing cached jwt + apiToken ✓"); return; }
    catch (e: any) { log("cached token rejected:", e?.response?.status, "— re-onboarding"); }
  }
  state.jwt = await startGuest(); log("guest jwt ✓");
  const txSig = await subscribeFreeTier();
  state.apiToken = await activate(txSig, state.jwt);
  log("apiToken ✓:", state.apiToken?.slice(0, 18) + "…");
  saveState();
}

// ---------- simulate a view-returning ix, decode bool ----------
async function simulateBool(label: string, ix: any): Promise<boolean> {
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: keypair.publicKey, recentBlockhash: blockhash, instructions: [cuIx, ix] }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  if (sim.value.err) {
    log(`  ${label} SIM ERR:`, JSON.stringify(sim.value.err));
    log("  logs:\n   " + (sim.value.logs ?? []).join("\n   "));
    throw new Error(`${label} simulation failed`);
  }
  const rd = sim.value.returnData;
  if (!rd?.data?.[0]) { log("  logs:\n   " + (sim.value.logs ?? []).join("\n   ")); throw new Error(`${label}: no return data`); }
  const bytes = Buffer.from(rd.data[0], "base64");
  const val = bytes.length > 0 && bytes[0] === 1;
  log(`  ${label} returnData bytes=[${[...bytes]}] -> ${val}  (CU used: ${sim.value.unitsConsumed})`);
  return val;
}

// ---------- SCORES proof ----------
async function proveScores(): Promise<void> {
  hr("SCORES  (validate_stat)");
  const snap = (await authGet(`/api/scores/snapshot/${FIXTURE}`)).data;
  const entries = (Array.isArray(snap) ? snap : [snap]).filter((e) => e && e.Seq != null).sort((a, b) => Number(b.Seq) - Number(a.Seq));
  log("scores snapshot entries:", entries.length, " top Seqs:", entries.slice(0, 6).map((e) => e.Seq).join(","));
  // try newest events first until stat-validation for P1/P2 goals (keys 1,2) succeeds
  let val: any = null, seq = 0;
  for (const e of entries.slice(0, 12)) {
    try {
      val = (await authGet(`/api/scores/stat-validation`, { fixtureId: FIXTURE, seq: e.Seq, statKey: 1, statKey2: 2 })).data;
      seq = Number(e.Seq); break;
    } catch (err: any) { log(`  seq ${e.Seq}: stat-validation ${err?.response?.status}`); }
  }
  if (!val) throw new Error("no snapshot Seq yielded a stat-validation");
  log(`using seq=${seq}`);
  log("stat-validation keys:", Object.keys(val));
  log("  statToProve:", JSON.stringify(val.statToProve), "statToProve2:", JSON.stringify(val.statToProve2));
  log("  summary:", JSON.stringify(val.summary));
  log("  proofs len sub/main/stat/stat2:",
    Array.isArray(val.subTreeProof) ? val.subTreeProof.length : "nil",
    Array.isArray(val.mainTreeProof) ? val.mainTreeProof.length : "nil",
    Array.isArray(val.statProof) ? val.statProof.length : "nil",
    Array.isArray(val.statProof2) ? val.statProof2.length : "nil");

  const ts = new BN(val.summary.updateStats.minTimestamp);
  const dailyScoresPda = epochDayPda("daily_scores_roots", Number(val.summary.updateStats.minTimestamp));
  log("dailyScoresPda:", dailyScoresPda.toBase58());

  const fixtureSummary = {
    fixtureId: new BN(val.summary.fixtureId),
    updateStats: {
      updateCount: val.summary.updateStats.updateCount,
      minTimestamp: new BN(val.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(val.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: b64ToBytes(val.summary.eventStatsSubTreeRoot),
  };
  const statA = { statToProve: val.statToProve, eventStatRoot: b64ToBytes(val.eventStatRoot), statProof: nodes(val.statProof) };

  // Assertion predicate: P1 goals > -1  (always true if proof valid). Single stat.
  const predTrue = { threshold: -1, comparison: { greaterThan: {} } };
  const ixTrue = await program.methods
    .validateStat(ts, fixtureSummary, nodes(val.subTreeProof), nodes(val.mainTreeProof), predTrue, statA, null, null)
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda }).instruction();
  const ok = await simulateBool("validate_stat[P1>-1]", ixTrue);
  if (!ok) throw new Error("proof-valid predicate returned false — proof pipeline broken");

  // Real result: (P1 - P2) via two-stat, report home win/draw/away
  if (val.statToProve2) {
    const statB = { statToProve: val.statToProve2, eventStatRoot: b64ToBytes(val.eventStatRoot), statProof: nodes(val.statProof2) };
    const homeWin = await program.methods
      .validateStat(ts, fixtureSummary, nodes(val.subTreeProof), nodes(val.mainTreeProof),
        { threshold: 0, comparison: { greaterThan: {} } }, statA, statB, { subtract: {} })
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda }).instruction();
    log(`  P1 goals=${val.statToProve.value}  P2 goals=${val.statToProve2.value}`);
    log("  home-win predicate (P1-P2>0):", await simulateBool("validate_stat[home]", homeWin));
  }
  log("SCORES PROOF ✓");
}

// ---------- ODDS proof ----------
async function proveOdds(): Promise<void> {
  hr("ODDS  (validate_odds)");
  const fx = (await authGet(`/api/fixtures/snapshot`)).data.find((f: any) => f.FixtureId === FIXTURE);
  const start = Number(fx.StartTime);
  // odds/snapshot is live-only; use ?asOf=<pre-kickoff time> for historical offers
  let offers: any[] = [];
  for (const off of [-1_800_000, -3_600_000, -600_000, 900_000]) {
    const d = (await authGet(`/api/odds/snapshot/${FIXTURE}`, { asOf: start + off })).data;
    if (Array.isArray(d) && d.length) { offers = d; log(`odds asOf ${off / 60000}m -> ${d.length} offers`); break; }
  }
  if (!offers.length) throw new Error("no historical odds offers via asOf");
  const markets = [...new Set(offers.map((o) => `${o.SuperOddsType}|${o.MarketPeriod}`))];
  log("distinct markets:", markets.slice(0, 14).join("   "));
  const pick =
    offers.find((o) => /1X2/i.test(o.SuperOddsType) && /(^|=)0$/.test(String(o.MarketPeriod))) ??
    offers.find((o) => /1X2/i.test(o.SuperOddsType)) ??
    offers.find((o) => Array.isArray(o.Prices) && o.Prices.length >= 2) ?? offers[0];
  log(`picked odds: msg=${pick.MessageId} ts=${pick.Ts} type=${pick.SuperOddsType} period=${pick.MarketPeriod} prices=${pick.Prices} names=${pick.PriceNames}`);

  const val = (await authGet(`/api/odds/validation`, { messageId: pick.MessageId, ts: pick.Ts })).data;
  log("odds-validation keys:", Object.keys(val));
  log("  odds:", JSON.stringify(val.odds)?.slice(0, 400));
  log("  summary:", JSON.stringify(val.summary));
  log("  proofs len sub/main:", Array.isArray(val.subTreeProof) ? val.subTreeProof.length : "nil",
    Array.isArray(val.mainTreeProof) ? val.mainTreeProof.length : "nil");

  const o = val.odds;
  const oddsArg = {
    fixtureId: new BN(o.FixtureId), messageId: o.MessageId, ts: new BN(o.Ts),
    bookmaker: o.Bookmaker, bookmakerId: o.BookmakerId, superOddsType: o.SuperOddsType,
    gameState: o.GameState ?? null, inRunning: !!o.InRunning,
    marketParameters: o.MarketParameters ?? null, marketPeriod: o.MarketPeriod ?? null,
    priceNames: o.PriceNames ?? [], prices: o.Prices ?? [],
  };
  const summary = {
    fixtureId: new BN(val.summary.fixtureId),
    updateStats: {
      updateCount: val.summary.updateStats.updateCount,
      minTimestamp: new BN(val.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(val.summary.updateStats.maxTimestamp),
    },
    oddsSubTreeRoot: b64ToBytes(val.summary.oddsSubTreeRoot),
  };
  const ts = new BN(o.Ts);
  const dailyOddsPda = epochDayPda("daily_batch_roots", Number(o.Ts));
  log("dailyOddsPda:", dailyOddsPda.toBase58());

  const ix = await program.methods
    .validateOdds(ts, oddsArg, summary, nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({ dailyOddsMerkleRoots: dailyOddsPda }).instruction();
  const ok = await simulateBool("validate_odds", ix);
  if (!ok) throw new Error("validate_odds returned false");
  const p0 = Number(oddsArg.prices[0]);
  log(`  implied prob (price[0]=${p0}) = ${Math.round(10_000_000 / p0)} bps`);
  log("ODDS PROOF ✓");
}

async function main() {
  log("wallet:", keypair.publicKey.toBase58(), " fixture:", FIXTURE, " program:", program.programId.toBase58());
  await ensureOnboarded();
  await proveScores();
  await proveOdds();
  hr("M0 GREEN ✅  both validate_stat and validate_odds returned TRUE on devnet");
}
main().catch((e) => {
  console.error("\n❌ SPIKE FAILED:", e?.response?.status ?? "", e?.response?.data ?? e?.message ?? e);
  process.exit(1);
});
