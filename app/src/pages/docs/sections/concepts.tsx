/* eslint-disable react-refresh/only-export-components -- content registry: these files export page data, and their body components are only reachable through it */
import { Callout, Code, CodeBlock, DocLink, DocTable, H2, LI, Lead, P, UL } from '../prose'
import type { DocPage } from '../registry'

function ClosingLineValue() {
  return (
    <>
      <Lead>
        Closing Line Value is the difference between the price you took and the price the market settled on by
        kickoff. It is the professional bettor's yardstick, because over any meaningful sample,{' '}
        <strong>beating the close is skill and beating the result is luck</strong>.
      </Lead>

      <H2 id="definition">The definition</H2>
      <P>
        Every decimal price implies a probability. Sharpe converts prices to basis points of implied probability, then
        subtracts:
      </P>
      <CodeBlock
        title="the whole product, in one subtraction"
        code={`entry_prob_bps = round(10_000_000 / entry_price_x1000)
close_prob_bps = round(10_000_000 / close_price_x1000)

clv_bps = close_prob_bps - entry_prob_bps`}
      />
      <UL>
        <LI><strong>Positive CLV</strong> — the market moved toward your position after you took it. You beat the close.</LI>
        <LI><strong>Negative CLV</strong> — you paid more than the market's final judgement of the probability.</LI>
      </UL>

      <H2 id="worked-example">A worked example, from devnet</H2>
      <P>Fixture <Code>18172379</Code>, USA v Bosnia &amp; Herzegovina. A bet on USA:</P>
      <CodeBlock
        title="settled on-chain"
        code={`entry_prob_bps  7210   (72.10%, taken at 1.387)
close_prob_bps  7163   (71.63%, market closed at 1.396)
clv_bps          -47
outcome_win     true`}
      />
      <P>
        The bet won. It was still a bad bet: it paid 72.1% for something the market priced at 71.6% by kickoff.
        Outcomes are noisy; prices are not. A leaderboard ranked on wins rewards variance. Ranked on CLV, it rewards
        being right about prices — which is the only thing that persists.
      </P>

      <H2 id="why-provable-matters">Why provability matters here</H2>
      <P>
        CLV is only meaningful if three facts are beyond dispute: the price you entered at, the price at close, and
        that both were quoted <em>before the match started</em>. Any one of them faked makes the number worthless.
        Sharpe proves all three against Merkle roots on Solana:
      </P>
      <UL>
        <LI>The entry line — <Code>validate_odds</Code>, pinned at commitment time so it cannot be swapped later.</LI>
        <LI>The closing line — <Code>validate_odds</Code> again, with in-play quotes refused.</LI>
        <LI>The kickoff itself — <Code>validate_fixture</Code>, so "before the match" is a proven fact, not a claim.</LI>
      </UL>
      <P>
        See <DocLink to="/docs/verifiers">The three verifiers</DocLink> and{' '}
        <DocLink to="/docs/proven-kickoff">The proven kickoff</DocLink>.
      </P>

      <H2 id="rounding">Rounding, precisely</H2>
      <P>
        <Code>prob_bps</Code> rounds — it does not truncate. <Code>10_000_000 / 1889</Code> is <Code>5293.8</Code>. An
        early version truncated to <Code>5293</Code> on-chain while the frontend displayed{' '}
        <Code>Math.round(...) = 5294</Code>, so the Verify modal would have shown a probability the chain never
        stored. The program now computes <Code>(10_000_000 + price/2) / price</Code>, checked against the frontend's
        formula for every price from 1.001 to 10.000 in <Code>programs/clv/tests/market.rs</Code>.
      </P>

      <Callout tone="info" title="What about de-margined probabilities?">
        TxLINE snapshots carry a de-margined <Code>Pct</Code> field, but it does not exist in the <Code>Odds</Code>{' '}
        record that <Code>validate_odds</Code> verifies — so it cannot be proven. Sharpe computes implied probability
        from the raw price, which can.
      </Callout>

      <H2 id="ranked-vs-backtest">Ranked calls vs backtests</H2>
      <P>
        A CLV score only measures skill if the call was committed <strong>before kickoff</strong>. Sharpe stamps this
        on-chain at commitment time, against a kickoff the chain itself verified. Calls on finished matches settle
        identically, are labelled <strong>Backtest</strong>, and never reach the leaderboard — see{' '}
        <DocLink to="/docs/proven-kickoff">The proven kickoff</DocLink>.
      </P>
    </>
  )
}

