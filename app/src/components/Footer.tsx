import { Link } from 'react-router-dom'
import Icon from './Icon'
import { CFG } from '../config'
import { explorerAddr } from '../lib/explorer'

function trunc(s: string) {
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s
}

const EXPLORE = [
  { to: '/matches', label: 'Matches' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/leaderboard', label: 'Leaderboard' },
]

const ringDark =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded'

export default function Footer() {
  const explorer = explorerAddr(CFG.clvProgram)
  return (
    <footer className="relative overflow-hidden bg-ink-950 text-white">
      <div className="h-[3px] accent-gradient" />
      <div className="grid-overlay" aria-hidden />
      <div
        className="glow-blob float-b"
        style={{ bottom: '-40%', left: '-5%', width: '26%', height: '110%', background: 'radial-gradient(circle, rgba(255,107,53,0.14), transparent 62%)' }}
        aria-hidden
      />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-14 md:py-16">
        <div className="grid gap-10 md:gap-8 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <Link to="/" className={`inline-flex items-center gap-2.5 ${ringDark}`}>
              <span className="w-8 h-8 rounded-lg accent-gradient-2 flex items-center justify-center">
                <Icon icon="lucide:line-chart" className="text-white text-lg" aria-hidden />
              </span>
              <span className="font-display font-extrabold text-xl">Sharpe</span>
            </Link>
            <p className="mt-4 text-sm text-white/55 leading-relaxed max-w-xs">
              Provable Closing-Line Value for the 2026 World Cup. Every line and result proven on Solana via TxLINE.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Devnet Active
            </div>
          </div>

          {/* Explore */}
          <nav className="md:col-span-3" aria-label="Explore">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Explore</h3>
            <ul className="mt-4 space-y-3">
              {EXPLORE.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={`text-sm text-white/70 hover:text-[#FF8A5E] transition-colors ${ringDark}`}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* On-chain */}
          <div className="md:col-span-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">On-chain</h3>
            <div className="mt-4 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Program · devnet</div>
              <a href={explorer} target="_blank" rel="noreferrer" className={`mt-1.5 inline-flex items-center gap-2 font-num text-sm font-bold text-white hover:text-[#FF8A5E] transition-colors ${ringDark}`}>
                {trunc(CFG.clvProgram)}
                <Icon icon="lucide:external-link" className="text-xs" aria-hidden />
              </a>
              <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
                <Icon icon="lucide:shield-check" className="text-emerald-400" aria-hidden />
                Merkle-proven · no oracle to trust
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 h-px bg-white/10" />

        <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-sm text-white/50 max-w-2xl leading-relaxed">
            Every entry line, closing line, and result is a <span className="text-[#FF8A5E] font-semibold">Merkle proof</span> verified on Solana via TxLINE.
          </p>
          <p className="text-xs text-white/40 shrink-0">© 2026 Sharpe · Built on TxLINE + Solana</p>
        </div>
      </div>
    </footer>
  )
}
