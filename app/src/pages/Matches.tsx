import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { txline } from '../lib/txline'
import { CFG, DEMO_FIXTURE_META } from '../config'
import { Card, Badge } from '../components/ui'
import Icon from '../components/Icon'

function fmt(ts: number) { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

function FixtureCard({ f, i }: { f: any; i: number }) {
  const hasData = CFG.demoFixtures.includes(f.FixtureId)
  const finished = Number(f.StartTime) < Date.now()
  return (
    <Link to={`/match/${f.FixtureId}`} className="block group">
      <Card hover style={{ animationDelay: `${i * 70}ms` }} className={`reveal p-6 h-full relative ${hasData ? 'proof-shimmer' : ''}`}>
        <div className="flex items-start justify-between mb-6">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">{f.Competition}</span>
          {hasData && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#FF6B35]/10 group-hover:bg-[#FF6B35]/15 transition-colors">
              <Icon icon="lucide:shield-check" className="text-[#FF6B35] text-lg" />
            </span>
          )}
        </div>
        <div className="space-y-1 mb-6">
          <div className="text-2xl font-display font-extrabold text-[#1E3A5F] leading-tight">{f.Participant1}</div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="h-px w-4 bg-slate-200" /><span className="text-[11px] font-bold uppercase tracking-widest">vs</span>
          </div>
          <div className="text-2xl font-display font-extrabold text-[#1E3A5F] leading-tight">{f.Participant2}</div>
        </div>
        <div className="flex items-end justify-between pt-4 border-t border-slate-100">
          <div className="font-num text-xs text-slate-500 font-medium">{fmt(Number(f.StartTime))}</div>
          {hasData ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#FF6B35] uppercase tracking-wider">
              <Icon icon="lucide:check-circle" className="text-sm" /> Provable
              <Icon icon="lucide:arrow-right" className="text-sm opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </span>
          ) : finished ? <Badge tone="muted">Finished</Badge> : <Badge tone="amber">Upcoming</Badge>}
        </div>
      </Card>
    </Link>
  )
}

export default function Matches() {
  const { data: fixtures = [], isLoading, error } = useQuery({ queryKey: ['fixtures'], queryFn: txline.fixtures })
  const now = Date.now()
  const withData = DEMO_FIXTURE_META
  const finished = fixtures.filter((f: any) => Number(f.StartTime) < now && !CFG.demoFixtures.includes(f.FixtureId)).sort((a: any, b: any) => Number(b.StartTime) - Number(a.StartTime))
  const upcoming = fixtures.filter((f: any) => Number(f.StartTime) >= now).sort((a: any, b: any) => Number(a.StartTime) - Number(b.StartTime))

  let n = 0
  return (
    <div>
      {/* Header */}
      <section className="mb-12 md:mb-16 reveal">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white shadow-sm text-[11px] font-bold text-slate-500 mb-6">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse"></span>
          <span className="font-num tracking-wide">TxLINE DEVNET · 2026 WORLD CUP</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.05]">
          Pick a match.
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed max-w-2xl">
          Matches tagged <span className="font-bold text-[#FF6B35]">Provable</span> have full devnet data — open one to
          lock the opening line and settle your Closing Line Value on-chain.
        </p>
      </section>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <Icon icon="lucide:triangle-alert" /> Couldn't reach TxLINE ({String((error as any).message)}). Check the data token in .env.local.
        </div>
      )}
      {isLoading && <p className="text-slate-400">Loading fixtures…</p>}

      <div className="space-y-16" id="provable">
        {withData.length > 0 && (
          <Section index={++n} title="Provable now" badge="Data live" caption="Finished matches with full devnet data">
            {withData.map((f: any, i: number) => <FixtureCard key={f.FixtureId} f={f} i={i} />)}
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section index={++n} title="Upcoming">
            {upcoming.map((f: any, i: number) => <FixtureCard key={f.FixtureId} f={f} i={i} />)}
          </Section>
        )}
        {finished.length > 0 && (
          <Section index={++n} title="Other finished">
            {finished.map((f: any, i: number) => <FixtureCard key={f.FixtureId} f={f} i={i} />)}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ index, title, badge, caption, children }: { index: number; title: string; badge?: string; caption?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="font-num text-sm font-bold text-[#FF6B35]/60">{String(index).padStart(2, '0')}</span>
          <h2 className="text-2xl md:text-3xl font-display font-extrabold text-[#1E3A5F]">{title}</h2>
          {badge && <Badge tone="accent">{badge}</Badge>}
        </div>
        {caption && <p className="text-sm text-slate-400">{caption}</p>}
      </div>
      <div className="line-divider mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{children}</div>
    </section>
  )
}
