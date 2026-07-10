# Sharpe: architecture

A user makes a World Cup call at a locked timestamp. The app proves on-chain what the consensus line was at entry, what it was at close, and what the match result was. Closing Line Value, the professional's measure of betting skill, becomes a score anyone can check.

Most entrants prove scores with `validate_stat`. Sharpe also proves the odds with `validate_odds`, and anchors both with `validate_fixture`. The `clv` program is a settlement engine that calls all three, so no admin and no oracle is trusted.

Target: Solana devnet, World Cup free tier (service level 1, 60 second delay).

## 1. What runs where

The app is a browser client. There is no backend and no keeper.

```
TxLINE API (https://txline-dev.txodds.com)
  auth, fixtures, odds, scores, SSE streams, /validation endpoints
        |
        v
app/  (React 19, Vite 8, Tailwind v4)
  lib/txline.ts     typed REST + SSE client, sends both auth headers
  lib/auth.ts       per-wallet onboarding, faucet
  lib/codec.ts      API JSON -> on-chain types (the fragile boundary)
  lib/domain.ts     market model, implied probability, odds selection
  feed/             one FeedSource, two implementations (live, replay)
  chain/program.ts  connection, program handles, PDA derivation
  chain/actions.ts  transaction builders and read-only .view() calls
  pages/            Onboard, Matches, MatchDetail, Duels, Portfolio, Leaderboard
  components/VerifyModal.tsx
        |
        | CPI (declare_program!) and read-only .view()
        v
clv program (734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz)
        |
        v
txoracle (6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J)
  validate_fixture / validate_odds / validate_stat
  daily_batch_roots / daily_scores_roots / ten_daily_fixtures_roots
```

Data flows one way: API, then pure functions, then chain, then UI. Everything provable is proven.

**Deployment.** The app is a static build on Vercel at https://sharpe-dusky.vercel.app, with the project root set to `app/` and a rewrite sending every path to `index.html`, because the router uses history mode. Vite inlines every `VITE_*` variable into the bundle at build time, so no secret may be passed that way. The only variables are the API host, the RPC URL, and two program ids, all of which have defaults in `app/src/config.ts`.

## 2. The three verifiers

```
validate_stat(ts, fixture_summary, fixture_proof, main_tree_proof,
              predicate, stat_a, stat_b?, op?) -> bool
  account: ["daily_scores_roots", epochDay u16 le]
  Returns the answer to the predicate when the proof is valid.

validate_odds(ts, odds_snapshot, summary, sub_tree_proof, main_tree_proof) -> bool
  account: ["daily_batch_roots", epochDay u16 le]
  Note the seed: odds roots use `daily_batch_roots`, not `daily_odds_roots`.
  Returns true only if the exact Odds record, including its prices, is
  committed under the on-chain root. This is what makes the implied
  probability trustworthy.

validate_fixture(...) -> bool
  account: ["ten_daily_fixtures_roots", floor(epochDay/10)*10 u16 le]
  Proves the fixture's metadata, including its kickoff time.
```

`epochDay = floor(ts_ms / 86_400_000)`. For scores the `ts` is `summary.updateStats.minTimestamp`; for odds it is `odds.Ts`; for fixtures it derives from `snapshot.Ts`, the update time, not `StartTime`.

## 3. The codec boundary

A Merkle leaf is hashed from a record's exact bytes. Any renaming or reformatting changes the hash and yields `InvalidSubTreeProof`, an error that surfaces far from its cause. Always prove the record verbatim from the `/validation` response, never from the stream or snapshot copy.

| API JSON | On-chain argument | Transform |
|---|---|---|
| `ProofNode.hash` (base64) | `hash: [u8;32]` | base64 to 32 bytes |
| `ProofNode.isRightSibling` | `isRightSibling: bool` | passthrough |
| scores `summary.eventStatsSubTreeRoot` | `eventsSubTreeRoot: [u8;32]` | rename, then base64 to 32 bytes |
| scores `eventStatRoot` | `StatTerm.eventStatRoot` | base64 to 32 bytes |
| odds `Odds` (PascalCase) | `Odds` (camelCase) | rename; `GameState`, `MarketParameters`, `MarketPeriod` become optional |
| odds `summary.oddsSubTreeRoot` | `OddsBatchSummary.oddsSubTreeRoot` | base64 to 32 bytes |
| fixtures `summary.updateSubTreeRoot` | `[u8;32]` | arrives as a JSON byte array, not base64 |
| `List_ProofNode = Nil {}` | `[]` | empty proof becomes an empty vector |

`app/src/lib/codec.test.ts` holds 16 golden-vector tests against frozen real responses, purely to defend this boundary.

