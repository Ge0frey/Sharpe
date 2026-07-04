# CLOSING LINE

A provably fair "beat the market" skill game for the 2026 World Cup, built on TxLINE and Solana.

You make a call on a World Cup match before it settles. Your skill is measured as Closing Line Value (CLV): how far the consensus betting line moved in your favor between the moment you locked it and the moment it closed. Every input to that score, the entry line, the closing line, and the final result, is a cryptographic Merkle proof verified on Solana through TxLINE. There is no oracle to trust and no admin who can change an outcome.

Built for the TxLINE World Cup track. The program is deployed on Solana devnet and the entire application is powered by the free World Cup data tier.

---

## Table of contents

1. [The idea in one minute](#the-idea-in-one-minute)
2. [Why Closing Line Value](#why-closing-line-value)
3. [The core concept, explained](#the-core-concept-explained)
4. [End to end user flow](#end-to-end-user-flow)
5. [Feature breakdown](#feature-breakdown)
6. [How it works under the hood](#how-it-works-under-the-hood)
7. [The on-chain program](#the-on-chain-program)
8. [The prediction lifecycle](#the-prediction-lifecycle)
9. [Markets and the outcome predicate](#markets-and-the-outcome-predicate)
10. [The math: implied probability and CLV](#the-math-implied-probability-and-clv)
11. [The proof pipeline](#the-proof-pipeline)
12. [Trust model](#trust-model)
13. [TxLINE endpoints used](#txline-endpoints-used)
14. [Deployed addresses and demo data](#deployed-addresses-and-demo-data)
15. [Repository layout](#repository-layout)
16. [Running it locally](#running-it-locally)
17. [Proof of correctness](#proof-of-correctness)
18. [Feedback on the TxLINE API](#feedback-on-the-txline-api)
19. [Known limitations and next steps](#known-limitations-and-next-steps)

---

## The idea in one minute

Sharp bettors do not measure themselves by whether a single bet won. They measure themselves by Closing Line Value: did they get a better price than the market's final, most efficient price. If you consistently beat the closing line, you have an edge, even on bets that lose.

The problem, until now, is that "the line" was never provable. You had to trust a screenshot or a book's word for what the price was.

TxLINE changes that. It publishes consensus odds and match scores to Solana and lets anyone reconstruct a Merkle proof that a specific odds record or score statistic was part of the committed data set. CLOSING LINE turns that into a game: lock a market at the opening line, and the platform proves, on-chain, what the opening line was, what the closing line was, and how the match actually ended. Your CLV becomes a trustless, on-chain number, and a leaderboard ranks players by it.

## Why Closing Line Value

Most sports applications in this space resolve simple win or lose bets by proving the score. That is valuable, but it only uses one of TxLINE's verifiers, `validate_stat`.

CLOSING LINE is built on the primitive almost nobody uses: `validate_odds`. This verifier proves what the consensus line was at a given timestamp. Proving the odds, not just the result, is what makes CLV possible and trustless. It is the difference between "we resolved a bet" and "we can prove the market itself, then prove you beat it."

Because the game scores skill through CLV rather than a wager, it needs no staking pools, which keeps it fully aligned with the track rule that the internal TxL token is never used for peer to peer transfers. Predictions live entirely on our own Solana program.

## The core concept, explained

A few terms, defined once:

- Consensus line. TxLINE's StablePrice engine blends odds from many global books into a single de-margined price for each market. For a 1X2 (match result) market it gives three prices: Home, Draw, Away.
- Decimal odds. Prices are integers scaled by 1000. A stored price of 1889 means decimal odds of 1.889.
- Implied probability. The market's estimate of an outcome's likelihood, derived from the price. 1.889 decimal implies about 52.9 percent. We store this in basis points (bps), where 10000 bps is 100 percent.
- Entry line. The price at the moment you lock your call. We use the earliest available pre-match line so there is room for the market to move.
- Closing line. The last pre-kickoff price, the market's final and most efficient estimate.
- Closing Line Value (CLV). Closing implied probability minus entry implied probability, for the side you picked. Positive CLV means the market moved toward your side after you committed, which means you were early and sharp.
- Merkle proof. A short list of sibling hashes that, combined with your record, reconstructs a root that TxLINE already committed to Solana. If it reconstructs, the record is authentic.

Putting it together: you lock Home at the opening line. The app proves that opening price on-chain and records your entry implied probability. When the match is done, the app proves the closing price and the final score. CLV is computed on-chain from two proven numbers, and the result is decided by a proven predicate. Nothing in that chain requires trusting the platform.

## End to end user flow

This is the full journey a player takes, screen by screen.

1. Arrive at the Matches board. A short hero explains the game. Below it, a "Provable now" row features the finished World Cup matches that have complete devnet data (scores and odds), followed by upcoming and other fixtures pulled live from TxLINE.

2. Connect a wallet. Click "Select Wallet" in the top right and connect a devnet wallet (Phantom or Solflare). The wallet needs a small amount of devnet SOL to pay rent for the prediction account and transaction fees. No TxLINE subscription is required of the player, because the data reads use a shared free-tier token and the on-chain verifiers are permissionless.

3. Open a match. Click a fixture to reach the Match detail page. Here you see three things: a chart of the consensus implied probability for Home, Draw, and Away across the pre-match window; the final score, labeled as proven via `validate_stat`; and the ticket on the right showing the opening line as decimal odds and implied percentage for each of the three outcomes.

4. Lock the opening line. In the ticket, pick Home, Draw, or Away, then press the lock button. The app fetches the Merkle proof for the opening odds record from TxLINE, then submits `open_prediction` to our program, which CPIs into `validate_odds` to prove that record is authentic before storing your entry implied probability. Your wallet signs one transaction. A confirmation shows the entry line is proven on-chain and links you to your portfolio.

5. Review the portfolio. The Portfolio page lists your calls. Each row shows the match, your pick, your entry probability, and a status of "entry proven". Close and result columns are still empty because the match has not been settled yet.

6. Settle the closing line. Press "Settle closing line" on a row. The app fetches the last pre-kickoff line and its proof, submits `settle_close`, which CPIs `validate_odds` again, and the program records the closing probability and computes CLV as closing minus entry. The row now shows a Close percentage and a signed CLV value in green or red.

7. Settle the result. Press "Settle result". The app fetches the final stat validation for the match and submits `settle_outcome`, which CPIs `validate_stat` using the predicate stored when you opened the call. The program writes whether your pick won. The row shows a WON or lost badge.

8. Open the verifiable receipt. Press "Verify" on any closed or settled call. A modal re-proves all three facts live and independently: the entry line, the closing line, and the match result. Each row runs a read-only `validate_odds` or `validate_stat` call and shows "Proven on Solana" when it returns true, alongside the implied probability or score and a truncated on-chain root. The footer restates the CLV and the win or loss.

9. Climb the leaderboard. The Leaderboard page aggregates every prediction on the program by wallet and ranks players by cumulative CLV, with call counts and hit rate. Because each contributing number is Merkle-proven, the ranking is trustless.

## Feature breakdown

Every user-facing part of the application, described.

### Navigation and wallet

A persistent top bar carries the CLOSING LINE wordmark and links to Matches, Portfolio, and Leaderboard, plus the wallet connect button on the right. The wallet button is provided by the Solana wallet-adapter and is themed to match the app. Connection state is shared across the app through a single provider, so any page can read the connected wallet and build transactions.

### Matches board

Fetches the live fixtures snapshot from TxLINE and organizes it into three sections. "Provable now" surfaces the two finished World Cup matches that have full devnet coverage, each tagged "data live". "Upcoming" and "Other finished" list the rest, sorted by kickoff time. Because the fixtures snapshot is a rolling window that drops matches a few hours after they finish, the two demo fixtures are also carried as hardcoded metadata so they always appear and remain openable even after they age out of the feed. Each card shows the competition, the two teams, and the local kickoff time.

### Match detail

The analytical heart of the app for a single fixture. It renders:

- Consensus implied probability chart. A line chart of the pre-match trajectory for Home, Draw, and Away, built by sampling the TxLINE odds snapshot at ten-minute intervals across the three hours before kickoff and converting each price to an implied percentage. This is the line you are proving against, drawn in the brand colors.
- Final score. When available, the final goals are shown large and labeled as proven via `validate_stat`, reinforcing that the number is not just displayed but verifiable.
- The ticket. Described next.
- A short explainer of how CLV works, so a first-time visitor understands what they are about to do.

### The prediction ticket

The action surface. It loads the opening line for the fixture and presents Home, Draw, and Away as selectable cards, each showing the decimal odds and the implied percentage for that outcome. You pick one, and if your wallet is connected, you lock it. The button label reflects your pick, for example "Lock Home win and prove entry". While the transaction runs it shows progress, and on success it swaps to a confirmation that the entry line is proven on-chain. If no wallet is connected, it invites you to connect one. Any error from the chain or the API is surfaced inline rather than swallowed.

### Portfolio

Your calls, newest first. If a wallet is connected it shows only that wallet's predictions; otherwise it shows all predictions read from the program. Each row is a compact dashboard: match, pick, entry probability, close probability, CLV, and result, followed by context-sensitive action buttons. A call that is only entry-proven offers "Settle closing line". A closed call offers "Settle result" and "Verify". A settled call shows the outcome badge and "Verify". Settlement actions fetch the required proof, submit the corresponding instruction, and refresh the list. Errors are shown inline.

### Verifiable receipt (Verify modal)

The centerpiece and the reason the whole thing is trustworthy. Given a prediction, it independently re-derives and re-proves three facts by calling the TxLINE verifiers in read-only mode:

- Entry line: fetch the odds record as of the stored entry timestamp, request its Merkle proof, and run `validate_odds`.
- Closing line: the same, as of the stored close timestamp.
- Match result: fetch the final stat validation and run `validate_stat` with the market's predicate.

Each row shows a spinner while proving, then a "Proven on Solana" badge when the verifier returns true, along with the implied probability or the score and a truncated on-chain root. This is not reading back what the app stored; it is re-executing the proofs against the chain in front of the user. The footer restates the CLV and the win or loss.

### Leaderboard

Reads every Prediction account on the program and groups them by predictor wallet. For each wallet it sums CLV over closed and settled calls, counts total calls, and computes hit rate over settled calls. It ranks by cumulative CLV, the professional measure of edge. Since every contributing value was Merkle-proven at settlement, the table is a trustless ranking of skill.

## How it works under the hood

The system is a thin, one-directional pipeline: TxLINE data flows into pure domain functions, which feed the Anchor chain layer, which drives the UI. Everything provable is proven, and the "Proven on Solana" badge is the product.

```
  React + Vite + Tailwind  (app/)

  data (TxLINE)   ->   domain (CLV / market / resolver)   ->   chain (Anchor)   ->   UI (Verify modal)
       |                                                              |  CPI via invoke + get_return_data
       v                                                              v
  /fixtures  /odds  /scores                              clv program (734ZW...)   ->   txoracle (6pW6...)
  /odds/validation  /scores/stat-validation              Config + Prediction PDAs      validate_odds
                                                                                        validate_stat
```

Three layers off-chain:

- Data layer. Typed TxLINE clients for authentication, REST snapshots, the two validation endpoints, and fetch-based Server-Sent Events. It attaches the guest JWT and the API token on every request. Server-Sent Events use fetch rather than the browser EventSource so that authentication headers can be set.
- Domain layer. Pure, deterministic functions with no I/O beyond the client: implied probability and CLV math, the market model, the mapping from market and selection to the on-chain predicate, the resolver that finds the final score and picks the entry and closing odds records, and the trajectory builder for the chart.
- Chain layer. Anchor providers and program handles for both our program and txoracle, all the program-derived address derivations, the transaction builders for opening and settling, and the read-only verification helpers used by the receipt.

## The on-chain program

Written in Anchor 1.0.2 and deployed to devnet. It is a custom settlement engine, not just a client of TxLINE.

Accounts:

- Config, a singleton at seed "config", holding the admin, the txoracle program id, and a global prediction counter.
- Prediction, at seeds "prediction", predictor, and the u64 id. It stores who made the call and for which fixture, the market and selection, the settlement terms derived at open time (the two stat keys, the add-or-subtract operator, the comparison, and the threshold), the entry timestamp and entry implied probability, the close timestamp and close implied probability, the resulting CLV in bps, the win flag, the status, and timestamps.

Instructions:

- `initialize_config` sets up the singleton once.
- `open_prediction` creates the Prediction account, derives and stores the deterministic settlement terms from the chosen market, then CPIs `validate_odds` to prove the entry record before recording the entry implied probability. It binds the supplied odds record to the prediction by asserting the fixture id and timestamp match, so a caller cannot prove a different record.
- `settle_close` CPIs `validate_odds` on the closing record and writes the close probability and CLV.
- `settle_outcome` CPIs `validate_stat` using the stored predicate and stat keys, then writes the win flag and marks the call settled. It checks that the supplied stats carry the exact keys stored at open, so the caller cannot substitute a different statistic.
- `void_prediction` lets the owner reclaim rent on an unsettled call.

The verifier calls are a manual Cross Program Invocation in `src/cpi.rs`: it hand-builds the instruction with the correct discriminator and Borsh-serialized arguments, invokes txoracle, and reads the returned boolean with `get_return_data`. If a proof is invalid, txoracle errors and that error propagates, so an invalid proof can never be recorded as a success. The argument types come from `declare_program!` over a vendored txoracle IDL.

Settlement is a pure function of on-chain roots and the terms stored at open. There is no branch on wall-clock time or off-chain state and no privileged settler, which makes resolution deterministic and auditable.

## The prediction lifecycle

A prediction moves through a small state machine:

- Open, the initial state before any proof. In practice the app proves the entry line in the same transaction that opens the call, so a fresh prediction is already EntryProven.
- EntryProven, after the entry line is proven and the entry implied probability is stored.
- Closed, after the closing line is proven and CLV is computed.
- Settled, after the result is proven and the win flag is written. This is terminal.
- Void, if the owner reclaims rent before settlement.

Each transition is gated by a verifier CPI, so the state can only advance on real proofs. The three heavy steps (prove entry, prove close, prove outcome) are separate instructions and separate transactions. That split is required by transaction size, since each carries a full record plus its Merkle branch, and it keeps every transaction comfortably under the compute budget.

## Markets and the outcome predicate

The MVP covers the full-match 1X2 market: Home win, Draw, Away win. Each maps deterministically to a two-stat predicate over goals, where stat key 1 is participant one total goals and key 2 is participant two total goals:

- Home win: (P1 - P2) greater than 0
- Draw: (P1 - P2) equal to 0
- Away win: (P1 - P2) less than 0

The market and selection are chosen in the UI, converted to these terms at open time, and stored on the Prediction account. Settlement re-uses the stored terms verbatim, which is what makes the outcome deterministic. The design generalizes cleanly to totals (over or under using the add operator), corners, cards, and per-half markets by changing the stat keys and threshold, because TxLINE encodes every statistic with a fixed key and period multiplier.

## The math: implied probability and CLV

Prices are decimal odds scaled by 1000. Implied probability in basis points is computed on-chain as 10,000,000 divided by the price. For example a price of 1889 gives 5294 bps, or 52.94 percent. This raw one-over-odds figure is used consistently for both the entry and the closing line, so the vig cancels in the difference.

CLV in basis points is the closing probability minus the entry probability for the side you picked. A positive CLV means the market moved toward your outcome after you committed. A concrete devnet example from the end-to-end test on USA versus Bosnia: entry Home at 1.398 gives 72.09 percent, the closing Home line at about 1.396 gives 71.63 percent, so CLV is minus 46 bps, and the match finished 2 to 0 so the Home pick won. You can win the bet and still have slightly negative CLV, which is exactly why CLV, not just win or lose, is the better measure of skill.

## The proof pipeline

The single most important implementation rule is that a record proves only if it is passed to the verifier exactly as TxLINE returns it from the validation endpoint. The codec layer centralizes this. It converts base64 roots and hashes to 32-byte arrays, maps the odds JSON from PascalCase to the program's camelCase and represents absent optional fields as null, renames the scores summary field `eventStatsSubTreeRoot` to the program's `eventsSubTreeRoot`, and assembles the stat terms and proof node lists. Any reformatting of a string field would change a leaf hash and break the proof, so the record to prove always comes straight from `/odds/validation` or `/scores/stat-validation`.

The daily root accounts are program-derived addresses on txoracle. Odds roots use the seed `daily_batch_roots` and scores roots use `daily_scores_roots`, each combined with the epoch day, which is the millisecond timestamp divided by the number of milliseconds in a day, encoded as a little-endian u16. The odds path seeds the epoch day from the odds record timestamp, and the scores path seeds it from the batch summary minimum timestamp.

## Trust model

- Verification is permissionless. Anyone can reconstruct any proof and call the verifiers. The Verify receipt does exactly this, live, with no privileged access.
- Settlement is deterministic and adminless. The program stores the predicate at open time and re-uses it at settle time. There is no settler who can decide a winner, and there is no path that records an outcome without a valid proof, because an invalid proof makes the txoracle CPI error.
- Data reads are gated by a free-tier token, but the on-chain proofs are not gated by anything. The token only fetches the records and their Merkle branches; the truth of those records is decided entirely on-chain.
- No value is transferred between users. Predictions are skill calls scored by CLV. The internal TxL token is never moved, consistent with the track rules.

## TxLINE endpoints used

| Endpoint | Purpose in the app |
|---|---|
| `POST /auth/guest/start` | Obtain the guest JWT used on every data request |
| on-chain `subscribe(1, 4)` then `POST /api/token/activate` | Activate the free World Cup tier and receive the API token |
| `GET /api/fixtures/snapshot` | Populate the Matches board and resolve fixture metadata |
| `GET /api/odds/snapshot/{id}?asOf=` | Fetch historical consensus 1X2 lines for the entry, the close, and the pre-match trajectory chart |
| `GET /api/scores/snapshot/{id}` | Find the final event sequence and the score |
| `GET /api/odds/validation?messageId&ts` | Merkle proof for an odds record, fed into `validate_odds` |
| `GET /api/scores/stat-validation?fixtureId&seq&statKey&statKey2` | Merkle proof for one or two score statistics, fed into `validate_stat` |

On-chain, the app and the program call the txoracle verifiers `validate_odds` and `validate_stat`, both by Cross Program Invocation for settlement and by read-only view for the Verify receipt.

## Deployed addresses and demo data

| Item | Value |
|---|---|
| CLOSING LINE program (devnet) | `734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz` |
| TxLINE txoracle program (devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxLINE API host (devnet) | `https://txline-dev.txodds.com` |
| Demo fixture, USA 2 to 0 Bosnia and Herzegovina | `18172379` |
| Demo fixture, Spain versus Austria | `18179551` |

## Repository layout

```
clv/
  programs/clv/                 Anchor program
    src/lib.rs                  program entry and instruction wiring
    src/state.rs                Config and Prediction accounts, events, enums
    src/instructions/           open_prediction, settle_close, settle_outcome, initialize_config, void_prediction
    src/cpi.rs                  manual CPI into txoracle validate_odds and validate_stat
    src/market.rs               market to predicate mapping and probability math
    idls/txoracle.json          vendored txoracle IDL for declare_program!
  app/                          React + Vite + Tailwind frontend
    src/config.ts               environment, demo fixture metadata
    src/lib/txline.ts           auth, REST, validation, SSE clients
    src/lib/codec.ts            verbatim proof and record mappers
    src/lib/domain.ts           markets, implied probability, CLV, resolver, trajectory
    src/chain/program.ts        providers, program handles, PDA derivations
    src/chain/actions.ts        open and settle builders, read-only verify helpers
    src/state/                  wallet, query, and program providers
    src/pages/                  Matches, MatchDetail, Portfolio, Leaderboard
    src/components/             Nav, Ticket, OddsChart, VerifyModal, ui primitives
    src/chain/idl/              clv and txoracle IDLs for the browser
  scripts/
    proof-spike.ts              proves validate_odds and validate_stat on devnet
    settle-e2e.ts               drives the full program lifecycle on devnet
  ARCHITECTURE.md               detailed design and confirmed devnet facts
  README.md                     this document
```

## Running it locally

The frontend needs a devnet wallet and a free-tier data token in `app/.env.local`.

```bash
cd app && npm install && npm run dev
```

The dev server prints a local URL. The `app/.env.local` file is git-ignored and holds the shared free-tier `VITE_TXLINE_JWT` and `VITE_TXLINE_API_TOKEN`, plus `VITE_RPC_URL`, `VITE_CLV_PROGRAM`, and `VITE_TXORACLE_PROGRAM`. The token can be regenerated at any time with the onboarding flow used by the scripts.

Build and deploy the program:

```bash
anchor build && anchor deploy --provider.cluster devnet
```

## Proof of correctness

Two scripts demonstrate the system against real devnet roots.

```bash
cd scripts && npm install
node --experimental-strip-types proof-spike.ts    # validate_odds and validate_stat both return true
node --experimental-strip-types settle-e2e.ts     # full clv lifecycle, prints the on-chain CLV
```

The end-to-end script output from a real devnet run:

```
open_prediction   entry 72.09 percent    settle_close   close 71.63 percent   CLV -46 bps
settle_outcome    USA 2 to 0 proven      outcome_win = true                   status = settled
```

## Feedback on the TxLINE API

What we liked most. The dual-proof design is the standout feature. Being able to prove odds as well as scores is genuinely novel and is what made this product possible. `validate_odds` is an underused superpower. The free World Cup tier onboarding, guest JWT then on-chain subscribe then activate, worked on the first attempt on devnet and is fully permissionless. The verifiers are cheap in compute, roughly 150k units for `validate_stat` and 264k for `validate_odds`, so they fit easily inside a Cross Program Invocation. CORS is fully open, so the browser can read the feed directly without a proxy. And because the settlement and verification primitives already live on-chain, we could build a genuinely trustless engine in days rather than weeks.

Where we hit friction.

- Records must be proven verbatim. Proofs only reconstruct when the record is passed exactly as the validation endpoint returns it, including casing, optional fields, the `eventStatsSubTreeRoot` to `eventsSubTreeRoot` rename, and base64 to 32-byte conversion. A single worked TypeScript example that goes straight from `/odds/validation` into a `validate_odds` Cross Program Invocation would have saved hours.
- PDA seed naming. Odds roots live under the `daily_batch_roots` seed even though the instruction account is named `daily_odds_merkle_roots`, which is easy to miss and worth documenting.
- Timestamp basis. Which timestamp seeds the daily-root PDA, the record `Ts` versus the batch summary minimum timestamp, took some trial and error and would benefit from a note per verifier.
- Coverage discovery. The fixtures snapshot is a rolling window, so finished matches age out even though their scores, odds, and proofs remain queryable. A hint for which fixtures currently have posted roots would smooth demos.
- The program has no published on-chain IDL, so we vendored it, and the odds validation `Odds` object omits the `Pct` field, so implied probability has to be computed on-chain from `Prices`.

## Known limitations and next steps

- The browser wallet-signed open and settle path is built on the same code that the devnet end-to-end script proves, but it should be clicked through once with a real wallet to confirm signing in the browser.
- The MVP ships the 1X2 market. Totals, corners, cards, and per-half markets are straightforward extensions of the same predicate machinery.
- A live-versus-replay toggle and an accelerated replayer would let the pre-match trajectory animate during a demo even though the matches themselves have finished.
- The frontend is ready to host on any static platform; production deployment needs the environment variables set on the host.

Every entry line, closing line, and result on this platform is a Merkle proof verified on Solana through TxLINE. There is no oracle to trust.
