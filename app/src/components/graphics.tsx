import { DEMO_FIXTURE_META } from '../config'
import Icon from './Icon'

/**
 * The brand motif: a consensus line that draws itself, with an entry marker
 * (coral) and a closing marker (navy). Purely decorative — echoes the product.
 */
export function LineMotif({ className = '' }: { className?: string }) {
  // A single smooth path; length approximated for the draw animation.
  const d = 'M0,150 C60,140 110,168 170,120 S300,60 360,96 T520,44'
  return (
    <svg viewBox="0 0 520 200" className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="lm-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L520,200 L0,200 Z`} fill="url(#lm-fill)" opacity="0.9" />
      {/* entry reference line */}
      <line x1="0" y1="96" x2="520" y2="96" stroke="#FF6B35" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.5" />
      <path d={d} fill="none" stroke="#1E3A5F" strokeWidth="3.5" strokeLinecap="round" className="line-draw" style={{ '--len': 760 } as any} />
      <circle cx="360" cy="96" r="6" fill="#FF6B35" className="marker-pop" style={{ animationDelay: '1.5s' }} />
      <circle cx="520" cy="44" r="6" fill="#1E3A5F" className="marker-pop" style={{ animationDelay: '2s' }} />
    </svg>
  )
}

/** Tiny cumulative sparkline from a running series. */
export function Sparkline({ points, className = '', stroke = '#FF6B35' }: { points: number[]; className?: string; stroke?: string }) {
  if (points.length < 2) return <div className={className} />
  const w = 120, h = 34, pad = 3
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2)
    const y = h - pad - ((p - min) / span) * (h - pad * 2)
    return [x, y]
  })
  const dLine = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const dArea = `${dLine} L${coords[coords.length - 1][0].toFixed(1)},${h} L${coords[0][0].toFixed(1)},${h} Z`
  const gid = `spk-${Math.round(min)}-${Math.round(max)}-${points.length}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dArea} fill={`url(#${gid})`} />
      <path d={dLine} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Signed horizontal magnitude bar centred on zero. */
export function Meter({ bps, max = 500 }: { bps: number; max?: number }) {
  const pos = bps >= 0
  const pct = Math.min(100, (Math.abs(bps) / max) * 100)
  return (
    <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />
      <div
        className="absolute top-0 bottom-0 meter-fill rounded-full"
        style={{ width: `${pct / 2}%`, [pos ? 'left' : 'right']: '50%', background: pos ? 'var(--ok)' : 'var(--bad)' } as any}
      />
    </div>
  )
}

/** Scrolling proof ticker — real demo fixtures + the primitives that prove them. */
export function ProofTicker() {
  const items = [
    ...DEMO_FIXTURE_META.map((f: any) => ({ label: `${f.Participant1} vs ${f.Participant2}`, tag: 'entry · close · result proven' })),
    { label: 'validate_odds', tag: 'consensus line → on-chain' },
    { label: 'validate_stat', tag: 'final score → on-chain' },
    { label: 'Closing Line Value', tag: 'the pro measure of edge' },
  ]
  const row = [...items, ...items]
  return (
    <div className="marquee-mask overflow-hidden py-1">
      <div className="marquee-track gap-3">
        {row.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 shadow-sm text-sm">
            <Icon icon="lucide:shield-check" className="text-[#FF6B35]" />
            <span className="font-bold text-[#1E3A5F]">{it.label}</span>
            <span className="text-slate-400 text-xs">{it.tag}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
