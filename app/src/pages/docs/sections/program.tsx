/* eslint-disable react-refresh/only-export-components -- content registry: these files export page data, and their body components are only reachable through it */
import { Callout, Code, CodeBlock, DocLink, DocTable, H2, LI, Lead, P, UL } from '../prose'
import type { DocPage } from '../registry'

function Architecture() {
  return (
    <>
      <Lead>
        Sharpe is a browser client and a Solana program. <strong>There is no backend and no keeper.</strong> Data
        flows one way — API, then pure functions, then chain, then UI — and everything provable is proven.
      </Lead>

      <H2 id="what-runs-where">What runs where</H2>
      <CodeBlock
        title="the system, top to bottom"
        code={`TxLINE API (https://txline-dev.txodds.com)
  auth, fixtures, odds, scores, SSE streams, /validation endpoints
        |
        v
app/  (React 19, Vite 8, Tailwind v4)
  lib/txline.ts     typed REST + SSE client, sends both auth headers
  lib/auth.ts       per-wallet onboarding, faucet
  lib/codec.ts      API JSON -> on-chain types (the fragile boundary)
  lib/domain.ts     market model, implied probability, odds selection
  feed/             one FeedSource, two implementations (live, replay)
  chain/program.ts  connection, program handles, PDA derivation
  chain/actions.ts  transaction builders and read-only .view() calls
  pages/            Onboard, Matches, MatchDetail, Duels, Portfolio, Leaderboard
  components/VerifyModal.tsx
        |
        | CPI (declare_program!) and read-only .view()
        v
clv program (734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz)
        |
        v
txoracle (6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J)
  validate_fixture / validate_odds / validate_stat
  daily_batch_roots / daily_scores_roots / ten_daily_fixtures_roots`}
      />

      <H2 id="why-a-program">Why a program, not just .view()</H2>
      <P>
        A <Code>.view()</Code> call gives the UI an instant read-only check, but it stores nothing and settles
        nothing. The <Code>clv</Code> program locks the entry line, records the proven CLV, and escrows duel stakes —
        with each step gated by a CPI into a verifier. Thirteen instructions, no admin key on any money path, at most
        one verifier CPI per instruction.
      </P>

      <H2 id="determinism">Determinism</H2>
      <P>
        Settlement is a pure function of the published Merkle root and the terms fixed when the bet was made.{' '}
        <Code>derive_terms(...)</Code> runs once, at open, and its output is stored. Settlement replays it. The caller
        supplies proven stats and Merkle branches, and <strong>chooses nothing</strong>.
      </P>

      <H2 id="deployment">Deployment</H2>
      <UL>
        <LI>
          The app is a static Vite build on Vercel, project root <Code>app/</Code>, with a rewrite sending every path
          to <Code>index.html</Code> because the router uses history mode.
        </LI>
        <LI>
          Vite inlines every <Code>VITE_*</Code> variable into the bundle at build time, so no secret may be passed
          that way. The only variables are the API host, the RPC URL, and two program ids — all with defaults in{' '}
          <Code>app/src/config.ts</Code>.
        </LI>
        <LI>
          TxLINE API calls are proxied through <Code>/txapi</Code> (Vite dev proxy locally, a Vercel rewrite in
          production) because direct cross-origin calls are CORS-blocked.
        </LI>
      </UL>

      <H2 id="repo-layout">Repository layout</H2>
      <CodeBlock
        title="where to look"
        code={`programs/clv/src/
  market.rs                    market model, bind_odds, the line parser
  instructions/
    prove_fixture.rs           the proven kickoff every guard depends on
    open_prediction.rs         the commitment; no CPI; \`ranked\`
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
  components/VerifyModal.tsx   four live .view() calls into TxLINE`}
      />
    </>
  )
}