**Stat keys.** `key = period * 1000 + base`. Base keys are goals 1 and 2, yellows 3 and 4, reds 5 and 6, corners 7 and 8. First half adds 1000, second half 2000, extra time 3000 and 4000, penalties 5000. `ScoreStat.period` is always `0`; the period lives in the key.

**Odds prices.** `Prices` is an `i32`, decimal odds times 1000. Implied probability in basis points is `round(10_000_000 / price)`. The de-margined `Pct` field exists in snapshots but not in the `Odds` record that `validate_odds` verifies, so it cannot be proven. Compute from the raw price.

**Auth.** `POST /auth/guest/start` returns a 30-day JWT. On-chain `subscribe(1, 4)` costs 0 TxL. `POST /api/token/activate` returns a plain-text API token. Send `Authorization: Bearer <jwt>` and `X-Api-Token: <token>` on every data call.

## 4. The on-chain program

Why our own program rather than only `.view()`? A `.view()` call gives the UI an instant read-only check, but it stores nothing and settles nothing. `clv` locks the entry line, records the proven CLV, and escrows duel stakes, with each step gated by a CPI into a verifier.

### State

```rust
#[account] pub struct Config {
    pub admin: Pubkey, pub txoracle_program: Pubkey,
    pub prediction_count: u64, pub bump: u8,
}

#[account] pub struct FixtureFacts {   // ["fixture", fixture_id le], write-once
    pub fixture_id: i64,
    pub start_time: i64,               // the proven kickoff
    pub participant1_id: i32, pub participant2_id: i32,
    pub competition_id: i32, pub proven_at: i64, pub bump: u8,
}

#[account] pub struct Prediction {     // ["prediction", predictor, id le]
    pub predictor: Pubkey, pub id: u64, pub fixture_id: i64,
    pub market: MarketKind, pub family: StatFamily,
    pub period: u16, pub selection: u8, pub line_x10: i16,
    // the settlement question, derived once at open and stored
    pub stat_a_key: u32, pub stat_b_key: u32, pub has_stat_b: bool,
    pub op_add: bool, pub comparison: u8, pub threshold: i32,
    // entry
    pub entry_ts: i64, pub entry_msg_hash: [u8; 32], pub entry_prob_bps: u32,
    pub ranked: bool,
    // close and result
    pub close_ts: i64, pub close_prob_bps: u32,
    pub clv_bps: i32, pub outcome_win: bool,
    pub status: PredStatus,            // Open | EntryProven | Closed | Settled | Void
    pub created_at: i64, pub settled_at: i64, pub bump: u8,
}
```

### Instructions

13 in total, no admin key on any money path, at most one verifier CPI each.

```
initialize_config
prove_fixture     CPI validate_fixture  ->  FixtureFacts, write-once kickoff
open_prediction   no CPI                ->  the commitment
prove_entry       CPI validate_odds     ->  entry_prob_bps
settle_close      CPI validate_odds     ->  clv_bps
settle_outcome    CPI validate_stat     ->  outcome_win
void_prediction   no CPI                ->  rent reclaim

create_duel       no CPI                ->  escrow creator stake, expires_at = proven kickoff
join_duel         no CPI                ->  escrow taker stake, refused past expires_at
resolve_duel      CPI validate_stat     ->  outcome_true. Moves no funds.
claim_duel        no CPI                ->  pay both stakes to the winner, close the vault
cancel_duel       no CPI                ->  unmatched: refund creator
refund_duel       no CPI                ->  matched but never provable, past kickoff + 7d
```

CPI wiring uses `declare_program!` against the vendored txoracle IDL. Both verifiers declare a `bool` return, so Anchor yields it directly:

```rust
let ok: bool = txoracle::cpi::validate_odds(ctx, ts, odds, summary, sub, main)?.get();
```

### Why the entry proof is deferred

Version 1 merged the entry proof into `open_prediction`. Two independent reasons make that impossible:

1. **The root does not exist yet.** Odds roots publish in 5-minute batches, so the quote you take at commitment time is not covered by any posted root. Observed live: `prove_entry` on the France v Morocco entry returned `HTTP 404` from `/api/odds/validation` on the first attempt and succeeded about 60 seconds later. A merged instruction can therefore never open a prediction on a match that has not started, which means it can only produce backtests, the exact predictions that do not score.
2. **Transaction size.** The `Odds` record plus both proof vectors plus seven accounts came to about 1660 encoded bytes against a 1644 limit, once `fixture_facts` was added. Split, `open_prediction` carries 5 accounts and no proof; `prove_entry` carries 4.

