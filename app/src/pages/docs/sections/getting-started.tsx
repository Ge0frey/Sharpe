/* eslint-disable react-refresh/only-export-components -- content registry: these files export page data, and their body components are only reachable through it */
import { Callout, Code, CodeBlock, DocLink, DocTable, ExtLink, H2, LI, Lead, P, Steps, UL } from '../prose'
import type { DocPage } from '../registry'

function Overview() {
  return (
    <>
      <Lead>
        Sharpe lets you <strong>prove you can beat a betting market</strong> — or find out that you can't. It scores
        World Cup calls on <strong>Closing Line Value</strong>, the professional bettor's measure of skill, and proves
        every number involved against Merkle roots that TxLINE publishes on Solana. There is no oracle to trust and no
        admin who can change an outcome.
      </Lead>

      <H2 id="the-problem">The problem Sharpe solves</H2>
      <P>
        Betting products ask you to trust three numbers: the price you were given, the price the market closed at, and
        the result. Sharpe proves all three on-chain, then scores you on the one that actually measures skill — the
        difference between your entry price and the closing price.
      </P>
      <P>
        Outcomes are noisy. Prices are not. A bet can win and still be bad, and a bet can lose and still be sharp.
        Professionals score themselves on Closing Line Value for exactly this reason — and until the line itself became
        provable, nobody could do it without trusting someone.
      </P>

      <H2 id="one-number">The point, in one number</H2>
      <P>
        From Sharpe's devnet history — fixture <Code>18172379</Code>, USA v Bosnia &amp; Herzegovina. A bet on USA:
      </P>
      <CodeBlock
        title="a settled prediction, on-chain"
        code={`entry_prob_bps   7210    (72.10%, taken at decimal odds 1.387)
close_prob_bps   7163    (71.63%, market closed at 1.396)
clv_bps           -47
outcome_win      true`}
      />
      <P>
        That bet <strong>won</strong>. It was still a <strong>bad bet</strong>: it paid 72.1% for something the market
        priced at 71.6% by kickoff. The leaderboard says so, because it ranks on CLV, not on wins. See{' '}
        <DocLink to="/docs/closing-line-value">Closing Line Value</DocLink> for the full concept.
      </P>

      <H2 id="three-actors">Three actors</H2>
      <DocTable
        head={['Actor', 'Role']}
        rows={[
          [
            'TxLINE',
            <>
              Publishes sports data and, every few minutes, commits a Merkle root of that data to its Solana program.
              Exposes three read-only verifiers, each answering one question: <em>is this record committed under a
              published root?</em>
            </>,
          ],
          [
            'Sharpe (clv program)',
            <>
              A settlement engine that never trusts a number it was handed. Every value it stores was either derived
              from a record TxLINE's verifier confirmed, or fixed by the user before the answer existed.
            </>,
          ],
          [
            'You',
            <>Commit to a call before the match. The chain scores you against the price the market closed at.</>,
          ],
        ]}
      />

      <H2 id="two-surfaces">Two surfaces, one proof engine</H2>
      <DocTable
        head={['Surface', 'Markets', 'Proofs used', 'Stake']}
        rows={[
          [
            'Ranked CLV',
            '1X2, Totals O/U, first-half 1X2',
            <><Code>validate_fixture</Code> + <Code>validate_odds</Code> ×2 + <Code>validate_stat</Code></>,
            'none',
          ],
          [
            'Prop duels',
            'combined corners, cards, goals, per-half',
            <><Code>validate_fixture</Code> + <Code>validate_stat</Code></>,
            'devnet USDT escrow',
          ],
        ]}
      />
      <P>
        Corners and cards have no consensus line, so they carry no CLV. That is why they live on the{' '}
        <DocLink to="/docs/duels">duel surface</DocLink>, which needs only a provable stat — a peer-to-peer escrow
        settled with no admin and no oracle.
      </P>

      <Callout tone="proof" title="Everything provable is proven">
        The app fires read-only <Code>.view()</Code> calls straight into TxLINE's on-chain verifiers from your
        browser, so every displayed number can be re-proven on demand. Open any settled prediction and hit{' '}
        <strong>Verify</strong> — see <DocLink to="/docs/verify-modal">Verifying in the browser</DocLink>.
      </Callout>

      <H2 id="where-next">Where to go next</H2>
      <UL>
        <LI><DocLink to="/docs/quickstart">Quickstart</DocLink> — open the live app or run it locally in minutes.</LI>
        <LI><DocLink to="/docs/onboarding">Onboarding</DocLink> — provision your own free TxLINE data access, one click per wallet.</LI>
        <LI><DocLink to="/docs/predictions">Predictions</DocLink> — the full lifecycle from commitment to settled CLV.</LI>
        <LI><DocLink to="/docs/architecture">Architecture</DocLink> — what runs where, and why there is no backend.</LI>
      </UL>
    </>
  )
}

