# How Sharpe works, end to end

Every step from a cold browser tab to a settled bet and a paid escrow, naming the file and the instruction at each point. If you read one document to understand this codebase, read this one.

## 1. The mental model

Three actors, and it matters which is which.

**TxLINE** publishes sports data and, every few minutes, commits a Merkle root of that data to its Solana program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`. It exposes three read-only verifiers, each answering one question: is this record committed under a published root?

```
validate_fixture   the fixture's metadata, including its kickoff time
validate_odds      one bookmaker quote at one instant
validate_stat      a yes/no question about final match statistics
```

**Sharpe's program** (`clv`, `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz`) never trusts a number it was handed. Every value it stores was either derived from a record TxLINE's verifier confirmed, or fixed by the user before the answer existed. It calls all three verifiers.

**You** commit to a call before the match, and the chain scores you against the price the market closed at.

The idea underneath everything: a Merkle proof tells you a record is authentic, but not when it was quoted or which market it prices. Most of this document is about closing that gap.

## 2. Arriving with no credentials

You open the app. `Nav` shows a "Get data access" link, and every page needing TxLINE data renders `DataGate` instead of a wall of failed requests.

This is deliberate. `app/src/config.ts` contains no API token. A shared token baked into the bundle would ship to every visitor and expire in 30 days, taking the demo with it. So there isn't one. `getCreds()` returns `null` until you onboard, and `txline.ts` throws rather than making an unauthenticated call:

```ts
const headers = () => {
  const c = getCreds();
  if (!c) throw new Error("not onboarded - visit /onboard to provision the free World Cup tier");
  return { Authorization: `Bearer ${c.jwt}`, "X-Api-Token": c.apiToken };
};
```

**Files:** `app/src/config.ts`, `app/src/lib/txline.ts`, `app/src/components/DataGate.tsx`, `app/src/components/Nav.tsx`

## 3. Onboarding: provisioning your own data access

You connect a devnet wallet and visit `/onboard`. Four steps run, each a visible chip:

| # | Step | What happens |
|---|---|---|
| 1 | Guest token | `POST /auth/guest/start` returns a 30-day JWT. No account, no email. |
| 2 | Subscribe | On-chain `subscribe(1, 4)` on TxLINE's program: service level 1 (World Cup, 60s delayed), 4 weeks. Costs 0 TxL. Creates your Token-2022 TxL token account if absent. |
| 3 | Prove ownership | Your wallet signs the message `` `${txSig}::${jwt}` ``. This binds the subscription transaction to that specific JWT, so neither can be replayed against the other. |
| 4 | Activate | `POST /api/token/activate` with `{txSig, walletSignature, leagues: []}` returns your personal API token. |

Two traps worth knowing:

- `activate` returns `text/plain`, not JSON. Every other endpoint returns JSON. Calling `res.json()` fails in a way that looks like a network error.
- `subscribe` is not in the trimmed IDL we vendor for `declare_program!`. It, `request_devnet_faucet` and `validate_fixture` all live in the full 28-instruction IDL, vendored separately at `app/src/chain/idl/txoracle-full.json`.

Both credentials land in `localStorage`, keyed by wallet address, and are pushed into `setCreds()` so `txline.ts` can read them. Switching wallets loads a different set.

The page also has a "Get devnet USDT" button. It calls TxLINE's own `request_devnet_faucet` and mints you 100 USDT, the stake for prop duels.

> Never TxL. The TxLINE credit token is locked to its program for data access and cannot be transferred between users. Duels are staked in devnet USDT, a classic SPL token.

**Files:** `app/src/lib/auth.ts`, `app/src/state/auth.tsx`, `app/src/pages/Onboard.tsx`

## 4. The feed: LIVE and REPLAY

Once you have credentials, the Nav toggle becomes meaningful. Both modes drive the same `FeedSource` interface.

**`LiveFeed`** opens TxLINE's SSE streams filtered by `fixtureId`. It resumes after a drop with `Last-Event-ID` (format `"<epochMs>:<index>"`), backs off exponentially, and dedupes by `MessageId` for odds and `Seq` for scores, because a resume replays the boundary event. Heartbeats arrive roughly every 20 seconds, so a 15-second probe looks like a dead stream and is not one.

**`ReplayFeed`** exists because the tournament finishes before judging. It loads a finished fixture's archived odds ladder from `/api/odds/updates/{epochDay}/{hour}/{interval}`, plus the scores ladder, and re-emits them on an accelerated clock. On fixture `18172379` that is about 1,950 records across five 5-minute buckets, thickening from 30 at 120 minutes before kickoff to 852 in the final five minutes.

> Replay is not a mock. Every record it emits is a real TxLINE record, and every one still proves. Replay changes when records arrive, never what they say.

`MatchDetail` shows an ingest strip so you can watch the feed flow: records counted, implied probabilities updating, and a "full time" marker once a scores update carries `Action: "game_finalised"`.

> The documented `gameState: 5` never appears. On this feed `GameState` is the string `"scheduled"` even a week after a match ended. Finality is the `game_finalised` action. Every settlement trigger depends on this.

**Files:** `app/src/feed/{index,live,replay}.ts`, `app/src/state/feed.tsx`, `app/src/pages/MatchDetail.tsx`

## 5. Proving the fixture, once per match

Before you can bet on a match, the chain has to know when it starts, and not because you said so.

`ensureFixtureProven()` checks whether a `FixtureFacts` account exists at `["fixture", fixture_id]`. If not, it fetches `/api/fixtures/validation?fixtureId=` and sends `prove_fixture`, which calls `validate_fixture`. On a `true` return it stores:

```rust
pub struct FixtureFacts {          // ["fixture", fixture_id.to_le_bytes()]
    pub fixture_id: i64,
    pub start_time: i64,           // PROVEN kickoff, the anchor for every timing guard
    pub participant1_id: i32,
    pub participant2_id: i32,
    pub competition_id: i32,
    pub proven_at: i64,
    pub bump: u8,
}
```

Three details that cost real debugging time:

- **`snapshot.FixtureId` is not the fixture id.** It returns `844424948304347` where every other endpoint says `18172379`. The high bits carry a sport tag (we observed 3 and 1 across fixtures, so you cannot hardcode it). `summary.fixture_id` is the public id, and the proof binds the two together. The program requires both.
- **The roots account is bucketed in tens of days:** `["ten_daily_fixtures_roots", floor(epochDay / 10) * 10]`, and `epochDay` derives from `snapshot.Ts`, the update time, not `StartTime`.
- **`updateSubTreeRoot` arrives as a JSON byte array**, while `/odds` and `/scores` send base64. `b64ToBytes` accepts both.

The account uses `init`, never `init_if_needed`. It is write-once: a kickoff cannot be rewritten underneath predictions already judged against it.

Why bother? Because without a proven kickoff you cannot say a line predates a match, and a CLV number is then a number about nothing.

**Files:** `programs/clv/src/instructions/prove_fixture.rs`, `app/src/chain/actions.ts` (`ensureFixtureProven`)

## 6. Making a call: the commitment

You open `/match/:id`, look at the odds trajectory, and pick a side.

```
open_prediction   accounts: predictor, config, fixture_facts, prediction, system_program
```

Note what is not in that list: no `txoracle_program`, no roots account. `open_prediction` performs no CPI at all. It takes the quote's timestamp and a hash of its identity, and does three things.

**1. Refuses a line quoted after the whistle.**

```rust
require!(entry_ts < start_time, ClvError::EntryAfterKickoff);
```

`start_time` comes from `FixtureFacts`. It is Merkle-proven, not supplied by you.

**2. Decides, permanently, whether this call can score.**

```rust
p.ranked = now < start_time;   // now_ms(), against the PROVEN kickoff
```

Did you commit before a kickoff the chain itself verified? There is no tunable constant, nothing to fake, and no way to earn it afterwards. A call on a finished match settles identically, is labelled **Backtest**, and never reaches the leaderboard.

> Units trap. `Fixture.start_time` and `Odds.ts` are epoch milliseconds. `Clock::unix_timestamp` is seconds. Mixing them makes every prediction look ranked. See `open_prediction::now_ms()`.

**3. Fixes the settlement question, once.**

`derive_terms(market, selection, line_x10, period, family)` runs here and its output is stored on the account:

```rust
pub struct Terms {
    pub stat_a_key: u32,   // period * 1000 + base_key
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    pub op_add: bool,      // Add or Subtract
    pub comparison: u8,    // GT | LT | EQ
    pub threshold: i32,
}
```

Settlement never re-derives anything. It replays these stored terms against an on-chain root. That is what makes resolution deterministic.

| `MarketKind` | Question | Priced? | Where it lives |
|---|---|---|---|
| `Result1x2` | (P1 minus P2) goals against 0 | yes, `1X2_PARTICIPANT_RESULT` | ranked CLV |
| `TotalsOu` | (P1 plus P2) goals against line | yes, `OVERUNDER_PARTICIPANT_GOALS` | ranked CLV |
| `CombinedTotal` | (A plus B) any family against line | no | duels |
| `TeamTotal` | single stat against line | no | duels |

Families map to base stat keys: `Goals` 1/2, `Yellows` 3/4, `Reds` 5/6, `Corners` 7/8. Key is `period * 1000 + base`, so first-half corners are 1007 and 1008. (`ScoreStat.period` is always `0`; the period lives in the key.)

Only priced markets may back a `Prediction`. `open_prediction` rejects the others with `MarketHasNoOddsLine`. Corners have no consensus line, so there is no closing price to beat. They belong on the duel surface.

The prediction is now `Open`. The UI says "Call committed on-chain", not "proven".

**Files:** `programs/clv/src/instructions/open_prediction.rs`, `programs/clv/src/market.rs`, `app/src/components/Ticket.tsx`

## 7. Proving the entry line, and why it happens later

This is the design decision that shaped the whole program.

Odds Merkle roots publish in 5-minute batches. The quote you just took is not covered by any published root yet. Ask `/api/odds/validation` for it and you get `HTTP 404`. We watched exactly this happen opening a real prediction on France v Morocco: 404 on the first attempt, success about 60 seconds later.

So an `open_prediction` that verified the entry line inside itself could only ever succeed on historical data. It could never open a prediction on a match that had not started, which is the only kind of prediction that counts. The merged design silently permits nothing but backtests.

It also blew the transaction size limit: the odds record plus both proof vectors plus seven accounts came to 1,660 encoded bytes against a 1,644 cap.

Hence a separate instruction. `prove_entry` is permissionless, so the predictor or a stranger may land it, and it has no freedom about what it writes, because the commitment pinned two things:

```rust
require!(odds.ts == entry_ts, ClvError::TimestampMismatch);
require!(hash(odds.message_id.as_bytes()).to_bytes() == entry_msg_hash,
         ClvError::EntryRecordMismatch);
