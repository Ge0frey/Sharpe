# Sharpe

Prove you can beat a betting market. Or find out that you can't. Built on TxLINE and Solana, for the 2026 World Cup.

**Live:** https://sharpe-dusky.vercel.app (Solana devnet)

Betting products ask you to trust three numbers: the price you were given, the price the market closed at, and the result. Sharpe proves all three against Merkle roots that TxLINE publishes on Solana, then scores you on the one that measures skill.

There is no oracle to trust and no admin who can change an outcome.

## The point, in one number

From our devnet history, fixture `18172379`, USA v Bosnia. A bet on USA:

```
entry_prob_bps   7210    (72.10%, taken at 1.387)
close_prob_bps   7163    (71.63%, market closed at 1.396)
clv_bps           -47
outcome_win      true
```

That bet won. It was still a bad bet. You paid 72.1% for something the market priced at 71.6% by kickoff.

Outcomes are noisy. Prices are not. Professional bettors score themselves on Closing Line Value for exactly this reason, and nobody could do it without trusting someone until the line itself became provable.

## Two surfaces, one proof engine

| Surface | Markets | Proofs used | Stake |
|---|---|---|---|
| Ranked CLV | 1X2, Totals O/U, first-half 1X2 | `validate_fixture` + `validate_odds` x2 + `validate_stat` | none |
| Prop duels | combined corners, cards, goals, per-half | `validate_fixture` + `validate_stat` | devnet USDT escrow |

Corners and cards have no consensus line, so they carry no CLV. That is why they sit on the duel surface, which needs only a provable stat. This is the brief's own "Team A Corners + Team B Corners > 10", settled with no admin and no oracle.

## Why `validate_fixture` matters

It looks like metadata plumbing. It is the only thing that makes the other two proofs mean anything.

A Merkle proof tells you a record is authentic. It does not tell you *when* it was quoted or *which market* it prices. At one instant on one fixture, the feed carries both a full-match 1X2 line and a first-half 1X2 line. Both are real, both pass `validate_odds`, and only one prices your bet. Without a proven kickoff, nothing stops you opening a position against an authentic line drawn after the match started.

So Sharpe proves the fixture first, stores its kickoff in a write-once account, and anchors every timing rule to it:

```rust
p.ranked = now_ms()? < fixture_facts.start_time;
```

Did you commit before a kickoff the chain itself verified? Nothing to tune, nothing to fake, no way to earn it afterwards. Bets on finished matches settle identically, are labelled **Backtest**, and never reach the leaderboard.

## Quickstart

No `.env` file is needed. Each wallet provisions TxLINE's free World Cup tier itself at `/onboard`, in one click.

```bash
# program: 22 tests, then deploy
anchor build && cargo test -p clv
anchor deploy --provider.cluster devnet

# app: 38 tests, then run it
cd app && npm install && npm test && npm run dev
```

Settlement needs no background process. `prove_entry`, `settle_close`, `settle_outcome`, `resolve_duel` and `claim_duel` are permissionless, and the app exposes each as a button in `/portfolio` and `/duels`.

## The on-chain program

13 instructions. No admin key on any money path. At most one verifier CPI per instruction.

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

`open_prediction` performs no CPI, and that is not an optimisation. Odds roots publish in 5-minute batches, so the quote you take at commitment time is not yet covered by any published root, and `/api/odds/validation` returns `404` for it. A merged design could only ever create backtests, which are exactly the predictions that don't score. The commitment pins `entry_ts` and `sha256(MessageId)`. `prove_entry` lands later, permissionlessly, with no freedom over which record it proves.

## Determinism

Settlement is a pure function of the published Merkle root and the terms fixed when the bet was made. `derive_terms(...)` runs once, at open, and its output is stored. Settlement replays it. The caller supplies proven stats and Merkle branches, and chooses nothing.

- `programs/clv/tests/market.rs`, 22 tests over `derive_terms`, `stat_keys`, `parse_line_x10`, `prob_bps`, `bind_odds`, and the duel payout truth table
- `app/src/lib/codec.test.ts`, 16 golden-vector tests against frozen real `/validation` responses
- `app/src/lib/domain.test.ts`, 22 tests over market derivation and odds selection

The settlement guards are declared in `programs/clv/src/error.rs` and enforced in `programs/clv/src/market.rs` and `programs/clv/src/instructions/`:

```
authentic half=1 line proving a full-match bet -> MarketPeriodMismatch
a totals quote settling a 1X2 bet              -> MarketTypeMismatch
entry line quoted after the proven kickoff     -> EntryAfterKickoff
an in-play quote posing as a closing line      -> LineIsInPlay
right timestamp, wrong quote                   -> EntryRecordMismatch
home selection proven at the draw price index  -> PriceNameMismatch
corners market opened as a CLV prediction      -> MarketHasNoOddsLine
1X2 opened with a totals line                  -> LineMismatch
a quarter line, which has no yes/no answer     -> UnsupportedLine
an authentic quote from another timestamp      -> TimestampMismatch
```

## Deployed addresses

| Item | Value |
|---|---|
| Sharpe program (devnet) | `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz` |
| TxLINE txoracle program (devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxLINE API host (devnet) | `https://txline-dev.txodds.com` |
| Duel stake mint (devnet USDT, classic SPL) | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` |
| Replay demo fixture, USA 2-0 Bosnia | `18172379` |

The duel stake is never TxL. The TxLINE credit token is locked to its program for data access and cannot be transferred between users.

## Documentation

- [/docs in the app](https://sharpe-dusky.vercel.app/docs). The full documentation, rendered inside the product: concepts, guides, the instruction surface, and every guard by name.
- [docs/USER-FLOW.md](docs/USER-FLOW.md). Start here. Every step from a cold browser tab to a settled bet and a paid escrow, naming the file and instruction at each point.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). What was built, and every fact confirmed against devnet.

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
  tests/market.rs              22 tests

app/src/
  feed/{live,replay}.ts        one FeedSource, two implementations
  lib/{auth,txline,codec,domain}.ts
  chain/{program,actions}.ts
  pages/{Onboard,Matches,MatchDetail,Duels,Portfolio,Leaderboard}.tsx
  components/VerifyModal.tsx   four live .view() calls into TxLINE
```

Built for the TxLINE World Cup track. Deployed on Solana devnet, powered entirely by the free World Cup data tier.
