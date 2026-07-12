import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useClv } from '../state/useClv'
import { txline } from '../lib/txline'
import { pickArchivedAt, finalStat, marketFromAccount, probPct } from '../lib/domain'
import { verifyFixture, verifyOdds, verifyStat } from '../chain/actions'
import { Badge, Shield } from './ui'
import Icon from './Icon'
import Flag from './Flag'
import { CountUp } from './motion'

/**
 * Roots arrive base64 from /odds and /scores but as a JSON byte array from
 * /fixtures. Decode both, or the fixtures root renders as the hex of its own
 * base64 characters.
 */
const trunc = (root: number[] | string | undefined) => {
  if (!root) return ''
  const b = Array.isArray(root) ? Buffer.from(root) : Buffer.from(root, 'base64')
  return '0x' + b.subarray(0, 6).toString('hex') + '…'
}

export default function VerifyModal({ pred, fixture, onClose }: { pred: any; fixture: any; onClose: () => void }) {
  const { txo } = useClv()
  const fixtureId = Number(pred.fixtureId)
  // Rebuilt from market + period + selection + line, never from `selection` alone:
  // that would mislabel every Totals bet and look up the wrong odds record.
  const market = marketFromAccount(pred)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')
      if (!nodes || nodes.length === 0) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); trigger?.focus?.() }
  }, [onClose])

  // The fixture proof is not decoration: `entry_ts < start_time`, `close_ts <= start_time`
  // and `ranked` are all measured against the kickoff this proof commits.
  const fixtureProof = useQuery({
    queryKey: ['verify-fixture', fixtureId], retry: 0, queryFn: async () => {
      const val: any = await txline.fixtureValidation(fixtureId)
      return { ok: await verifyFixture(txo, val), start: Number(val.snapshot.StartTime), root: val.summary.updateSubTreeRoot }
    },
  })
  const entry = useQuery({
    queryKey: ['verify-entry', pred.pubkey], retry: 0, queryFn: async () => {
      const rec = await pickArchivedAt(fixtureId, Number(pred.entryTs), market)
      if (!rec) throw new Error('entry record not found')
      const val = await txline.oddsValidation(rec.MessageId, rec.Ts)
      return { ok: await verifyOdds(txo, val), pct: probPct(val.odds.Prices[market.priceIndex]), root: val.summary.oddsSubTreeRoot }
    },
  })
  const close = useQuery({
    queryKey: ['verify-close', pred.pubkey], enabled: !!pred.closeTs && Number(pred.closeTs) > 0, retry: 0, queryFn: async () => {
      const rec = await pickArchivedAt(fixtureId, Number(pred.closeTs), market)
      if (!rec) throw new Error('closing record not found')
      const val = await txline.oddsValidation(rec.MessageId, rec.Ts)
      return { ok: await verifyOdds(txo, val), pct: probPct(val.odds.Prices[market.priceIndex]), root: val.summary.oddsSubTreeRoot }
    },
  })
  const outcome = useQuery({
    queryKey: ['verify-outcome', pred.pubkey], retry: 0, queryFn: async () => {
      // The stat keys the CHAIN settled on. A first-half bet is keys 1001/1002;
      // proving keys 1/2 would re-prove a different match period entirely.
      const { val, a, b } = await finalStat(fixtureId, pred.statAKey, pred.hasStatB ? pred.statBKey : undefined)
      return { ok: await verifyStat(txo, val, pred), p1: a, p2: b, root: val.summary.eventStatsSubTreeRoot }
    },
  })

  const Row = ({ n, title, sub, q, render, delay }: { n: string; title: string; sub: string; q: any; render?: (d: any) => React.ReactNode; delay: number }) => {
    const pending = !q.isError && !q.data
    const proven = q.data && q.data.ok
    return (
      <div className={`reveal flex items-center justify-between gap-4 p-4 rounded-xl bg-[#F8F7F5] ${pending ? 'scanning' : ''}`} style={{ animationDelay: `${delay}ms` }}>
        <div className="min-w-0 flex items-start gap-3">
          <span className={`font-num text-xs font-bold mt-0.5 ${proven ? 'text-[#FF6B35]' : 'text-slate-300'}`}>{n}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">{title} <span className="font-num text-[10px] font-medium text-slate-400 lowercase">{sub}</span></div>
            <div className="font-num text-xs text-slate-500 mt-1 break-all">
              {q.isError ? <span className="text-red-500">{String(q.error?.message)}</span> : q.data ? render?.(q.data) : 'reconstructing Merkle proof…'}
            </div>
          </div>
        </div>
        <div className={`shrink-0 ${proven ? 'ring-pulse rounded-lg' : ''}`}><Shield ok={q.isError ? false : q.data ? q.data.ok : null} /></div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Verifiable receipt" className="bg-white rounded-3xl w-full max-w-lg overflow-hidden elev-lg animate-pop" onClick={(e: any) => e.stopPropagation()}>
        {/* Header */}
        <div className="accent-gradient px-6 py-5 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:shield-check" className="text-2xl" />
              <h2 className="font-display font-extrabold text-xl">Verifiable receipt</h2>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>
          <p className="text-xs text-white/80 mt-1 flex flex-wrap items-center gap-1.5">
            {fixture ? (
              <span className="inline-flex items-center gap-1.5">
                <Flag name={fixture.Participant1} className="text-sm" /> {fixture.Participant1}
                <span className="text-white/50">vs</span>
                <Flag name={fixture.Participant2} className="text-sm" /> {fixture.Participant2}
              </span>
            ) : (
              <span>Fixture {fixtureId}</span>
            )}
            <span>· {market.label} · re-proved live on Solana</span>
          </p>
        </div>

        {/* Proof rows */}
        <div className="p-6 space-y-3">
          <Row n="01" title="The fixture" sub="validate_fixture" q={fixtureProof} delay={40} render={(d) => <>kickoff {new Date(d.start).toUTCString()} · fixtures root {trunc(d.root)}</>} />
          <Row n="02" title="Entry line" sub="validate_odds" q={entry} delay={120} render={(d) => <>implied {d.pct.toFixed(2)}% · odds root {trunc(d.root)}</>} />
          <Row n="03" title="Closing line" sub="validate_odds" q={close} delay={200} render={(d) => <>implied {d.pct.toFixed(2)}% · odds root {trunc(d.root)}</>} />
          <Row n="04" title="Match result" sub="validate_stat" q={outcome} delay={280}
            render={(d) => <>keys {pred.statAKey}{pred.hasStatB ? `/${pred.statBKey}` : ''} = {d.p1}{d.p2 !== undefined ? `–${d.p2}` : ''} · scores root {trunc(d.root)}</>} />
        </div>

        {/* Footer */}
        <div className="px-6 py-5 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 font-medium">Closing Line Value</span>
            <CountUp value={Number(pred.clvBps)} duration={1200}
              className={`font-num font-extrabold text-2xl ${Number(pred.clvBps) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
              format={(v) => `${v >= 0 ? '+' : ''}${(v / 100).toFixed(2)}%`} />
          </div>
          {Object.keys(pred.status)[0] === 'settled' && (pred.outcomeWin ? <Badge tone="green">Won</Badge> : <Badge tone="red">Lost</Badge>)}
        </div>
        <p className="px-6 pb-5 pt-3 text-[11px] text-slate-400 leading-relaxed">
          Each shield is a live <span className="text-slate-600 font-semibold">validate_odds</span> / <span className="text-slate-600 font-semibold">validate_stat</span> call returning true on Solana devnet. No oracle to trust.
        </p>
      </div>
    </div>
  )
}