function Verifiers() {
  return (
    <>
      <Lead>
        TxLINE publishes sports data and, every few minutes, commits a Merkle root of that data to its Solana program.
        Three read-only verifiers each answer one question: <strong>is this record committed under a published
        root?</strong> Sharpe's program calls all three, and the app also calls them read-only from your browser.
      </Lead>

      <H2 id="the-three">The three verifiers</H2>
      <DocTable
        head={['Verifier', 'Proves', 'Roots account (seeds)']}
        rows={[
          [
            <Code>validate_fixture</Code>,
            "A fixture's metadata, including its kickoff time",
            <Code>["ten_daily_fixtures_roots", floor(epochDay/10)*10]</Code>,
          ],
          [
            <Code>validate_odds</Code>,
            'One bookmaker quote at one instant, including its prices',
            <Code>["daily_batch_roots", epochDay]</Code>,
          ],
          [
            <Code>validate_stat</Code>,
            'A yes/no question about final match statistics',
            <Code>["daily_scores_roots", epochDay]</Code>,
          ],
        ]}
      />
      <Callout tone="warn" title="Odds roots live under daily_batch_roots">
        Not <Code>daily_odds_roots</Code>. Deriving the wrong seed produces an account that doesn't exist, and the
        error surfaces far from its cause.
      </Callout>
      <P>
        <Code>epochDay = floor(ts_ms / 86_400_000)</Code>. For scores the timestamp is{' '}
        <Code>summary.updateStats.minTimestamp</Code>; for odds it is <Code>odds.Ts</Code>; for fixtures it derives
        from <Code>snapshot.Ts</Code> — the update time, <em>not</em> <Code>StartTime</Code>.
      </P>

      <H2 id="signatures">Signatures</H2>
      <CodeBlock
        title="the verifier surface"
        code={`validate_stat(ts, fixture_summary, fixture_proof, main_tree_proof,
              predicate, stat_a, stat_b?, op?) -> bool
  Returns the ANSWER to the predicate when the proof is valid.

validate_odds(ts, odds_snapshot, summary, sub_tree_proof, main_tree_proof) -> bool
  Returns true only if the exact Odds record - including its prices -
  is committed under the on-chain root.

validate_fixture(...) -> bool
  Proves the fixture's metadata, including its kickoff time.`}
      />
      <P>
        Note <Code>validate_stat</Code>'s return value: it is not just "the proof is valid" — it is the answer to the
        question. Sharpe stores that answer directly as <Code>outcome_win</Code>.
      </P>

      <H2 id="what-a-proof-says">What a Merkle proof does and doesn't say</H2>
      <P>
        A Merkle proof tells you a record is <strong>authentic</strong>. It does not tell you <em>when</em> it was
        quoted or <em>which market</em> it prices. At one instant on one fixture, the feed carries a full-match 1X2
        line <em>and</em> a first-half 1X2 line — both real, both provable, and only one prices your bet. Closing that
        gap is most of Sharpe's program: see <DocLink to="/docs/proven-kickoff">The proven kickoff</DocLink> and the{' '}
        <Code>bind_odds</Code> guards in <DocLink to="/docs/errors">Errors &amp; guards</DocLink>.
      </P>

      <H2 id="compute">Compute cost, measured on devnet</H2>
      <DocTable
        head={['CPI', 'Compute units (approx.)']}
        rows={[
          [<Code>validate_fixture</Code>, '131k CU'],
          [<Code>validate_stat</Code>, '150k CU'],
          [<Code>validate_odds</Code>, '264k CU'],
        ]}
      />
      <P>
        Nowhere near the 1.4M CU the TxLINE documentation warns about. Sharpe still performs{' '}
        <strong>at most one verifier CPI per instruction</strong> — but for transaction size and a legible state
        machine, not for compute.
      </P>

      <H2 id="view-calls">Free verification with .view()</H2>
      <P>
        Because the verifiers are read-only, they can be <strong>simulated</strong> without a wallet, a transaction, or
        any cost. The <DocLink to="/docs/verify-modal">Verify modal</DocLink> uses exactly this: four live{' '}
        <Code>.view()</Code> calls into TxLINE's program, re-proving every displayed number in your browser on demand.
      </P>
    </>
  )
}

