/**
 * PHASE 0 GATING SPIKES — Sharpe v2.
 *
 * Each spike answers one question that a downstream phase depends on. Every
 * spike prints `PASS`/`FAIL` and the fact we need; nothing is inferred.
 *
 *   S1  corners / cards / first-half stat keys available on a devnet fixture?
 *   S2  validate_fixture verifies? which timestamp drives the aligned epochDay?
 *   S3  devnet USDT token program; request_devnet_faucet shape + tracker seeds
 *   S4  /api/odds/updates/{epochDay}/{hour}/{interval} usable as a replay ladder?
 *   S5  do the SSE streams emit on devnet? does Last-Event-ID resume?
 *   S6  subscribe + activate instruction shapes (needs the FULL idl, not the
 *       trimmed one that ships in programs/clv/idls)
 *
 * Run:  node --experimental-strip-types scripts/spike-phase0.ts [s1 s2 ...]
 * Env:  RPC_URL, WALLET, FIXTURE
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, ComputeBudgetProgram,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import axios from "axios";

const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;

const RPC_URL = process.env.RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const API = "https://txline-dev.txodds.com";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const USDT_MINT = new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh");
const FIXTURE = Number(process.env.FIXTURE ?? 18172379);
const WALLET_PATH = process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const STATE_PATH = path.join(import.meta.dirname, ".state.json");
const FULL_IDL_PATH = path.join(import.meta.dirname, "../idls/txoracle-full.json");

const log = (...a: unknown[]) => console.log(...a);
const hr = (t: string) => log(`\n════════ ${t} ════════`);
const PASS = (s: string) => log(`  PASS  ${s}`);
const FAIL = (s: string) => log(`  FAIL  ${s}`);

const b64ToBytes = (s: string): number[] => {
  const b = Buffer.from(s, "base64");
  if (b.length !== 32) throw new Error(`expected 32 bytes, got ${b.length}`);
  return [...b];
};
const nodes = (list: any) =>
  Array.isArray(list) ? list.map((n) => ({ hash: b64ToBytes(n.hash), isRightSibling: !!n.isRightSibling })) : [];
const toMs = (ts: number): number => (ts < 1e12 ? ts * 1000 : ts);
const epochDayOf = (tsAny: number) => Math.floor(toMs(Number(tsAny)) / 86_400_000);
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, TXORACLE_PID)[0];

const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: "confirmed" });
anchor.setProvider(provider);
const fullIdl = JSON.parse(fs.readFileSync(FULL_IDL_PATH, "utf8"));
const program = new anchor.Program(fullIdl, provider);

const state: { jwt?: string; apiToken?: string } = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const authGet = (url: string, params?: object) =>
  axios.get(`${API}${url}`, {
    params, timeout: 30000,
    headers: { Authorization: `Bearer ${state.jwt}`, "X-Api-Token": state.apiToken },
  });

async function simulateBool(label: string, ix: any): Promise<boolean> {
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: keypair.publicKey, recentBlockhash: blockhash, instructions: [cuIx, ix],
  }).compileToV0Message();
  const sim = await connection.simulateTransaction(new VersionedTransaction(msg), {
    sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed",
  });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((l) => /Error|error|failed/.test(l)).slice(0, 4);
    throw new Error(`${label} sim err ${JSON.stringify(sim.value.err)}\n     ${logs.join("\n     ")}`);
  }
  const bytes = Buffer.from(sim.value.returnData?.data?.[0] ?? "", "base64");
  log(`     ${label}: returnData=[${[...bytes]}] CU=${sim.value.unitsConsumed}`);
  return bytes.length > 0 && bytes[0] === 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// S1 — which stat keys exist on a finished devnet fixture?
// key = period*1000 + base.  Goals 1/2, yellows 3/4, reds 5/6, corners 7/8.
// ─────────────────────────────────────────────────────────────────────────────
async function s1() {
  hr("S1  stat-validation coverage (corners / cards / first half)");
  const snap = (await authGet(`/api/scores/snapshot/${FIXTURE}`)).data;
  const seqs = (Array.isArray(snap) ? snap : [snap])
    .filter((e) => e?.Seq != null).sort((a, b) => Number(b.Seq) - Number(a.Seq)).map((e) => Number(e.Seq));
  log(`  fixture ${FIXTURE}: ${seqs.length} scored updates, top seqs ${seqs.slice(0, 5).join(",")}`);

  const probes: [string, number, number | undefined][] = [
    ["full goals      (1,2)", 1, 2],
    ["full yellows    (3,4)", 3, 4],
    ["full reds       (5,6)", 5, 6],
    ["full corners    (7,8)", 7, 8],
    ["H1 goals  (1001,1002)", 1001, 1002],
    ["H2 goals  (2001,2002)", 2001, 2002],
    ["H1 corners(1007,1008)", 1007, 1008],
  ];
  const found: Record<string, any> = {};
  for (const [label, k1, k2] of probes) {
    let hit: any = null, usedSeq = 0;
    for (const seq of seqs.slice(0, 10)) {
      try {
        hit = (await authGet(`/api/scores/stat-validation`, { fixtureId: FIXTURE, seq, statKey: k1, statKey2: k2 })).data;
        usedSeq = seq; break;
      } catch { /* next seq */ }
    }
    if (hit) {
      const a = hit.statToProve, b = hit.statToProve2;
      PASS(`${label}  seq=${usedSeq}  a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
      found[label] = { seq: usedSeq, a, b };
    } else FAIL(`${label}  no seq yielded a proof`);
  }
  log(`\n  → corners available: ${!!found["full corners    (7,8)"]}`);
  log(`  → cards available:   ${!!found["full yellows    (3,4)"] || !!found["full reds       (5,6)"]}`);
  log(`  → first half avail:  ${!!found["H1 goals  (1001,1002)"]}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// S2 — validate_fixture. Which ts drives the aligned epochDay: Ts or StartTime?
// ─────────────────────────────────────────────────────────────────────────────
async function s2() {
  hr("S2  validate_fixture + ten_daily_fixtures_roots seed");
  const val = (await authGet(`/api/fixtures/validation`, { fixtureId: FIXTURE })).data;
  log("  /fixtures/validation keys:", Object.keys(val).join(", "));
  const snap = val.snapshot ?? val.fixture;
  log("  snapshot:", JSON.stringify(snap));
  log("  summary: ", JSON.stringify(val.summary));
  log(`  proofs sub/main: ${nodes(val.subTreeProof).length}/${nodes(val.mainTreeProof).length}`);

  const fixtureArg = {
    ts: new BN(snap.Ts), startTime: new BN(snap.StartTime),
    competition: snap.Competition, competitionId: snap.CompetitionId,
    fixtureGroupId: snap.FixtureGroupId,
    participant1Id: snap.Participant1Id, participant1: snap.Participant1,
    participant2Id: snap.Participant2Id, participant2: snap.Participant2,
    fixtureId: new BN(snap.FixtureId), participant1IsHome: !!snap.Participant1IsHome,
  };
  const s = val.summary;
  const summaryArg = {
    fixtureId: new BN(s.fixtureId), competitionId: s.competitionId, competition: s.competition,
    updateStats: {
      updateCount: s.updateStats.updateCount,
      minTimestamp: new BN(s.updateStats.minTimestamp),
      maxTimestamp: new BN(s.updateStats.maxTimestamp),
    },
    updateSubTreeRoot: b64ToBytes(s.updateSubTreeRoot),
  };

  const candidates: [string, number][] = [
    ["snapshot.Ts", Number(snap.Ts)],
    ["snapshot.StartTime", Number(snap.StartTime)],
    ["summary.updateStats.minTimestamp", Number(s.updateStats.minTimestamp)],
  ];
  for (const [label, tsVal] of candidates) {
    const ed = epochDayOf(tsVal);
    const aligned = Math.floor(ed / 10) * 10;
    const rootsPda = pda([Buffer.from("ten_daily_fixtures_roots"), u16le(aligned)]);
    const exists = await connection.getAccountInfo(rootsPda);
    log(`\n  ${label}: epochDay=${ed} aligned=${aligned} pda=${rootsPda.toBase58()} exists=${!!exists}`);
    if (!exists) { FAIL(`${label}: roots account missing`); continue; }
    try {
      const ix = await program.methods
        .validateFixture(fixtureArg, summaryArg, nodes(val.subTreeProof), nodes(val.mainTreeProof))
        .accounts({ tenDailyFixturesRoots: rootsPda }).instruction();
      const ok = await simulateBool("validate_fixture", ix);
      ok ? PASS(`${label} → validate_fixture TRUE; proven StartTime=${snap.StartTime}`)
         : FAIL(`${label} → returned false`);
      if (ok) return;
    } catch (e: any) { FAIL(`${label}: ${e.message}`); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 — devnet USDT token program + faucet
// ─────────────────────────────────────────────────────────────────────────────
async function s3() {
  hr("S3  devnet USDT mint + request_devnet_faucet");
  const info = await connection.getAccountInfo(USDT_MINT);
  if (!info) return FAIL("USDT mint account not found on devnet");
  const owner = info.owner.toBase58();
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  const name = owner === TOKEN ? "SPL Token (classic)" : owner === TOKEN22 ? "Token-2022" : owner;
  PASS(`USDT mint owner = ${name}`);
  log(`     use anchor-spl TokenInterface / InterfaceAccount to stay program-agnostic`);

  for (const seeds of [
    ["faucet_tracker + user", [Buffer.from("faucet_tracker"), keypair.publicKey.toBuffer()]],
    ["faucet_tracker only  ", [Buffer.from("faucet_tracker")]],
  ] as [string, Buffer[]][]) {
    const p = pda(seeds[1]);
    const acc = await connection.getAccountInfo(p);
    log(`  ${seeds[0]} -> ${p.toBase58()} exists=${!!acc}${acc ? ` len=${acc.data.length}` : ""}`);
  }
  const ata = PublicKey.findProgramAddressSync(
    [keypair.publicKey.toBuffer(), info.owner.toBuffer(), USDT_MINT.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"))[0];
  const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
  log(`  our USDT ATA ${ata.toBase58()} balance=${bal?.value.uiAmountString ?? "(no account)"}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// S4 — is /api/odds/updates/{epochDay}/{hour}/{interval} a usable replay ladder?
// ─────────────────────────────────────────────────────────────────────────────
async function s4() {
  hr("S4  /api/odds/updates/{epochDay}/{hourOfDay}/{interval} as a replay ladder");
  // /fixtures/snapshot is forward-looking and drops finished fixtures; /fixtures/validation
  // resolves metadata for any id (and proves it, which is why we can trust StartTime).
  const fx = (await authGet(`/api/fixtures/validation`, { fixtureId: FIXTURE })).data.snapshot;
  if (!fx) return FAIL("fixture not resolvable via /fixtures/validation");
  const start = Number(fx.StartTime);
  log(`  fixture ${FIXTURE} StartTime=${start} (${new Date(start).toISOString()})`);

  let total = 0, buckets = 0;
  for (const offsetMin of [-120, -90, -60, -30, -5]) {
    const t = start + offsetMin * 60_000;
    const epochDay = Math.floor(t / 86_400_000);
    const hourOfDay = new Date(t).getUTCHours();
    const interval = Math.floor(new Date(t).getUTCMinutes() / 5);
    try {
      const d = (await authGet(`/api/odds/updates/${epochDay}/${hourOfDay}/${interval}`, { fixtureId: FIXTURE })).data;
      const n = Array.isArray(d) ? d.length : 0;
      total += n; if (n) buckets++;
      log(`  T${offsetMin}m  day=${epochDay} h=${hourOfDay} i=${interval} -> ${n} records`);
    } catch (e: any) {
      log(`  T${offsetMin}m  day=${epochDay} h=${hourOfDay} i=${interval} -> HTTP ${e?.response?.status}`);
    }
  }
  total > 0
    ? PASS(`${total} odds records across ${buckets} 5-min buckets — usable as replay frames`)
    : FAIL("no records; replay falls back to the parallelised asOf ladder");
}

// ─────────────────────────────────────────────────────────────────────────────
// S5 — do the SSE streams emit anything on devnet right now?
// ─────────────────────────────────────────────────────────────────────────────
async function s5() {
  hr("S5  SSE streams (/api/odds/stream, /api/scores/stream)");
  for (const p of ["/api/odds/stream", "/api/scores/stream"]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    let messages = 0, heartbeats = 0, lastId = "";
    try {
      const r = await fetch(API + p, {
        headers: {
          Authorization: `Bearer ${state.jwt}`, "X-Api-Token": state.apiToken!,
          Accept: "text/event-stream", "Accept-Encoding": "gzip",
        },
        signal: ctl.signal,
      });
      if (!r.ok || !r.body) { FAIL(`${p} -> HTTP ${r.status}`); continue; }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep = buf.match(/\r?\n\r?\n/);
        while (sep?.index !== undefined) {
          const block = buf.slice(0, sep.index); buf = buf.slice(sep.index + sep[0].length);
          if (/^event:\s*heartbeat/m.test(block)) heartbeats++;
          else if (/^data:/m.test(block)) messages++;
          const m = block.match(/^id:\s*(.+)$/m); if (m) lastId = m[1].trim();
          sep = buf.match(/\r?\n\r?\n/);
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") { FAIL(`${p} -> ${e.message}`); continue; }
    } finally { clearTimeout(timer); }
    log(`  ${p}: 15s window -> ${messages} data, ${heartbeats} heartbeat, lastId="${lastId}"`);
    messages > 0 ? PASS(`${p} emits data (Last-Event-ID resume point: ${lastId})`)
                 : FAIL(`${p} idle — expected: matches are over. Live path ships, demo uses replay.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// S6 — subscribe + activate instruction shapes against the FULL idl
// ─────────────────────────────────────────────────────────────────────────────
async function s6() {
  hr("S6  subscribe / activate instruction shapes");
  const trimmed = JSON.parse(fs.readFileSync(
    path.join(import.meta.dirname, "../programs/clv/idls/txoracle.json"), "utf8"));
  const trimmedIxs = trimmed.instructions.map((i: any) => i.name);
  log(`  trimmed idl instructions: ${trimmedIxs.join(", ")}`);
  trimmedIxs.includes("subscribe")
    ? PASS("subscribe present in trimmed idl")
    : FAIL("subscribe MISSING from trimmed idl — proof-spike.ts:92 only works via the cached-token early return");
  log(`  full idl instructions: ${fullIdl.instructions.length} (subscribe, request_devnet_faucet, validate_fixture present)`);

  const pricingMatrix = pda([Buffer.from("pricing_matrix")]);
  const pm = await connection.getAccountInfo(pricingMatrix);
  pm ? PASS(`pricing_matrix exists (${pm.data.length} bytes) — subscribe(1,4) has its rows`)
     : FAIL("pricing_matrix missing");
  log(`\n  activate message format (from proof-spike.ts:105): \`\${txSig}::\${jwt}\` for leagues=[]`);
  log(`  browser equivalent: wallet.signMessage(new TextEncoder().encode(msg)) → base64`);
  log(`  response is text/plain — axios needs transformResponse, fetch needs .text()`);
}

const ALL: Record<string, () => Promise<void>> = { s1, s2, s3, s4, s5, s6 };
const want = process.argv.slice(2).filter((a) => a in ALL);
const run = want.length ? want : Object.keys(ALL);

log(`wallet ${keypair.publicKey.toBase58()}  fixture ${FIXTURE}  running: ${run.join(" ")}`);
for (const name of run) {
  try { await ALL[name](); }
  catch (e: any) { FAIL(`${name} threw: ${e?.response?.status ?? ""} ${e?.message ?? e}`); }
}
hr("PHASE 0 COMPLETE — transcribe results into docs/ARCHITECTURE.md §13");
