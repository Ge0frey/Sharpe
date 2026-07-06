import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { txline } from '../lib/txline'
import { DEMO_FIXTURE_META } from '../config'
import { oddsTrajectory, finalResult } from '../lib/domain'
import { Card } from '../components/ui'
import Icon from '../components/Icon'
import OddsChart from '../components/OddsChart'
import Ticket from '../components/Ticket'

export default function MatchDetail() {
  const { id } = useParams()
  const fixtureId = Number(id)

  const { data: fixtures = [] } = useQuery({ queryKey: ['fixtures'], queryFn: txline.fixtures })
  const fixture = fixtures.find((f: any) => f.FixtureId === fixtureId) ?? DEMO_FIXTURE_META.find((f) => f.FixtureId === fixtureId)

  const start = fixture ? Number(fixture.StartTime) : 0
  const { data: traj = [], isLoading: trajLoading } = useQuery({
    queryKey: ['traj', fixtureId], enabled: !!fixture, queryFn: () => oddsTrajectory(fixtureId, start),
  })
  const { data: result } = useQuery({
    queryKey: ['result', fixtureId], enabled: !!fixture, retry: 0, queryFn: () => finalResult(fixtureId),
  })

  if (!fixture) return <p className="text-slate-400">Loading match…</p>

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 reveal">
        <div>
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            <Link to="/" className="hover:text-[#1E3A5F] transition-colors">Matches</Link>
            <Icon icon="lucide:chevron-right" />
            <span className="text-[#1E3A5F] font-num normal-case tracking-normal">{fixture.Competition} · #{fixtureId}</span>
          </nav>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold text-[#1E3A5F] leading-[1.03]">
            {fixture.Participant1}<br />
            <span className="text-slate-300 text-2xl md:text-3xl align-middle">vs</span> {fixture.Participant2}
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
            <div className="text-xs text-slate-400 mb-4">TxLINE StablePrice 1X2, de-margined. This is the line you're proving against.</div>
            {trajLoading
              ? <div className="h-72 grid place-items-center text-slate-400 text-sm">Building trajectory…</div>
              : <OddsChart data={traj} />}
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
