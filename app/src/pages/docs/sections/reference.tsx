/* eslint-disable react-refresh/only-export-components -- content registry: these files export page data, and their body components are only reachable through it */
import { Callout, Code, CodeBlock, DocLink, DocTable, ExtLink, H2, LI, Lead, P, UL } from '../prose'
import type { DocPage } from '../registry'

function TxlineApi() {
  return (
    <>
      <Lead>
        Every number in Sharpe originates from TxLINE's API and is proven against roots TxLINE publishes on Solana.
        This page lists the endpoints in use, the auth model, and the <strong>codec boundary</strong> — the exact
        transforms between API JSON and on-chain types, where one renamed field breaks a Merkle proof.
      </Lead>

      <H2 id="auth">Auth model</H2>
      <P>
        Every data call sends <strong>both</strong> headers: <Code>Authorization: Bearer &lt;jwt&gt;</Code> and{' '}
        <Code>X-Api-Token: &lt;token&gt;</Code>. The JWT comes from <Code>POST /auth/guest/start</Code> (30 days); the
        API token from <Code>POST /api/token/activate</Code> after an on-chain <Code>subscribe(1, 4)</Code> — the free
        World Cup tier, service level 1, 60-second delay. See{' '}
        <DocLink to="/docs/onboarding">Onboarding</DocLink>.
      </P>
      <P>
        In the app all calls go through the <Code>/txapi</Code> proxy (Vite dev server locally, a Vercel rewrite in
        production) because direct cross-origin calls to <Code>txline-dev.txodds.com</Code> are CORS-blocked.
      </P>

      <H2 id="endpoints">Endpoints in use</H2>
      <DocTable
        head={['Endpoint', 'Used for', 'Notes']}
        rows={[
          [<Code>POST /auth/guest/start</Code>, 'guest JWT', 'no account, no email'],
          [<Code>POST /api/token/activate</Code>, 'personal API token', <>returns <Code>text/plain</Code>, not JSON</>],
          [<Code>/api/fixtures/snapshot</Code>, 'upcoming fixtures', 'forward-looking: drops finished fixtures'],
          [<Code>/api/fixtures/validation</Code>, 'fixture metadata + proof', 'works for finished fixtures too'],
          [<Code>/api/odds/snapshot/{'{id}'}</Code>, 'current odds board', <>live only; use <Code>?asOf=</Code> for history</>],
          [<Code>/api/odds/updates/…</Code>, 'archived odds ladder', '5-minute buckets; feeds REPLAY and closing lines'],
          [<Code>/api/odds/validation</Code>, 'one quote + Merkle branches', <><Code>404</Code> until its 5-minute root publishes</>],
          [<Code>/api/scores/stat-validation</Code>, 'final stats + proof', <Code>?fixtureId&amp;seq&amp;statKey&amp;statKey2</Code>],
          ['SSE streams', 'live odds and scores', <>filterable by <Code>?fixtureId=</Code>; heartbeats ~20s</>],
        ]}
        firstColBold={false}
      />

      <H2 id="codec">The codec boundary</H2>
      <P>
        A Merkle leaf is hashed from a record's <strong>exact bytes</strong>. Any renaming or reformatting changes the
        hash and yields <Code>InvalidSubTreeProof</Code> — far from its cause. Always prove the record verbatim from
        the <Code>/validation</Code> response, never from the stream or snapshot copy. The full transform table, as
        implemented in <Code>app/src/lib/codec.ts</Code>:
      </P>
      <DocTable
        head={['API JSON', 'On-chain argument', 'Transform']}
        rows={[
          [<Code>ProofNode.hash</Code> , <Code>hash: [u8;32]</Code>, 'base64 → 32 bytes'],
          [<Code>ProofNode.isRightSibling</Code>, <Code>isRightSibling: bool</Code>, 'passthrough'],
          [<Code>summary.eventStatsSubTreeRoot</Code>, <Code>eventsSubTreeRoot</Code>, 'rename, then base64 → 32 bytes'],
          [<Code>eventStatRoot</Code>, <Code>StatTerm.eventStatRoot</Code>, 'base64 → 32 bytes'],
          [<><Code>Odds</Code> (PascalCase)</>, <><Code>Odds</Code> (camelCase)</>, <>rename; <Code>GameState</Code>, <Code>MarketParameters</Code>, <Code>MarketPeriod</Code> become optional</>],
          [<Code>summary.oddsSubTreeRoot</Code>, <Code>OddsBatchSummary.oddsSubTreeRoot</Code>, 'base64 → 32 bytes'],
          [<Code>summary.updateSubTreeRoot</Code>, <Code>[u8;32]</Code>, 'arrives as a JSON byte array, not base64'],
          [<Code>List_ProofNode = Nil {'{}'}</Code>, <Code>[]</Code>, 'empty proof becomes an empty vector'],
        ]}
        firstColBold={false}
      />
      <P>
        <Code>app/src/lib/codec.test.ts</Code> holds 16 golden-vector tests against frozen real{' '}
        <Code>/validation</Code> responses, purely to defend this boundary.
      </P>

      <H2 id="devnet-findings">Confirmed on devnet</H2>
      <P>Facts verified against real fixtures, not assumed from documentation:</P>
      <UL>
        <LI>
          <strong>Both root types are posted.</strong> <Code>daily_scores_roots</Code> and{' '}
          <Code>daily_batch_roots</Code> exist and their proofs reconstruct.
        </LI>
        <LI>
          <strong>Two fixture ids.</strong> <Code>snapshot.FixtureId = 844424948304347</Code> is internal;{' '}
          <Code>summary.fixtureId = 18172379</Code> is what every other endpoint uses. The high bits carry a sport tag.
        </LI>
        <LI>
          <strong>Stat coverage is total.</strong> On fixture <Code>18172379</Code> at <Code>seq=1058</Code>:
          goals 2-0, yellows 0-1, reds 1-0, corners 4-3, plus per-half splits — all provable.
        </LI>
        <LI>
          <strong>The odds ladder is rich.</strong> 1,954 records across the last five 5-minute buckets before one
          kickoff, rising from 30 at 120 minutes out to 852 in the final five.
        </LI>
        <LI>
          <strong><Code>gameState: 5</Code> never appears.</strong> Finality is <Code>Action: "game_finalised"</Code>{' '}
          on a scores update.
        </LI>
        <LI>
          <strong>SSE <Code>Last-Event-ID</Code></strong> format is <Code>"&lt;epochMs&gt;:&lt;index&gt;"</Code>;
          heartbeats about every 20 seconds.
        </LI>
      </UL>
    </>
  )
}

