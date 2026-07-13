import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useFeed } from '../state/feed'
import { useAuth } from '../state/auth'
import Icon from './Icon'
import LogoMark from './LogoMark'

const NAV: { to: string; label: string; prefix?: string }[] = [
  { to: '/matches', label: 'Matches', prefix: '/match' },
  { to: '/duels', label: 'Duels' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/docs', label: 'Docs', prefix: '/docs' },
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
            // slate-500 is 4.44:1 on this #F8F7F5 pill, just under the 4.5:1 floor for 11px text.
            mode === m ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:text-ink'}`}>
          {m === 'live' && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${mode === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />}
          {m}
        </button>
      ))}
      {mode === 'replay' && (
        <select aria-label="Replay speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
          className="bg-transparent text-[11px] font-bold text-ink pr-1 focus:outline-none">
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      )}
    </div>
  )
}

export default function Nav() {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [overHero, setOverHero] = useState(loc.pathname === '/')
  const progress = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const { ready } = useAuth()

  const isLanding = loc.pathname === '/'
  useEffect(() => { setOpen(false) }, [loc.pathname])

  /**
   * Two independent thresholds. The bar condenses as soon as the page moves, but it
   * only sheds the hero's black at the exact moment the hero's bottom edge passes the
   * bar's bottom edge. Guessing that point (say `0.7 * innerHeight`) flips the bar to
   * white while black hero is still behind it, which is the jarring part. So measure.
   *
   * The progress fill is written straight to the node, so scrolling never re-renders.
   */
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const y = window.scrollY
      setScrolled(y > 8)

      const hero = isLanding ? document.getElementById('hero') : null
      const navH = headerRef.current?.offsetHeight ?? 0
      setOverHero(Boolean(hero && hero.getBoundingClientRect().bottom > navH))

      const max = document.documentElement.scrollHeight - window.innerHeight
      if (progress.current) progress.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isLanding])

  // At the top of the landing page the bar wears the hero's black, and the blueprint
  // grid runs through it unbroken, because every grid layer is viewport-anchored.
  const dark = isLanding && overHero

  const isActive = (to: string, prefix?: string) => (prefix ? loc.pathname.startsWith(prefix) : loc.pathname === to)

  // The display accent is 2.8:1 on white, so the readable sibling carries the ring on
  // the light bar. On black the bright accent clears 7.4:1 and reads better.
  const ring = dark
    ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950'
    : 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2'

  return (
    <header
      ref={headerRef}
      data-nav={dark ? 'dark' : 'light'}
      /* `color` is in the transition list or the text snaps while the plane fades.
         The blur stays mounted in both states so it cannot pop in on the handover. */
      className={`sticky top-0 z-50 backdrop-blur-md transition-[background-color,color,box-shadow] duration-300 ease-out ${
        dark ? 'bg-ink-950 text-white' : 'bg-white/85 shadow-sm text-ink'
      }`}
    >
      {/* The hero's own blueprint grid, continued through the bar. Always mounted and
          faded, because unmounting it cannot be animated. Rendered first, and
          everything after it is positioned, so it stays behind. */}
      <div
        className={`grid-overlay transition-opacity duration-300 ease-out ${dark ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      />

      {/* Scroll progress. The strip was decoration; now it reports where you are. */}
      <div className={`relative h-[3px] w-full overflow-hidden transition-colors duration-300 ease-out ${dark ? 'bg-white/10' : 'bg-slate-200/70'}`}>
        <div ref={progress} className="h-full w-full accent-gradient origin-left" style={{ transform: 'scaleX(0)' }} aria-hidden />
      </div>

      <div
        className={`relative max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between transition-[height] duration-200 ease-out ${
          scrolled ? 'h-[60px]' : 'h-[72px]'
        }`}
      >
        <div className="flex items-center gap-10">
          <Link to="/" className={`flex items-center gap-2.5 group rounded-lg ${ring}`}>
            {/* One subtree, never swapped: a swap unmounts and remounts, which cannot be
                animated. On black an ink tile would be an invisible square, so it becomes
                the frosted badge the hero and wallet pill already use. */}
            <div
              className={`rounded-lg flex items-center justify-center transition-[width,height,background-color,box-shadow] duration-300 ease-out ${
                scrolled ? 'w-7 h-7' : 'w-8 h-8'
              } ${dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-ink'}`}
            >
              <LogoMark className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="font-display font-extrabold text-xl">Sharpe</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`text-sm transition-colors rounded ${ring} ${
                  isActive(n.to, n.prefix)
                    ? `font-bold underline decoration-2 decoration-accent underline-offset-8 ${dark ? 'text-white' : 'text-ink'}`
                    : dark
                      ? 'text-white/60 font-medium hover:text-white'
                      : 'text-slate-500 font-medium hover:text-ink'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {/* There is no fixture on the landing page, so LIVE/REPLAY controls nothing. */}
          {!isLanding && <FeedToggle />}
          {!ready && (
            <Link
              to="/onboard"
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-bold hover:underline px-2 rounded ${ring} ${
                dark ? 'text-accent' : 'text-accent-ink'
              }`}
            >
              <Icon icon="lucide:key-round" className="text-[13px]" aria-hidden /> Get data access
            </Link>
          )}
          <WalletMultiButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className={`md:hidden w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${ring} ${
              dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-slate-100'
            }`}
          >
            <Icon icon={open ? 'lucide:x' : 'lucide:menu'} className="text-xl" aria-hidden />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav
          className={`relative md:hidden border-t px-4 py-2 ${
            dark ? 'border-white/10 bg-ink-950/95 backdrop-blur-md' : 'border-slate-100 bg-white/95 backdrop-blur-md'
          }`}
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`block rounded-xl px-4 py-3 text-base font-semibold transition-colors ${ring} ${
                isActive(n.to, n.prefix)
                  ? dark ? 'bg-accent/15 text-accent' : 'bg-accent-ink/10 text-accent-ink'
                  : dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-slate-50'
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