function Instructions() {
  return (
    <>
      <Lead>
        Thirteen instructions. <strong>No admin key on any money path.</strong> At most one verifier CPI per
        instruction — for transaction size and a legible state machine, not compute.
      </Lead>

      <H2 id="prediction-path">The prediction path</H2>
      <DocTable
        head={['Instruction', 'CPI', 'Writes']}
        rows={[
          [<Code>initialize_config</Code>, '—', 'the config account, once'],
          [<Code>prove_fixture</Code>, <Code>validate_fixture</Code>, <><Code>FixtureFacts</Code> — write-once kickoff</>],
          [<Code>open_prediction</Code>, 'none', 'the commitment: terms, entry_ts, msg hash, ranked'],
          [<Code>prove_entry</Code>, <Code>validate_odds</Code>, <Code>entry_prob_bps</Code>],
          [<Code>settle_close</Code>, <Code>validate_odds</Code>, <Code>clv_bps</Code>],
          [<Code>settle_outcome</Code>, <Code>validate_stat</Code>, <Code>outcome_win</Code>],
          [<Code>void_prediction</Code>, 'none', 'closes the account, rent to predictor'],
        ]}
      />

      <H2 id="duel-path">The duel path</H2>
      <DocTable
        head={['Instruction', 'CPI', 'Effect']}
        rows={[
          [<Code>create_duel</Code>, 'none', <>escrow creator's stake; <Code>expires_at</Code> = proven kickoff</>],
          [<Code>join_duel</Code>, 'none', 'escrow taker stake; refused past expires_at'],
          [<Code>resolve_duel</Code>, <Code>validate_stat</Code>, <><Code>outcome_true</Code> — moves no funds</>],
          [<Code>claim_duel</Code>, 'none', 'pay both stakes to the winner, close the vault'],
          [<Code>cancel_duel</Code>, 'none', 'unmatched: refund creator'],
          [<Code>refund_duel</Code>, 'none', 'matched but never provable: refund both, kickoff + 7d'],
        ]}
      />

      <H2 id="accounts-per-ix">Accounts, instruction by instruction</H2>
      <CodeBlock
        title="the full instruction surface"
        code={`initialize_config   admin, config, system_program
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
                    taker_token_account, stake_mint, token_program`}
      />
      <P>
        Note what <Code>open_prediction</Code>'s list does <em>not</em> contain: no <Code>txoracle_program</Code>, no
        roots account. It performs no CPI — see{' '}
        <DocLink to="/docs/predictions">Predictions</DocLink> for why the entry proof is deferred.
      </P>

      <H2 id="cpi-wiring">CPI wiring</H2>
      <P>
        CPIs use <Code>declare_program!</Code> against the vendored txoracle IDL. Both odds/stat verifiers declare a{' '}
        <Code>bool</Code> return, so Anchor yields it directly:
      </P>
      <CodeBlock
        title="programs/clv"
        code={`let ok: bool = txoracle::cpi::validate_odds(ctx, ts, odds, summary, sub, main)?.get();`}
      />
      <Callout tone="warn" title="The published IDL is trimmed">
        TxLINE's published IDL contains only the two verifiers. <Code>subscribe</Code>,{' '}
        <Code>request_devnet_faucet</Code>, <Code>validate_fixture</Code> and 23 others exist on-chain but are absent
        from it. The full 28-instruction IDL is vendored at <Code>idls/txoracle-full.json</Code> and{' '}
        <Code>app/src/chain/idl/txoracle-full.json</Code>. Keep the trimmed one for <Code>declare_program!</Code>.
      </Callout>

      <H2 id="binary-size">Binary size</H2>
      <P>
        <Code>anchor-spl</Code>'s default features add about 140&nbsp;KB to the program binary. Sharpe trims to{' '}
        <Code>["token", "token_2022", "mint"]</Code> — <Code>token_2022</Code> cannot be dropped because Anchor's{' '}
        <Code>token::</Code> constraints expand to <Code>anchor_spl::token_interface</Code>. The program account still
        needed <Code>solana program extend</Code> twice as it grew.
      </P>
    </>
  )
}

function Accounts() {
  return (
    <>
      <Lead>
        Four account types on Sharpe's side — <Code>Config</Code>, <Code>FixtureFacts</Code>,{' '}
        <Code>Prediction</Code> and <Code>Duel</Code> (plus its vault) — and three roots accounts on TxLINE's side
        that the proofs verify against.
      </Lead>

      <H2 id="state">State</H2>
      <CodeBlock
        title="programs/clv/src — the core accounts"
        code={`#[account] pub struct Config {
    pub admin: Pubkey, pub txoracle_program: Pubkey,
    pub prediction_count: u64, pub bump: u8,
}

#[account] pub struct FixtureFacts {   // ["fixture", fixture_id le], write-once
    pub fixture_id: i64,
    pub start_time: i64,               // the proven kickoff
    pub participant1_id: i32, pub participant2_id: i32,
    pub competition_id: i32, pub proven_at: i64, pub bump: u8,
}

#[account] pub struct Prediction {     // ["prediction", predictor, id le]
    pub predictor: Pubkey, pub id: u64, pub fixture_id: i64,
    pub market: MarketKind, pub family: StatFamily,
    pub period: u16, pub selection: u8, pub line_x10: i16,
    // the settlement question, derived once at open and stored
    pub stat_a_key: u32, pub stat_b_key: u32, pub has_stat_b: bool,
    pub op_add: bool, pub comparison: u8, pub threshold: i32,
    // entry
    pub entry_ts: i64, pub entry_msg_hash: [u8; 32], pub entry_prob_bps: u32,
    pub ranked: bool,
    // close and result
    pub close_ts: i64, pub close_prob_bps: u32,
    pub clv_bps: i32, pub outcome_win: bool,
    pub status: PredStatus,            // Open | EntryProven | Closed | Settled | Void
    pub created_at: i64, pub settled_at: i64, pub bump: u8,
}`}
      />
      <P>
        The <Code>Duel</Code> account lives at <Code>["duel", fixture_id le, duel_id le]</Code> with a vault token
        account at <Code>["duel_vault", duel]</Code> whose authority is the duel account itself.
      </P>

      <H2 id="pdas">Program-derived addresses</H2>
      <DocTable
        head={['Account', 'Seeds', 'Program', 'Notes']}
        rows={[
          [<Code>config</Code>, <Code>["config"]</Code>, 'clv', ''],
          [<Code>fixture_facts</Code>, <Code>["fixture", fixture_id le]</Code>, 'clv', 'write-once'],
          [<Code>prediction</Code>, <Code>["prediction", predictor, id le]</Code>, 'clv', ''],
          [<Code>duel</Code>, <Code>["duel", fixture_id le, duel_id le]</Code>, 'clv', ''],
          [<Code>duel_vault</Code>, <Code>["duel_vault", duel]</Code>, 'clv', 'token account'],
          [<Code>daily odds roots</Code>, <Code>["daily_batch_roots", epochDay u16 le]</Code>, 'txoracle', <>not <Code>daily_odds_roots</Code></>],
          [<Code>daily scores roots</Code>, <Code>["daily_scores_roots", epochDay u16 le]</Code>, 'txoracle', ''],
          [<Code>fixtures roots</Code>, <Code>["ten_daily_fixtures_roots", floor(epochDay/10)*10]</Code>, 'txoracle', '10-day buckets'],
          [<Code>faucet tracker</Code>, <Code>["faucet_tracker", user]</Code>, 'txoracle', 'not in the IDL'],
          [<Code>usdt treasury</Code>, <Code>["usdt_treasury"]</Code>, 'txoracle', 'not in the IDL'],
        ]}
        firstColBold={false}
      />

      <Callout tone="warn" title="Older accounts do not decode">
        Five 121-byte <Code>Prediction</Code> accounts on devnet predate the current layout and share the
        discriminator. <Code>program.account.prediction.all()</Code> throws on them, so the app decodes one account at
        a time and skips what it cannot read.
      </Callout>
    </>
  )
}

function Errors() {
  return (
    <>
      <Lead>
        A Merkle proof says a record is authentic. It says <strong>nothing</strong> about which market the record
        prices, when it was quoted, or whether it is the record you committed to.{' '}
        <Code>market.rs::bind_odds</Code> and the instruction guards close that gap — each rejection has a name.
      </Lead>

      <H2 id="the-guards">The settlement guards</H2>
      <DocTable
        head={['What it stops', 'Error']}
        rows={[
          [<>an authentic <Code>half=1</Code> line proving a full-match bet</>, <Code>MarketPeriodMismatch</Code>],
          [<>a totals quote settling a 1X2 bet</>, <Code>MarketTypeMismatch</Code>],
          [<>an entry line quoted after the proven kickoff</>, <Code>EntryAfterKickoff</Code>],
          [<>an in-play quote posing as a closing line</>, <Code>LineIsInPlay</Code>],
          [<>a closing quote timestamped after kickoff</>, <Code>CloseAfterKickoff</Code>],
          [<>right timestamp, wrong quote</>, <Code>EntryRecordMismatch</Code>],
          [<>an authentic quote from another timestamp</>, <Code>TimestampMismatch</Code>],
          [<>a home selection proven at the draw price index</>, <Code>PriceNameMismatch</Code>],
          [<>an Over 3.5 quote settling an Over 2.5 bet</>, <Code>LineMismatch</Code>],
          [<>a corners market opened as a CLV prediction</>, <Code>MarketHasNoOddsLine</Code>],
          [<>a quarter or whole line, which has no yes/no answer</>, <Code>UnsupportedLine</Code>],
          [<>proving a stat other than the one stored at open</>, <Code>StatKeyMismatch</Code>],
          [<>supplying a second stat the terms never asked for</>, <Code>UnexpectedSecondStat</Code>],
          [<>creating or joining a duel after the proven kickoff</>, <Code>DuelExpired</Code>],
          [<>taking your own duel</>, <Code>SelfDuel</Code>],
        ]}
        firstColBold={false}
      />
      <P>
        All are declared in <Code>programs/clv/src/error.rs</Code> and enforced in{' '}
        <Code>programs/clv/src/market.rs</Code> and <Code>programs/clv/src/instructions/</Code>. The full lifecycle —
        and each of these rejections — was exercised on devnet against live roots on fixture <Code>18172379</Code>.
      </P>

      <H2 id="why-bind-odds">Why bind_odds exists</H2>
      <P>At one instant, on one fixture, the devnet feed carries all of:</P>
      <CodeBlock
        title="four authentic records, one valid settlement"
        code={`1X2_PARTICIPANT_RESULT           MarketPeriod=null       <- full match
1X2_PARTICIPANT_RESULT           MarketPeriod=half=1     <- FIRST HALF, same market type
OVERUNDER_PARTICIPANT_GOALS      MarketParameters=line=0.75
ASIANHANDICAP_PARTICIPANT_GOALS  MarketParameters=line=-1.75`}
      />
      <P>
        All four are real. All four pass <Code>validate_odds</Code>. Only one prices a full-match 1X2 bet. So before
        any verifier CPI fires, <Code>bind_odds</Code> requires the record's market type, period, line and price name
        to match the terms stored at open:
      </P>
      <CodeBlock
        title="programs/clv/src/market.rs"
        code={`require!(odds.super_odds_type == expected_super_odds_type(market),  MarketTypeMismatch);
require!(odds.market_period.as_deref() == expected_market_period(period), MarketPeriodMismatch);
// TotalsOu: parse \`line=2.5\` and require it equals line_x10
require!(odds.price_names[idx] == expected_price_name(market, selection), PriceNameMismatch);`}
      />

      <H2 id="proof-errors">Errors from TxLINE's side</H2>
      <P>
        A record that is reformatted before proving — renamed keys, re-encoded bytes, re-serialised JSON — hashes to a
        different leaf and yields <Code>InvalidSubTreeProof</Code> from the verifier, an error that surfaces far from
        its cause. Always prove the record <strong>verbatim</strong> from the <Code>/validation</Code> response. This
        is why the <DocLink to="/docs/txline-api">codec boundary</DocLink> has 16 golden-vector tests.
      </P>
    </>
  )
}

export const PROGRAM: DocPage[] = [
  {
    slug: 'architecture',
    group: 'On-chain program',
    title: 'Architecture',
    description: 'What runs where: a browser client, a settlement program, and TxLINE’s verifiers. No backend.',
    body: Architecture,
  },
  {
    slug: 'instructions',
    group: 'On-chain program',
    title: 'Instructions',
    description: 'All 13 instructions, their CPIs, their accounts, and the trimmed-IDL trap.',
    body: Instructions,
  },
  {
    slug: 'accounts',
    group: 'On-chain program',
    title: 'Accounts & PDAs',
    description: 'Config, FixtureFacts, Prediction, Duel — layouts and every seed derivation.',
    body: Accounts,
  },
  {
    slug: 'errors',
    group: 'On-chain program',
    title: 'Errors & guards',
    description: 'Every named rejection, what attack or mistake it stops, and why bind_odds exists.',
    body: Errors,
  },
]
