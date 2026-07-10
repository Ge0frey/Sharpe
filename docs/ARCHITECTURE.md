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

---

## 13. PHASE 0 SPIKES — all green (2026-07-09, `scripts/spike-phase0.ts`)

No cut line was triggered. Every v2 feature survives.

**S1 · Stat coverage is total.** On `18172379` (USA 2–0 Bosnia), `stat-validation` at `seq=1058` proves *every* family we want:

| keys | stat | value |
|---|---|---|
| 1 / 2 | full goals | 2 – 0 |
| 3 / 4 | yellows | 0 – 1 |
| 5 / 6 | reds | 1 – 0 |
| 7 / 8 | corners | 4 – 3 |
| 1001 / 1002 | H1 goals | 1 – 0 |
| 2001 / 2002 | H2 goals | 1 – 0 |
| 1007 / 1008 | H1 corners | 3 – 2 |

Corners total = 7, so `combined corners > 6` settles TRUE and `> 10` settles FALSE — both sides of a duel are demoable on one fixture. Note `ScoreStat.period` is **always 0**; the period lives in the key, not the field.

**S2 · `validate_fixture` verifies.** Returns `true` at **131k CU**.
- Roots PDA: `["ten_daily_fixtures_roots", alignedEpochDay u16 LE]`, `aligned = floor(epochDay/10)*10`.
- `epochDay` derives from **`snapshot.Ts`** (the update time), *not* `StartTime`. For `18172379`: `Ts=1783173600000` → day 20638 → aligned 20630.
- **Two ids.** `snapshot.FixtureId = 844424948304347` (internal) ≠ `summary.fixtureId = 18172379` (the id odds/scores use). Bind `FixtureFacts` on **`summary.fixture_id`**; read `start_time` from `snapshot.start_time`. The proof links them, so both are trustworthy.
- `subTreeProof` is empty (`Nil`, `updateCount = 1`); `mainTreeProof` has 7 nodes.
- `summary.updateSubTreeRoot` arrives as a **JSON byte array**, not base64 — unlike the odds/scores summaries. `codec.ts` must branch.

**S3 · Devnet USDT `ELWT…` is owned by classic SPL Token**, not Token-2022 (TxL is Token-2022; do not conflate). Use `TokenInterface`/`InterfaceAccount` anyway. `faucet_tracker` PDA does not exist yet for our wallet; our USDT ATA is unfunded.

**S4 · `/api/odds/updates/{epochDay}/{hourOfDay}/{interval}?fixtureId=` is a rich replay ladder.** 1,954 records across five 5-min buckets pre-kickoff, density rising into the whistle (30 at T−120m → 852 at T−5m). This replaces the 19 sequential `asOf` calls in `domain.ts:38-49`.

