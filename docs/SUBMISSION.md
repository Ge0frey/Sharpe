# Sharpe: technical documentation

**Track:** TxLINE, World Cup
**Live:** https://sharpe-dusky.vercel.app
**Deployed:** Solana devnet, program `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz`
**How it works, end to end:** [USER-FLOW.md](USER-FLOW.md)

## The core idea

Sports betting products ask you to trust three numbers: the line you were given, the line the market closed at, and the result. Sharpe proves all three against Merkle roots that TxLINE publishes on Solana, then scores you on Closing Line Value, the gap between the price you took and the price the market closed at.

CLV is the metric professional bettors use to measure skill, because outcomes are noisy and prices are not. You can back a winner and still have made a bad bet. Our devnet backtest shows exactly that: a bet on USA to beat Bosnia, entered at an implied 72.10%, closed at 71.63%. CLV of -47 bps. The bet won. The bettor was wrong.

Until TxLINE there was no proven line, so there was no way to score CLV without trusting someone. That is the whole product.

Sharpe has two surfaces sharing one proof engine:

| Surface | Markets | Proofs used | Stake |
|---|---|---|---|
| Ranked CLV | 1X2, Totals O/U, first-half 1X2 | `validate_fixture` + `validate_odds` x2 + `validate_stat` | none |
| Prop duels | combined corners, cards, goals, per-half | `validate_fixture` + `validate_stat` | devnet USDT escrow |

Corners and cards have no consensus line, so they carry no CLV. That is why they belong on the duel surface, which needs only a provable stat. It is the brief's own "Team A Corners + Team B Corners > 10" example, settled with no admin and no oracle.

## Making the third proof load-bearing

Most entrants will prove the score. Some will prove the odds. We could find no reason anyone would call `validate_fixture`, because proving a fixture's metadata sounds decorative.

It is not. It is the only thing that makes the other two proofs mean anything.

A Merkle proof tells you a record is authentic. It tells you nothing about when it was quoted, or which market it prices. Without a proven kickoff, a predictor can open a position against an authentic odds record drawn after the match started, guaranteeing positive CLV with every proof passing. And for one fixture at one instant, the devnet feed carries:

```
1X2_PARTICIPANT_RESULT           MarketPeriod=null       <- full match
1X2_PARTICIPANT_RESULT           MarketPeriod=half=1     <- first half, same market type
OVERUNDER_PARTICIPANT_GOALS      MarketParameters=line=0.75
ASIANHANDICAP_PARTICIPANT_GOALS  MarketParameters=line=-1.75
```

All four are real. All four pass `validate_odds`. Only one prices the bet you made.

So `prove_fixture` calls `validate_fixture` and writes a write-once `FixtureFacts` account holding a Merkle-proven `start_time`. Every timing rule is anchored to it:

| Guard | Error | What it stops |
|---|---|---|
| `odds.super_odds_type` matches market | `MarketTypeMismatch` | a totals quote settling a 1X2 bet |
| `odds.market_period` matches period | `MarketPeriodMismatch` | an authentic first-half line settling a full-match bet |
| parsed `market_parameters` line == `line_x10` | `LineMismatch` | an Over 3.5 quote settling an Over 2.5 bet |
| `price_names[i]` names the selection | `PriceNameMismatch` | reading the draw price as the home price |
| line must be a half-integer | `UnsupportedLine` | `line=0.75`, a split stake with no yes/no answer |
| `entry_ts < start_time` | `EntryAfterKickoff` | a line quoted once the result was half known |
| `close_ts <= start_time` and not `in_running` | `CloseAfterKickoff`, `LineIsInPlay` | an in-play quote posing as a closing line |
| `sha256(message_id) == entry_msg_hash` | `EntryRecordMismatch` | proving a different quote than the one taken |

These are declared in `programs/clv/src/error.rs` and enforced in `programs/clv/src/market.rs` and `programs/clv/src/instructions/`. The guard is in the program, not in a test harness, so it rejects whoever calls and however they call.

### `ranked` means commitment, not freshness

```rust
p.ranked = now_ms()? < fixture_facts.start_time;
```

Did you commit before a kickoff the chain itself verified? No tunable constant, nothing to fake. Predictions made on finished matches settle identically but are labelled **Backtest** and never enter the leaderboard. You cannot bet a match whose result you already know.

### Why the entry proof is deferred

`open_prediction` performs no CPI. This is not an optimisation. The merged design is impossible:

> Odds roots publish in 5-minute batches. The quote you take at commitment time is not yet covered by any published root. Observed live: `prove_entry` on our France v Morocco entry returned `HTTP 404` from `/api/odds/validation` on the first attempt and succeeded about 60 seconds later.

A merged `open_prediction` could therefore only ever create backtests, the exact predictions that don't score. So the commitment pins `entry_ts` and `sha256(MessageId)`, and `prove_entry` lands later, permissionlessly, with no freedom over which record it proves. Splitting also brought the transaction under the size limit: the merged form was 1660 bytes against a 1644 cap.

## On-chain settlement engine

Program `clv`, 13 instructions, no admin key on any money path.

```
initialize_config
prove_fixture     CPI validate_fixture  ->  FixtureFacts account (write-once kickoff)
open_prediction   no CPI                ->  the commitment
prove_entry       CPI validate_odds     ->  entry_prob_bps
settle_close      CPI validate_odds     ->  clv_bps
settle_outcome    CPI validate_stat     ->  outcome_win
void_prediction   no CPI                ->  rent reclaim

create_duel       no CPI                ->  escrow creator's stake
join_duel         no CPI                ->  escrow taker's stake
resolve_duel      CPI validate_stat     ->  the proven answer. No funds move.
claim_duel        no CPI                ->  pay the winner both stakes, close the vault
cancel_duel       no CPI                ->  unmatched: refund creator
refund_duel       no CPI                ->  matched but never provable: refund both
```

