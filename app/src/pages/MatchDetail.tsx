import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { oddsTrajectory, finalResult, probPct, isFinalised } from '../lib/domain'
import { useFixtures } from '../state/fixtures'
import { useFixtureFeed } from '../state/feed'
import { Card } from '../components/ui'
import Icon from '../components/Icon'
import Flag from '../components/Flag'
import { Skeleton } from '../components/Skeleton'
import OddsChart from '../components/OddsChart'
import Ticket from '../components/Ticket'

export default function MatchDetail() {
  const { id } = useParams()
  const fixtureId = Number(id)

  // Resolves from the snapshot, the demo set, or `/fixtures/validation` for a match
  // the snapshot has already dropped. Without this, every finished fixture 404s here.
  const { byId, isLoading: fixturesLoading } = useFixtures([fixtureId])
  const fixture = byId.get(fixtureId)

  const start = fixture ? Number(fixture.StartTime) : 0
  const { data: traj = [], isLoading: trajLoading } = useQuery({
    queryKey: ['traj', fixtureId], enabled: !!fixture, queryFn: () => oddsTrajectory(fixtureId, start),
  })
  const { data: result } = useQuery({
    queryKey: ['result', fixtureId], enabled: !!fixture, retry: 0, queryFn: () => finalResult(fixtureId),
  })

  // Ingest from whichever source is active: the SSE stream, or an accelerated
  // replay of this fixture's archived records. Both carry provable records.
  const { odds: liveOdds, scores: liveScores, mode } = useFixtureFeed(fixture ? fixtureId : null, start || null)
  const latest = liveOdds.filter((o: any) => o.SuperOddsType === '1X2_PARTICIPANT_RESULT' && o.MarketPeriod == null).at(-1)
  const finalised = isFinalised(liveScores)

  if (!fixture) {
    if (fixturesLoading) return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-2/3 rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
    return (
      <Card className="p-12 text-center max-w-lg mx-auto">
        <Icon icon="lucide:search-x" className="text-4xl text-slate-300" />
        <h1 className="text-2xl font-display font-extrabold text-[#1E3A5F] mt-3">Match not found</h1>
        <p className="text-slate-500 mt-2">Fixture #{fixtureId} isn't in this dataset.</p>
        <Link to="/matches" className="mt-5 inline-flex items-center gap-1.5 font-bold text-[#FF6B35] hover:underline">
          <Icon icon="lucide:arrow-left" className="text-sm" aria-hidden /> Back to matches
        </Link>
      </Card>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 reveal">
        <div>
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            <Link to="/matches" className="hover:text-[#1E3A5F] transition-colors">Matches</Link>
            <Icon icon="lucide:chevron-right" />
            <span className="text-[#1E3A5F] font-num normal-case tracking-normal">{fixture.Competition} · #{fixtureId}</span>
          </nav>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold text-[#1E3A5F] leading-[1.03]">
            <span className="inline-flex items-center gap-3">
              <Flag name={fixture.Participant1} className="text-3xl md:text-5xl" />
              {fixture.Participant1}
            </span>
            <br />
            <span className="text-slate-300 text-2xl md:text-3xl align-middle">vs</span>{' '}
            <span className="inline-flex items-center gap-3">
              <Flag name={fixture.Participant2} className="text-3xl md:text-5xl" />
              {fixture.Participant2}
            </span>
          </h1>
        </div>
        {result ? (
          <Card className="px-6 py-4 text-right shrink-0">
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1.5 justify-end">
              <Icon icon="lucide:shield-check" /> Final · proven via validate_stat
            </div>
            <div className="text-5xl font-display font-extrabold text-[#1E3A5F] tabular leading-none">
              {result.p1}<span className="text-slate-300 mx-2">–</span>{result.p2}
            </div>
          </Card>
        ) : (
          <div className="flex items-center gap-2 text-emerald-500 font-bold shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> PROVABLE
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Analysis */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="p-6 reveal" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-lg bg-[#1E3A5F] text-white text-[11px] font-bold uppercase tracking-wide">Odds Trend</span>
                <span className="text-sm font-medium text-slate-500">Consensus implied probability — pre-match</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <Legend swatch="#1E3A5F" label="Home" />
                <Legend swatch="#94a3b8" label="Draw" />
                <Legend swatch="#FF6B35" label="Away" />
              </div>
            </div>
            <div className="text-xs text-slate-400 mb-3">TxLINE StablePrice 1X2, de-margined. This is the line you're proving against.</div>

            {/* Ingest indicator — proves the feed is actually flowing. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 px-3 py-2.5 rounded-xl bg-[#F8F7F5] text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-widest text-[10px] text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${liveOdds.length ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                {mode} feed
              </span>
              <span className="text-slate-500 font-num">{liveOdds.length} odds · {liveScores.length} score updates</span>
              {latest && (
                <span className="text-slate-500 font-num">
                  now <b className="text-[#1E3A5F]">{probPct(latest.Prices[0]).toFixed(1)}%</b> /
                  <b className="text-[#1E3A5F]"> {probPct(latest.Prices[1]).toFixed(1)}%</b> /
                  <b className="text-[#1E3A5F]"> {probPct(latest.Prices[2]).toFixed(1)}%</b>
                </span>
              )}
              {finalised && <span className="text-emerald-600 font-bold">full time</span>}
            </div>
            {trajLoading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : traj.length === 0 ? (
              <div className="h-72 grid place-items-center text-center text-slate-400 text-sm">
                No pre-match odds available for this fixture yet.
              </div>
            ) : (
              <OddsChart data={traj} />
            )}
          </Card>

          {/* Proof story / timeline */}
          <section className="reveal" style={{ animationDelay: '160ms' }}>
            <div className="flex items-center gap-4 mb-4">
              <span className="font-num text-sm font-bold text-[#FF6B35]/60">RX</span>
              <h3 className="text-xl font-display font-extrabold text-[#1E3A5F]">How your CLV gets proven</h3>
              <div className="line-divider flex-1" />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Step n="1" icon="lucide:lock" title="Lock the entry line" body="open_prediction CPIs validate_odds — your opening implied probability is committed on-chain." />
              <Step n="2" icon="lucide:flag" title="Settle the close" body="settle_close proves the last pre-kickoff price, then computes CLV = close − entry." />
              <Step n="3" icon="lucide:shield-check" title="Settle the result" body="settle_outcome CPIs validate_stat against the final score. No admin can alter it." />
            </div>
          </section>
        </div>

        {/* Ticket */}
        <div className="lg:col-span-4 reveal" style={{ animationDelay: '120ms' }}>
          <div className="lg:sticky lg:top-24"><Ticket fixture={fixture} /></div>
        </div>
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] rounded-full" style={{ background: swatch }} />{label}</span>
}

function Step({ n, icon, title, body }: { n: string; icon: string; title: string; body: string }) {
  return (
    <Card className="p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
          <Icon icon={icon} className="text-[#FF6B35]" />
        </div>
        <span className="font-display font-extrabold text-2xl text-slate-200">{n}</span>
      </div>
      <div className="font-bold text-[#1E3A5F] text-sm mb-1">{title}</div>
      <div className="text-xs text-slate-500 leading-relaxed">{body}</div>
    </Card>
  )
}
