# Sharpe — Architecture & Implementation Spec

> **Product:** A provably-fair "beat the closing line" skill game. A user makes a World Cup call at a locked timestamp; the app proves on-chain (a) what the TxODDS consensus line was at entry, (b) what it was at close, and (c) the actual match result. **Closing Line Value (CLV)** — the pro metric for betting skill — becomes a trustless, on-chain score.
>
> **Thesis / moat:** almost every entrant will only prove *scores* (`validate_stat`). We prove the **odds** too (`validate_odds`) — the untouched primitive. Our own `clv` program is a **custom settlement/attestation engine** that CPIs into all three TxLINE verifiers. This hits every judging axis: ingest live+simulated feed, compelling use-case (CLV), and clean deterministic resolution code.
>
> **Target:** devnet. **Data:** World Cup free tier (service level 1, 60s delay; or 12 real-time on mainnet — devnet documents level 1). **Deadline:** 19 Jul 2026.

---

## 0. Ground truth (verified against DOCUMENTATION/ + REFERENCEAPI/)

**Scaffold as-is:**
- `app/` — React 19 + Vite 8 + Tailwind v4 (`@tailwindcss/vite`) + React Compiler (babel plugin). No Solana/wallet/query deps yet. `src/{App,main}.tsx` only.
- `programs/clv/` — Anchor **1.0.2**, Rust 1.89, single `initialize` ix, `declare_id!("734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz")`, tests via **litesvm**. `Anchor.toml` cluster = localnet (switch to devnet), package manager = yarn.

**TxLINE devnet targets:**
- Program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, TxL mint `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`, devnet USDT mint `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh`, API `https://txline-dev.txodds.com`, RPC `https://api.devnet.solana.com`.
- **Faucet:** TxLINE ships `request_devnet_faucet` → mints devnet USDT to a user (usable as the neutral stake coin for the optional skill pool; **never** TxL, which is data-auth only).

**The two verification contracts (exact):**

`validate_stat(ts: i64, fixture_summary: ScoresBatchSummary, fixture_proof: ProofNode[], main_tree_proof: ProofNode[], predicate: TraderPredicate, stat_a: StatTerm, stat_b: Option<StatTerm>, op: Option<BinaryExpression>) -> bool`
- account: `daily_scores_merkle_roots` = PDA(`["daily_scores_roots", epochDay:u16 le]`, txoracle)
- Errors on bad proof (`InvalidStatProof` 6023 / `InvalidMainTreeProof` 6004 / `RootNotAvailable` 6007 / `TimestampMismatch` 6010). Returns the **predicate result** when the proof is valid.

`validate_odds(ts: i64, odds_snapshot: Odds, summary: OddsBatchSummary, sub_tree_proof: ProofNode[], main_tree_proof: ProofNode[]) -> bool`
- account: `daily_odds_merkle_roots` = PDA(`["daily_batch_roots", epochDay:u16 le]`, txoracle)  ← odds roots use the **`daily_batch_roots`** seed.
- Returns true iff the exact `Odds` record (incl. its `prices`) is committed under the on-chain root. This is what makes the implied probability trustless.

`validate_fixture(...) -> bool` — proves fixture metadata (used only to show teams/kickoff are canonical; optional).

**Data → program type mapping (CRITICAL — casing + remaps):**

| Off-chain API (JSON) | On-chain arg (Anchor camelCase) | Transform |
|---|---|---|
| `ProofNode.hash` (base64 str) | `hash: [u8;32]` | base64 → 32 bytes |
| `ProofNode.isRightSibling` | `isRightSibling: bool` | passthrough |
| scores `summary.eventStatsSubTreeRoot` | `eventsSubTreeRoot: [u8;32]` | **name remap** + base64→32B |
| scores `statToProve` `{key,value,period}` | `StatTerm.statToProve: ScoreStat` | passthrough |
| scores `eventStatRoot` | `StatTerm.eventStatRoot: [u8;32]` | base64→32B |
| scores `statProof` | `StatTerm.statProof: ProofNode[]` | map nodes |
| odds `Odds` (PascalCase) | `Odds` (camelCase) | **case remap**; `GameState/MarketParameters/MarketPeriod` → `Option` (null if absent) |
| odds `summary.oddsSubTreeRoot` | `OddsBatchSummary.oddsSubTreeRoot` | base64→32B |
| `List_ProofNode` = `Nil {}` | `[]` | empty proof ⇒ empty vec |