```

Only the exact quote you took satisfies both. Then, before spending a verifier CPI on it, `bind_odds` insists that quote prices the bet you actually made.

### Why `bind_odds` exists

At one instant, on one fixture, the devnet feed carries all of:

```
1X2_PARTICIPANT_RESULT           MarketPeriod=null       <- full match
1X2_PARTICIPANT_RESULT           MarketPeriod=half=1     <- FIRST HALF, same market type
OVERUNDER_PARTICIPANT_GOALS      MarketParameters=line=0.75
ASIANHANDICAP_PARTICIPANT_GOALS  MarketParameters=line=-1.75
```

All four are real. All four pass `validate_odds`. Only one prices a full-match 1X2 bet. A proof that a record is authentic says nothing about which market it prices.

```rust
require!(odds.super_odds_type == expected_super_odds_type(market),  MarketTypeMismatch);
require!(odds.market_period.as_deref() == expected_market_period(period), MarketPeriodMismatch);
// TotalsOu: parse `line=2.5` and require it equals line_x10
require!(odds.price_names[idx] == expected_price_name(market, selection), PriceNameMismatch);
```

Quarter lines (`line=0.75`, `line=-1.75`) are refused with `UnsupportedLine`: they split the stake across two adjacent lines and have no yes/no answer. Whole lines like `3.0` are refused too, because they can push, and a push has no yes/no answer either.

Only after all of that does the CPI fire. On `true`:

```rust
let entry_prob_bps = prob_bps(price)?;   // round(10_000_000 / price)
p.status = PredStatus::EntryProven;
```

> `prob_bps` rounds, it does not truncate. `10_000_000 / 1889` is `5293.8`. The program used to store `5293` while the frontend displayed `Math.round(...) = 5294`, so the Verify modal would have shown a probability the chain never held. Checked against the frontend's formula for every price from 1.001 to 10.000 in `programs/clv/tests/market.rs`.

**Files:** `programs/clv/src/instructions/prove_entry.rs`, `programs/clv/src/market.rs` (`bind_odds`)

## 8. Kickoff: what the program now refuses

The moment `Clock::now >= FixtureFacts.start_time`, four things become impossible, all anchored to the same proven number:

| Attempt | Error |
|---|---|
| `open_prediction` with `entry_ts >= start_time` | `EntryAfterKickoff` |
| `settle_close` with `close_ts > start_time` | `CloseAfterKickoff` |
| `settle_close` with an `in_running` quote | `LineIsInPlay` |
| `create_duel` or `join_duel` after kickoff | `DuelExpired` |

And any new prediction gets `ranked = false`.

Each is declared in `programs/clv/src/error.rs` and enforced in `programs/clv/src/market.rs` and `programs/clv/src/instructions/`. The guard lives in the program, so it rejects whoever calls and however they call.

## 9. Settling the closing line: CLV appears

After the match starts, the closing line is fixed forever. It is the last quote before the whistle.

"Closing" is enforced, not assumed:

```rust
require!(close_ts <= start_time, ClvError::CloseAfterKickoff);
require!(!odds.in_running,       ClvError::LineIsInPlay);
```

An in-play quote has already absorbed part of the result, so scoring an entry against it would measure nothing. And `bind_odds` runs again with the same market, period and line stored at open, otherwise CLV would compare the prices of two different bets.

Then:

```rust
let close_prob_bps = prob_bps(price)?;
p.clv_bps = close_prob_bps as i32 - entry_prob_bps as i32;
p.status = PredStatus::Closed;
```

That is the whole product, in one subtraction.

**A worked example, from devnet.** Fixture `18172379`, USA v Bosnia. A bet on USA:

```
entry_prob_bps  7210   (72.10%, taken at 1.387)
close_prob_bps  7163   (71.63%, market closed at 1.396)
clv_bps          -47
outcome_win     true
```

The bet won. It was still a bad bet. You paid 72.1% for something the market priced at 71.6% by kickoff. Outcomes are noisy; prices are not. That is why professionals score themselves on closing line value, and why nobody could do it without trusting someone until the line itself became provable.

**Files:** `programs/clv/src/instructions/settle_close.rs`

## 10. Settling the outcome

Once a scores update carries `Action: "game_finalised"`, the final stats are provable.

The caller fetches `/api/scores/stat-validation?fixtureId&seq&statKey&statKey2` and hands over proven stats and their Merkle branches. It chooses nothing:

```rust
require!(stat_a.stat_to_prove.key == sa_key, ClvError::StatKeyMismatch);
let predicate = TraderPredicate { threshold, comparison: comparison_ty(comparison) };
// keys, operator, comparison and threshold all come from the Prediction account
let win = crate::cpi::validate_stat(..., &predicate, &stat_a, &stat_b_opt, &op_opt)?;
```

`validate_stat` returns the answer to the question, not just proof validity. So the CPI's return value is the answer: `p.outcome_win = win`. Status becomes `Settled`.

Single-stat markets (`TeamTotal`) pass `stat_b: None` and `op: None`. Two-stat markets must supply the exact second key stored at open. Passing an unexpected second stat is `UnexpectedSecondStat`.

The lifecycle is complete:

```
Open --prove_entry--> EntryProven --settle_close--> Closed --settle_outcome--> Settled
  +------------------------ void_prediction ------------------------> Void
