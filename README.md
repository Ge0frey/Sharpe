# Sharpe

A provably fair "beat the closing line" skill game for the 2026 World Cup, built on TxLINE and Solana.

The name is a double play: a **sharp** is the pro bettor who beats the closing line, and the **Sharpe ratio** is finance's benchmark for real, risk-adjusted skill — exactly what Sharpe proves for every call, on-chain, as Closing Line Value.

Every betting product asks you to trust three numbers: the price you were given, the price the market closed at, and the result. Sharpe proves all three against Merkle roots that TxLINE publishes on Solana, then scores you on the one that actually measures skill.

There is no oracle to trust and no admin who can change an outcome. Not even us.

---

## The point, in one number

From our own devnet history, fixture `18172379`, USA v Bosnia. A bet on USA:

```
entry_prob_bps   7210    (72.10% — taken at 1.387)
close_prob_bps   7163    (71.63% — market closed at 1.396)
clv_bps           -47
outcome_win      true
```

That bet **won**. It was a **bad bet**. You paid 72.1% for something the sharpest market on earth priced at 71.6% by kickoff.

Outcomes are noise. Prices are not. That is why professional bettors score themselves on **Closing Line Value** — and why nobody could do it trustlessly until the line itself became provable.

---

## Two surfaces, one proof engine

| Surface | Markets | Proofs used | Stake |
|---|---|---|---|
| **Ranked CLV** | 1X2, Totals O/U, first-half 1X2 | `validate_fixture` + `validate_odds` ×2 + `validate_stat` | none |
| **Prop duels** | combined corners, cards, goals, per-half | `validate_fixture` + `validate_stat` | devnet USDT escrow |

Corners and cards have no consensus line, so they cannot carry CLV. That is exactly why they belong on the duel surface, which needs only a provable stat — the brief's own *"Team A Corners + Team B Corners > 10"*, settled with no admin and no oracle.

## What almost everyone will miss

`validate_fixture` reads like decorative metadata plumbing. It is the only thing that makes the other two proofs mean anything.

A Merkle proof tells you a record is *authentic*. It does not tell you **when** it was quoted or **which market** it prices. At one instant, on one fixture, the feed carries a full-match 1X2 line and a first-half 1X2 line — both real, both passing `validate_odds`, only one pricing your bet. And without a proven kickoff, nothing stops you opening a position against an authentic line drawn *after* the match started.

So Sharpe proves the fixture first, stores its kickoff in a write-once PDA, and anchors every timing rule to it:

```rust
p.ranked = now_ms()? < fixture_facts.start_time;
```

Did you commit before a kickoff *the chain itself verified*? Nothing to tune, nothing to fake, no way to earn it retroactively. Bets on finished matches settle identically — and are labelled **Backtest**, and never reach the leaderboard.

---

## Documentation

| Document | What it covers |
|---|---|
| **[docs/USER-FLOW.md](docs/USER-FLOW.md)** | **Start here.** Every step from a cold tab to a settled bet and a paid escrow, naming the file and instruction at each point. |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Technical overview, the eight settlement guards, endpoint list |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design spec and every fact confirmed against devnet |
| [docs/FEEDBACK.md](docs/FEEDBACK.md) | Our experience with the TxLINE API — what we liked, where we lost time |
| [docs/DEMO.md](docs/DEMO.md) | Demo video script |

---

## Quickstart

No `.env` file is required. Each wallet provisions TxLINE's free World Cup tier itself on `/onboard`, in one click.

```bash
# program: 22 pure tests, then deploy
anchor build && cargo test -p clv
anchor deploy --provider.cluster devnet

# devnet integration — the positive path AND every guard asserted to reject
node --experimental-strip-types scripts/settle-e2e.ts
node --experimental-strip-types scripts/duel-e2e.ts

# the keeper: watches the feed, drives predictions and duels to settlement
WATCH=1 node --experimental-strip-types scripts/keeper.ts

# the app: 16 golden-vector codec tests, then run it
cd app && npm install && npm test && npm run dev
```

## The on-chain program

13 instructions. No admin key on any money path. Exactly one verifier CPI per instruction.