function Quickstart() {
  return (
    <>
      <Lead>
        Sharpe is a static web app backed entirely by Solana devnet and TxLINE's free World Cup data tier. You can use
        the hosted deployment immediately, or run everything locally. <strong>No <Code>.env</Code> file is needed</strong> —
        every configuration value has a working devnet default.
      </Lead>

      <H2 id="use-the-live-app">Use the live app</H2>
      <P>
        The production build runs at{' '}
        <ExtLink href="https://sharpe-dusky.vercel.app">sharpe-dusky.vercel.app</ExtLink> against Solana devnet.
      </P>
      <Steps
        items={[
          {
            title: 'Get a devnet wallet',
            body: (
              <P>
                Install Phantom or Solflare, switch it to <strong>devnet</strong>, and fund it with a devnet SOL
                airdrop. SOL only pays transaction fees and account rent — nothing in Sharpe costs real money.
              </P>
            ),
          },
          {
            title: 'Provision data access at /onboard',
            body: (
              <P>
                Each wallet provisions TxLINE's free World Cup tier itself, in one click. Four steps run automatically —
                see <DocLink to="/docs/onboarding">Onboarding</DocLink>. While you're there, hit{' '}
                <strong>Get devnet USDT</strong> to mint 100 USDT for prop duels.
              </P>
            ),
          },
          {
            title: 'Pick a match and commit a call',
            body: (
              <P>
                Browse <Code>/matches</Code>, open a fixture, watch the odds trajectory, and commit. On a live fixture
                your call is <strong>ranked</strong>; on a finished one it settles identically but is labelled{' '}
                <strong>Backtest</strong> and never reaches the leaderboard.
              </P>
            ),
          },
          {
            title: 'Settle it — with buttons, not a bot',
            body: (
              <P>
                Settlement is permissionless and every transition is a button in <Code>/portfolio</Code> and{' '}
                <Code>/duels</Code>. On a finished fixture the whole lifecycle unlocks back to back:{' '}
                <Code>prove_entry</Code> → <Code>settle_close</Code> → <Code>settle_outcome</Code>.
              </P>
            ),
          },
        ]}
      />

      <H2 id="run-locally">Run it locally</H2>
      <CodeBlock
        title="program — 22 tests, then deploy"
        code={`anchor build && cargo test -p clv
anchor deploy --provider.cluster devnet`}
      />
      <CodeBlock
        title="app — 38 tests, then run it"
        code={`cd app
npm install
npm test
npm run dev`}
      />
      <P>
        The dev server proxies TxLINE API calls through <Code>/txapi</Code> (see <Code>vite.config.ts</Code>) because
        direct cross-origin calls are CORS-blocked. The production deployment does the same through a rewrite in{' '}
        <Code>vercel.json</Code>.
      </P>

      <H2 id="defaults">Configuration defaults</H2>
      <P>
        All of these live in <Code>app/src/config.ts</Code> and can be overridden with <Code>VITE_*</Code> variables —
        but none are required:
      </P>
      <DocTable
        head={['Key', 'Default', 'What it is']}
        rows={[
          [<Code>api</Code>, <Code>/txapi</Code>, 'TxLINE API, proxied for CORS'],
          [<Code>rpc</Code>, <Code>api.devnet.solana.com</Code>, 'Solana RPC endpoint'],
          [<Code>clvProgram</Code>, <Code>734Z…GmLz</Code>, "Sharpe's settlement program"],
          [<Code>txoracle</Code>, <Code>6pW6…yP2J</Code>, "TxLINE's verifier program"],
        ]}
      />
      <Callout tone="warn" title="Vite inlines every VITE_* value into the bundle">
        Never pass a secret through a <Code>VITE_*</Code> variable — it ships to every visitor in <Code>dist/</Code>.
        This is why Sharpe deliberately has <strong>no shared API token</strong>: each wallet provisions its own on{' '}
        <Code>/onboard</Code>, and credentials live in <Code>localStorage</Code>.
      </Callout>

      <H2 id="requirements">Toolchain, if you're building the program</H2>
      <UL>
        <LI>Rust with the toolchain pinned in <Code>rust-toolchain.toml</Code>, plus the Anchor CLI.</LI>
        <LI>Node 22 for the app (<Code>engines</Code> field in <Code>app/package.json</Code>).</LI>
        <LI>A devnet keypair with SOL for deployment — the program account needed <Code>solana program extend</Code> as it grew.</LI>
      </UL>
    </>
  )
}