The commitment pins `entry_ts` and `entry_msg_hash` (sha256 of the quote's `MessageId`), so the deferred proof has no freedom: only the exact quote taken satisfies both, and `bind_odds` insists that quote prices the market that was bet.

### `ranked` means commitment, not freshness

```rust
p.ranked = now_ms()? < fixture_facts.start_time;
```

Did the predictor commit before a kickoff the chain itself verified? No tunable constant, nothing to fake. Finished fixtures yield `ranked = false` and are labelled **Backtest**, excluded from the leaderboard but still settled.

`Fixture.start_time` and `Odds.ts` are epoch milliseconds. `Clock::unix_timestamp` is seconds. Mixing them makes every prediction look ranked. See `open_prediction::now_ms`.

### The guards

A Merkle proof says a record is authentic. It says nothing about which market the record prices. `market.rs::bind_odds` closes that gap.

| Guard | Error | What it stops |
|---|---|---|
| `super_odds_type` matches market | `MarketTypeMismatch` | a totals record settling a 1X2 bet |
| `market_period` matches period | `MarketPeriodMismatch` | an authentic `half=1` line settling a full-match bet |
| `market_parameters` line equals `line_x10` | `LineMismatch` | an Over 3.5 quote settling an Over 2.5 bet |
| `price_names[i]` names the selection | `PriceNameMismatch` | reading "draw" as "home" |
| quarter and whole lines refused | `UnsupportedLine` | `line=0.75` splits the stake and has no yes/no answer |
| `entry_ts < start_time` | `EntryAfterKickoff` | a line quoted once the result was half known |
| `close_ts <= start_time`, not `in_running` | `CloseAfterKickoff`, `LineIsInPlay` | an in-play quote posing as a closing line |
| `sha256(message_id) == entry_msg_hash` | `EntryRecordMismatch` | proving a different quote than the one taken |

All are declared in `programs/clv/src/error.rs` and enforced in `market.rs` and `instructions/`. The full lifecycle, and each of these rejections, was exercised on devnet against live roots on fixture 18172379.

### `prob_bps` rounds, it does not truncate

`10_000_000 / 1889` is `5293.8`. The program truncated to `5293` while `app/src/lib/domain.ts` used `Math.round` and displayed `5294`, so the Verify modal would have shown a probability the chain never stored. It is now `(10_000_000 + price/2) / price`, checked against the frontend's formula for every price from 1.001 to 10.000.

### Markets

| Market | Question | Priced? | Surface |
|---|---|---|---|
| `Result1x2` | (P1 minus P2) goals against 0 | yes, `1X2_PARTICIPANT_RESULT` | ranked CLV |
| `TotalsOu` | (P1 plus P2) goals against line | yes, `OVERUNDER_PARTICIPANT_GOALS` | ranked CLV |
| `CombinedTotal` | (A plus B) any family against line | no | duels |
| `TeamTotal` | single stat against line | no | duels |

Only `Result1x2` and `TotalsOu` may back a `Prediction`. The rest raise `MarketHasNoOddsLine` and belong to duels, which need no line.

## 5. Prop duels

`Duel` at `["duel", fixture_id le, duel_id le]`, with a vault token account at `["duel_vault", duel]` whose authority is the duel account.

Resolution and payout are split for the same reason `prove_entry` is split from `open_prediction`: one verifier CPI per transaction, and a legible state machine. `Resolved` means the chain knows the answer. `Settled` means the money moved.

- **Stake:** devnet USDT `ELWT…`, a classic SPL token. TxL is Token-2022 and is data access only, never staked. The vault is declared over `TokenInterface`, so a Token-2022 stake mint would work unchanged.
- **`anchor-spl` cost:** default features add about 140 KB to the program binary. Trimmed to `["token", "token_2022", "mint"]`. `token_2022` cannot be dropped, because Anchor's `token::` constraints expand to `anchor_spl::token_interface`. The program account needed `solana program extend` twice.
- **Faucet:** `request_devnet_faucet` uses seeds `["faucet_tracker", user]` and treasury `["usdt_treasury"]`, neither declared in the IDL. It mints 100 USDT.
- **Testability:** `create_duel` requires `now < start_time`, so a duel cannot be created on a finished fixture, which means `resolve_duel` and `claim_duel` cannot be exercised on historical data. The payout rule is therefore extracted as the pure `creator_wins(outcome_true, creator_takes_true)` and unit-tested, and the full path runs against a real match.

## 6. Confirmed on devnet

Verified against real fixtures, not assumed from documentation.

- **Both root types are posted.** `daily_scores_roots` and `daily_batch_roots` exist and their proofs reconstruct.
- **Compute is small.** `validate_fixture` about 131k CU, `validate_stat` about 150k, `validate_odds` about 264k. Nowhere near the 1.4M the documentation warns about. The instruction split is for clarity and transaction size, not compute.
- **Two fixture ids.** `snapshot.FixtureId = 844424948304347` is internal; `summary.fixtureId = 18172379` is the id every other endpoint uses. The high bits carry a sport tag, observed as 3 and 1 across fixtures, so it cannot be hardcoded. Bind `FixtureFacts` on `summary.fixture_id`, read `start_time` from the snapshot. The proof links them, so both are trustworthy.
- **Stat coverage is total.** On fixture `18172379` (USA 2-0 Bosnia) at `seq=1058`, `stat-validation` proves goals 2-0, yellows 0-1, reds 1-0, corners 4-3, first-half goals 1-0, second-half goals 1-0, first-half corners 3-2. Corners total 7, so a "combined corners over 6" duel settles true and "over 10" settles false. Both sides are demonstrable on one fixture.
- **`/api/fixtures/snapshot` is forward-looking.** It drops fixtures once they finish. Resolve finished fixtures through `/api/fixtures/validation?fixtureId=`, which returns metadata and proves it.
- **`/api/odds/snapshot/{id}` is live only** and returns empty after a match. Use `?asOf=<pre-kickoff ms>` for history.
- **The odds ladder is rich.** `/api/odds/updates/{epochDay}/{hour}/{interval}?fixtureId=` returned 1,954 records across five 5-minute buckets before kickoff, rising from 30 at 120 minutes out to 852 in the final five minutes.
- **SSE is alive.** `?fixtureId=` filters correctly. Heartbeats arrive about every 20 seconds, so a 15-second probe sees none and should not conclude the stream is idle. `Last-Event-ID` format is `"<epochMs>:<index>"`.
- **The documented `gameState: 5` never appears.** `GameState` reads `"scheduled"` even a week after a match ended. Full time is signalled by `Action: "game_finalised"` on a scores update.
- **The published IDL is trimmed** to the two verifiers. `subscribe`, `request_devnet_faucet`, `validate_fixture` and 23 others exist on-chain but are absent from it. The full 28-instruction IDL lives at `idls/txoracle-full.json` and `app/src/chain/idl/txoracle-full.json`. Keep the trimmed one for `declare_program!`.
- **Devnet coverage is thin.** Only two finished World Cup matches carry complete data: `18172379` (USA 2-0 Bosnia) and `18179551` (Spain v Austria). These are the replay demo fixtures.
- **Devnet USDT `ELWT…` is a classic SPL mint,** not Token-2022. TxL is Token-2022. Do not conflate them.
- **Older accounts do not decode.** Five 121-byte `Prediction` accounts predate the current layout and share the discriminator. `program.account.prediction.all()` throws on them, so `listPredictions` decodes one account at a time and skips what it cannot read.

## 7. Frontend

- `app/src/feed/` is one `FeedSource` with two implementations. Live SSE is filtered by fixture, resumed with `Last-Event-ID`, backed off exponentially, and deduped by `MessageId` and `Seq`. Replay reads the odds updates ladder and re-emits it on an accelerated clock. `Nav` carries the toggle.
- `app/src/lib/auth.ts`, `state/auth.tsx` and `pages/Onboard.tsx` run per-wallet onboarding: guest JWT, then `subscribe(1,4)`, then `signMessage`, then `activate`, which returns `text/plain`. Credentials are cached in `localStorage`. `DataGate` fronts every page needing them.
- `pages/Duels.tsx` handles offer, take, resolve and claim, with the half-integer line rule surfaced in the form.
- `pages/Portfolio.tsx` exposes `prove_entry`, `settle_close`, `settle_outcome` and `void_prediction` as buttons, and shows the **Backtest** badge. The leaderboard filters to `ranked` and adds hit rate and Brier score.
- `components/VerifyModal.tsx` fires four read-only `.view()` calls into txoracle, so every displayed number is re-proven in the browser on demand.

**Secrets.** `config.ts` originally did `const env = import.meta.env`, which makes Vite inline the entire environment object, baking the JWT and API token into `dist/`. Reading each key by name limits what is inlined. Two items remain recoverable from git history and should be rotated: the TxLINE guest credentials once committed at `scripts/.state.json`, and the Helius devnet RPC key. The RPC key is also inlined into every build by design, because Vite has no other way to pass it.

## 8. Tests

```bash
cargo test -p clv     # 22 tests: derive_terms, stat_keys, parse_line_x10,
                      # prob_bps, bind_odds, the duel payout truth table
cd app && npm test    # 38 tests: 16 golden-vector codec, 22 domain
```

The Rust tests are pure functions and need no validator. The codec tests run against frozen real `/validation` responses. Beyond that, the full lifecycle is reproducible from the app itself: every settlement step is a button in `/portfolio` and `/duels`, and on a finished fixture they unlock back to back.