```

**Files:** `programs/clv/src/instructions/settle_outcome.rs`

## 11. Prop duels: the escrow path

Corners have no consensus line. No bookmaker prices "both teams' corners over 10.5". So there is no closing price to beat and no CLV to score, but there is a provable stat. That is the duel. It is the brief's own example, and it needs only `validate_stat`.

**Creating.** Terms derive from the same shared `derive_terms`, so a duel and a prediction settle by identical logic. `expires_at` is set to `FixtureFacts.start_time`, the proven kickoff, not a client-supplied deadline. The creator's stake transfers into a vault token account seeded `["duel_vault", duel]`, whose authority is the duel account, so no human key can move it. `creator_takes_true` records which side the creator nominated.

**Joining.** Guarded by `status == Open`, `now < expires_at`, and `taker != creator` (`SelfDuel`). The taker's matching stake joins the vault. Status becomes `Matched`, and the vault holds two stakes.

**Resolving and claiming, deliberately two instructions.** `resolve_duel` calls `validate_stat` and writes `outcome_true`. It moves no funds. `claim_duel` pays the winner and closes the vault.

Splitting them mirrors `open_prediction` and `prove_entry`: one verifier CPI per transaction keeps the proof vectors inside the size limit, and it makes the state machine legible. `Resolved` means the chain knows the answer. `Settled` means the money moved.

Both are permissionless. The winner is a pure function of the on-chain scores root and the terms fixed at creation:

```rust
pub fn creator_wins(outcome_true: bool, creator_takes_true: bool) -> bool {
    outcome_true == creator_takes_true
}
```

That function has its own truth table in `programs/clv/tests/market.rs`, because getting it backwards means the escrow pays the loser. It is extracted as a pure function precisely because `create_duel`'s kickoff guard makes the full path untestable on historical data: you cannot create a duel on a match that already finished.

No admin key appears anywhere in this file. No rake. Rent returns to the creator.

```
Open --join_duel--> Matched --resolve_duel--> Resolved --claim_duel--> Settled
 +-- cancel_duel --> Cancelled        +-- refund_duel (kickoff + 7d) --> Refunded
