/* eslint-disable react-refresh/only-export-components -- content registry: these files export page data, and their body components are only reachable through it */
import { Callout, Code, CodeBlock, DocLink, DocTable, H2, LI, Lead, P, Steps, UL } from '../prose'
import type { DocPage } from '../registry'

function MatchesAndFeed() {
  return (
    <>
      <Lead>
        The matches surface is driven by one <Code>FeedSource</Code> interface with two implementations —{' '}
        <strong>LIVE</strong> ingests TxLINE's real-time streams, <strong>REPLAY</strong> re-emits a finished
        fixture's archived records on an accelerated clock. The toggle lives in the nav.
      </Lead>

      <H2 id="live">LIVE: the SSE stream</H2>
      <P><Code>LiveFeed</Code> opens TxLINE's Server-Sent Events streams filtered by <Code>fixtureId</Code>. Details that matter:</P>
      <UL>
        <LI>
          <strong>Resume:</strong> after a drop it reconnects with <Code>Last-Event-ID</Code> (format{' '}
          <Code>"&lt;epochMs&gt;:&lt;index&gt;"</Code>) and backs off exponentially.
        </LI>
        <LI>
          <strong>Dedupe:</strong> a resume replays the boundary event, so records are deduped by{' '}
          <Code>MessageId</Code> for odds and <Code>Seq</Code> for scores.
        </LI>
        <LI>
          <strong>Heartbeats</strong> arrive roughly every 20 seconds. A 15-second probe sees none and looks like a
          dead stream — it is not one.
        </LI>
      </UL>

      <H2 id="replay">REPLAY: a finished match, streaming again</H2>
      <P>
        The tournament finishes before judging does, so <Code>ReplayFeed</Code> loads a finished fixture's archived
        odds ladder from <Code>/api/odds/updates/{'{epochDay}/{hour}/{interval}'}</Code>, plus the scores ladder, and
        re-emits both on an accelerated clock — selectable at 1×, 10×, 30× or 60×.
      </P>
      <P>
        On fixture <Code>18172379</Code> that is about 1,950 records across five 5-minute buckets, thickening from 30
        records at 120 minutes before kickoff to 852 in the final five minutes.
      </P>
      <Callout tone="proof" title="Replay is not a mock">
        Every record it emits is a real TxLINE record, and every one still proves against the on-chain roots. Replay
        changes <em>when</em> records arrive, never <em>what they say</em>.
      </Callout>

      <H2 id="match-detail">The match detail page</H2>
      <P>
        <Code>/match/:id</Code> shows the odds trajectory, the ticket for committing a call, and an ingest strip so
        you can watch the feed flow: records counted, implied probabilities updating, and a <strong>full
        time</strong> marker once a scores update carries <Code>Action: "game_finalised"</Code>.
      </P>
      <Callout tone="warn" title="Finality is game_finalised, not gameState">
        The documented <Code>gameState: 5</Code> never appears on this feed — <Code>GameState</Code> reads{' '}
        <Code>"scheduled"</Code> even a week after a match ends. Full time is signalled by{' '}
        <Code>Action: "game_finalised"</Code> on a scores update. Every settlement trigger depends on this.
      </Callout>

      <H2 id="fixture-discovery">Where fixtures come from</H2>
      <UL>
        <LI>
          <Code>/api/fixtures/snapshot</Code> is <strong>forward-looking</strong> — it drops fixtures once they
          finish. Finished fixtures resolve through <Code>/api/fixtures/validation?fixtureId=</Code>, which returns
          metadata <em>and</em> proves it.
        </LI>
        <LI>
          <Code>/api/odds/snapshot/{'{id}'}</Code> is <strong>live only</strong> and returns empty after a match. Use{' '}
          <Code>?asOf=&lt;pre-kickoff ms&gt;</Code> for history.
        </LI>
        <LI>
          Devnet carries complete data for two finished World Cup matches: <Code>18172379</Code> (USA 2-0 Bosnia) and{' '}
          <Code>18179551</Code> (Spain v Austria). These are the replay demo fixtures.
        </LI>
      </UL>
    </>
  )
}

