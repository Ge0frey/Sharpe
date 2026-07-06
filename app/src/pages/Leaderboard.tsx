import { useQuery } from '@tanstack/react-query'
import { useClv } from '../state/useClv'
import { listPredictions } from '../chain/actions'
import { CLV } from '../components/ui'
import Icon from '../components/Icon'

const short = (s: string) => s.slice(0, 4) + '…' + s.slice(-4)
const avatar = (k: string) => `https://api.dicebear.com/7.x/identicon/svg?seed=${k}`
const medal = ['bg-amber-100 text-amber-700', 'bg-slate-100 text-slate-600', 'bg-orange-100 text-orange-800']

export default function Leaderboard() {
  const { clv } = useClv()
  const { data: preds = [], isLoading } = useQuery({ queryKey: ['predictions'], queryFn: () => listPredictions(clv) })

  const byUser = new Map<string, { cum: number; n: number; closed: number; settled: number; wins: number }>()
  for (const p of preds) {
    const k = p.predictor.toBase58()
    const e = byUser.get(k) ?? { cum: 0, n: 0, closed: 0, settled: 0, wins: 0 }
    e.n++
    const st = Object.keys(p.status ?? {})[0]
    if (st === 'closed' || st === 'settled') { e.cum += Number(p.clvBps); e.closed++ }
    if (st === 'settled') { e.settled++; if (p.outcomeWin) e.wins++ }
    byUser.set(k, e)
  }
  const rows = [...byUser.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.cum - a.cum)
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.cum)))
  const podium = rows.slice(0, 3)
  const order = podium.length === 3 ? [1, 0, 2] : podium.map((_, i) => i) // 2nd, 1st, 3rd

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 reveal">
        <span className="font-num text-sm font-bold text-[#FF6B35]/60">01</span>
        <h1 className="text-4xl md:text-5xl font-display font-extrabold text-[#1E3A5F]">Global Rankings</h1>
      </div>

      {/* CLV explainer */}
      <div className="soft-card rounded-3xl p-6 md:p-8 mb-10 reveal" style={{ animationDelay: '60ms' }}>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="w-12 h-12 rounded-2xl bg-[#FF6B35]/10 flex items-center justify-center shrink-0">
            <Icon icon="lucide:trending-up" className="text-[#FF6B35] text-2xl" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1E3A5F] mb-1">Ranked by cumulative Closing Line Value</h3>
            <p className="text-slate-500 leading-relaxed">
              CLV measures your edge against the market — the gap between the line you locked and the final closing price.
              Every number here is Merkle-proven on Solana, so the ranking is trustless.
            </p>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <div className="soft-card rounded-2xl p-12 text-center">
          <Icon icon="lucide:trophy" className="text-4xl text-slate-300" />
          <p className="text-slate-400 mt-3">No settled calls yet.</p>
        </div>
      )}

      {/* Podium */}
      {podium.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 mb-12 items-end">
          {order.map((idx) => {
            const r = podium[idx]
            const first = idx === 0
            return (
              <div key={r.k}
                className={`reveal rounded-2xl p-5 text-center ${first ? 'soft-card elev-lg -mt-4 ring-2 ring-[#FF6B35]/20' : 'soft-card'}`}
                style={{ animationDelay: `${idx * 90}ms` }}>
                <div className={`mx-auto w-9 h-9 rounded-xl flex items-center justify-center font-display font-extrabold ${medal[idx]}`}>{idx + 1}</div>
                <img src={avatar(r.k)} alt="" className={`mx-auto mt-3 rounded-full bg-slate-100 border-2 border-white shadow-sm ${first ? 'w-16 h-16' : 'w-12 h-12'}`} />
                {first && <Icon icon="lucide:crown" className="text-[#FF6B35] text-xl mt-2" />}
                <div className="font-num font-bold text-sm text-[#1E3A5F] mt-2">{short(r.k)}</div>
                <div className={`font-display font-extrabold mt-1 ${first ? 'text-2xl' : 'text-xl'}`}>
                  {r.closed ? <CLV bps={r.cum} /> : <span className="text-slate-300">—</span>}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{r.n} call{r.n === 1 ? '' : 's'}{r.settled ? ` · ${Math.round((r.wins / r.settled) * 100)}% hit` : ''}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full standings */}
      {rows.length > 0 && (
        <div>
          <div className="px-5 py-3 grid grid-cols-12 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="col-span-2 md:col-span-1">Rank</div>
            <div className="col-span-6 md:col-span-4">Predictor</div>
            <div className="hidden md:block md:col-span-4">Edge</div>
            <div className="col-span-2 text-center">Calls</div>
            <div className="col-span-2 text-right">CLV</div>
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.map((r, i) => (
              <div key={r.k} className="soft-card row-hover rounded-2xl px-5 py-4 grid grid-cols-12 items-center reveal" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                <div className="col-span-2 md:col-span-1">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-sm ${i < 3 ? medal[i] : 'text-slate-400'}`}>{i + 1}</span>
                </div>
                <div className="col-span-6 md:col-span-4 flex items-center gap-3">
                  <img src={avatar(r.k)} alt="" className="w-9 h-9 rounded-full bg-slate-100 border-2 border-white shadow-sm" />
                  <span className="font-num font-bold text-sm text-[#1E3A5F]">{short(r.k)}</span>
                </div>
                <div className="hidden md:block md:col-span-4 pr-6">
                  <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="absolute top-0 bottom-0 left-0 meter-fill rounded-full"
                      style={{ width: `${(Math.abs(r.cum) / maxAbs) * 100}%`, background: r.cum >= 0 ? 'var(--ok)' : 'var(--bad)' }} />
                  </div>
                </div>
                <div className="col-span-2 text-center font-num font-bold text-slate-500">{r.n}</div>
                <div className="col-span-2 text-right font-display font-bold">
                  {r.closed ? <CLV bps={r.cum} /> : <span className="text-slate-300">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
