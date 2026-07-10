# How Sharpe works, end to end

A walkthrough of every step from a cold browser tab to a settled bet and a paid-out escrow, naming the file and the instruction at each point. If you read one document to understand this codebase, read this one.

**Contents**

1. [The mental model](#1-the-mental-model)
2. [Arriving: the app with no credentials](#2-arriving-the-app-with-no-credentials)
3. [Onboarding: provisioning your own data access](#3-onboarding-provisioning-your-own-data-access)
4. [The feed: LIVE and REPLAY](#4-the-feed-live-and-replay)
5. [Proving the fixture (once per match)](#5-proving-the-fixture-once-per-match)
6. [Making a call: the commitment](#6-making-a-call-the-commitment)
7. [Proving the entry line (why it happens later)](#7-proving-the-entry-line-why-it-happens-later)
8. [Kickoff: what the program now refuses](#8-kickoff-what-the-program-now-refuses)
9. [Settling the closing line: CLV appears](#9-settling-the-closing-line-clv-appears)
10. [Settling the outcome](#10-settling-the-outcome)
11. [Prop duels: the escrow path](#11-prop-duels-the-escrow-path)
12. [The keeper: nobody has to click](#12-the-keeper-nobody-has-to-click)
13. [Verifying: re-proving in your browser](#13-verifying-re-proving-in-your-browser)
14. [The leaderboard, and why backtests never score](#14-the-leaderboard-and-why-backtests-never-score)
15. [Failure modes and escape hatches](#15-failure-modes-and-escape-hatches)
16. [Reading the code](#16-reading-the-code)

---

## 1. The mental model

Three actors, and it matters which is which.

**TxLINE** publishes sports data and, every few minutes, commits a Merkle root of that data to its Solana program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`. It exposes three read-only verifiers that answer one question each — *is this record committed under a published root?*

```
validate_fixture   the fixture's metadata, incl. its kickoff time
validate_odds      one bookmaker quote at one instant
validate_stat      a predicate over final match statistics
```

**Sharpe's program** (`clv`, `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz`) never trusts a number it was handed. Every value it stores was either derived from a record TxLINE's verifier confirmed, or fixed by the user before the answer existed. It CPIs into all three verifiers.

**You** commit to a call before the match, and the chain scores you against the price the market closed at.

The single idea underneath everything: *a Merkle proof tells you a record is authentic. It does not tell you when it was quoted, or which market it prices.* Most of this document is about closing that gap.

---

## 2. Arriving: the app with no credentials

You open the app. `Nav` shows a **Get data access** link, and every page that needs TxLINE data renders `DataGate` instead of a wall of failed requests.

This is deliberate. `app/src/config.ts` contains **no API token**:

```ts
// Read each key by name. `const env = import.meta.env` makes Vite inline the WHOLE
// env object into the bundle — every VITE_* in .env.local, secrets included.
export const CFG = {
  api: (import.meta.env.VITE_TXLINE_API as string) ?? "https://txline-dev.txodds.com",
  ...
};
```

A shared token baked into the bundle would ship to every visitor and expire in 30 days, taking the demo with it. So there isn't one. `getCreds()` returns `null` until you onboard, and `txline.ts` throws rather than making an unauthenticated call:

```ts
const headers = () => {
  const c = getCreds();
  if (!c) throw new Error("not onboarded — visit /onboard to provision the free World Cup tier");
  return { Authorization: `Bearer ${c.jwt}`, "X-Api-Token": c.apiToken };
};
```

**Files:** `app/src/config.ts`, `app/src/lib/txline.ts`, `app/src/components/DataGate.tsx`, `app/src/components/Nav.tsx`

---

## 3. Onboarding: provisioning your own data access

You connect a devnet wallet and visit `/onboard`. Four steps run, each a visible chip:

| # | Step | What happens |
|---|---|---|
| 1 | Guest token | `POST /auth/guest/start` → a 30-day JWT. No account, no email. |
| 2 | Subscribe | On-chain `subscribe(1, 4)` on TxLINE's program: service level 1 (World Cup, 60s delayed), 4 weeks. **Costs 0 TxL.** Creates your Token-2022 TxL ATA idempotently. |
| 3 | Prove ownership | Your wallet signs the message `` `${txSig}::${jwt}` ``. This binds the subscription transaction to that specific JWT, so neither can be replayed against the other. |
| 4 | Activate | `POST /api/token/activate` with `{txSig, walletSignature, leagues: []}` → your personal API token. |

Two traps worth knowing:

- **`activate` returns `text/plain`, not JSON.** Every other endpoint returns JSON. Calling `res.json()` fails in a way that looks like a network error.
- **`subscribe` is not in the trimmed IDL** that we vendor for `declare_program!`. It, `request_devnet_faucet` and `validate_fixture` all live in the full 28-instruction IDL, which the app vendors separately at `app/src/chain/idl/txoracle-full.json`.

Both credentials land in `localStorage`, keyed by wallet pubkey, and are pushed into the module-level `setCreds()` so `txline.ts` can read them. Switching wallets re-hydrates a different set.

The page also has a **Get devnet USDT** button. It calls TxLINE's own `request_devnet_faucet` — PDA seeds `["faucet_tracker", user]`, treasury `["usdt_treasury"]`, neither declared in the IDL — and mints you 100 USDT. That's the stake for prop duels.

> **Never TxL.** The TxLINE credit token is locked to its program for data authorisation and may not be transferred peer-to-peer. Duels are staked in devnet USDT, a classic SPL Token mint.

**Files:** `app/src/lib/auth.ts`, `app/src/state/auth.tsx`, `app/src/pages/Onboard.tsx`

---

## 4. The feed: LIVE and REPLAY

Once you have credentials, the Nav toggle becomes meaningful.

```
LIVE  ●          REPLAY ▸ 30×
```

Both drive the same interface, `FeedSource`:

```ts
export interface FeedSource {
  readonly mode: FeedMode;
  now(): number;                                             // simulated wall-clock
  subscribeOdds(fixtureId: number, cb: (o: any) => void): () => void;
  subscribeScores(fixtureId: number, cb: (s: any) => void): () => void;
  stop(): void;
}
```

**`LiveFeed`** opens TxLINE's SSE streams filtered by `fixtureId`. It resumes after a drop with `Last-Event-ID` (format `"<epochMs>:<index>"`), backs off exponentially, and dedupes by `MessageId` (odds) / `Seq` (scores), because a resume replays the boundary event. Heartbeats arrive roughly every 20 seconds — a 15-second probe looks like a dead stream and isn't.

**`ReplayFeed`** exists because the tournament finishes before judging. It loads a finished fixture's archived odds ladder from `/api/odds/updates/{epochDay}/{hour}/{interval}` — on fixture `18172379` that is ~1,950 records across five 5-minute buckets, thickening from 30 at T−120m to 852 in the final five minutes — plus the scores `Seq` ladder, and re-emits them on an accelerated clock.

> Replay is **not a mock**. Every record it emits is a real TxLINE record, and every one still proves. Replay changes *when* records arrive, never *what* they say.

`MatchDetail` shows an ingest strip so you can see the feed actually flowing: records counted, implied probabilities updating, and a `full time` marker once a scores update carries `Action: "game_finalised"`.

> **The documented `gameState: 5` never appears.** On this feed `GameState` is the string `"scheduled"` even a week after a match ended. Finality is the `game_finalised` action. Every settlement trigger depends on this.

**Files:** `app/src/feed/{index,live,replay}.ts`, `app/src/state/feed.tsx`, `app/src/pages/MatchDetail.tsx`

---

## 5. Proving the fixture (once per match)

Before you can bet on a match, the chain has to know when it starts — and not because you said so.

`ensureFixtureProven()` checks whether a `FixtureFacts` PDA exists at `["fixture", fixture_id]`. If not, it fetches `/api/fixtures/validation?fixtureId=` and sends **`prove_fixture`**, which CPIs into `validate_fixture`.

```
prove_fixture   accounts: prover, fixture_facts, ten_daily_fixtures_roots, txoracle_program, system_program
```

On a `true` return it persists:

```rust
pub struct FixtureFacts {          // PDA ["fixture", fixture_id.to_le_bytes()]
    pub fixture_id: i64,
    pub start_time: i64,           // PROVEN kickoff — the anchor for every timing guard
    pub participant1_id: i32,
    pub participant2_id: i32,
    pub competition_id: i32,
    pub proven_at: i64,
    pub bump: u8,
}
```

Three details that cost real debugging time:

- **`snapshot.FixtureId` is not the fixture id.** It returns `844424948304347` where every other endpoint says `18172379`. The high bits carry a sport tag (observed 3 and 1 across fixtures, so you cannot hardcode it). `summary.fixture_id` is the public id, and the proof binds the two together. The program requires *both*: `summary.fixture_id == fixture_id` and `snapshot.fixture_id & FIXTURE_ID_MASK == fixture_id`.
- **The roots PDA is bucketed in tens of days:** `["ten_daily_fixtures_roots", floor(epochDay / 10) * 10]`, and `epochDay` derives from `snapshot.Ts` (the update time), *not* `StartTime`.
- **`updateSubTreeRoot` arrives as a JSON byte array**, while `/odds` and `/scores` send base64. `b64ToBytes` accepts both.

The account uses `init`, never `init_if_needed`. It is **write-once**: a kickoff cannot be rewritten underneath predictions that were already judged against it.

Why bother? Because `validate_fixture` reads like decorative metadata plumbing, and it is actually the only thing that makes the other two proofs mean anything. Without a proven kickoff you cannot say a line predates a match, and a CLV number is a number about nothing.

**Files:** `programs/clv/src/instructions/prove_fixture.rs`, `app/src/chain/actions.ts` → `ensureFixtureProven`

---

## 6. Making a call: the commitment

You open `/match/:id`, look at the odds trajectory, and pick a side. Behind the ticket:

```
open_prediction   accounts: predictor, config, fixture_facts, prediction, system_program
```

Note what is **not** in that list: no `txoracle_program`, no roots account. **`open_prediction` performs no CPI at all.**

It takes the quote's timestamp and a hash of its identity:

```rust
pub fn handler(ctx, id, fixture_id, market, family, period, selection, line_x10,
               entry_ts: i64, entry_msg_hash: [u8; 32]) -> Result<()>
```

and does three things:

**1. Refuses a line quoted after the whistle.**

```rust
require!(entry_ts < start_time, ClvError::EntryAfterKickoff);
```

`start_time` comes from `FixtureFacts` — Merkle-proven, not supplied by you.

**2. Decides, permanently, whether this call can score.**

```rust
p.ranked = now < start_time;   // now_ms(), against the PROVEN kickoff
```

Did you commit before a kickoff *the chain itself verified*? There is no tunable constant, nothing to fake, and no way to earn it retroactively. A call on a finished match settles identically — and is labelled **Backtest**, and never reaches the leaderboard.

> **Units footgun.** `Fixture.start_time` and `Odds.ts` are epoch **milliseconds**. `Clock::unix_timestamp` is **seconds**. Mixing them makes every prediction look ranked. See `open_prediction::now_ms()`.

**3. Fixes the settlement predicate, once.**

`derive_terms(market, selection, line_x10, period, family)` runs here and its output is persisted on the account:

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

Settlement never re-derives anything. It replays these stored terms against an on-chain root. That is what makes resolution deterministic: a pure function of (published Merkle root, terms fixed when the bet was made).

The market table:

| `MarketKind` | Predicate | Priced? | Where it lives |
|---|---|---|---|
| `Result1x2` | (P1 − P2) goals ⋛ 0 | yes, `1X2_PARTICIPANT_RESULT` | ranked CLV |
| `TotalsOu` | (P1 + P2) goals ⋛ line | yes, `OVERUNDER_PARTICIPANT_GOALS` | ranked CLV |
| `CombinedTotal` | (A + B) any family ⋛ line | no | duels |
| `TeamTotal` | single stat ⋛ line | no | duels |

Families → base stat keys: `Goals` 1/2, `Yellows` 3/4, `Reds` 5/6, `Corners` 7/8. Key = `period * 1000 + base`, so first-half corners are 1007/1008. (`ScoreStat.period` is always `0`; the period lives in the key.)

Only priced markets may back a `Prediction` — `open_prediction` rejects the others with `MarketHasNoOddsLine`. Corners have no consensus line, so there is no closing price to beat. They belong on the duel surface.

The prediction is now `Open`. The UI says **Call committed on-chain**, not "proven".

**Files:** `programs/clv/src/instructions/open_prediction.rs`, `programs/clv/src/market.rs`, `app/src/components/Ticket.tsx`

---

## 7. Proving the entry line (why it happens later)

Here is the design decision that shaped the whole program.

**Odds Merkle roots publish in 5-minute batches.** The quote you just took is not covered by any published root yet. Ask `/api/odds/validation` for it and you get `HTTP 404`. We watched exactly this happen opening a real prediction on France v Morocco — 404 on the first attempt, success ~60 seconds later.

So an `open_prediction` that verified the entry line inside itself could only ever succeed on **historical** data. It could never open a prediction on a match that hadn't started, which is the only kind of prediction that counts. The merged design silently permits nothing but backtests.

(It also blew the transaction size limit: the odds record plus both proof vectors plus seven accounts came to 1,660 encoded bytes against a 1,644 cap.)

Hence a separate instruction:

```
prove_entry   accounts: prover, prediction, daily_odds_merkle_roots, txoracle_program
```

It is **permissionless** — the predictor, a keeper, or a stranger may land it — and it has no freedom about what it writes, because the commitment pinned two things:

```rust
require!(odds.ts == entry_ts, ClvError::TimestampMismatch);
require!(hash(odds.message_id.as_bytes()).to_bytes() == entry_msg_hash,
         ClvError::EntryRecordMismatch);
```

Only the exact quote you took satisfies both. Then, *before* spending a verifier CPI on it, `bind_odds` insists that quote prices the bet you actually made.

### Why `bind_odds` exists

At one instant, on one fixture, the devnet feed carries all of:

```
1X2_PARTICIPANT_RESULT           MarketPeriod=null       ← full match
1X2_PARTICIPANT_RESULT           MarketPeriod=half=1     ← FIRST HALF, same market type
OVERUNDER_PARTICIPANT_GOALS      MarketParameters=line=0.75
ASIANHANDICAP_PARTICIPANT_GOALS  MarketParameters=line=-1.75
```

All four are real. All four pass `validate_odds`. Only one prices a full-match 1X2 bet. A proof that a record is *authentic* says nothing about *which market it prices*.

```rust
require!(odds.super_odds_type == expected_super_odds_type(market),  MarketTypeMismatch);
require!(odds.market_period.as_deref() == expected_market_period(period), MarketPeriodMismatch);
// TotalsOu: parse `line=2.5` and require it equals line_x10
require!(odds.price_names[idx] == expected_price_name(market, selection), PriceNameMismatch);
```

Quarter lines (`line=0.75`, `line=-1.75`) are refused outright with `UnsupportedLine`: they are split stakes across two adjacent lines and have no boolean answer, so they cannot be a `TraderPredicate`. Whole lines (`3.0`) are refused too — they can push, and a push has no boolean answer either.

Only after all of that does the CPI fire. On `true`:

```rust
let entry_prob_bps = prob_bps(price)?;   // round(10_000_000 / price)
p.status = PredStatus::EntryProven;
```

> `prob_bps` **rounds**, it does not truncate. `10_000_000 / 1889` is `5293.8`. The program used to store `5293` while the frontend displayed `Math.round(...) = 5294` — the Verify modal would have shown a probability the chain never held. Checked against the frontend's formula for every price from 1.001 to 10.000 in `programs/clv/tests/market.rs`.

**Files:** `programs/clv/src/instructions/prove_entry.rs`, `programs/clv/src/market.rs` → `bind_odds`

---

## 8. Kickoff: what the program now refuses

The moment `Clock::now >= FixtureFacts.start_time`, four things become impossible, all anchored to the same proven number:

| Attempt | Error |
|---|---|
| `open_prediction` with `entry_ts >= start_time` | `EntryAfterKickoff` |
| `settle_close` with `close_ts > start_time` | `CloseAfterKickoff` |
| `settle_close` with an `in_running` quote | `LineIsInPlay` |
| `create_duel` / `join_duel` after kickoff | `DuelExpired` |

And any new prediction gets `ranked = false`.

Each of these is asserted to **reject** on devnet, against real Merkle proofs, in `scripts/settle-e2e.ts`. A guard nobody has watched fail is not a guard.

---

## 9. Settling the closing line: CLV appears

After the match starts, the closing line is fixed forever: it's the last quote before the whistle.

```
settle_close   accounts: settler, prediction, fixture_facts, daily_odds_merkle_roots, txoracle_program
```

"Closing" is enforced, not assumed:

```rust
require!(close_ts <= start_time, ClvError::CloseAfterKickoff);
require!(!odds.in_running,       ClvError::LineIsInPlay);
```

An in-play quote has already absorbed part of the result. Scoring an entry against it would measure nothing. And `bind_odds` runs again with the *same* market, period and line stored at open — otherwise CLV would compare the prices of two different bets.

Then:

```rust
let close_prob_bps = prob_bps(price)?;
p.clv_bps = close_prob_bps as i32 - entry_prob_bps as i32;
p.status = PredStatus::Closed;
```

That's the whole product, in one subtraction.

**A worked example, from devnet.** Fixture `18172379`, USA v Bosnia. A bet on USA:

```
entry_prob_bps  7210   (72.10%, taken at 1.387)
close_prob_bps  7163   (71.63%, market closed at 1.396)
clv_bps          -47
outcome_win     true
```

The bet **won**. It was a **bad bet**. You paid 72.1% for something the sharpest market on earth priced at 71.6% by kickoff. Outcomes are noise; prices are not. That is why professionals score themselves on closing line value — and why nobody could do it trustlessly until the line itself became provable.

**Files:** `programs/clv/src/instructions/settle_close.rs`

---

## 10. Settling the outcome

Once a scores update carries `Action: "game_finalised"`, the final stats are provable.

```
settle_outcome   accounts: settler, prediction, daily_scores_merkle_roots, txoracle_program
```

The caller fetches `/api/scores/stat-validation?fixtureId&seq&statKey&statKey2` and hands over proven stats and their Merkle branches. It **chooses nothing**:

```rust
require!(stat_a.stat_to_prove.key == sa_key, ClvError::StatKeyMismatch);
let predicate = TraderPredicate { threshold, comparison: comparison_ty(comparison) };
// keys, operator, comparison and threshold all come from the Prediction account
let win = crate::cpi::validate_stat(..., &predicate, &stat_a, &stat_b_opt, &op_opt)?;
```

`validate_stat` returns the *predicate result*, not just proof validity. So the CPI's return value **is** the answer: `p.outcome_win = win`. Status → `Settled`.

Single-stat markets (`TeamTotal`) pass `stat_b: None` and `op: None`; two-stat markets must supply the exact second key stored at open. Passing an unexpected second stat is `UnexpectedSecondStat`.

The prediction's lifecycle is complete:

```
Open ──prove_entry──▶ EntryProven ──settle_close──▶ Closed ──settle_outcome──▶ Settled
  └────────────────────── void_prediction ──────────────────────▶ Void
```

**Files:** `programs/clv/src/instructions/settle_outcome.rs`

---

## 11. Prop duels: the escrow path

Corners have no consensus line. No bookmaker prices "both teams' corners over 10.5". So there is no closing price to beat, and no CLV to score — but there *is* a provable stat. That's the duel.

This is the brief's own example, and it needs only `validate_stat`.

### Creating

```
create_duel   accounts: creator, fixture_facts, duel, vault, stake_mint,
                        creator_token_account, token_program, system_program
```

- Terms derive from the same shared `derive_terms`, so a duel and a prediction settle by identical logic.
- `expires_at` is set to `FixtureFacts.start_time` — **the proven kickoff**, not a client-supplied deadline.
- The creator's stake transfers into a **vault PDA token account** seeded `["duel_vault", duel]`, whose authority is the duel PDA. No human key can move it.
- `creator_takes_true` records which side of the predicate the creator nominated.

### Joining

```
join_duel   accounts: taker, duel, vault, stake_mint, taker_token_account, token_program
```

Guarded by `status == Open`, `now < expires_at`, and `taker != creator` (`SelfDuel`). The taker's matching stake joins the vault. Status → `Matched`. The vault now holds `2 × stake`.

### Resolving and claiming — deliberately two instructions

```
resolve_duel   accounts: resolver, duel, daily_scores_merkle_roots, txoracle_program
claim_duel     accounts: claimer, duel, vault, creator, winner, winner_token_account,
                         stake_mint, token_program
```

`resolve_duel` CPIs into `validate_stat` and writes `outcome_true`. **It moves no funds.** `claim_duel` pays the winner and closes the vault.

Splitting them mirrors `open_prediction` / `prove_entry`: one verifier CPI per transaction keeps the proof vectors inside the size limit, and it makes the state machine legible. `Resolved` means *the chain knows the answer*. `Settled` means *the money moved*.

Both are **permissionless**. The winner is a pure function of the on-chain scores root and the terms fixed at creation:

```rust
pub fn creator_wins(outcome_true: bool, creator_takes_true: bool) -> bool {
    outcome_true == creator_takes_true
}
```

That function has its own truth table in `programs/clv/tests/market.rs`, because getting it backwards means the escrow pays the loser. It's extracted as a pure function precisely because `create_duel`'s kickoff guard makes the full path untestable on historical data — you cannot create a duel on a match that already finished.

No admin key appears anywhere in this file. No rake. Rent returns to the creator.

```
Open ──join_duel──▶ Matched ──resolve_duel──▶ Resolved ──claim_duel──▶ Settled
 └── cancel_duel ──▶ Cancelled          └── refund_duel (kickoff + 7d) ──▶ Refunded
```

**Files:** `programs/clv/src/instructions/duel.rs`, `app/src/pages/Duels.tsx`

---

## 12. The keeper: nobody has to click

`scripts/keeper.ts` watches the feed and drives everything to settlement.

```bash
node --experimental-strip-types scripts/keeper.ts            # one pass
WATCH=1 node --experimental-strip-types scripts/keeper.ts    # poll every 60s
FIXTURE=18209181 node --experimental-strip-types scripts/keeper.ts   # one fixture
```

Each pass loads every `Prediction` and `Duel` account and advances whatever it can:

| State | Action | Waits for |
|---|---|---|
| `Open` | `prove_entry` | the entry quote's 5-minute odds root |
| `EntryProven` | `settle_close` | kickoff to pass, so a closing quote is archived |
| `Closed` | `settle_outcome` | `game_finalised` + the scores root |
| `Matched` | `resolve_duel` | `game_finalised` + the scores root |
| `Resolved` | `claim_duel` | nothing |

Two details worth noting.

**Finding the committed quote from a hash.** The prediction stores only `sha256(MessageId)`, never the id itself. So the keeper fetches the odds snapshot as-of `entry_ts` and searches by content:

```ts
const rec = offers.find((o) => sha256(o.MessageId).equals(want));
```

**Decoding defensively.** Anchor's `.all()` throws on the first account it cannot decode, and devnet still holds pre-v2 `Prediction` accounts that share the discriminator but not the layout. So both the keeper and `listPredictions()` decode account-by-account and skip what they can't read.

The keeper is **not privileged**. `prove_entry`, `settle_close`, `settle_outcome`, `resolve_duel` and `claim_duel` are all permissionless, and each writes exactly one value that a Merkle proof forces. A keeper saves users a click. It cannot change an outcome.

**Files:** `scripts/keeper.ts`

---

## 13. Verifying: re-proving in your browser

The Verify modal is the point of the product. It doesn't display stored values and ask you to trust them — it fires four **read-only `.view()` calls** straight into TxLINE's program, right then, and shows what comes back.

```
01  The fixture     validate_fixture   ✓  kickoff 2 Jul 2026 00:00 UTC · root 0x4073ec…
02  Entry line      validate_odds      ✓  implied 72.10%              · root 0x…
03  Closing line    validate_odds      ✓  implied 71.63%              · root 0x…
04  Match result    validate_stat      ✓  2–0                         · root 0x…
```

No wallet. No transaction. No cost. These are simulations against the live roots on Solana, and they'd fail in front of you if any number here were invented.

Reading row 01 as decorative is the mistake. It is the proof that rows 02 and 03 were quoted *before* the match — and therefore that the CLV in row 03 measures anything at all.

**Files:** `app/src/components/VerifyModal.tsx`, `app/src/chain/actions.ts` → `verifyFixture` / `verifyOdds` / `verifyStat`

---

## 14. The leaderboard, and why backtests never score

The leaderboard filters to `p.ranked`, and shows cumulative CLV (the rank key), hit rate, and Brier score.

```ts
const ranked = preds.filter((p) => p.ranked)
```

Everything else — every prediction opened on a match whose result was already public — appears in your Portfolio badged **Backtest**, settles exactly the same way, and is invisible here.

This is the honest core of the design. Sharpe could trivially let you "predict" a finished match and post a perfect record. The program refuses, using a kickoff it verified against a Merkle root, and it refuses for its own authors as much as for anyone else. The backtest in our own devnet history reads `ranked: false`.

Hit rate is included because people expect it, and Brier because it's a better calibration measure, but the ranking key is CLV. A settled bet that won with negative CLV is a bad bet, and the leaderboard says so.

**Files:** `app/src/pages/Leaderboard.tsx`, `app/src/pages/Portfolio.tsx`

---

## 15. Failure modes and escape hatches

| Situation | What happens |
|---|---|
| Entry quote's odds root hasn't published yet | `/api/odds/validation` → `404`. `prove_entry` retries; the commitment stands. |
| Prediction never proven or match abandoned | `void_prediction` closes the account and returns rent to the predictor. Blocked once `Settled`. |
| Duel offered, nobody takes it | `cancel_duel` refunds the creator and closes the vault. `Open` only. |
| Duel matched but the result never becomes provable | `refund_duel`, available `kickoff + 7 days` (`DUEL_REFUND_GRACE_MS`). Both sides get their own stake back. Nobody can trigger it early — `expires_at` is proven. |
| JWT expires (30 days) | `/onboard` again; it's free and takes one click. |
| A record is reformatted before proving | `InvalidSubTreeProof` from TxLINE. This is why `app/src/lib/codec.test.ts` exists — a Merkle leaf hashes the record's exact bytes. |

No path traps funds. No path has an admin key.

---

## 16. Reading the code

Start here, in this order:

```
programs/clv/src/market.rs                  the market model, bind_odds, the line parser
programs/clv/src/instructions/prove_fixture.rs   why the kickoff is proven
programs/clv/src/instructions/open_prediction.rs why open does no CPI, and what `ranked` means
programs/clv/src/instructions/prove_entry.rs     the deferred proof, and bind_odds in action
programs/clv/src/instructions/duel.rs            escrow with no admin key
programs/clv/tests/market.rs                     22 pure tests; the truth tables
scripts/settle-e2e.ts                            the positive path + every guard rejecting
app/src/feed/replay.ts                           how a finished match streams again
app/src/lib/codec.test.ts                        16 golden vectors against real responses
```

Verify it yourself:

```bash
anchor build && cargo test -p clv                              # 22 pure tests
node --experimental-strip-types scripts/settle-e2e.ts          # devnet, incl. 7 rejections
node --experimental-strip-types scripts/duel-e2e.ts            # devnet, real USDT
cd app && npm test && npm run dev                              # 16 codec tests, then the app
```

---

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

Exactly one verifier CPI per instruction. Measured on devnet: `validate_fixture` ~131k CU, `validate_stat` ~150k, `validate_odds` ~264k.

**PDAs**

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
