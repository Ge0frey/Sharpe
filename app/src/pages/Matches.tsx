import { Link } from 'react-router-dom'
import { DEMO_FIXTURE_META } from '../config'
import { useFixtures, useProvenFixtureIds, type FixtureMeta } from '../state/fixtures'
import { Card, Badge } from '../components/ui'
import Icon from '../components/Icon'
import Flag from '../components/Flag'
import { FixtureCardSkeleton } from '../components/Skeleton'

function fmt(ts: number) { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

function FixtureCard({ f, i, hasData = false }: { f: any; i: number; hasData?: boolean }) {
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
          <div className="flex items-center gap-2.5">
            <Flag name={f.Participant1} className="text-2xl" />
            <span className="text-2xl font-display font-extrabold text-[#1E3A5F] leading-tight">{f.Participant1}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 pl-0.5">
            <span className="h-px w-4 bg-slate-200" /><span className="text-[11px] font-bold uppercase tracking-widest">vs</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Flag name={f.Participant2} className="text-2xl" />
            <span className="text-2xl font-display font-extrabold text-[#1E3A5F] leading-tight">{f.Participant2}</span>
          </div>
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
  // The program is the index of provable matches. Any fixture with a proven kickoff
  // stays browsable forever, long after `/fixtures/snapshot` has dropped it.
  const provenIds = useProvenFixtureIds()
  const { byId, rows, isLoading, error } = useFixtures(provenIds)
  const now = Date.now()

  // A match is "provable now" if it has finished AND its kickoff is proven on-chain
  // (or it is one of the hardcoded demo fixtures).
  const provableIds = new Set<number>([...provenIds, ...DEMO_FIXTURE_META.map((f) => f.FixtureId)])
  const withData = [...provableIds]
    .map((id) => byId.get(id))
    .filter((f): f is FixtureMeta => !!f && Number(f.StartTime) < now)
    .sort((a, b) => Number(b.StartTime) - Number(a.StartTime))

  const upcoming = rows
    .filter((f: any) => Number(f.StartTime) >= now)
    .sort((a: any, b: any) => Number(a.StartTime) - Number(b.StartTime))
  const finished = rows
    .filter((f: any) => Number(f.StartTime) < now && !provableIds.has(Number(f.FixtureId)))
    .sort((a: any, b: any) => Number(b.StartTime) - Number(a.StartTime))

  let n = 0
  return (
    <div>
      {/* Header */}
      <section className="mb-12 md:mb-16 reveal">
        <span className="block font-num text-[11px] font-bold tracking-wide text-slate-500 mb-6">TxLINE DEVNET · 2026 WORLD CUP</span>
        <h1 className="text-4xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.05]">
          Pick a match.
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed max-w-2xl">
          Matches tagged <span className="font-bold text-[#FF6B35]">Provable</span> have a kickoff proven on-chain. Open one
          to commit to a line and settle your Closing Line Value against Merkle proofs.
        </p>
      </section>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <Icon icon="lucide:triangle-alert" /> Couldn't reach TxLINE ({String((error as any).message)}). Check the data token in .env.local.
        </div>
      )}
      <div className="space-y-16" id="provable">
        {withData.length > 0 && (
          <Section index={++n} title="Provable now" badge="Data live" caption="Finished matches with a kickoff proven on-chain">
            {withData.map((f: any, i: number) => <FixtureCard key={f.FixtureId} f={f} i={i} hasData />)}
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section index={++n} title="Upcoming">
            {upcoming.map((f: any, i: number) => (
              <FixtureCard key={f.FixtureId} f={f} i={i} hasData={provableIds.has(Number(f.FixtureId))} />
            ))}
          </Section>
        )}
        {finished.length > 0 && (
          <Section index={++n} title="Other finished">
            {finished.map((f: any, i: number) => <FixtureCard key={f.FixtureId} f={f} i={i} />)}
          </Section>
        )}
        {isLoading && (
          <section aria-busy="true">
            <div className="line-divider mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => <FixtureCardSkeleton key={i} />)}
            </div>
          </section>
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
