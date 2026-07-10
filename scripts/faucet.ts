/**
 * Request devnet USDT from TxLINE's own `request_devnet_faucet`.
 *
 * The published IDL declares no seeds for `faucet_tracker` or `usdt_treasury_pda`,
 * so they are derived here and confirmed by simulation. The faucet is rate-limited
 * per wallet by `FaucetTracker.last_request_time`.
 *
 *   node --experimental-strip-types scripts/faucet.ts [keypair.json]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

const RPC_URL = process.env.RPC_URL ?? "https://devnet.helius-rpc.com/?api-key=e26a41e3-3e82-45eb-956f-5a2160c31324";
const TXORACLE_PID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const USDT_MINT = new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh");
const WALLET_PATH = process.argv[2] ?? process.env.WALLET ?? path.join(os.homedir(), ".config/solana/txodds.json");
const FULL_IDL = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../idls/txoracle-full.json"), "utf8"));

const log = (...a: unknown[]) => console.log(...a);
const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"))));
const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: "confirmed" });
const program = new anchor.Program(FULL_IDL, provider);

const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, TXORACLE_PID)[0];
const ata = getAssociatedTokenAddressSync(USDT_MINT, keypair.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
const treasury = pda([Buffer.from("usdt_treasury")]);

const trackerCandidates: [string, PublicKey][] = [
  ["faucet_tracker + user", pda([Buffer.from("faucet_tracker"), keypair.publicKey.toBuffer()])],
  ["faucet + user", pda([Buffer.from("faucet"), keypair.publicKey.toBuffer()])],
  ["faucet_tracker", pda([Buffer.from("faucet_tracker")])],
];

const balance = async () => {
  const b = await connection.getTokenAccountBalance(ata).catch(() => null);
  return b?.value.uiAmountString ?? "(no ATA)";
};

log(`wallet   ${keypair.publicKey.toBase58()}`);
log(`usdt ata ${ata.toBase58()}  balance=${await balance()}`);
log(`treasury ${treasury.toBase58()}  exists=${!!(await connection.getAccountInfo(treasury))}`);

for (const [label, tracker] of trackerCandidates) {
  const ix = await program.methods
    .requestDevnetFaucet()
    .accounts({
      user: keypair.publicKey, faucetTracker: tracker, usdtMint: USDT_MINT, userUsdtAta: ata,
      usdtTreasuryPda: treasury, tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: keypair.publicKey, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  if (sim.value.err) {
    const why = (sim.value.logs ?? []).filter((l) => /Error|error|seeds|constraint/i.test(l)).slice(0, 2).join(" | ");
    log(`  ✗ ${label.padEnd(22)} ${JSON.stringify(sim.value.err)}  ${why.slice(0, 110)}`);
    continue;
  }
  log(`  ✓ ${label} simulates clean — sending`);
  tx.sign([keypair]);
  const sig = await connection.sendTransaction(tx, { maxRetries: 5 });
  await connection.confirmTransaction(sig, "confirmed");
  log(`\nfaucet tx ${sig}`);
  log(`usdt balance now: ${await balance()}`);
  process.exit(0);
}
console.error("\n❌ no faucet_tracker seed candidate worked");
process.exit(1);
