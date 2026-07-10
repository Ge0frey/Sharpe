import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { txline } from "../lib/txline";
import { oddsToProgram, oddsSummary, scoresSummary, statTerm, nodes, fixtureToProgram, fixtureSummary, msgHash } from "../lib/codec";
import { type MarketDef, type DuelMarket, storedPredicate, finalResult, finalStat, statKeys, marketFromAccount } from "../lib/domain";
import {
  TXORACLE, USDT_MINT, cuIx, configPda, fixturePda, predictionPda, duelPda, duelVaultPda,
  dailyOddsPda, dailyScoresPda, fixturesRootPda,
} from "./program";

const payer = (program: Program) => (program.provider as any).wallet.publicKey as PublicKey;
const ata = (owner: PublicKey, mint: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

export async function ensureConfig(program: Program): Promise<PublicKey> {
  const cfg = configPda(program.programId);
  if (!(await program.provider.connection.getAccountInfo(cfg))) {
    await program.methods.initializeConfig()
      .accounts({ admin: payer(program), config: cfg, systemProgram: SystemProgram.programId })
      .rpc();
  }
  return cfg;
}

/**
 * prove_fixture: CPI validate_fixture, recording the kickoff on-chain. Write-once
 * and idempotent — every prediction and duel on this fixture is timed against it.
 */
export async function ensureFixtureProven(program: Program, fixtureId: number): Promise<PublicKey> {
  const facts = fixturePda(program.programId, fixtureId);
  if (await program.provider.connection.getAccountInfo(facts)) return facts;

  const val: any = await txline.fixtureValidation(fixtureId);
  await program.methods
    .proveFixture(new BN(fixtureId), fixtureToProgram(val.snapshot), fixtureSummary(val.summary),
      nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({
      prover: payer(program), fixtureFacts: facts,
      tenDailyFixturesRoots: fixturesRootPda(Number(val.snapshot.Ts)),
      txoracleProgram: TXORACLE, systemProgram: SystemProgram.programId,
    })
    .preInstructions([cuIx()]).rpc();
  return facts;
}

/**
 * The Merkle-proven kickoff, read from `FixtureFacts`. `/fixtures/snapshot` is
 * forward-looking and drops a fixture the moment it finishes, so it cannot be the
 * source of a kickoff we still need after full time. This is also the exact number
 * the program anchors its timing guards to.
 */
export async function provenKickoff(program: Program, fixtureId: number): Promise<number> {
  const info = await program.provider.connection.getAccountInfo(fixturePda(program.programId, fixtureId));
  if (!info) throw new Error(`fixture ${fixtureId} has no proven kickoff on-chain`);
  // Anchor camelCases the IDL when it builds `program.coder`, so the account is
  // keyed "fixtureFacts", not "FixtureFacts". The latter throws "Account not found".
  const facts: any = program.coder.accounts.decode("fixtureFacts", info.data);
  return Number(facts.startTime);
}

/**
 * open_prediction: the commitment. No CPI — the odds root covering the quote just
 * taken is not published until the next 5-minute batch, so proving here would make
 * it impossible to bet on a match that has not started.
 */
export async function openPrediction(program: Program, fixtureId: number, market: MarketDef, entryRec: any) {
  const predictor = payer(program);
  const cfg = await ensureConfig(program);
  const facts = await ensureFixtureProven(program, fixtureId);
  const id = new BN(Date.now());
  const pred = predictionPda(program.programId, predictor, id);
  const sig = await program.methods
    .openPrediction(id, new BN(fixtureId), market.marketArg, market.family, market.period,
      market.selection, market.lineX10, new BN(entryRec.Ts), msgHash(entryRec.MessageId))
    .accounts({ predictor, config: cfg, fixtureFacts: facts, prediction: pred, systemProgram: SystemProgram.programId })
    .rpc();
  return { id: id.toString(), pred, sig };
}

/** prove_entry: CPI validate_odds once the entry quote's root exists. Permissionless. */
export async function proveEntry(program: Program, pred: PublicKey, entryRec: any, priceIndex: number) {
  const val: any = await txline.oddsValidation(entryRec.MessageId, entryRec.Ts);
  return program.methods
    .proveEntry(priceIndex, oddsToProgram(val.odds), oddsSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({ prover: payer(program), prediction: pred, dailyOddsMerkleRoots: dailyOddsPda(Number(val.odds.Ts)), txoracleProgram: TXORACLE })
    .preInstructions([cuIx()]).rpc();
}

/** settle_close: CPI validate_odds on the last pre-kickoff quote; records CLV. */
export async function settleClose(program: Program, pred: PublicKey, fixtureId: number, closeRec: any, priceIndex: number) {
  const val: any = await txline.oddsValidation(closeRec.MessageId, closeRec.Ts);
  return program.methods
    .settleClose(new BN(val.odds.Ts), priceIndex, oddsToProgram(val.odds), oddsSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({
      settler: payer(program), prediction: pred, fixtureFacts: fixturePda(program.programId, fixtureId),
      dailyOddsMerkleRoots: dailyOddsPda(Number(val.odds.Ts)), txoracleProgram: TXORACLE,
    })
    .preInstructions([cuIx()]).rpc();
}

/** settle_outcome: CPI validate_stat using the predicate stored at open. */
export async function settleOutcome(program: Program, pred: PublicKey, fixtureId: number) {
  const acc: any = await (program.account as any).prediction.fetch(pred);
  const { val } = await finalStat(fixtureId, acc.statAKey, acc.hasStatB ? acc.statBKey : undefined);
  const ts = Number(val.summary.updateStats.minTimestamp);
  return program.methods
    .settleOutcome(new BN(ts), scoresSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof),
      statTerm(val, 1), acc.hasStatB ? statTerm(val, 2) : null)
    .accounts({ settler: payer(program), prediction: pred, dailyScoresMerkleRoots: dailyScoresPda(ts), txoracleProgram: TXORACLE })
    .preInstructions([cuIx()]).rpc();
}

export async function voidPrediction(program: Program, pred: PublicKey) {
  return program.methods.voidPrediction().accounts({ predictor: payer(program), prediction: pred }).rpc();
}

/**
 * Anchor's `.all()` throws on the first account it cannot decode. Devnet still holds
 * pre-v2 `Prediction` accounts that share the discriminator but not the layout, so
 * decode defensively and skip what we cannot read.
 */
async function listAccounts(program: Program, kind: "prediction" | "duel") {
  const raw = await program.provider.connection.getProgramAccounts(program.programId);
  const out: any[] = [];
  for (const a of raw) {
    try { out.push({ pubkey: a.pubkey.toBase58(), ...(program.coder.accounts.decode(kind, a.account.data) as any) }); } catch { /* other type or legacy */ }
  }
  return out;
}
export const listPredictions = (program: Program) => listAccounts(program, "prediction");
export const listDuels = (program: Program) => listAccounts(program, "duel");

// ── prop duels ───────────────────────────────────────────────────────────────

export async function createDuel(program: Program, fixtureId: number, m: DuelMarket, stakeUsdt: number, takesOver: boolean) {
  const creator = payer(program);
  const facts = await ensureFixtureProven(program, fixtureId);
  const duelId = new BN(Date.now());
  const duel = duelPda(program.programId, fixtureId, duelId);
  const sig = await program.methods
    .createDuel(duelId, new BN(fixtureId), m.marketArg, m.family, m.period, m.selection, m.lineX10,
      new BN(Math.round(stakeUsdt * 1e6)), takesOver)
    .accounts({
      creator, fixtureFacts: facts, duel, vault: duelVaultPda(program.programId, duel), stakeMint: USDT_MINT,
      creatorTokenAccount: ata(creator, USDT_MINT), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { duel, sig };
}

export async function joinDuel(program: Program, duel: PublicKey) {
  const taker = payer(program);
  return program.methods.joinDuel()
    .accounts({
      taker, duel, vault: duelVaultPda(program.programId, duel), stakeMint: USDT_MINT,
      takerTokenAccount: ata(taker, USDT_MINT), tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function cancelDuel(program: Program, duel: PublicKey) {
  const creator = payer(program);
  return program.methods.cancelDuel()
    .accounts({
      creator, duel, vault: duelVaultPda(program.programId, duel),
      creatorTokenAccount: ata(creator, USDT_MINT), stakeMint: USDT_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/**
 * refund_duel: a matched duel whose result never became provable. Callable by
 * anyone once the proven kickoff is 7 days past (`DUEL_REFUND_GRACE_MS`); both
 * sides take their own stake back. No path traps funds.
 */
export async function refundDuel(program: Program, duelKey: PublicKey) {
  const d: any = await (program.account as any).duel.fetch(duelKey);
  return program.methods.refundDuel()
    .accounts({
      payer: payer(program), duel: duelKey, vault: duelVaultPda(program.programId, duelKey),
      creator: d.creator, taker: d.taker,
      creatorTokenAccount: ata(d.creator, USDT_MINT), takerTokenAccount: ata(d.taker, USDT_MINT),
      stakeMint: USDT_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** resolve_duel: CPI validate_stat. Permissionless, moves no funds. */
export async function resolveDuel(program: Program, duelKey: PublicKey) {
  const d: any = await (program.account as any).duel.fetch(duelKey);
  const { val } = await finalStat(Number(d.fixtureId), d.statAKey, d.hasStatB ? d.statBKey : undefined);
  const ts = Number(val.summary.updateStats.minTimestamp);
  return program.methods
    .resolveDuel(new BN(ts), scoresSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof),
      statTerm(val, 1), d.hasStatB ? statTerm(val, 2) : null)
    .accounts({ resolver: payer(program), duel: duelKey, dailyScoresMerkleRoots: dailyScoresPda(ts), txoracleProgram: TXORACLE })
    .preInstructions([cuIx()]).rpc();
}

/** claim_duel: pays both stakes to the proven winner. Permissionless; destination is on-chain. */
export async function claimDuel(program: Program, duelKey: PublicKey) {
  const d: any = await (program.account as any).duel.fetch(duelKey);
  const winner: PublicKey = d.outcomeTrue === d.creatorTakesTrue ? d.creator : d.taker;
  return program.methods.claimDuel()
    .accounts({
      claimer: payer(program), duel: duelKey, vault: duelVaultPda(program.programId, duelKey),
      creator: d.creator, winner, winnerTokenAccount: ata(winner, USDT_MINT),
      stakeMint: USDT_MINT, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function usdtBalance(program: Program, owner: PublicKey): Promise<number> {
  const b = await program.provider.connection.getTokenAccountBalance(ata(owner, USDT_MINT)).catch(() => null);
  return Number(b?.value.uiAmountString ?? 0);
}

// ── read-only Verify badges (txoracle .view(), no wallet, no cost) ────────────

/** The fixture itself is real: teams and kickoff are committed under the fixtures root. */
export async function verifyFixture(txProgram: Program, val: any): Promise<boolean> {
  return txProgram.methods
    .validateFixture(fixtureToProgram(val.snapshot), fixtureSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({ tenDailyFixturesRoots: fixturesRootPda(Number(val.snapshot.Ts)) })
    .preInstructions([cuIx()]).view();
}

export async function verifyOdds(txProgram: Program, val: any): Promise<boolean> {
  return txProgram.methods
    .validateOdds(new BN(val.odds.Ts), oddsToProgram(val.odds), oddsSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof))
    .accounts({ dailyOddsMerkleRoots: dailyOddsPda(Number(val.odds.Ts)) }).preInstructions([cuIx()]).view();
}

/**
 * Re-prove the outcome using the predicate the PROGRAM stored on the account —
 * keys, operator, comparison and threshold. Re-deriving these from a market label
 * would ask `validate_stat` a different question than `settle_outcome` asked: a
 * first-half bet settles on stat keys 1001/1002, and a totals bet uses Add where
 * 1X2 uses Subtract. Same proof, different bet, different answer.
 */
export async function verifyStat(txProgram: Program, val: any, account: any): Promise<boolean> {
  const { predicate, op, hasStatB } = storedPredicate(account);
  const ts = Number(val.summary.updateStats.minTimestamp);
  return txProgram.methods
    .validateStat(new BN(ts), scoresSummary(val.summary), nodes(val.subTreeProof), nodes(val.mainTreeProof),
      predicate, statTerm(val, 1), hasStatB ? statTerm(val, 2) : null, op)
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda(ts) }).preInstructions([cuIx()]).view();
}

export { finalResult, statKeys, marketFromAccount };