function ProvenKickoff() {
  return (
    <>
      <Lead>
        <Code>validate_fixture</Code> looks like metadata plumbing. It is the only thing that makes the other two
        proofs mean anything: without a proven kickoff you cannot say a line predates a match, and a CLV number is then
        a number about nothing.
      </Lead>

      <H2 id="why">Why the kickoff must be proven</H2>
      <P>
        An authentic odds record passes <Code>validate_odds</Code> whether it was quoted a week before the match or at
        half time. Nothing in the proof itself stops you opening a position against a line drawn after the match
        started — unless the chain independently knows when the match started. So Sharpe proves the fixture first, and
        anchors <em>every</em> timing rule to that one number.
      </P>

      <H2 id="fixture-facts">FixtureFacts: a write-once account</H2>
      <P>
        Before the first bet on a match, <Code>ensureFixtureProven()</Code> fetches{' '}
        <Code>/api/fixtures/validation</Code> and sends <Code>prove_fixture</Code>, which CPIs into{' '}
        <Code>validate_fixture</Code>. On a <Code>true</Code> return it stores:
      </P>
      <CodeBlock
        title='programs/clv — ["fixture", fixture_id le], write-once'
        code={`pub struct FixtureFacts {
    pub fixture_id: i64,
    pub start_time: i64,           // PROVEN kickoff - anchor for every timing guard
    pub participant1_id: i32,
    pub participant2_id: i32,
    pub competition_id: i32,
    pub proven_at: i64,
    pub bump: u8,
}`}
      />
      <P>
        The account uses <Code>init</Code>, never <Code>init_if_needed</Code>. It is write-once: a kickoff cannot be
        rewritten underneath predictions already judged against it.
      </P>

      <H2 id="ranked">What `ranked` means</H2>
      <CodeBlock title="programs/clv/src/instructions/open_prediction.rs" code={`p.ranked = now_ms()? < fixture_facts.start_time;`} />
      <P>
        Did you commit before a kickoff the chain itself verified? There is no tunable constant, nothing to fake, and
        no way to earn it afterwards. Bets on finished matches settle identically, are labelled{' '}
        <strong>Backtest</strong>, and never reach the{' '}
        <DocLink to="/docs/leaderboard">leaderboard</DocLink>. This holds for Sharpe's own authors as much as anyone:
        the backtest in the project's devnet history reads <Code>ranked: false</Code>.
      </P>
      <Callout tone="warn" title="Units trap">
        <Code>Fixture.start_time</Code> and <Code>Odds.ts</Code> are epoch <strong>milliseconds</strong>.{' '}
        <Code>Clock::unix_timestamp</Code> is <strong>seconds</strong>. Mixing them makes every prediction look
        ranked. See <Code>open_prediction::now_ms()</Code>.
      </Callout>

      <H2 id="after-kickoff">What kickoff makes impossible</H2>
      <P>
        The moment <Code>Clock::now ≥ FixtureFacts.start_time</Code>, four things are refused — all anchored to the
        same proven number:
      </P>
      <DocTable
        head={['Attempt', 'Error']}
        rows={[
          [<>open a prediction with <Code>entry_ts ≥ start_time</Code></>, <Code>EntryAfterKickoff</Code>],
          [<>settle a close with <Code>close_ts &gt; start_time</Code></>, <Code>CloseAfterKickoff</Code>],
          [<>settle a close with an <Code>in_running</Code> quote</>, <Code>LineIsInPlay</Code>],
          [<>create or join a duel after kickoff</>, <Code>DuelExpired</Code>],
        ]}
        firstColBold={false}
      />
      <P>
        Each guard lives in the program, so it rejects whoever calls and however they call. And any new prediction
        after kickoff gets <Code>ranked = false</Code>.
      </P>

      <H2 id="fixture-id-trap">The two fixture ids</H2>
      <P>
        <Code>snapshot.FixtureId</Code> is not the fixture id. It returns <Code>844424948304347</Code> where every
        other endpoint says <Code>18172379</Code> — the high bits carry a sport tag (observed as 3 and 1 across
        fixtures, so it cannot be hardcoded). Sharpe binds <Code>FixtureFacts</Code> on{' '}
        <Code>summary.fixture_id</Code>, the public id, and reads <Code>start_time</Code> from the snapshot. The Merkle
        proof links the two records together, so both are trustworthy.
      </P>
    </>
  )
}