```
prove_fixture     CPI validate_fixture  →  FixtureFacts PDA (write-once kickoff)
open_prediction   no CPI                →  the commitment
prove_entry       CPI validate_odds     →  entry_prob_bps
settle_close      CPI validate_odds     →  clv_bps
settle_outcome    CPI validate_stat     →  outcome_win
void_prediction   no CPI                →  rent reclaim

create_duel       no CPI                →  escrow creator's stake
join_duel         no CPI                →  escrow taker's stake
resolve_duel      CPI validate_stat     →  the proven predicate. No funds move.
claim_duel        no CPI                →  pay the winner both stakes, close the vault
cancel_duel       no CPI                →  unmatched: refund creator
refund_duel       no CPI                →  matched but never provable: refund both
```

`open_prediction` performs **no CPI**, and that is not an optimisation. Odds roots publish in 5-minute batches, so the quote you take at commitment time is not yet covered by any published root — `/api/odds/validation` returns `404` for it. A merged design could therefore only ever create backtests, the exact predictions that don't score. The commitment pins `entry_ts` and `sha256(MessageId)`; `prove_entry` lands later, permissionlessly, with no freedom over which record it proves.

## Determinism

Settlement is a pure function of (published Merkle root, terms fixed when the bet was made). `derive_terms(...)` runs once, at open, and its output is persisted; settlement replays it. The caller supplies proven stats and Merkle branches, and chooses nothing.

- `programs/clv/tests/market.rs` — 22 pure tests: `derive_terms`, `stat_keys`, `parse_line_x10`, `prob_bps`, `bind_odds`, the duel payout truth table
- `app/src/lib/codec.test.ts` — 16 golden-vector tests against frozen real `/validation` responses
- `scripts/settle-e2e.ts` — devnet lifecycle plus **seven negative guards**, each watched rejecting:

```
✓ authentic half=1 line proving a full-match bet → MarketPeriodMismatch
✓ entry line quoted after the proven kickoff     → EntryAfterKickoff
✓ right timestamp, wrong quote                   → EntryRecordMismatch
✓ home selection proven at the draw price index  → PriceNameMismatch
✓ corners market opened as a CLV prediction      → MarketHasNoOddsLine
✓ 1X2 opened with a totals line                  → LineMismatch
✓ an authentic quote from another timestamp      → TimestampMismatch
```

## Deployed addresses

| Item | Value |
|---|---|
| Sharpe program (devnet) | `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz` |
| TxLINE txoracle program (devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxLINE API host (devnet) | `https://txline-dev.txodds.com` |
| Duel stake mint (devnet USDT, classic SPL) | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` |
| Replay demo fixture — USA 2–0 Bosnia | `18172379` |

The duel stake is **never TxL**: the TxLINE credit token is locked to its program for data authorisation and may not be transferred peer-to-peer.

## Layout

```
programs/clv/src/
  market.rs                    market model, bind_odds, the line parser
  instructions/
    prove_fixture.rs           the proven kickoff every guard depends on
    open_prediction.rs         the commitment; no CPI; `ranked`
    prove_entry.rs             the deferred odds proof
    settle_close.rs            CLV
    settle_outcome.rs          the result
    duel.rs                    escrow with no admin key
  tests/market.rs              22 pure tests

app/src/
  feed/{live,replay}.ts        one FeedSource, two implementations
  lib/{auth,txline,codec,domain}.ts
  chain/{program,actions}.ts
  pages/{Onboard,Matches,MatchDetail,Duels,Portfolio,Leaderboard}.tsx
  components/VerifyModal.tsx   four live .view() calls into TxLINE

scripts/
  keeper.ts                    watches the feed, settles everything
  settle-e2e.ts                positive path + every guard rejecting
  duel-e2e.ts                  create → join → resolve → claim, real USDT
  open-ranked.ts               open a ranked prediction before a real kickoff
  faucet.ts                    devnet USDT from TxLINE's own faucet
```

---

Built for the TxLINE World Cup track. Deployed on Solana devnet, powered entirely by the free World Cup data tier.
