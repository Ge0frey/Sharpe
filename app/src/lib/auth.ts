/**
 * Per-wallet TxLINE onboarding — the free World Cup tier, provisioned by the user.
 *
 *   POST /auth/guest/start        -> guest JWT (30 days)
 *   on-chain subscribe(1, 4)      -> service level 1, 4 weeks, costs 0 TxL
 *   sign `${txSig}::${jwt}`       -> wallet proves it owns the subscription
 *   POST /api/token/activate      -> the api token (text/plain, NOT json)
 *
 * Doing this in the browser is what lets the repo be public: no shared JWT is
 * baked into the bundle, and every judge provisions their own credentials with
 * one click. Tokens are cached in localStorage, keyed by wallet.
 *
 * `subscribe` is absent from the trimmed IDL we vendor for `declare_program!`,
 * so this uses the full 28-instruction IDL in `idls/txoracle-full.json`.
 */
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { CFG } from "../config";
import fullIdl from "../chain/idl/txoracle-full.json";

export type Creds = { jwt: string; apiToken: string };
export type OnboardStep = "jwt" | "subscribe" | "sign" | "activate";

const TXL_MINT = new PublicKey(CFG.txlMint);
const USDT_MINT = new PublicKey(CFG.usdtMint);
const TXORACLE = new PublicKey(CFG.txoracle);

const key = (wallet: string) => `sharpe.creds.${wallet}`;

export function loadCreds(wallet: string): Creds | null {
  try {
    const raw = localStorage.getItem(key(wallet));
    if (!raw) return null;
    const c = JSON.parse(raw) as Creds;
    return c.jwt && c.apiToken ? c : null;
  } catch { return null; }
}
export const saveCreds = (wallet: string, c: Creds) => localStorage.setItem(key(wallet), JSON.stringify(c));
export const clearCreds = (wallet: string) => localStorage.removeItem(key(wallet));

const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, TXORACLE)[0];

async function startGuest(): Promise<string> {
  const r = await fetch(`${CFG.api}/auth/guest/start`, { method: "POST" });
  if (!r.ok) throw new Error(`guest/start -> ${r.status}`);
  return (await r.json()).token as string;
}

/** Free tier: service level 1 (60s delayed World Cup), 4 weeks. Costs 0 TxL. */
async function subscribeFreeTier(provider: AnchorProvider): Promise<string> {
  const program = new Program(fullIdl as any, provider);
  const user = provider.wallet.publicKey;
  const tokenTreasuryPda = pda([Buffer.from("token_treasury_v2")]);
  const userTokenAccount = getAssociatedTokenAddressSync(TXL_MINT, user, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    user, userTokenAccount, user, TXL_MINT, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  return program.methods
    .subscribe(1, 4)
    .accounts({
      user,
      pricingMatrix: pda([Buffer.from("pricing_matrix")]),
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault: getAssociatedTokenAddressSync(TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ataIx])
    .rpc();
}

/** The activate response is `text/plain`, not JSON. Reading it as JSON silently fails. */
async function activate(txSig: string, jwt: string, signature: Uint8Array): Promise<string> {
  const walletSignature = Buffer.from(signature).toString("base64");
  const r = await fetch(`${CFG.api}/api/token/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ txSig, walletSignature, leagues: [] }),
  });
  if (!r.ok) throw new Error(`activate -> ${r.status} ${await r.text()}`);
  return (await r.text()).trim().replace(/^"|"$/g, "");
}

/**
 * Run the four steps, reporting progress. `signMessage` comes from the wallet
 * adapter; the message binds the subscription tx to the JWT so neither can be
 * replayed against the other.
 */
export async function onboard(
  provider: AnchorProvider,
  signMessage: (m: Uint8Array) => Promise<Uint8Array>,
  onStep: (s: OnboardStep) => void,
): Promise<Creds> {
  onStep("jwt");
  const jwt = await startGuest();

  onStep("subscribe");
  const txSig = await subscribeFreeTier(provider);

  onStep("sign");
  // leagues is empty, so `${txSig}:${leagues.join(",")}:${jwt}` collapses to `${txSig}::${jwt}`.
  const signature = await signMessage(new TextEncoder().encode(`${txSig}::${jwt}`));

  onStep("activate");
  const apiToken = await activate(txSig, jwt, signature);

  const creds = { jwt, apiToken };
  saveCreds(provider.wallet.publicKey.toBase58(), creds);
  return creds;
}

/** TxLINE's own devnet USDT faucet — the stake for prop duels. Rate-limited per wallet. */
export async function requestFaucet(provider: AnchorProvider): Promise<string> {
  const program = new Program(fullIdl as any, provider);
  const user = provider.wallet.publicKey;
  return program.methods
    .requestDevnetFaucet()
    .accounts({
      user,
      faucetTracker: pda([Buffer.from("faucet_tracker"), user.toBuffer()]),
      usdtMint: USDT_MINT,
      userUsdtAta: getAssociatedTokenAddressSync(USDT_MINT, user, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
      usdtTreasuryPda: pda([Buffer.from("usdt_treasury")]),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .rpc();
}
