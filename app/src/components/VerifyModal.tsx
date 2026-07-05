import { useQuery } from '@tanstack/react-query'
import { useClv } from '../state/useClv'
import { txline } from '../lib/txline'
import { pickOdds, finalResult, MARKETS, probPct } from '../lib/domain'
import { verifyOdds, verifyStat } from '../chain/actions'
import { Badge, Shield } from './ui'
import Icon from './Icon'
import { CountUp } from './motion'

const trunc = (arr: number[]) => arr ? '0x' + Buffer.from(arr.slice(0, 6)).toString('hex') + '…' : ''

export default function VerifyModal({ pred, fixture, onClose }: { pred: any; fixture: any; onClose: () => void }) {
  const { txo } = useClv()
  const fixtureId = Number(pred.fixtureId)
  const market = MARKETS[pred.selection]

  const entry = useQuery({
    queryKey: ['verify-entry', pred.pubkey], retry: 0, queryFn: async () => {
      const rec = await pickOdds(fixtureId, Number(pred.entryTs))
      if (!rec) throw new Error('entry record not found')
      const val = await txline.oddsValidation(rec.MessageId, rec.Ts)
      return { ok: await verifyOdds(txo, val), pct: probPct(val.odds.Prices[pred.selection]), root: val.summary.oddsSubTreeRoot }
    },
  })
  const close = useQuery({
    queryKey: ['verify-close', pred.pubkey], enabled: !!pred.closeTs && Number(pred.closeTs) > 0, retry: 0, queryFn: async () => {
      const rec = await pickOdds(fixtureId, Number(pred.closeTs))
      if (!rec) throw new Error('closing record not found')
      const val = await txline.oddsValidation(rec.MessageId, rec.Ts)
      return { ok: await verifyOdds(txo, val), pct: probPct(val.odds.Prices[pred.selection]), root: val.summary.oddsSubTreeRoot }
    },
  })
  const outcome = useQuery({
    queryKey: ['verify-outcome', pred.pubkey], retry: 0, queryFn: async () => {
      const { val, p1, p2 } = await finalResult(fixtureId)
      return { ok: await verifyStat(txo, val, market), p1, p2, root: val.summary.eventStatsSubTreeRoot }
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
            <div className="text-sm font-bold text-[#1E3A5F]">{title} <span className="font-num text-[10px] font-medium text-slate-400 lowercase">{sub}</span></div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1E3A5F]/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden elev-lg animate-pop" onClick={(e: any) => e.stopPropagation()}>
        {/* Header */}
        <div className="accent-gradient px-6 py-5 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:shield-check" className="text-2xl" />
              <h2 className="font-display font-extrabold text-xl">Verifiable receipt</h2>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>
          <p className="text-xs text-white/80 mt-1">
            {fixture ? `${fixture.Participant1} vs ${fixture.Participant2}` : `Fixture ${fixtureId}`} · {['Home win', 'Draw', 'Away win'][pred.selection]} · re-proved live on Solana
          </p>
        </div>

        {/* Proof rows */}
        <div className="p-6 space-y-3">
          <Row n="01" title="Entry line" sub="validate_odds" q={entry} delay={40} render={(d) => <>implied {d.pct.toFixed(2)}% · odds root {trunc(d.root)}</>} />
          <Row n="02" title="Closing line" sub="validate_odds" q={close} delay={120} render={(d) => <>implied {d.pct.toFixed(2)}% · odds root {trunc(d.root)}</>} />
          <Row n="03" title="Match result" sub="validate_stat" q={outcome} delay={200} render={(d) => <>{d.p1}–{d.p2} · scores root {trunc(d.root)}</>} />
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