function Predictions() {
  return (
    <>
      <Lead>
        A prediction moves through four proven steps: <strong>commit</strong> before kickoff, <strong>prove the
        entry line</strong> once its Merkle root publishes, <strong>settle the closing line</strong> after kickoff, and{' '}
        <strong>settle the outcome</strong> at full time. Each step writes exactly one value that a Merkle proof
        forces.
      </Lead>

      <CodeBlock
        title="the lifecycle"
        code={`Open --prove_entry--> EntryProven --settle_close--> Closed --settle_outcome--> Settled
  +------------------------ void_prediction -------------------------> Void`}
      />

      <H2 id="commit">1 — The commitment (open_prediction)</H2>
      <P>
        You open <Code>/match/:id</Code>, look at the odds trajectory, and pick a side. <Code>open_prediction</Code>{' '}
        performs <strong>no CPI at all</strong>. It takes the quote's timestamp and a hash of its identity, and does
        three things:
      </P>
      <Steps
        items={[
          {
            title: 'Refuses a line quoted after the whistle',
            body: (
              <P>
                <Code>require!(entry_ts &lt; start_time, EntryAfterKickoff)</Code> — where <Code>start_time</Code>{' '}
                comes from the write-once <DocLink to="/docs/proven-kickoff">FixtureFacts</DocLink> account. It is
                Merkle-proven, not supplied by you.
              </P>
            ),
          },
          {
            title: 'Decides, permanently, whether the call can score',
            body: (
              <P>
                <Code>p.ranked = now_ms() &lt; fixture_facts.start_time</Code>. A call on a finished match settles
                identically, is labelled <strong>Backtest</strong>, and never reaches the leaderboard.
              </P>
            ),
          },
          {
            title: 'Fixes the settlement question, once',
            body: (
              <P>
                <Code>derive_terms(...)</Code> runs here and its output — stat keys, operator, comparison, threshold —
                is stored on the account. Settlement never re-derives anything; it replays the stored terms. See{' '}
                <DocLink to="/docs/markets">Markets &amp; stat keys</DocLink>.
              </P>
            ),
          },
        ]}
      />
      <P>
        The commitment pins <Code>entry_ts</Code> and <Code>entry_msg_hash</Code> — sha256 of the quote's{' '}
        <Code>MessageId</Code>. The prediction is now <Code>Open</Code>, and the UI says{' '}
        <strong>"Call committed on-chain"</strong>, not "proven". That distinction is the next section.
      </P>

      <H2 id="prove-entry">2 — Proving the entry line (prove_entry)</H2>
      <P>
        This is the design decision that shaped the whole program. Odds Merkle roots publish in{' '}
        <strong>5-minute batches</strong>, so the quote you just took is not covered by any published root yet — ask{' '}
        <Code>/api/odds/validation</Code> for it and you get <Code>HTTP 404</Code>. Observed live on a France v
        Morocco entry: 404 on the first attempt, success about 60 seconds later.
      </P>
      <P>
        An <Code>open_prediction</Code> that verified the entry line inside itself could therefore only ever succeed
        on historical data — it could never open a prediction on a match that had not started, which is the only kind
        that counts. A merged design silently permits nothing but backtests. It also blew the transaction size limit:
        the odds record plus both proof vectors plus seven accounts came to ~1,660 encoded bytes against a 1,644 cap.
      </P>
      <P>
        Hence a separate, <strong>permissionless</strong> instruction with no freedom about what it writes:
      </P>
      <CodeBlock
        title="programs/clv/src/instructions/prove_entry.rs"
        code={`require!(odds.ts == entry_ts, ClvError::TimestampMismatch);
require!(hash(odds.message_id.as_bytes()).to_bytes() == entry_msg_hash,
         ClvError::EntryRecordMismatch);`}
      />
      <P>
        Only the exact quote you took satisfies both. Then <Code>bind_odds</Code> insists the quote prices the market
        you actually bet — see <DocLink to="/docs/errors">Errors &amp; guards</DocLink> — and only then does the CPI
        fire. On <Code>true</Code>, the program stores <Code>entry_prob_bps</Code> and the status becomes{' '}
        <Code>EntryProven</Code>.
      </P>

      <H2 id="settle-close">3 — The closing line (settle_close)</H2>
      <P>
        After kickoff, the closing line is fixed forever: the last quote before the whistle. "Closing" is enforced,
        not assumed:
      </P>
      <CodeBlock
        title="programs/clv/src/instructions/settle_close.rs"
        code={`require!(close_ts <= start_time, ClvError::CloseAfterKickoff);
require!(!odds.in_running,       ClvError::LineIsInPlay);

let close_prob_bps = prob_bps(price)?;
p.clv_bps = close_prob_bps as i32 - entry_prob_bps as i32;
p.status = PredStatus::Closed;`}
      />
      <P>
        An in-play quote has already absorbed part of the result, so scoring an entry against it would measure
        nothing. <Code>bind_odds</Code> runs again with the same market, period and line stored at open — otherwise
        CLV would compare the prices of two different bets.
      </P>

      <H2 id="settle-outcome">4 — The outcome (settle_outcome)</H2>
      <P>
        Once a scores update carries <Code>Action: "game_finalised"</Code>, the final stats are provable. The caller
        fetches <Code>/api/scores/stat-validation</Code> and hands over proven stats with their Merkle branches — and
        chooses nothing: keys, operator, comparison and threshold all come from the Prediction account.{' '}
        <Code>validate_stat</Code> returns the <em>answer</em> to the question, so the CPI's return value is stored
        directly: <Code>p.outcome_win = win</Code>. Status becomes <Code>Settled</Code>.
      </P>

      <H2 id="void">The escape hatch (void_prediction)</H2>
      <P>
        A prediction that was never proven, or whose match was abandoned, can be voided: the account closes and rent
        returns to the predictor. Blocked once <Code>Settled</Code>.
      </P>

      <Callout tone="info" title="Every step is a button">
        <Code>prove_entry</Code>, <Code>settle_close</Code> and <Code>settle_outcome</Code> are all exposed as buttons
        in <DocLink to="/docs/settlement">Portfolio</DocLink>, and all are permissionless — anyone may land them, and
        nobody can change what they write.
      </Callout>
    </>
  )
}