> **Golden rule:** always feed the record to prove **verbatim from the `/validation` endpoint response** (never from the stream/snapshot copy). Any string/field reformatting changes the leaf hash → `InvalidSubTreeProof`.

**Stat/period encoding (soccer):** `key = period*1000 + base`. Full-game P1 goals = **1**, P2 goals = **2** (period field = 0). H1 +1000, H2 +2000, ET1 +3000, ET2 +4000, PE +5000. Game phase `F = 5` (finished) marks final result.

**Odds price format:** `Prices: i32`, decimal odds ×1000 (3dp). Implied prob (bps) = `10_000_000 / price`. (De-vig `Pct` exists in snapshots but **not** in the validation `Odds`; compute raw `1/price` on-chain, normalize only for display.)

**Auth:** `POST /auth/guest/start` → `{token}` (JWT, 30-day). On-chain `subscribe(serviceLevelId=1, weeks=4)` (free, 0 TxL). `POST /api/token/activate` with `{txSig, walletSignature, leagues:[]}` → **plain-text** API token string. Send `Authorization: Bearer <jwt>` + `X-Api-Token: <token>` on every data call. (Prose mentions `oracle-dev`; the real devnet host is `txline-dev.txodds.com`.)

---

## 1. System overview

```
                    ┌──────────────────────── app/ (React 19 + Vite) ───────────────────────┐
 TxLINE devnet API  │  data/         domain/          chain/            ui/                  │
 ┌───────────────┐  │  ┌────────┐   ┌──────────┐   ┌───────────┐   ┌──────────────────┐     │
 │ /auth /activate│─▶│  auth    │   │ CLV math │   │ anchor x2 │   │ Onboard          │     │
 │ /fixtures      │─▶│  rest    │──▶│ prob/vig │──▶│ (clv +    │──▶│ Fixtures board   │     │
 │ /odds  (SSE)   │─▶│  sse     │   │ market → │   │  txoracle)│   │ Match + odds chart│     │
 │ /scores (SSE)  │─▶│  stream  │   │ predicate│   │ PDA deriv │   │ Ticket / Portfolio│     │
 │ /odds/validation│▶│ validate │   │ resolver │   │ view()    │   │ Leaderboard       │     │
 │ /scores/stat-  │─▶│  client  │   └──────────┘   │ tx build  │   │ VERIFY modal ★    │     │
 │  validation    │  └────┬─────┘                  └─────┬─────┘   └──────────────────┘     │
 └───────────────┘        │  Replayer (historical→fake SSE, accelerated) for demo          │
                          └───────────────────────────────────────────────────────────────┘
                                             │ CPI (declare_program!)
             on-chain (devnet)               ▼
   ┌─────────────────────────┐   CPI    ┌──────────────────────────────────────────┐
   │  clv program (ours)     │─────────▶│ txoracle: validate_odds / validate_stat  │
   │  Config PDA             │◀── bool ─│ daily_batch_roots / daily_scores_roots    │
   │  Prediction PDA (+ CLV) │          └──────────────────────────────────────────┘
   │  (opt) SkillPool + vault│
   └─────────────────────────┘
   Keeper (Node): watches scores stream → calls prove_entry / settle_* when roots posted
```

Data flows one way: **API → domain (pure functions) → chain (tx/view) → UI**. Everything provable is proven; the UI's green "Verified on Solana" badge is the product.

---

## 2. On-chain program (`programs/clv`)

### 2.1 Why our own program (not just `.view()`)
`.view()` on txoracle gives an instant read-only check for the UI, but stores nothing and settles nothing. Our `clv` program is the **custom on-chain settlement engine** the track explicitly rewards: it locks the entry line, records the proven CLV, and (optionally) escrows a skill pool — each step gated by a **CPI into txoracle's verifiers**, so no admin/oracle is trusted.

### 2.2 CPI wiring — `declare_program!`
Vendor the devnet txoracle IDL to `programs/clv/idls/txoracle.json`, then:
```rust
use anchor_lang::prelude::*;
declare_program!(txoracle);              // generates txoracle::cpi + types from the IDL
use txoracle::cpi::accounts::{ValidateStat, ValidateOdds};
```
`validate_stat`/`validate_odds` declare a `bool` return, so Anchor CPI yields it directly:
```rust
let ok: bool = txoracle::cpi::validate_odds(cpi_ctx, ts, odds, summary, sub_proof, main_proof)?.get();
```
This is the clean, modern path (Anchor 1.x). Fallback if the IDL return-capture misbehaves: raw `invoke` + `anchor_lang::solana_program::program::get_return_data()` and Borsh-decode the 1-byte bool.