function Markets() {
  return (
    <>
      <Lead>
        Sharpe's market model decides two things at the moment you commit: <strong>what question settles the
        bet</strong>, and <strong>whether the market has a consensus price</strong> — which determines whether it can
        carry a CLV score at all.
      </Lead>

      <H2 id="the-four">The four market kinds</H2>
      <DocTable
        head={['Market', 'Question', 'Priced?', 'Surface']}
        rows={[
          [<Code>Result1x2</Code>, '(P1 − P2) goals against 0', <>yes — <Code>1X2_PARTICIPANT_RESULT</Code></>, 'ranked CLV'],
          [<Code>TotalsOu</Code>, '(P1 + P2) goals against line', <>yes — <Code>OVERUNDER_PARTICIPANT_GOALS</Code></>, 'ranked CLV'],
          [<Code>CombinedTotal</Code>, '(A + B) any family against line', 'no', 'duels'],
          [<Code>TeamTotal</Code>, 'single stat against line', 'no', 'duels'],
        ]}
      />
      <P>
        Only priced markets may back a <Code>Prediction</Code>. The rest raise <Code>MarketHasNoOddsLine</Code> and
        belong to <DocLink to="/docs/duels">duels</DocLink> — corners have no consensus line, so there is no closing
        price to beat, but there <em>is</em> a provable stat.
      </P>

      <H2 id="derive-terms">Terms are derived once, at open</H2>
      <P>
        <Code>derive_terms(market, selection, line_x10, period, family)</Code> runs at commitment time and its output
        is stored on the account. Settlement never re-derives anything — it replays the stored terms against an
        on-chain root. That is what makes resolution deterministic:
      </P>
      <CodeBlock
        title="programs/clv/src/market.rs"
        code={`pub struct Terms {
    pub stat_a_key: u32,   // period * 1000 + base_key
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    pub op_add: bool,      // Add or Subtract
    pub comparison: u8,    // GT | LT | EQ
    pub threshold: i32,
}`}
      />

      <H2 id="stat-keys">Stat keys</H2>
      <P>
        <Code>key = period * 1000 + base</Code>. Base keys per team:
      </P>
      <DocTable
        head={['Family', 'Team 1', 'Team 2']}
        rows={[
          ['Goals', <Code>1</Code>, <Code>2</Code>],
          ['Yellow cards', <Code>3</Code>, <Code>4</Code>],
          ['Red cards', <Code>5</Code>, <Code>6</Code>],
          ['Corners', <Code>7</Code>, <Code>8</Code>],
        ]}
      />
      <P>
        First half adds 1000, second half 2000, extra time 3000 and 4000, penalties 5000 — so first-half corners are{' '}
        <Code>1007</Code> and <Code>1008</Code>. Note that <Code>ScoreStat.period</Code> is always <Code>0</Code>: the
        period lives in the key.
      </P>

      <H2 id="line-rules">Which lines are allowed</H2>
      <P>Sharpe only accepts lines with a strict yes/no answer:</P>
      <UL>
        <LI>
          <strong>Half-integer lines</strong> (2.5, 10.5) — accepted. Every outcome is decisively over or under.
        </LI>
        <LI>
          <strong>Quarter lines</strong> (0.75, −1.75) — refused with <Code>UnsupportedLine</Code>. They split the
          stake across two adjacent lines and have no single yes/no answer.
        </LI>
        <LI>
          <strong>Whole lines</strong> (3.0) — refused too, because they can push, and a push has no yes/no answer
          either.
        </LI>
      </UL>
      <P>
        The duel creation form surfaces this rule directly — it only offers half-integer lines.
      </P>

      <H2 id="odds-prices">How prices become probabilities</H2>
      <P>
        <Code>Prices</Code> is an <Code>i32</Code>: decimal odds × 1000. Implied probability in basis points is{' '}
        <Code>round(10_000_000 / price)</Code> — see the rounding note in{' '}
        <DocLink to="/docs/closing-line-value">Closing Line Value</DocLink>.
      </P>
    </>
  )
}

export const CONCEPTS: DocPage[] = [
  {
    slug: 'closing-line-value',
    group: 'Core concepts',
    title: 'Closing Line Value',
    description: 'The number Sharpe scores you on, why it beats win-rate, and how it is computed on-chain.',
    body: ClosingLineValue,
  },
  {
    slug: 'verifiers',
    group: 'Core concepts',
    title: 'The three verifiers',
    description: "TxLINE's on-chain Merkle verifiers: what each proves, their roots accounts, and their limits.",
    body: Verifiers,
  },
  {
    slug: 'proven-kickoff',
    group: 'Core concepts',
    title: 'The proven kickoff',
    description: 'Why validate_fixture anchors everything: write-once FixtureFacts, ranked vs backtest, timing guards.',
    body: ProvenKickoff,
  },
  {
    slug: 'markets',
    group: 'Core concepts',
    title: 'Markets & stat keys',
    description: 'The four market kinds, derived settlement terms, stat key encoding, and the line rules.',
    body: Markets,
  },
]