function Duels() {
  return (
    <>
      <Lead>
        Corners have no consensus line — no bookmaker prices "both teams' corners over 10.5". So there is no closing
        price to beat and no CLV to score, but there <strong>is</strong> a provable stat. That is the duel: a
        peer-to-peer escrow settled by <Code>validate_stat</Code>, with <strong>no admin key anywhere on the
        path</strong>.
      </Lead>

      <CodeBlock
        title="the lifecycle"
        code={`Open --join_duel--> Matched --resolve_duel--> Resolved --claim_duel--> Settled
 +-- cancel_duel --> Cancelled        +-- refund_duel (kickoff + 7d) --> Refunded`}
      />

      <H2 id="creating">Creating a duel</H2>
      <UL>
        <LI>
          Terms derive from the same shared <Code>derive_terms</Code> as predictions, so a duel and a prediction settle
          by identical logic. Only half-integer lines are accepted — the form surfaces this rule.
        </LI>
        <LI>
          <Code>expires_at</Code> is set to <Code>FixtureFacts.start_time</Code> — the <em>proven</em> kickoff, not a
          client-supplied deadline.
        </LI>
        <LI>
          The creator's stake transfers into a vault token account seeded <Code>["duel_vault", duel]</Code>, whose
          authority is the duel account itself — no human key can move it.
        </LI>
        <LI>
          <Code>creator_takes_true</Code> records which side of the yes/no question the creator nominated.
        </LI>
      </UL>

      <H2 id="joining">Joining</H2>
      <P>
        Guarded by <Code>status == Open</Code>, <Code>now &lt; expires_at</Code>, and <Code>taker != creator</Code>{' '}
        (<Code>SelfDuel</Code>). The taker's matching stake joins the vault; status becomes <Code>Matched</Code> and
        the vault holds two stakes.
      </P>

      <H2 id="resolve-claim">Resolving and claiming — deliberately two instructions</H2>
      <P>
        <Code>resolve_duel</Code> calls <Code>validate_stat</Code> and writes <Code>outcome_true</Code>.{' '}
        <strong>It moves no funds.</strong> <Code>claim_duel</Code> pays the winner both stakes and closes the vault.
        The split keeps one verifier CPI per transaction (proof vectors are large) and makes the state machine legible:{' '}
        <Code>Resolved</Code> means the chain knows the answer; <Code>Settled</Code> means the money moved.
      </P>
      <P>Both are permissionless. The winner is a pure function of the on-chain scores root and the terms fixed at creation:</P>
      <CodeBlock
        title="programs/clv/src/market.rs"
        code={`pub fn creator_wins(outcome_true: bool, creator_takes_true: bool) -> bool {
    outcome_true == creator_takes_true
}`}
      />
      <P>
        That function has its own truth table in <Code>programs/clv/tests/market.rs</Code>, because getting it
        backwards means the escrow pays the loser. It is extracted as a pure function precisely because{' '}
        <Code>create_duel</Code>'s kickoff guard makes the full path untestable on historical data — you cannot create
        a duel on a match that already finished.
      </P>

      <H2 id="stake">The stake</H2>
      <Callout tone="warn" title="Devnet USDT, never TxL">
        Duels are staked in devnet USDT (<Code>ELWT…2Ujh</Code>), a classic SPL token minted 100 at a time by the
        faucet on <DocLink to="/docs/onboarding">/onboard</DocLink>. The TxLINE credit token (TxL) is Token-2022,
        locked to its program for data access, and cannot be transferred between users. The vault is declared over{' '}
        <Code>TokenInterface</Code>, so a Token-2022 stake mint would work unchanged.
      </Callout>

      <H2 id="escape-hatches">Escape hatches</H2>
      <DocTable
        head={['Situation', 'Instruction', 'Effect']}
        rows={[
          ['Nobody takes the offer', <Code>cancel_duel</Code>, 'Refunds the creator, closes the vault. Open only.'],
          [
            'Matched, but the result never becomes provable',
            <Code>refund_duel</Code>,
            <>
              Available at kickoff + 7 days (<Code>DUEL_REFUND_GRACE_MS</Code>). Both sides get their own stake back.
              Nobody can trigger it early, because <Code>expires_at</Code> is proven.
            </>,
          ],
        ]}
        firstColBold={false}
      />
      <P>
        No path traps funds. No rake is taken. Rent returns to the creator when the duel account closes.
      </P>
    </>
  )
}