> On a valid proof, `validate_odds` returning `true` **proves the `odds.prices` are authentic** → our program can compute the implied probability from those prices and trust it. `validate_stat` returns the **predicate** result (win/lose) once the score proof checks out.

### 2.3 Accounts (state.rs)
```rust
#[account]
pub struct Config {                 // PDA ["config"]
    pub admin: Pubkey,
    pub txoracle_program: Pubkey,   // 6pW6...
    pub stake_mint: Pubkey,         // devnet USDT (skill-pool coin); Pubkey::default if disabled
    pub prediction_count: u64,
    pub bump: u8,
}

#[account]
pub struct Prediction {             // PDA ["prediction", predictor, id.to_le_bytes()]
    pub predictor: Pubkey,
    pub id: u64,
    pub fixture_id: i64,
    pub market: MarketKind,         // enum: Result1x2 | TotalsOU
    pub selection: u8,              // 0=Home/Over,1=Draw,2=Away/Under
    pub line_x10: i16,              // totals line ×10 (e.g. 25 = 2.5); 0 for 1x2
    // outcome predicate (derived from market+selection at open, stored for determinism)
    pub stat_a_key: u32, pub stat_b_key: u32, pub op_add: bool,
    pub comparison: u8,             // 0 GT | 1 LT | 2 EQ
    pub threshold: i32,
    // entry (proven)
    pub entry_msg_hash: [u8;32],    // hash of entry MessageId (bound, compact)
    pub entry_ts: i64,
    pub entry_prob_bps: u32,        // 0 until proven
    // close (proven)
    pub close_ts: i64,
    pub close_prob_bps: u32,
    // result
    pub clv_bps: i32,               // close_prob - entry_prob (signed)
    pub outcome_win: bool,
    pub status: PredStatus,         // Draft|EntryProven|Closed|Settled|Void
    pub created_at: i64, pub settled_at: i64, pub bump: u8,
}
```
Events (the shareable receipt): `PredictionOpened`, `EntryProven{entry_prob_bps, odds_root}`, `PredictionSettled{clv_bps, outcome_win, entry_prob_bps, close_prob_bps, scores_root, odds_root}`.

