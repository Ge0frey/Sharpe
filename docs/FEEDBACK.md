# Working with the TxLINE API — what we liked, where we lost time

Notes taken as we hit each thing, not reconstructed afterwards.

## What we liked most

**Odds and scores are both provable, against separate roots.** This is the thing that made our product possible. Everyone can prove a scoreline; almost nobody can prove *what the market price was at a given instant*. Closing Line Value has been the professional's skill metric for decades and has never been trustlessly computable. `validate_odds` changes that. It is the single most under-appreciated primitive in the IDL.

**`validate_fixture` is quietly the most important verifier.** It reads like metadata plumbing. It is actually the anchor for every timing guarantee: without a proven kickoff you cannot say a line predates a match, and every CLV number is meaningless. We would put it first in the docs, not third.

**Two-stat predicates with `Add`/`Subtract`.** `validate_stat` taking `stat_a`, `Option<stat_b>` and an operator meant "both teams' corners over 10.5" needed zero custom resolution logic. Markets no bookmaker lists, settled by one CPI.

**The free World Cup tier is genuinely frictionless.** `subscribe(1, 4)` costs 0 TxL, and `request_devnet_faucet` mints devnet USDT from inside the same program. A judge can go from cold wallet to staked duel in under a minute.

**Compute is cheap.** We budgeted 1.4M CU per verifier based on the docs' warnings. Measured: `validate_fixture` ~131k, `validate_stat` ~150k, `validate_odds` ~264k. That reshaped our instruction design for the better.

## Friction, roughly in the order it cost us time

**The published IDL is trimmed.** The IDL we were handed carries `validate_odds` and `validate_stat` only. `subscribe`, `request_devnet_faucet`, `validate_fixture` and 23 others exist on-chain and appear in `DOCUMENTATION/solana-programs.md`, but not in the artifact you'd naturally vendor. We had a `program.methods.subscribe(...)` call that only worked because a cached-token early return skipped it; a fresh run would have thrown. Shipping one complete IDL would have saved a half day.

**`gameState: 5` never appears.** The scores docs give a full soccer phase enum (NS=1 … F=5). On the wire, `GameState` is the string `"scheduled"` — on a match that finished a week ago. Full time is actually signalled by `Action: "game_finalised"` on a scores update. Every keeper and every settlement trigger depends on getting this right, and the documented enum sends you the wrong way.

**Root encodings are inconsistent across endpoints.** `/odds/validation` and `/scores/stat-validation` return roots and proof hashes as base64 strings. `/fixtures/validation` returns `updateSubTreeRoot` as a JSON **byte array**. Our codec had to accept both. Worse, the odds/scores schemas *say* `string` but sometimes send arrays. A leaf is hashed from exact bytes, so getting this wrong yields `InvalidSubTreeProof` — an opaque failure, far from its cause. We ended up writing golden-vector tests purely to defend this boundary.

**`summary.eventStatsSubTreeRoot` → `eventsSubTreeRoot`.** The API field name and the on-chain struct field name differ by one word. Nothing catches it: you build a valid-looking struct whose leaf hash is nonsense.

**`Fixture.FixtureId` is not the fixture id.** `/fixtures/validation` returns `snapshot.FixtureId = 844424948304347` while `summary.fixtureId = 18172379` — the id every other endpoint uses. The high bits carry a sport tag (we observed 3 and 1 across fixtures, so you cannot even hardcode it). We only found this because a `require!` failed. Please document the packing, or expose the public id on the snapshot.

**`/fixtures/snapshot` is forward-looking.** It silently drops fixtures once they finish. Since the tournament ends before the hackathon is judged, every demo fixture eventually vanishes from the endpoint the app was built on. `/fixtures/validation?fixtureId=` still resolves them, which is a lovely accident — but it isn't obvious, and the docs don't say the snapshot is a *future* window.

**Odds roots lag the quote by up to five minutes.** Not a bug — batches publish on a 5-minute boundary — but it has a hard architectural consequence that isn't called out anywhere: you **cannot** prove an odds record at the moment a user acts on it. Any design that verifies the entry line inside the same instruction that opens a position can only ever work on historical data. We discovered this when `prove_entry` returned `404` on a live quote. A sentence in the quickstart would save teams a redesign.

**`POST /api/token/activate` returns `text/plain`.** Every other endpoint returns JSON. `await res.json()` fails silently in axios if you've set `transformResponse` naively. Small, but it bit us twice.

**Quarter lines cannot be settled.** The feed carries `MarketParameters: line=0.75` and `line=-1.75`. These are split stakes across two adjacent lines and have no boolean answer, so they cannot be expressed as a `TraderPredicate`. We reject them in-program. It would help if the docs said which lines are settleable by `validate_stat` and which are display-only.

**`Pct` is not provable.** The de-margined implied probability appears in `/odds/snapshot` but not in the `Odds` struct that `validate_odds` verifies. So the trustworthy number is `1/price` from the raw `Prices`, and the pretty number in the snapshot cannot be proven. Worth stating explicitly — we nearly built a scoreboard on `Pct`.

**Minor:** `Scores.fixtureId` is typed `int32` while the on-chain summaries use `i64`. SSE heartbeats arrive about every 20 seconds, so a 15-second probe looks like a dead stream (we briefly concluded the streams were down). The IDL still ships `SUBSCRIPTION_DURATION = 3600` and `SUBSCRIPTION_PRICE_TOKEN = 1`, which contradict the documented 4-week / 1000-TxL-per-USD pricing.

## What we'd ask for next

1. One complete, canonical IDL artifact.
2. A `finalised: bool` (or the real phase enum) on scores updates.
3. Consistent root encoding, or a documented statement of which endpoint returns which.
4. A note in the quickstart: *"odds roots publish every 5 minutes; you cannot prove a quote at the instant it is taken."*

None of this dented the core impression: the ability to prove a **price**, not just a result, is a genuinely new primitive, and we don't think the field has noticed yet.