function Settlement() {
  return (
    <>
      <Lead>
        Settlement on Sharpe is <strong>permissionless</strong>: <Code>prove_entry</Code>, <Code>settle_close</Code>,{' '}
        <Code>settle_outcome</Code>, <Code>resolve_duel</Code> and <Code>claim_duel</Code> may be landed by any
        signer, and each writes exactly one value that a Merkle proof forces. There is no privileged process, no
        keeper, and nothing to run.
      </Lead>

      <H2 id="buttons">Every transition is a button</H2>
      <P>The app surfaces each pending transition on whichever account is ready:</P>
      <DocTable
        head={['State', 'Action', 'Where', 'Waits for']}
        rows={[
          [<Code>Open</Code>, <Code>prove_entry</Code>, <Code>/portfolio</Code>, "the entry quote's 5-minute odds root to publish"],
          [<Code>EntryProven</Code>, <Code>settle_close</Code>, <Code>/portfolio</Code>, 'kickoff to pass, so a closing quote is archived'],
          [<Code>Closed</Code>, <Code>settle_outcome</Code>, <Code>/portfolio</Code>, <><Code>game_finalised</Code> and the scores root</>],
          [<Code>Matched</Code>, <Code>resolve_duel</Code>, <Code>/duels</Code>, <><Code>game_finalised</Code> and the scores root</>],
          [<Code>Resolved</Code>, <Code>claim_duel</Code>, <Code>/duels</Code>, 'nothing'],
        ]}
        firstColBold={false}
      />
      <P>
        A bot could poll these accounts and land the same instructions unattended. It would save users a click. It
        could not change an outcome.
      </P>

      <H2 id="portfolio">The portfolio page</H2>
      <P>
        <Code>/portfolio</Code> lists your predictions with their status, the settlement buttons above, a{' '}
        <Code>void_prediction</Code> action for stuck accounts, and the <strong>Backtest</strong> badge on anything
        committed after its proven kickoff. Each row opens the{' '}
        <DocLink to="/docs/verify-modal">Verify modal</DocLink> to re-prove its numbers live.
      </P>

      <H2 id="defensive-decoding">Decoding defensively</H2>
      <P>
        Anchor's <Code>.all()</Code> throws on the first account it cannot decode, and devnet still holds five older
        121-byte <Code>Prediction</Code> accounts that share the discriminator but not the current layout. So{' '}
        <Code>listPredictions()</Code> decodes account by account and skips what it cannot read.
      </P>
    </>
  )
}

function Leaderboard() {
  return (
    <>
      <Lead>
        The leaderboard filters to <Code>ranked</Code> predictions and ranks on <strong>cumulative CLV</strong>. A
        settled bet that won with negative CLV is a bad bet, and the leaderboard says so.
      </Lead>

      <H2 id="what-counts">What counts</H2>
      <P>
        Only predictions with <Code>ranked = true</Code> — committed before a kickoff the chain itself verified —
        enter the ranking. Everything else appears in your portfolio badged <strong>Backtest</strong>, settles exactly
        the same way, and is invisible here.
      </P>
      <P>
        This is the honest core of the design. Sharpe could trivially let you "predict" a finished match and post a
        perfect record. The program refuses, using a kickoff it verified against a Merkle root — and it refuses for
        its own authors as much as for anyone else.
      </P>

      <H2 id="metrics">The three metrics</H2>
      <DocTable
        head={['Metric', 'What it measures', 'Why it is shown']}
        rows={[
          ['Cumulative CLV', 'Sum of clv_bps over closed and settled ranked calls', 'The rank key. Skill against the closing price.'],
          ['Hit rate', 'Settled wins ÷ settled calls', 'People expect it. It is noisy and it does not rank.'],
          [
            'Brier score',
            <>Mean of <Code>(entry_prob − outcome)²</Code> over settled calls</>,
            'A better calibration measure than hit rate: it punishes confident misses hardest.',
          ],
        ]}
        firstColBold={false}
      />

      <H2 id="reading-it">Reading a row</H2>
      <P>
        A bettor with positive cumulative CLV and a mediocre hit rate is doing the hard thing right: consistently
        getting better prices than the close. A bettor with a great hit rate and negative CLV has been lucky. Over a
        long enough sample, the first profile earns and the second regresses — that asymmetry is the entire reason CLV
        is the rank key.
      </P>
    </>
  )
}