### 2.4 Instructions & lifecycle
1. `initialize_config(stake_mint?)` — replaces the stub `initialize`. Sets admin, txoracle id.
2. `open_prediction(id, fixture_id, market, selection, line_x10, entry_ts, entry_msg_hash)` — creates the PDA in `Draft`, derives+stores the outcome predicate (see §6 table). Cheap, no CPI.
3. `prove_entry(ts, odds, summary, sub_proof, main_proof, price_index)` — **CPI `validate_odds`**; on `true`, compute `entry_prob_bps = 10_000_000 / odds.prices[price_index]`, assert record matches stored `fixture_id`/`entry_ts`/`entry_msg_hash`, set `EntryProven`. (Deferred if the entry batch root isn't posted yet → keeper retries.)
4. `settle_close(ts, odds, summary, sub_proof, main_proof, price_index)` — **CPI `validate_odds`** for the closing record; store `close_prob_bps`, `close_ts`, `clv_bps = close_prob_bps - entry_prob_bps`; status `Closed`.
5. `settle_outcome(ts, fixture_summary, fixture_proof, main_proof, stat_a, stat_b?, op?)` — **CPI `validate_stat`** with the predicate stored at open; set `outcome_win`, status `Settled`; emit `PredictionSettled`. (Split from `settle_close` for compute-budget headroom.)
6. `void_prediction()` — expiry / no-root-available refund path.

**Compute budget:** each heavy verifier can approach ~1.4M CU. Keep **one verifier CPI per instruction** (hence entry/close/outcome are separate ixs). Client prepends `ComputeBudgetProgram.setComputeUnitLimit(1_400_000)`. Never bundle two proofs in one tx.

**Determinism:** the predicate is computed once at `open` and stored; settlement re-uses it verbatim, so resolution is a pure function of on-chain roots + stored terms. No branching on wall-clock or off-chain state.

### 2.5 Optional skill pool (Phase 2, cleanly separable)
`SkillPool` PDA + `pool_vault` (ATA owned by pool PDA) in **devnet USDT** (fund via txoracle `request_devnet_faucet`). `create_pool`/`join_pool` escrow equal stakes keyed to a fixture+market; `claim_pool` pays the side whose `settle_outcome` proved true (highest CLV as tiebreak). Uses classic SPL via `anchor-spl` (verify the stake mint's token program first). Core product works with this disabled.

### 2.6 Tests
- **litesvm (unit):** CLV math, `market→predicate` derivation, prob_bps rounding, state transitions. Pure, fast.
- **CPI integration:** point at **devnet** (free tier) against a real finished fixture, or dump txoracle + the needed daily-root accounts into localnet (`solana program dump 6pW6… txoracle.so`; `solana account <rootPda> --output-file`). Assert `settle_outcome` writes the expected `outcome_win` for a known match.

---

## 3. Off-chain layer (`app/src/data`, `app/src/domain`)

### 3.1 `data/txline/` — API clients (typed to the schemas above)
- `auth.ts` — `startGuest()` → jwt; `activate(txSig, walletSignature, leagues)` → apiToken (**response is text/plain**, read `res.data` / `await res.text()`, not `.token`). Cache jwt (30d) + apiToken; on `401` re-mint jwt; on `403` re-activate.
- `rest.ts` — `fixturesSnapshot()`, `oddsSnapshot(fixtureId)`, `oddsUpdates(fixtureId | epochDay,hour,interval)`, `scoresSnapshot(fixtureId, asOf?)`, `scoresUpdates(fixtureId | day,hour,interval)`, `scoresHistorical(fixtureId)` (6h–2wk window). Shared axios instance with both auth headers + `Accept-Encoding: gzip`.
- `sse.ts` — `streamOdds()`, `streamScores()` using the SSE parser from `examples.md` (block split on `\r?\n\r?\n`, gzip-aware). Auto-reconnect with backoff; dedupe by `MessageId`/`seq`.
- `validation.ts` — `oddsValidation(messageId, ts)` → `OddsValidation`; `statValidation(fixtureId, seq, statKey, statKey2?)` → `ScoresStatValidation`. These return the **exact records + proofs** to hand to chain.
- `codec.ts` — `b64ToBytes32`, `toProofNodes`, `oddsApiToProgram` (PascalCase→camel, options), `scoresSummaryToProgram` (`eventStatsSubTreeRoot`→`eventsSubTreeRoot`), `bnify`.

### 3.2 `domain/` — pure, deterministic, unit-tested
- `impliedProb.ts` — `probBps(price_i32) = round(10_000_000 / price)`; `normalize1x2(prices[])` for display de-vig; `clv(entryBps, closeBps)`.
- `market.ts` — model of the two MVP markets and the **market→predicate** mapping (§6). Picks the odds `price_index` from `PriceNames`/`MarketParameters`.
- `resolver.ts` — given a fixture: pull scores (snapshot/historical), find the **final** update (`gameState == 5`), return its `seq` + the `statKey`s needed; pick entry line (first quote at/after user's lock ts) and closing line (last pre-kickoff quote, or last `InRunning=false` before `F`).
- `replay.ts` — **demo de-risker:** reads `scoresHistorical` + `oddsUpdates` for a finished fixture and re-emits them as an accelerated in-memory SSE, so the whole live pipeline runs with zero live activity during judging. Toggle: Live | Replay.

### 3.3 `chain/`
- `providers.ts` — Connection + AnchorProvider; `Program<Clv>` (our IDL) and `Program<Txoracle>` (their IDL) for `.view()`.
- `pdas.ts` — `dailyScoresPda(ts)`, `dailyOddsPda(ts)` (seed `daily_batch_roots`), `configPda()`, `predictionPda(user,id)`. `epochDay = Math.floor(ts / 86_400_000)` (ms), `u16 LE`.
- `verify.ts` — read-only badges: `program.methods.validateOdds(...).accounts({dailyOddsMerkleRoots}).preInstructions([cuIx]).view()` and the `validateStat(...).view()` from `examples.md`. Used for instant UI verification independent of settlement.
- `tx.ts` — builders for `open/proveEntry/settleClose/settleOutcome`, each with the CU ix; wallet-adapter signing.

---

## 4. Frontend (`app/src`)

Stack additions: `@solana/web3.js`, `@coral-xyz/anchor`, `@solana/wallet-adapter-react(+-wallets,-base,-react-ui)`, `@tanstack/react-query`, a router (`react-router` or `@tanstack/router`), a chart lib (`visx` or `recharts`), `bn.js`, `bs58`, `tweetnacl` (activation signing).

Providers: `WalletProvider` → `QueryClientProvider` → `TxlineAuthProvider` (holds jwt/apiToken, exposes authed clients) → app.

Routes/pages:
- **/onboard** — connect wallet → guest JWT → `subscribe(1,4)` → activate. Status chips for each step. One-time.
- **/matches** — the 104-fixture board from `fixturesSnapshot` (group/R32/R16…): status, kickoff, live score if streaming. Live|Replay toggle.
- **/match/:fixtureId** — odds **trajectory chart** (implied prob over time from odds updates), live score, and the **ticket**: pick market + selection, lock entry → `open_prediction` (+ `prove_entry` when root available).
- **/portfolio** — my predictions with entry/close prob, **CLV** (green/red), status, and a **Verify** button.
- **/leaderboard** — cumulative CLV + hit-rate (+ Brier) across predictors; all inputs proven.
- **Verify modal ★** (the money shot) — shows the proven entry line, closing line, and result; fires the two `.view()` calls live and renders `true` + the on-chain roots/tx links. Copy-as-receipt (ties to the `PredictionSettled` event).

UX principles: every number that is proven gets a subtle "shield" affordance that opens the Verify modal; never show an unproven number as if it were final.

---

## 5. Verification recipes (exact)

**Scores outcome (proven, per `examples.md` + schema):**
```
val = GET /api/scores/stat-validation?fixtureId=F&seq=FINAL_SEQ&statKey=1&statKey2=2
ts        = val.summary.updateStats.minTimestamp        // seed + arg basis (matches examples.md)
epochDay  = floor(ts / 86_400_000)  → dailyScoresPda(["daily_scores_roots", u16LE])
fixtureSummary = { fixtureId:BN, updateStats{updateCount,minTimestamp:BN,maxTimestamp:BN},
                   eventsSubTreeRoot: b64→32B(val.summary.eventStatsSubTreeRoot) }
statA = { statToProve: val.statToProve, eventStatRoot: b64→32B(val.eventStatRoot),
          statProof: nodes(val.statProof) }
statB = statKey2 ? { statToProve: val.statToProve2, eventStatRoot: b64→32B(val.eventStatRoot),
                     statProof: nodes(val.statProof2) } : null
predicate = { threshold, comparison }        // from §6
op        = Add|Subtract|null                // from §6
validateStat(ts, fixtureSummary, nodes(val.subTreeProof), nodes(val.mainTreeProof),
             predicate, statA, statB, op)
```

**Odds line (proven):**
```
val = GET /api/odds/validation?messageId=M&ts=T          // M,T from the odds update you locked
ts       = val.odds.Ts
epochDay = floor(ts / 86_400_000)  → dailyOddsPda(["daily_batch_roots", u16LE])
odds     = oddsApiToProgram(val.odds)   // Pascal→camel; GameState/MarketParameters/MarketPeriod→Option
summary  = { fixtureId:BN, updateStats{...:BN}, oddsSubTreeRoot: b64→32B(val.summary.oddsSubTreeRoot) }
validateOdds(ts, odds, summary, nodes(val.subTreeProof), nodes(val.mainTreeProof))
→ true ⇒ prob_bps = 10_000_000 / odds.prices[price_index]
```
`price_index` comes from matching your selection to `odds.priceNames` (1x2: Home/Draw/Away; totals: Over/Under at `MarketParameters` line).

> **Spike to confirm before building settle logic (½ day):** (1) which `ts` the odds path wants for seed vs `TimestampMismatch` (`odds.Ts` vs `summary.updateStats.minTimestamp`); (2) that devnet has odds+scores roots posted for a finished WC fixture; (3) `epochDay` alignment for both PDAs. Do this as a standalone `.view()` script first — do not write `settle_*` until a real finished fixture verifies green.

---

## 6. Market → outcome-predicate mapping (MVP)

Full-game goals: `statKey` **1** = P1 goals, **2** = P2 goals, period 0. `predicate = (statA op statB) ⟂ threshold`.

| Market / selection | statA | statB | op | comparison | threshold | meaning |
|---|---|---|---|---|---|---|
| Result — Home | 1 | 2 | Subtract | GreaterThan | 0 | P1−P2 > 0 |
| Result — Away | 1 | 2 | Subtract | LessThan | 0 | P1−P2 < 0 |
| Result — Draw | 1 | 2 | Subtract | EqualTo | 0 | P1−P2 = 0 |
| Totals — Over 2.5 | 1 | 2 | Add | GreaterThan | 2 | P1+P2 ≥ 3 |
| Totals — Under 2.5 | 1 | 2 | Add | LessThan | 3 | P1+P2 ≤ 2 |

(Extensible later: corners keys 7/8, cards 3–6, per-half via +1000/+2000, first-half markets, etc. Keep MVP to goals — cleanest to prove and most liquid odds.)

---

## 7. Devnet deployment & onboarding

1. `anchor keys sync` or keep `734ZW…`; set `Anchor.toml [provider] cluster = "devnet"`, wallet funded via `solana airdrop`.
2. `anchor build && anchor deploy --provider.cluster devnet`. Export our IDL to `app/src/chain/idl/clv.json`; vendor txoracle devnet IDL to both `programs/clv/idls/txoracle.json` (for `declare_program!`) and `app/src/chain/idl/txoracle.json` (for `.view()`).
3. Run `initialize_config` (stake_mint = devnet USDT or default).
4. App onboarding does `subscribe(1,4)` + activate per user wallet (free). Provide a "Get devnet USDT" button → `request_devnet_faucet` for the optional pool.
5. Host the SPA (Vercel/Netlify). Judges get: deployed URL + devnet program id + a replayable finished fixture.

---

## 8. Build order (spikes first — de-risk the proofs)

- **M0 · Proof spike (day 1):** node script: auth → pick a finished WC fixture (R32/group already played) → `stat-validation` + `odds/validation` → `validateStat.view()` + `validateOdds.view()` both `true`. **Gate:** nothing else starts until this is green on devnet.
- **M1 · Program core:** `Config`, `Prediction`, `open`/`prove_entry`/`settle_close`/`settle_outcome` with `declare_program!` CPIs; litesvm math tests; one devnet integration test settling a known match.
- **M2 · Data+domain:** typed clients, codec, implied-prob/CLV, resolver, replayer; unit tests.
- **M3 · Frontend:** onboard → matches → match+chart → ticket → portfolio → **Verify modal**; wallet + query wiring.
- **M4 · Leaderboard + polish:** CLV/Brier aggregation, empty/error/loading states, Live↔Replay.
- **M5 (stretch) · Skill pool:** USDT escrow + claim.
- **M6 · Demo:** record on a replayed finished fixture; script per §10.

---

## 9. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Devnet roots missing for a fixture | can't prove | M0 spike selects a fixture with posted roots; keep a known-good fixture for the demo |
| `TimestampMismatch`/`InvalidSubTreeProof` from reformatting | proof fails | prove **verbatim** from `/validation`; centralize in `codec.ts`; snapshot-test the mapping |
| Live batch root not yet posted at entry | `prove_entry` fails | deferred entry proof + keeper retry; demo uses historical (already committed) |
| Two proofs blow the CU limit | tx fails | one verifier CPI per ix (entry/close/outcome split) + 1.4M CU ix |
| `declare_program!` return capture quirk | can't read bool | fallback to raw `invoke` + `get_return_data()` |
| Matches finished before judging → no live data | flat demo | Replayer makes the pipeline live on historical data |
| Token expiry (JWT 30d / apiToken) | 401/403 mid-demo | auto re-mint on 401, re-activate on 403 |
| React Compiler + wallet-adapter interop | build friction | keep providers at root; memo boundaries; test `anchor` in browser early |

---

## 10. Demo script (≤5 min, on a replayed finished fixture)

1. Problem: "How do you know the line — or the result — was real?" (10s)
2. Onboard: connect → free WC subscription → activated. (25s)
3. Matches board updating from the (replayed) stream; open a finished R32 match. (30s)
4. Odds trajectory chart; **lock an entry** early → `open` + `prove_entry` (entry line proven on-chain). (45s)
5. Scrub replay to full-time; score resolves. (30s)
6. **Settle & Verify:** `settle_close` + `settle_outcome`; Verify modal fires both `.view()` → `true`; **CLV** lights green; climb leaderboard. (90s)
7. Close: "Entry line, closing line, and result — every number proven on Solana. No oracle to trust." (20s)

---

## 11. Repo layout (target)

```
programs/clv/
  idls/txoracle.json               # vendored devnet IDL (declare_program!)
  src/{lib,state,error,constants}.rs
  src/instructions/{initialize_config,open_prediction,prove_entry,
                    settle_close,settle_outcome,void_prediction,
                    pool_*}.rs      # pool_* = Phase 2
  tests/{clv_math_litesvm.rs, settle_devnet.rs}
app/src/
  data/txline/{auth,rest,sse,validation,codec}.ts
  domain/{impliedProb,market,resolver,replay}.ts
  chain/{providers,pdas,verify,tx}.ts  chain/idl/{clv,txoracle}.json
  ui/{pages,components}/…  state/{auth,wallet}.tsx  main.tsx App.tsx
scripts/{proof-spike.ts, keeper.ts, initialize-config.ts}
```

---

## 12. CONFIRMED ON DEVNET (M0 spike green — 2026-07-03)

Proven via `scripts/proof-spike.ts` (onboard → both proofs `true`). Locked facts:

- **Onboarding works:** `subscribe(1,4)` (Token-2022 TxL ATA created idempotently) + `activate` → `apiToken` string `txoracle_api_…`. Cache jwt+apiToken; reuse across runs. Guest JWT valid ~30d.
- **Devnet posts BOTH roots.** `daily_scores_roots` and `daily_batch_roots` PDAs exist and proofs reconstruct. Bases confirmed: **scores** `ts = summary.updateStats.minTimestamp`, **odds** `ts = odds.Ts`; `epochDay = floor(ts_ms/86_400_000)` u16 LE for both.
- **CU is tiny:** `validate_stat` ~150k, `validate_odds` ~264k CU (not 1.4M). The entry/close/outcome split is for determinism/clarity, **not** CU. Multiple verifications could even share one tx.
- **Return bool** decodes from `simulateTransaction` `returnData.data[0]` (1 byte). For the program, `txoracle::cpi::…?.get()` / `get_return_data()` will mirror this.
- **Devnet coverage is thin:** `/api/fixtures/snapshot` returns ~15 fixtures; only **2 finished WC matches have data** → demo fixtures **`18172379` USA 2–0 Bosnia** and **`18179551` Spain–Austria**. (Fixtures use PascalCase: `FixtureId, StartTime, Competition, Participant1/2, Participant1IsHome`.)
- **Scores shapes:** `/api/scores/snapshot/{id}` entries are PascalCase with **`Seq`** (capital), nested `Score`, `Ts`; drive `seq` off the newest `Seq`. `/scores/historical` was empty for these — snapshot `Seq` is the reliable source. `stat-validation` (lowercase `ts/statToProve/summary/subTreeProof/mainTreeProof/statProof/statToProve2/statProof2`) returns `statToProve.{key,value,period}` — e.g. USA `{1,2,0}` Bosnia `{2,0,0}`.
- **Odds shapes:** `/api/odds/snapshot/{id}` is **live-only** (empty post-match); use **`?asOf=<pre-kickoff ms>`** for history (returned 34 offers at −30m). **Full-match 1X2** = `SuperOddsType:"1X2_PARTICIPANT_RESULT"`, **`MarketPeriod: null`** (a `"half=1"` variant is first-half), `PriceNames:["part1","draw","part2"]`, `Prices` decimal×1000 (`1889` = 1.889). Snapshot also carries `Pct` (de-vigged) — but prove the record from `/odds/validation` (its `odds` omits `Pct`, matching the program type). Other markets present: `ASIANHANDICAP_PARTICIPANT_GOALS`, `OVERUNDER_PARTICIPANT_GOALS` (each `half=1` + `null`).
- **Tooling:** anchor JS **0.32.1**, web3 1.98.4. `BN` interop under Node ESM: `anchor.BN ?? anchor.default.BN`. Run scripts with `node --experimental-strip-types` (avoid TS enums/param-props). npm installs must run **unsandboxed** here (sandbox throttles npm's connection storm).

### TL;DR
Build a small `clv` Anchor program that stores a **Prediction** and settles it through **CPIs into txoracle's `validate_odds` (entry + close) and `validate_stat` (result)** via `declare_program!`, one verifier per instruction for CU headroom. Off-chain is three clean layers (typed API clients → pure CLV/predicate domain → chain), a **Replayer** so the demo runs on finished-match data, and a React UI whose centerpiece is a **Verify modal** proving every number on Solana. **Do the M0 proof spike on a real finished World Cup fixture before writing any settlement code** — the whole edge (and the whole risk) lives in getting those two Merkle proofs to return `true`.