function Addresses() {
  return (
    <>
      <Lead>
        Everything Sharpe touches on devnet, in one place. All addresses are defaults in{' '}
        <Code>app/src/config.ts</Code> and overridable with <Code>VITE_*</Code> variables.
      </Lead>

      <H2 id="deployed">Deployed addresses</H2>
      <DocTable
        head={['Item', 'Value']}
        rows={[
          ['Sharpe program (devnet)', <Code>734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz</Code>],
          ['TxLINE txoracle program (devnet)', <Code>6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J</Code>],
          ['TxLINE API host (devnet)', <Code>https://txline-dev.txodds.com</Code>],
          ['Duel stake mint (devnet USDT, classic SPL)', <Code>ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh</Code>],
          ['TxL credit mint (Token-2022, data access only)', <Code>4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG</Code>],
          ['Live app', <ExtLink href="https://sharpe-dusky.vercel.app">sharpe-dusky.vercel.app</ExtLink>],
        ]}
        firstColBold={false}
      />
      <Callout tone="warn" title="The duel stake is never TxL">
        The TxLINE credit token is locked to its program for data access and cannot be transferred between users.
        Duels stake devnet USDT — a classic SPL token, minted 100 at a time by the faucet on{' '}
        <DocLink to="/docs/onboarding">/onboard</DocLink>.
      </Callout>

      <H2 id="demo-fixtures">Demo fixtures</H2>
      <P>
        Only two finished World Cup matches on devnet carry complete data — scores <em>and</em> the archived odds
        ladder. These drive the REPLAY feed:
      </P>
      <DocTable
        head={['Fixture', 'Match', 'Notes']}
        rows={[
          [<Code>18172379</Code>, 'USA 2-0 Bosnia & Herzegovina', 'the worked example throughout these docs'],
          [<Code>18179551</Code>, 'Spain v Austria', 'second replay fixture'],
        ]}
        firstColBold={false}
      />

      <H2 id="service-tier">Data tier</H2>
      <P>
        Sharpe runs entirely on TxLINE's <strong>free World Cup tier</strong>: service level 1, 60-second delay,
        provisioned per wallet via on-chain <Code>subscribe(1, 4)</Code> at a cost of 0 TxL. No paid subscription is
        involved anywhere.
      </P>
    </>
  )
}

function Testing() {
  return (
    <>
      <Lead>
        Sixty tests across two suites, plus a full lifecycle that is reproducible from the UI itself. The Rust tests
        are pure functions and need no validator; the codec tests run against frozen real API responses.
      </Lead>

      <H2 id="commands">Commands</H2>
      <CodeBlock
        title="run everything"
        code={`cargo test -p clv     # 22 tests: derive_terms, stat_keys, parse_line_x10,
                      # prob_bps, bind_odds, the duel payout truth table
cd app && npm test    # 38 tests: 16 golden-vector codec, 22 domain`}
      />

      <H2 id="program-tests">Program tests (22)</H2>
      <P><Code>programs/clv/tests/market.rs</Code> covers the pure core of settlement:</P>
      <UL>
        <LI><Code>derive_terms</Code> — market + selection + line → the stored settlement question.</LI>
        <LI><Code>stat_keys</Code> — the <Code>period * 1000 + base</Code> encoding.</LI>
        <LI><Code>parse_line_x10</Code> — line parsing, with quarter and whole lines refused.</LI>
        <LI>
          <Code>prob_bps</Code> — checked against the frontend's <Code>Math.round</Code> formula for every price from
          1.001 to 10.000, so the chain and the UI can never disagree.
        </LI>
        <LI><Code>bind_odds</Code> — each mismatch guard, by name.</LI>
        <LI>
          the <Code>creator_wins</Code> truth table — extracted as a pure function because the kickoff guard makes the
          full duel path untestable on historical data.
        </LI>
      </UL>

      <H2 id="app-tests">App tests (38)</H2>
      <UL>
        <LI>
          <Code>app/src/lib/codec.test.ts</Code> — 16 golden-vector tests against frozen real{' '}
          <Code>/validation</Code> responses. A Merkle leaf hashes a record's exact bytes, so this boundary is where
          proofs silently break; see <DocLink to="/docs/txline-api">TxLINE integration</DocLink>.
        </LI>
        <LI>
          <Code>app/src/lib/domain.test.ts</Code> — 22 tests over market derivation and odds selection.
        </LI>
      </UL>

      <H2 id="lifecycle">The living test: the app itself</H2>
      <P>
        Beyond the suites, the full lifecycle is reproducible from the UI: every settlement step is a button in{' '}
        <Code>/portfolio</Code> and <Code>/duels</Code>, and on a finished fixture they unlock back to back. The full
        prediction lifecycle — and every guard rejection — was exercised on devnet against live roots on fixture{' '}
        <Code>18172379</Code>.
      </P>
    </>
  )
}

function Troubleshooting() {
  return (
    <>
      <Lead>
        Every failure mode has a designed exit. <strong>No path traps funds, and no path has an admin key.</strong>
      </Lead>

      <H2 id="failure-modes">Failure modes and escape hatches</H2>
      <DocTable
        head={['Situation', 'What happens']}
        rows={[
          [
            "Entry quote's odds root hasn't published yet",
            <>
              <Code>/api/odds/validation</Code> returns <Code>404</Code>. Retry <Code>prove_entry</Code> after ~a
              minute — the commitment stands and loses nothing by waiting.
            </>,
          ],
          [
            'Prediction never proven, or match abandoned',
            <>
              <Code>void_prediction</Code> closes the account and returns rent to the predictor. Blocked once{' '}
              <Code>Settled</Code>.
            </>,
          ],
          [
            'Duel offered, nobody takes it',
            <>
              <Code>cancel_duel</Code> refunds the creator and closes the vault. <Code>Open</Code> only.
            </>,
          ],
          [
            'Duel matched but the result never becomes provable',
            <>
              <Code>refund_duel</Code>, available at kickoff + 7 days. Both sides get their own stake back. Nobody can
              trigger it early, because <Code>expires_at</Code> is proven.
            </>,
          ],
          [
            'JWT expired (30 days)',
            <>
              Visit <Code>/onboard</Code> again — free, one click. Nothing on-chain is lost.
            </>,
          ],
          [
            'A record was reformatted before proving',
            <>
              <Code>InvalidSubTreeProof</Code> from TxLINE. Prove the record verbatim from the{' '}
              <Code>/validation</Code> response — see the <DocLink to="/docs/txline-api">codec boundary</DocLink>.
            </>,
          ],
        ]}
        firstColBold={false}
      />

      <H2 id="common-symptoms">Common symptoms</H2>
      <DocTable
        head={['Symptom', 'Likely cause']}
        rows={[
          [
            '"not onboarded" errors everywhere',
            <>
              No credentials for the connected wallet. Visit <Code>/onboard</Code> — credentials are stored per wallet
              address, so switching wallets switches credentials.
            </>,
          ],
          [
            'activate step seems to fail with a parse error',
            <>
              <Code>/api/token/activate</Code> returns <Code>text/plain</Code>, not JSON. Don't call{' '}
              <Code>res.json()</Code> on it.
            </>,
          ],
          [
            'the SSE stream "looks dead"',
            <>Heartbeats arrive ~every 20 seconds. A 15-second probe sees none. Wait longer before concluding.</>,
          ],
          [
            'a fixture disappeared from /matches',
            <>
              <Code>/api/fixtures/snapshot</Code> is forward-looking and drops finished fixtures. Finished matches
              resolve through <Code>/api/fixtures/validation</Code>, and the two replay fixtures carry their own
              metadata.
            </>,
          ],
          [
            'every prediction looks ranked in local tinkering',
            <>
              Milliseconds vs seconds. <Code>start_time</Code> and <Code>Odds.ts</Code> are epoch ms;{' '}
              <Code>Clock::unix_timestamp</Code> is seconds. See <Code>open_prediction::now_ms()</Code>.
            </>,
          ],
          [
            'account listing throws on decode',
            <>
              Old-layout accounts share the discriminator. Decode account by account and skip failures, as{' '}
              <Code>listPredictions()</Code> does.
            </>,
          ],
        ]}
        firstColBold={false}
      />

      <H2 id="help">Still stuck?</H2>
      <P>
        Read the code in the order suggested in <DocLink to="/docs/architecture">Architecture</DocLink> — the market
        model first, then the instruction files. Every guard is declared by name in{' '}
        <Code>programs/clv/src/error.rs</Code>, and <DocLink to="/docs/errors">Errors &amp; guards</DocLink> maps each
        one to the mistake it stops.
      </P>
    </>
  )
}

export const REFERENCE: DocPage[] = [
  {
    slug: 'txline-api',
    group: 'Reference',
    title: 'TxLINE integration',
    description: 'Endpoints, the dual-header auth model, and the codec boundary where proofs break.',
    body: TxlineApi,
  },
  {
    slug: 'addresses',
    group: 'Reference',
    title: 'Addresses & fixtures',
    description: 'Every devnet address Sharpe touches, plus the two replay demo fixtures.',
    body: Addresses,
  },
  {
    slug: 'testing',
    group: 'Reference',
    title: 'Testing',
    description: '22 program tests, 38 app tests, and a lifecycle reproducible from the UI.',
    body: Testing,
  },
  {
    slug: 'troubleshooting',
    group: 'Reference',
    title: 'Troubleshooting',
    description: 'Failure modes, escape hatches, and the symptoms that cost real debugging time.',
    body: Troubleshooting,
  },
]