function VerifyModal() {
  return (
    <>
      <Lead>
        The Verify modal is the point of the product. It does not display stored values and ask you to trust them — it
        fires four read-only <Code>.view()</Code> calls straight into TxLINE's on-chain program, <strong>right
        then</strong>, and shows what comes back.
      </Lead>

      <H2 id="four-rows">The four rows</H2>
      <CodeBlock
        title="a verified prediction"
        code={`01  The fixture     validate_fixture   ok  kickoff 2 Jul 2026 00:00 UTC · root 0x4073ec…
02  Entry line      validate_odds      ok  implied 72.10%              · root 0x…
03  Closing line    validate_odds      ok  implied 71.63%              · root 0x…
04  Match result    validate_stat      ok  2-0 · bet won               · root 0x…`}
      />
      <P>
        No wallet. No transaction. No cost. These are simulations against the live roots on Solana, and they would
        fail in front of you if any number here were invented.
      </P>

      <H2 id="row-one">Row 01 is not decorative</H2>
      <P>
        Reading the fixture row as plumbing is the mistake. It is the proof that rows 02 and 03 were quoted{' '}
        <em>before the match</em> — and therefore that the CLV computed from them measures anything at all. A Merkle
        proof alone says a quote is authentic; only the proven kickoff says it was pre-match. See{' '}
        <DocLink to="/docs/proven-kickoff">The proven kickoff</DocLink>.
      </P>

      <H2 id="how">How it works</H2>
      <P>
        Anchor's <Code>.view()</Code> simulates an instruction with a declared return type and yields the value
        without sending a transaction. The modal calls <Code>verifyFixture</Code>, <Code>verifyOdds</Code> (twice —
        entry and close) and <Code>verifyStat</Code> in <Code>app/src/chain/actions.ts</Code>, passing the exact
        records and Merkle branches fetched from TxLINE's <Code>/validation</Code> endpoints. The same verifiers the
        program CPIs into at settlement time answer the browser directly.
      </P>

      <Callout tone="proof" title="Try it">
        Open any settled prediction in <Code>/portfolio</Code> and hit <strong>Verify</strong>. Watch the four rows
        scan, then land. Each shows the on-chain root it proved against.
      </Callout>
    </>
  )
}

export const GUIDE: DocPage[] = [
  {
    slug: 'matches-and-feed',
    group: 'Using Sharpe',
    title: 'Matches & the feed',
    description: 'LIVE SSE ingestion and REPLAY of archived fixtures — one FeedSource, two implementations.',
    body: MatchesAndFeed,
  },
  {
    slug: 'predictions',
    group: 'Using Sharpe',
    title: 'Predictions',
    description: 'The full lifecycle: commit, prove the entry, settle the close, settle the outcome.',
    body: Predictions,
  },
  {
    slug: 'duels',
    group: 'Using Sharpe',
    title: 'Prop duels',
    description: 'Peer-to-peer escrow on provable stats — corners, cards, goals — with no admin key.',
    body: Duels,
  },
  {
    slug: 'settlement',
    group: 'Using Sharpe',
    title: 'Settlement & portfolio',
    description: 'Permissionless settlement, one button per transition, and defensive account decoding.',
    body: Settlement,
  },
  {
    slug: 'leaderboard',
    group: 'Using Sharpe',
    title: 'Leaderboard',
    description: 'Why only ranked calls count, and what cumulative CLV, hit rate and Brier score each tell you.',
    body: Leaderboard,
  },
  {
    slug: 'verify-modal',
    group: 'Using Sharpe',
    title: 'Verifying in the browser',
    description: 'Four live .view() calls re-prove every displayed number against on-chain roots, free.',
    body: VerifyModal,
  },
]