**Duels.** The vault is a program-owned token account whose authority is the duel account, so no human key can move it. `expires_at` is the proven kickoff, not a client-supplied deadline, so a duel cannot be created or joined after the whistle. Resolution and payout are separate instructions: `Resolved` means the chain knows the answer, `Settled` means the money moved. Both are permissionless, and the winner is a pure function of the on-chain scores root and the terms fixed at creation. No rake. Rent returns to the creator.

The stake is devnet USDT, never TxL. The TxLINE credit token is locked to its program for data access and cannot move between users.

**Compute.** At most one verifier CPI per instruction. Measured on devnet: `validate_fixture` about 131k CU, `validate_stat` about 150k, `validate_odds` about 264k.

## Determinism

Settlement is a pure function of the on-chain Merkle root and the terms fixed when the bet was made. Nothing branches on wall-clock or off-chain state at settlement time.

`derive_terms(market, selection, line, period, family)` runs once, at open or create, and its output is stored. `settle_outcome` and `resolve_duel` replay the stored keys, operator, comparison and threshold. The caller supplies proven stats and Merkle branches, and chooses nothing.

- `programs/clv/tests/market.rs`, 22 tests over `derive_terms`, `stat_keys`, `parse_line_x10`, `prob_bps`, `bind_odds`, and the duel payout truth table. Pure functions, no validator.
- `app/src/lib/codec.test.ts`, 16 golden-vector tests against frozen real `/validation` responses. A Merkle leaf is hashed from a record's exact bytes, so a renamed field or an undecoded root silently breaks the proof. These pin the mapping.
- `app/src/lib/domain.test.ts`, 22 tests over market derivation and odds selection.

The full lifecycle, `prove_fixture` to `open_prediction` to `prove_entry` to `settle_close` to `settle_outcome`, and `create_duel` to `join_duel` to `resolve_duel` to `claim_duel` in real USDT, was exercised on devnet against live Merkle roots. It is reproducible from the app itself, because every step is a button in `/portfolio` and `/duels`.

One bug these caught: `prob_bps` truncated (`10_000_000 / 1889 = 5293`) where the frontend rounded (`5294`). The Verify modal would have shown a probability the chain never stored. It now rounds, checked against the frontend's formula for every price from 1.001 to 10.000.

## Ingesting the feed

`app/src/feed/` is one interface with two implementations:

- **LIVE.** The SSE streams, filtered by `fixtureId`, resumed with `Last-Event-ID` (format `"<epochMs>:<index>"`), exponential backoff, deduped by `MessageId` and `Seq`.
- **REPLAY.** A finished fixture's archived records re-emitted on an accelerated clock, at 1x, 10x, 30x or 60x.

Replay exists because the tournament ends before judging. Without it there is nothing to ingest and the app looks static. It is not a mock. Every record it emits is a real TxLINE record and every one still proves. Replay changes when records arrive, never what they say.

The odds ladder comes from `/api/odds/updates/{epochDay}/{hour}/{interval}`. On fixture 18172379 that is about 1,950 records across five 5-minute buckets, thickening from 30 at 120 minutes before kickoff to 852 in the final five minutes, which is what makes the chart move the way a real market does.

Settlement needs no privileged process. `prove_entry`, `settle_close`, `settle_outcome`, `resolve_duel` and `claim_duel` are permissionless: anyone may land them, with proofs the program checks and terms it fixed at open. The app exposes each as a button. A background service would only save users a click. It could never change an outcome.

## Onboarding, and why there is no token in this repo

Vite inlines every `VITE_*` variable into the built bundle. A shared data token would therefore ship to anyone who loads the site, and expire 30 days later, taking the demo with it.

Instead `/onboard` provisions the free tier per wallet, in four steps:

1. `POST /auth/guest/start` returns a guest JWT
2. on-chain `subscribe(1, 4)` grants the World Cup tier for 4 weeks, at a cost of 0 TxL
3. the wallet signs `` `${txSig}::${jwt}` ``, binding the subscription to the token
4. `POST /api/token/activate` returns the API token, as `text/plain` rather than JSON

Credentials live in `localStorage`, keyed by wallet. A "Get devnet USDT" button calls TxLINE's own `request_devnet_faucet`, so a judge can duel within a minute of arriving.

## TxLINE endpoints used

| Endpoint | Used for |
|---|---|
| `POST /auth/guest/start` | guest JWT |
| `POST /api/token/activate` | per-wallet API token |
| `GET /api/fixtures/snapshot` | the upcoming board |
| `GET /api/fixtures/validation` | fixture metadata and its proof, and the only way to resolve a finished fixture |
| `GET /api/odds/snapshot/{id}?asOf=` | entry and closing quotes, live and historical |
| `GET /api/odds/updates/{epochDay}/{hour}/{interval}` | the replay ladder |
| `GET /api/odds/validation` | `validate_odds` inputs |
| `GET /api/odds/stream` (SSE) | live odds ingest |
| `GET /api/scores/snapshot/{id}` | live score and full-time detection |
| `GET /api/scores/stat-validation` | `validate_stat` inputs |
| `GET /api/scores/stream` (SSE) | live score ingest |

On-chain instructions we call on `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`: `validate_fixture`, `validate_odds` and `validate_stat`, all three by CPI and also as read-only `.view()` calls for the Verify modal, plus `subscribe` and `request_devnet_faucet`.

## Running it

```bash
# program
anchor build && cargo test -p clv          # 22 tests
anchor deploy --provider.cluster devnet

# app
cd app && npm install && npm test && npm run dev
```

No `.env` is needed. Visit `/onboard` and click once.