function Onboarding() {
  return (
    <>
      <Lead>
        Sharpe ships with <strong>no API token</strong>. A shared token baked into the bundle would ship to every
        visitor and expire in 30 days, taking the demo with it. Instead, each wallet provisions TxLINE's free World Cup
        tier for itself at <Code>/onboard</Code> — no account, no email, one click.
      </Lead>

      <H2 id="before-onboarding">Before you onboard</H2>
      <P>
        Every page that needs TxLINE data renders a <Code>DataGate</Code> prompt instead of a wall of failed requests,
        and the nav shows a <strong>Get data access</strong> link. The API client refuses to make unauthenticated
        calls:
      </P>
      <CodeBlock
        title="app/src/lib/txline.ts"
        code={`const headers = () => {
  const c = getCreds();
  if (!c) throw new Error("not onboarded - visit /onboard to provision the free World Cup tier");
  return { Authorization: \`Bearer \${c.jwt}\`, "X-Api-Token": c.apiToken };
};`}
      />

      <H2 id="four-steps">The four steps</H2>
      <P>Connect a devnet wallet, visit <Code>/onboard</Code>, and four steps run — each a visible chip:</P>
      <Steps
        items={[
          {
            title: 'Guest token',
            body: (
              <P>
                <Code>POST /auth/guest/start</Code> returns a 30-day JWT. No account, no email.
              </P>
            ),
          },
          {
            title: 'Subscribe on-chain',
            body: (
              <P>
                Your wallet signs <Code>subscribe(1, 4)</Code> on TxLINE's program: service level 1 (World Cup data,
                60-second delay), 4 weeks. It costs <strong>0 TxL</strong>, and creates your Token-2022 TxL token
                account if absent. You only pay devnet SOL for the transaction fee.
              </P>
            ),
          },
          {
            title: 'Prove ownership',
            body: (
              <P>
                Your wallet signs the message <Code>{'`${txSig}::${jwt}`'}</Code>. This binds the subscription
                transaction to that specific JWT, so neither can be replayed against the other.
              </P>
            ),
          },
          {
            title: 'Activate',
            body: (
              <P>
                <Code>POST /api/token/activate</Code> with the transaction signature, the wallet signature, and an
                empty league list returns your personal API token.
              </P>
            ),
          },
        ]}
      />
      <P>
        Both credentials land in <Code>localStorage</Code>, keyed by wallet address. Switching wallets loads a
        different set. From then on every data call carries both headers: <Code>Authorization: Bearer &lt;jwt&gt;</Code>{' '}
        and <Code>X-Api-Token: &lt;token&gt;</Code>.
      </P>

      <H2 id="devnet-usdt">Getting devnet USDT for duels</H2>
      <P>
        The onboarding page has a <strong>Get devnet USDT</strong> button. It calls TxLINE's own{' '}
        <Code>request_devnet_faucet</Code> instruction and mints you <strong>100 USDT</strong> — the stake token for{' '}
        <DocLink to="/docs/duels">prop duels</DocLink>.
      </P>
      <Callout tone="warn" title="Never TxL">
        The TxLINE credit token (TxL) is locked to its program for data access and cannot be transferred between
        users. Duels are staked in <strong>devnet USDT</strong>, a classic SPL token at{' '}
        <Code>ELWT…2Ujh</Code>. Do not conflate the two.
      </Callout>

      <H2 id="traps">Two traps worth knowing</H2>
      <UL>
        <LI>
          <Code>activate</Code> returns <Code>text/plain</Code>, not JSON. Every other endpoint returns JSON, so
          calling <Code>res.json()</Code> on it fails in a way that looks like a network error.
        </LI>
        <LI>
          <Code>subscribe</Code> is not in the trimmed txoracle IDL vendored for CPI. It,{' '}
          <Code>request_devnet_faucet</Code> and <Code>validate_fixture</Code> live in the full 28-instruction IDL at{' '}
          <Code>app/src/chain/idl/txoracle-full.json</Code>.
        </LI>
      </UL>

      <H2 id="expiry">When the JWT expires</H2>
      <P>
        The guest JWT lasts 30 days. When it lapses, visit <Code>/onboard</Code> again — re-provisioning is free and
        takes one click. Nothing on-chain is lost; your predictions and duels are accounts on Solana and independent of
        your data credentials.
      </P>
    </>
  )
}

export const GETTING_STARTED: DocPage[] = [
  {
    slug: 'overview',
    group: 'Getting started',
    title: 'Overview',
    description: 'What Sharpe is, the number it scores you on, and the three actors involved.',
    body: Overview,
  },
  {
    slug: 'quickstart',
    group: 'Getting started',
    title: 'Quickstart',
    description: 'Use the live devnet app or run the program and frontend locally — no .env required.',
    body: Quickstart,
  },
  {
    slug: 'onboarding',
    group: 'Getting started',
    title: 'Onboarding',
    description: 'Provision your own free TxLINE World Cup data tier, per wallet, in one click.',
    body: Onboarding,
  },
]
