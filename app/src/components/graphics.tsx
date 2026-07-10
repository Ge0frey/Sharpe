import { DEMO_FIXTURE_META } from '../config'
import Icon from './Icon'
import Flag from './Flag'

/**
 * The brand motif: a consensus line that draws itself, with an entry marker
 * (coral) and a closing marker (ink). Purely decorative — echoes the product.
 */
export function LineMotif({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  // A single smooth path; length approximated for the draw animation.
  const d = 'M0,150 C60,140 110,168 170,120 S300,60 360,96 T520,44'
  const line = dark ? '#FF7A45' : '#0F0F0F'
  const fillTop = dark ? '#FF6B35' : '#0F0F0F'
  const entryRef = dark ? '#FFFFFF' : '#FF6B35'
  const closeMarker = dark ? '#FFFFFF' : '#0F0F0F'
  const uid = dark ? 'lm-fill-d' : 'lm-fill'
  return (
    <svg viewBox="0 0 520 200" className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} stopOpacity={dark ? '0.28' : '0.14'} />
          <stop offset="100%" stopColor={fillTop} stopOpacity="0" />
        </linearGradient>
        {dark && (
          <filter id="lm-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#FF6B35" floodOpacity="0.9" />
          </filter>
        )}
      </defs>
      <path d={`${d} L520,200 L0,200 Z`} fill={`url(#${uid})`} opacity="0.9" />
      {/* entry reference line */}
      <line x1="0" y1="96" x2="520" y2="96" stroke={entryRef} strokeWidth="1.5" strokeDasharray="5 5" opacity={dark ? '0.4' : '0.5'} />
      <path d={d} fill="none" stroke={line} strokeWidth="3.5" strokeLinecap="round" className="line-draw" filter={dark ? 'url(#lm-glow)' : undefined} style={{ '--len': 760 } as any} />
      <circle cx="360" cy="96" r="6" fill="#FF6B35" className="marker-pop" style={{ animationDelay: '1.5s' }} />
      <circle cx="520" cy="44" r="6" fill={closeMarker} className="marker-pop" style={{ animationDelay: '2s' }} />
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

/**
 * Scrolling proof ticker: the real settled fixtures, and the primitives that prove
 * them. Receipts, not decoration. `dark` dresses the chips as the hero's frosted
 * badges so it can ride along the bottom of a black plane.
 */
export function ProofTicker({ dark = false }: { dark?: boolean }) {
  const items: any[] = [
    ...DEMO_FIXTURE_META.map((f: any) => ({ p1: f.Participant1, p2: f.Participant2, label: `${f.Participant1} vs ${f.Participant2}`, tag: 'entry · close · result proven' })),
    { label: 'validate_odds', tag: 'consensus line → on-chain' },
    { label: 'validate_stat', tag: 'final score → on-chain' },
    { label: 'Closing Line Value', tag: 'the pro measure of edge' },
  ]
  const row = [...items, ...items]
  // The display accent is 2.8:1 on a light chip, under the 3:1 an icon needs.
  const chip = dark ? 'bg-white/10 ring-1 ring-white/15 backdrop-blur' : 'bg-white/80 shadow-sm'
  const label = dark ? 'text-white' : 'text-ink'
  const tag = dark ? 'text-white/55' : 'text-slate-500'
  const icon = dark ? 'text-accent' : 'text-accent-ink'
  const flagRing = dark ? 'ring-white/25' : 'ring-white'
  return (
    <div className="marquee-mask overflow-hidden py-1">
      <div className="marquee-track gap-3">
        {row.map((it, i) => (
          <span key={i} className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm ${chip}`}>
            {it.p1 ? (
              <span className="inline-flex items-center -space-x-1">
                <Flag name={it.p1} className={`text-base ring-1 rounded-full ${flagRing}`} />
                <Flag name={it.p2} className={`text-base ring-1 rounded-full ${flagRing}`} />
              </span>
            ) : (
              <Icon icon="lucide:shield-check" className={icon} aria-hidden />
            )}
            <span className={`font-bold ${label}`}>{it.label}</span>
            <span className={`text-xs ${tag}`}>{it.tag}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
