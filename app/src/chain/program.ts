import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { Buffer } from "buffer";
import { CFG } from "../config";
import clvIdl from "./idl/clv.json";
// The full 28-instruction IDL: the trimmed one we vendor for `declare_program!`
// carries only validate_odds/validate_stat, but the UI also calls validate_fixture
// (and onboarding calls subscribe / request_devnet_faucet).
import txoracleIdl from "./idl/txoracle-full.json";

export const TXORACLE = new PublicKey(CFG.txoracle);
export const USDT_MINT = new PublicKey(CFG.usdtMint);
export const connection = new Connection(CFG.rpc, "confirmed");

export function getProvider(wallet: any): AnchorProvider {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}
export function clvProgram(provider: AnchorProvider): Program {
  return new Program(clvIdl as any, provider);
}
export function txoracleProgram(provider: AnchorProvider): Program {
  return new Program(txoracleIdl as any, provider);
}

export const cuIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64le = (bn: any) => (bn.toArrayLike ? bn.toArrayLike(Buffer, "le", 8) : Buffer.alloc(8));
const i64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
export const epochDay = (tsMs: number) => Math.floor(tsMs / 86_400_000);

// ── txoracle root PDAs ───────────────────────────────────────────────────────
export const dailyOddsPda = (tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("daily_batch_roots"), u16le(epochDay(tsMs))], TXORACLE)[0];
export const dailyScoresPda = (tsMs: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), u16le(epochDay(tsMs))], TXORACLE)[0];
/** Fixtures roots are bucketed into 10-day windows, keyed off the record's own `Ts`. */
export const fixturesRootPda = (tsMs: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("ten_daily_fixtures_roots"), u16le(Math.floor(epochDay(tsMs) / 10) * 10)], TXORACLE)[0];

// ── clv PDAs ─────────────────────────────────────────────────────────────────
export const configPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
export const fixturePda = (programId: PublicKey, fixtureId: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("fixture"), i64le(fixtureId)], programId)[0];
export const predictionPda = (programId: PublicKey, predictor: PublicKey, id: any) =>
  PublicKey.findProgramAddressSync([Buffer.from("prediction"), predictor.toBuffer(), u64le(id)], programId)[0];
export const duelPda = (programId: PublicKey, fixtureId: number, duelId: any) =>
  PublicKey.findProgramAddressSync([Buffer.from("duel"), i64le(fixtureId), u64le(duelId)], programId)[0];
export const duelVaultPda = (programId: PublicKey, duel: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("duel_vault"), duel.toBuffer()], programId)[0];