**S5 · SSE is alive.** `/api/odds/stream` emits; `?fixtureId=` filters correctly; heartbeats every **~20 s** (a 15 s probe sees none — don't conclude "idle"). `Last-Event-ID` format is `"<epochMs>:<index>"`. `/api/scores/stream` holds open with heartbeats and no data when nothing is in play.

**S6 · The vendored IDL is trimmed to the two verifiers.** `subscribe`, `request_devnet_faucet`, `validate_fixture`, and 23 others are absent. `scripts/proof-spike.ts:92` calls `program.methods.subscribe` and only survives because `ensureOnboarded()` short-circuits on a cached token. The full 28-instruction IDL is now extracted from `DOCUMENTATION/solana-programs.md:145-3319` to **`idls/txoracle-full.json`** — use it for `subscribe` / `request_devnet_faucet` / `validate_fixture`. Keep the trimmed IDL for `declare_program!`. `pricing_matrix` exists (62 bytes).

### 13.1 The finding that reshapes the schedule

`/api/fixtures/snapshot` is **forward-looking** — it no longer returns `18172379`. Resolve finished fixtures via `/api/fixtures/validation?fixtureId=` (which returns metadata *and* proves it). As of 2026-07-09 it lists four real World Cup matches before the deadline:

| fixture | kickoff (UTC) | match |
|---|---|---|
| `18209181` | 2026-07-09 20:00 | France v Morocco |
| `18218149` | 2026-07-10 19:00 | Spain v Belgium |
| `18213979` | 2026-07-11 21:00 | Norway v England |
| `18222446` | 2026-07-12 01:00 | Argentina v Switzerland |

Odds appear roughly **24 h before kickoff** — France v Morocco is already quoting (France 61.8 / draw 23.9 / Morocco 14.3, `InRunning: false`); Spain v Belgium is not yet.

Therefore **`ranked` is `Clock::now < proven_start_time`** — you committed before kickoff in real wall-clock, and the chain checked the kickoff against a Merkle root. No `MAX_ENTRY_AGE_SECS` constant, nothing to tune, nothing to fake. Finished fixtures yield `ranked = false` → **BACKTEST**; these four yield genuinely ranked entries.

**Hard deadline:** ship Phase 2 before a real kickoff to land ranked predictions on live matches and settle them before 19 Jul. Spain v Belgium (10 Jul 19:00 UTC) is the realistic first target; Norway v England and Argentina v Switzerland are the backups.

---

## 14. PROGRAM v2 — shipped & deployed (2026-07-09)

Program `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz` on devnet. Instruction set:

```
initialize_config
prove_fixture     CPI validate_fixture  →  FixtureFacts PDA ["fixture", fixture_id le]
open_prediction   no CPI                →  the commitment
prove_entry       CPI validate_odds     →  entry_prob_bps
settle_close      CPI validate_odds     →  clv_bps
settle_outcome    CPI validate_stat     →  outcome_win
void_prediction   no CPI                →  rent reclaim
```

### 14.1 Why the entry proof is deferred (this was not optional)

v1 merged the entry proof into `open_prediction`. Two independent reasons that cannot work:

1. **The root does not exist yet.** Odds roots publish in 5-minute batches. The quote you take at commitment time is not covered by any posted root. Observed live: `prove_entry` on the France v Morocco entry returned `HTTP 404` from `/api/odds/validation` on the first attempt and succeeded ~60 s later. A merged instruction can therefore *never* open a prediction on a match that has not started — i.e. it can only ever produce backtests, which are exactly the predictions that don't score.
2. **Transaction size.** `Odds` + both proof vectors + 7 accounts came to ~1660 encoded bytes against a 1644 limit once `fixture_facts` was added. Split, `open_prediction` carries 5 accounts and no proof; `prove_entry` carries 4.

The commitment now pins `entry_ts` **and** `entry_msg_hash` (sha256 of the quote's `MessageId`), so a deferred proof has no freedom: only the exact quote taken can satisfy both, and `bind_odds` insists that quote prices the market that was bet. `prove_entry` is permissionless — a keeper may land it.

### 14.2 `ranked` — commitment, not freshness

`ranked = Clock::now < FixtureFacts.start_time`, evaluated in `open_prediction`. Did the predictor commit before a kickoff the chain itself verified? No tunable constant, nothing to fake. Finished fixtures yield `ranked = false` → **BACKTEST**, excluded from the leaderboard but still settled.

Units footgun: `Fixture.start_time` and `Odds.ts` are epoch **milliseconds**; `Clock::unix_timestamp` is **seconds**. See `open_prediction::now_ms`.

### 14.3 Guards, each observed rejecting on devnet

A Merkle proof says a record is *authentic*. It says nothing about *which market* the record prices. `market.rs::bind_odds` closes that gap.

| guard | error | what it stops |
|---|---|---|
| `super_odds_type` matches market | `MarketTypeMismatch` | a totals record settling a 1X2 bet |
| `market_period` matches period | `MarketPeriodMismatch` | **an authentic `half=1` line settling a full-match bet** |
| `market_parameters` line == `line_x10` | `LineMismatch` | an Over 3.5 quote settling an Over 2.5 bet |
| `price_names[i]` names the selection | `PriceNameMismatch` | reading "draw" as "home" |
| quarter/whole lines refused | `UnsupportedLine` | `line=0.75` — a split stake has no boolean answer |
| `entry_ts < start_time` | `EntryAfterKickoff` | a line quoted once the result was half known |
| `close_ts <= start_time`, `!in_running` | `CloseAfterKickoff`, `LineIsInPlay` | an in-play "closing" line |
| `sha256(message_id) == entry_msg_hash` | `EntryRecordMismatch` | proving a different quote than the one taken |

Verified end-to-end by `scripts/settle-e2e.ts` (positive path + all eight rejections) on fixture 18172379.

### 14.4 `prob_bps` rounds, it does not truncate

`10_000_000 / 1889` is `5293.8`. The program truncated to `5293`; `app/src/lib/domain.ts` uses `Math.round` → `5294`. The Verify modal would have displayed a probability the chain never stored. Now `(10_000_000 + price/2) / price`, checked against the frontend's formula for every price 1.001–10.000 in `programs/clv/tests/market.rs`.

### 14.5 Markets

| market | stats | priced? | surface |
|---|---|---|---|
| `Result1x2` | (P1 − P2) goals vs 0 | yes, `1X2_PARTICIPANT_RESULT` | ranked CLV |
| `TotalsOu` | (P1 + P2) goals vs line | yes, `OVERUNDER_PARTICIPANT_GOALS` | ranked CLV |
| `CombinedTotal` | (A + B) any family vs line | no | duels |
| `TeamTotal` | single stat vs line | no | duels |

Families: `Goals` 1/2, `Yellows` 3/4, `Reds` 5/6, `Corners` 7/8. Key = `period*1000 + base`. Only `Result1x2`/`TotalsOu` may back a `Prediction`; the rest are `MarketHasNoOddsLine` there and belong to duels, which need no line.

### 14.6 Live ranked predictions (settle before 19 Jul)

| fixture | prediction | entry | status |
|---|---|---|---|
| `18209181` France v Morocco | Home @ 1.621 | 6169 bps, committed T−15.6h | ranked, entry proven — **settle after 2026-07-09 20:00 UTC** |

Devnet artifact: five 121-byte `Prediction` accounts predate the v2 layout. They share the discriminator but not the shape, so `program.account.prediction.all()` throws on them — `listPredictions` must skip undecodable accounts.

---

## 15. PROP DUELS — shipped (2026-07-09)

`Duel` PDA `["duel", fixture_id le, duel_id le]` + vault PDA token account `["duel_vault", duel]`, authority = the duel PDA.

```
create_duel   escrow creator stake; terms via the shared derive_terms; expires_at = PROVEN kickoff
join_duel     escrow taker stake                                       (refused past expires_at)
resolve_duel  CPI validate_stat -> outcome_true. Permissionless, moves no funds.
claim_duel    pay 2x stake to the proven winner, close the vault. Permissionless.
cancel_duel   unmatched -> refund creator
refund_duel   matched but never provable, past kickoff + 7d -> refund both
```

Resolution and payout are split for the same reason `prove_entry` is split from `open_prediction`: one verifier CPI per transaction, and a legible state machine (`Resolved` = the chain knows; `Settled` = the money moved).

- **Stake:** devnet USDT `ELWT…`, a **classic SPL Token** mint (TxL is Token-2022 and is data-auth only — never staked). The vault is declared over `TokenInterface`, so a Token-2022 stake mint would work unchanged.
- **`anchor-spl` cost:** default features add ~140 KB of `.so` (metadata, ATA, token-2022 extensions). Trimmed to `["token","token_2022","mint"]`. `token_2022` cannot be dropped — Anchor's `token::` account constraints expand to `anchor_spl::token_interface`. The program account needed `solana program extend` twice.
- **Faucet:** `request_devnet_faucet` seeds are `["faucet_tracker", user]`; treasury is `["usdt_treasury"]`. Neither is declared in the IDL. Mints 100 USDT.
- **Testability note:** `create_duel` requires `now < start_time`, so a duel cannot be created on a finished fixture — which means `resolve_duel`/`claim_duel` cannot be exercised on historical data. The payout rule is therefore extracted as the pure `creator_wins(outcome_true, creator_takes_true)` and unit-tested; the full path runs against a real match.

**Live duel:** `8zyy8HPuqtFdtjQJkqdN8pkxB5FShUAhTEtPvP4KHVW2` — France v Morocco, combined corners over 10.5, 5 USDT/side, matched. Resolves after full time.

## 16. FRONTEND v2

- `app/src/feed/{index,live,replay}.ts` — one `FeedSource`, two implementations. Live SSE (fixture-filtered, `Last-Event-ID` resume, backoff, dedupe by `MessageId`/`Seq`); replay from the `/odds/updates/{day}/{hour}/{interval}` ladder on an accelerated clock. `Nav` carries the `LIVE | REPLAY ▸ n×` toggle.
- `app/src/lib/auth.ts` + `state/auth.tsx` + `pages/Onboard.tsx` — per-wallet guest JWT → `subscribe(1,4)` → `signMessage` → `activate` (**`text/plain`**). Cached in `localStorage`. `DataGate` fronts every page that needs credentials.
- **Secret leak fixed.** `config.ts` did `const env = import.meta.env`, which makes Vite inline the *entire* env object — the JWT and api token were being baked into `dist/`. Reading each key by name limits inlining. `scripts/.state.json` was also tracked in git; now ignored. **The token remains in git history (commit `00c1ba9`) — rotate before publishing.**
- `pages/Duels.tsx` — offer/take/resolve/claim, with the half-integer line rule surfaced in the form.
- Portfolio gains `Prove entry`, the **Backtest** badge, and `void_prediction`. Leaderboard filters to `ranked` and adds hit rate + Brier.
- `app/src/chain/idl/txoracle-full.json` — the UI needs `validate_fixture`, `subscribe` and `request_devnet_faucet`, none of which are in the trimmed IDL.

**Tests:** `cargo test -p clv` (22) · `cd app && npm test` (16 golden-vector codec tests) · `scripts/settle-e2e.ts` (positive + 7 negative guards) · `scripts/duel-e2e.ts`.

**Docs** (all under `docs/`): `USER-FLOW.md` (the end-to-end walkthrough), `SUBMISSION.md` (technical overview + endpoint list), `FEEDBACK.md` (the required API-experience field), `DEMO.md` (video script).

---

### TL;DR
Build a small `clv` Anchor program that stores a **Prediction** and settles it through **CPIs into txoracle's `validate_odds` (entry + close) and `validate_stat` (result)** via `declare_program!`, one verifier per instruction for CU headroom. Off-chain is three clean layers (typed API clients → pure CLV/predicate domain → chain), a **Replayer** so the demo runs on finished-match data, and a React UI whose centerpiece is a **Verify modal** proving every number on Solana. **Do the M0 proof spike on a real finished World Cup fixture before writing any settlement code** — the whole edge (and the whole risk) lives in getting those two Merkle proofs to return `true`.