```

**Files:** `programs/clv/src/instructions/duel.rs`, `app/src/pages/Duels.tsx`

## 12. Settlement: anyone can click

Settlement is permissionless. `prove_entry`, `settle_close`, `settle_outcome`, `resolve_duel` and `claim_duel` may be landed by any signer, and each writes exactly one value that a Merkle proof forces. There is no privileged process, and nothing to run.

The app surfaces every transition as a button, on whichever account is ready:

| State | Action | Where | Waits for |
|---|---|---|---|
| `Open` | `prove_entry` | `/portfolio` | the entry quote's 5-minute odds root |
| `EntryProven` | `settle_close` | `/portfolio` | kickoff to pass, so a closing quote is archived |
| `Closed` | `settle_outcome` | `/portfolio` | `game_finalised` and the scores root |
| `Matched` | `resolve_duel` | `/duels` | `game_finalised` and the scores root |
| `Resolved` | `claim_duel` | `/duels` | nothing |

**Decoding defensively.** Anchor's `.all()` throws on the first account it cannot decode, and devnet still holds older `Prediction` accounts that share the discriminator but not the layout. So `listPredictions()` decodes account by account and skips what it cannot read.

A bot could poll these accounts and land the same instructions unattended. It would save users a click. It could not change an outcome.

**Files:** `app/src/pages/Portfolio.tsx`, `app/src/pages/Duels.tsx`, `app/src/chain/actions.ts`

## 13. Verifying: re-proving in your browser

The Verify modal is the point of the product. It does not display stored values and ask you to trust them. It fires four read-only `.view()` calls straight into TxLINE's program, right then, and shows what comes back.

```
01  The fixture     validate_fixture   ok  kickoff 2 Jul 2026 00:00 UTC · root 0x4073ec…
02  Entry line      validate_odds      ok  implied 72.10%              · root 0x…
03  Closing line    validate_odds      ok  implied 71.63%              · root 0x…
04  Match result    validate_stat      ok  2-0                         · root 0x…
```

No wallet. No transaction. No cost. These are simulations against the live roots on Solana, and they would fail in front of you if any number here were invented.

Reading row 01 as decorative is the mistake. It is the proof that rows 02 and 03 were quoted before the match, and therefore that the CLV in row 03 measures anything at all.

**Files:** `app/src/components/VerifyModal.tsx`, `app/src/chain/actions.ts` (`verifyFixture`, `verifyOdds`, `verifyStat`)

## 14. The leaderboard, and why backtests never score

The leaderboard filters to `p.ranked`, and shows cumulative CLV (the rank key), hit rate, and Brier score.

Everything else, meaning every prediction opened on a match whose result was already public, appears in your Portfolio badged **Backtest**, settles exactly the same way, and is invisible here.

This is the honest core of the design. Sharpe could trivially let you "predict" a finished match and post a perfect record. The program refuses, using a kickoff it verified against a Merkle root, and it refuses for its own authors as much as for anyone else. The backtest in our own devnet history reads `ranked: false`.

Hit rate is included because people expect it, and Brier because it is a better calibration measure, but the ranking key is CLV. A settled bet that won with negative CLV is a bad bet, and the leaderboard says so.

**Files:** `app/src/pages/Leaderboard.tsx`, `app/src/pages/Portfolio.tsx`

## 15. Failure modes and escape hatches

| Situation | What happens |
|---|---|
| Entry quote's odds root has not published yet | `/api/odds/validation` returns `404`. `prove_entry` retries; the commitment stands. |
| Prediction never proven, or match abandoned | `void_prediction` closes the account and returns rent to the predictor. Blocked once `Settled`. |
| Duel offered, nobody takes it | `cancel_duel` refunds the creator and closes the vault. `Open` only. |
| Duel matched but the result never becomes provable | `refund_duel`, available at kickoff plus 7 days (`DUEL_REFUND_GRACE_MS`). Both sides get their own stake back. Nobody can trigger it early, because `expires_at` is proven. |
| JWT expires after 30 days | Visit `/onboard` again. It is free and takes one click. |
| A record is reformatted before proving | `InvalidSubTreeProof` from TxLINE. This is why `app/src/lib/codec.test.ts` exists: a Merkle leaf hashes the record's exact bytes. |

No path traps funds. No path has an admin key.

## 16. Reading the code

Start here, in this order:

```
programs/clv/src/market.rs                       the market model, bind_odds, the line parser
programs/clv/src/instructions/prove_fixture.rs   why the kickoff is proven
programs/clv/src/instructions/open_prediction.rs why open does no CPI, and what `ranked` means
programs/clv/src/instructions/prove_entry.rs     the deferred proof, and bind_odds in action
programs/clv/src/instructions/duel.rs            escrow with no admin key
programs/clv/src/error.rs                        every guard, by name
programs/clv/tests/market.rs                     22 tests; the truth tables
app/src/feed/replay.ts                           how a finished match streams again
app/src/lib/codec.test.ts                        16 golden vectors against real responses
```

Verify it yourself:

```bash
anchor build && cargo test -p clv     # 22 tests
cd app && npm test && npm run dev     # 38 tests, then the app
```

Then walk a prediction from `open` to `settled` in `/portfolio`. On a finished fixture every step unlocks back to back.

## Appendix: the full instruction surface

```
initialize_config   admin, config, system_program
prove_fixture       prover, fixture_facts, ten_daily_fixtures_roots, txoracle_program, system_program
open_prediction     predictor, config, fixture_facts, prediction, system_program
prove_entry         prover, prediction, daily_odds_merkle_roots, txoracle_program
settle_close        settler, prediction, fixture_facts, daily_odds_merkle_roots, txoracle_program
settle_outcome      settler, prediction, daily_scores_merkle_roots, txoracle_program
void_prediction     predictor, prediction

