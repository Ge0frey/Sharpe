import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useFeed } from '../state/feed'
import { useAuth } from '../state/auth'
import Icon from './Icon'

const NAV: { to: string; label: string; prefix?: string }[] = [
  { to: '/matches', label: 'Matches', prefix: '/match' },
  { to: '/duels', label: 'Duels' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/leaderboard', label: 'Leaderboard' },
]

const SPEEDS = [1, 10, 30, 60]

/**
 * LIVE ingests the SSE stream. REPLAY re-emits a finished fixture's archived
 * records on an accelerated clock — the only way to demonstrate ingestion once
 * the tournament is over. Both paths carry real, provable records.
 */
function FeedToggle() {
  const { mode, speed, setMode, setSpeed } = useFeed()
  return (
    <div className="hidden sm:flex items-center gap-1 rounded-xl bg-[#F8F7F5] p-1">
      {(['live', 'replay'] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors ${
            mode === m ? 'bg-white text-[#1E3A5F] shadow-sm' : 'text-slate-400 hover:text-[#1E3A5F]'}`}>
          {m === 'live' && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${mode === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />}
          {m}
        </button>
      ))}
      {mode === 'replay' && (
        <select aria-label="Replay speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
          className="bg-transparent text-[11px] font-bold text-[#1E3A5F] pr-1 focus:outline-none">
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      )}
    </div>
  )
}

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] focus-visible:ring-offset-2'

export default function Nav() {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const { ready } = useAuth()
  useEffect(() => { setOpen(false) }, [loc.pathname])

  const isActive = (to: string, prefix?: string) => (prefix ? loc.pathname.startsWith(prefix) : loc.pathname === to)

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md shadow-sm">
      <div className="h-[3px] accent-gradient" />
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link to="/" className={`flex items-center gap-2.5 group rounded-lg ${ring}`}>
            <div className="w-8 h-8 rounded-lg bg-[#1E3A5F] flex items-center justify-center">
              <Icon icon="lucide:line-chart" className="text-white text-lg" />
            </div>
            <span className="font-display font-extrabold text-xl text-[#1E3A5F]">Sharpe</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`text-sm transition-colors rounded ${ring} ${
                  isActive(n.to, n.prefix)
                    ? 'text-[#1E3A5F] font-bold underline decoration-2 decoration-[#FF6B35] underline-offset-8'
                    : 'text-slate-400 font-medium hover:text-[#1E3A5F]'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <FeedToggle />
          {!ready && (
            <Link to="/onboard" className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-[#FF6B35] hover:underline px-2 rounded ${ring}`}>
              <Icon icon="lucide:key-round" className="text-[13px]" aria-hidden /> Get data access
            </Link>
          )}
          <WalletMultiButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className={`md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-[#1E3A5F] hover:bg-slate-100 transition-colors ${ring}`}
          >
            <Icon icon={open ? 'lucide:x' : 'lucide:menu'} className="text-xl" aria-hidden />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="md:hidden border-t border-slate-100 bg-white/95 backdrop-blur-md px-4 py-2">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`block rounded-xl px-4 py-3 text-base font-semibold transition-colors ${ring} ${
                isActive(n.to, n.prefix) ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-[#1E3A5F] hover:bg-slate-50'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