create_duel         creator, fixture_facts, duel, vault, stake_mint, creator_token_account,
                    token_program, system_program
join_duel           taker, duel, vault, stake_mint, taker_token_account, token_program
resolve_duel        resolver, duel, daily_scores_merkle_roots, txoracle_program
claim_duel          claimer, duel, vault, creator, winner, winner_token_account,
                    stake_mint, token_program
cancel_duel         creator, duel, vault, creator_token_account, stake_mint, token_program
refund_duel         payer, duel, vault, creator, taker, creator_token_account,
                    taker_token_account, stake_mint, token_program
```

At most one verifier CPI per instruction. Measured on devnet: `validate_fixture` about 131k CU, `validate_stat` about 150k, `validate_odds` about 264k.

Program-derived addresses:

```
config          ["config"]                                          clv
fixture_facts   ["fixture", fixture_id le]                          clv   (write-once)
prediction      ["prediction", predictor, id le]                    clv
duel            ["duel", fixture_id le, duel_id le]                 clv
duel_vault      ["duel_vault", duel]                                clv   (token account)

daily_odds      ["daily_batch_roots",  epochDay u16 le]             txoracle
daily_scores    ["daily_scores_roots", epochDay u16 le]             txoracle
fixtures roots  ["ten_daily_fixtures_roots", floor(epochDay/10)*10] txoracle
faucet tracker  ["faucet_tracker", user]                            txoracle
usdt treasury   ["usdt_treasury"]                                   txoracle
```
