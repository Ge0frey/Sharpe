import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Flag from '../components/Flag'
import { LineMotif, ProofTicker } from '../components/graphics'
import { CountUp, Reveal, useInView } from '../components/motion'
import { CFG } from '../config'

/* ── Shared building blocks ────────────────────────────────────────────── */

function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <span className={`block text-[11px] font-bold uppercase tracking-[0.18em] ${tone === 'dark' ? 'text-white/60' : 'text-slate-500'}`}>
      {children}
    </span>
  )
}

/** A TxLINE verifier name — the primitive that makes a step trustless. */
function Primitive({ name, tone = 'light' }: { name: string; tone?: 'light' | 'dark' }) {
  const cls = tone === 'dark' ? 'text-[#FF8A5E] bg-white/10' : 'text-[#FF6B35] bg-[#FF6B35]/10'
  return (
    <span className={`inline-flex items-center gap-1.5 font-num text-xs font-bold px-2.5 py-1 rounded-lg ${cls}`}>
      <Icon icon="lucide:file-check-2" className="text-sm" aria-hidden />
      {name}
    </span>
  )
}

function CtaPrimary({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 accent-gradient-2 btn-shine text-white font-extrabold px-7 py-3.5 rounded-xl transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0C1B30]"
    >
      {children}
      <Icon icon="lucide:arrow-right" className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/** Counts a number up from zero the first time it scrolls into view. */
function CountStat({ to, format, className }: { to: number; format: (n: number) => string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.5 })
  const [v, setV] = useState(0)
  useEffect(() => {
    if (inView) setV(to)
  }, [inView, to])
  return (
    <span ref={ref} className={className}>
      <CountUp value={v} format={format} />
    </span>
  )
}

/** A one-shot confetti burst that fires when it enters view. Decorative. */
function Confetti() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.45 })
  const pieces = useMemo(() => {
    const colors = ['#FF6B35', '#FFA83D', '#1E3A5F', '#10B981', '#F8F7F5']
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: `${Math.round(Math.random() * 100)}%`,
      color: colors[i % colors.length],
      delay: `${(Math.random() * 0.5).toFixed(2)}s`,
      dur: `${(1.3 + Math.random() * 0.9).toFixed(2)}s`,
    }))
  }, [])
  return (
    <div ref={ref} className="pointer-events-none absolute inset-x-0 -top-3 h-32 overflow-hidden" aria-hidden>
      {inView &&
        pieces.map((p) => (
          <span key={p.id} className="confetti-piece" style={{ left: p.left, background: p.color, animationDelay: p.delay, animationDuration: p.dur }} />
        ))}
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function Landing() {
  const [heroClv, setHeroClv] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setHeroClv(4.2), 550)
    return () => clearTimeout(t)
  }, [])

  return (
    <main className="flex-1">
      {/* ══ Night-stadium hero ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0C1B30] text-white">
        {/* stadium-light glows */}
        <div className="glow-blob float-a" style={{ top: '-14%', left: '-8%', width: '48%', height: '78%', background: 'radial-gradient(circle, rgba(255,107,53,0.55), transparent 62%)' }} aria-hidden />
        <div className="glow-blob float-b" style={{ top: '-22%', right: '-10%', width: '46%', height: '80%', background: 'radial-gradient(circle, rgba(96,150,255,0.30), transparent 65%)' }} aria-hidden />
        {/* white blueprint grid — continuous with the page-wide navy grid */}
        <div className="grid-overlay" aria-hidden />

        <div className="relative max-w-6xl mx-auto px-4 md:px-8 pt-16 md:pt-20 pb-20 min-h-[86vh] flex items-center">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center w-full">
            <div className="lg:col-span-7 reveal">
              <Eyebrow tone="dark">TxLINE Devnet · 2026 World Cup</Eyebrow>
              <h1 className="mt-6 text-[3.25rem] leading-[0.98] md:text-8xl font-display font-extrabold tracking-tight">
                Prove you<br />
                <span className="text-electric">beat the market.</span>
              </h1>
              <p className="mt-7 text-lg md:text-xl text-white/60 leading-relaxed max-w-xl">
                Sharpe turns <span className="font-bold text-white">Closing Line Value</span> — the pro measure of betting edge —
                into a trustless, on-chain score. Call a World Cup market and your entry, the close, and the result are each
                proven on Solana.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <CtaPrimary to="/matches">Enter Sharpe</CtaPrimary>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 border border-white/20 text-white font-bold px-6 py-3.5 rounded-xl transition-colors duration-200 hover:border-[#FF6B35] hover:text-[#FF8A5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0C1B30]"
                >
                  See how it works
                </a>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/55">
                <span className="inline-flex items-center gap-2"><Icon icon="lucide:lock" aria-hidden /> No stake</span>
                <span className="inline-flex items-center gap-2"><Icon icon="lucide:shield-check" className="text-emerald-400" aria-hidden /> No oracle</span>
                <span className="inline-flex items-center gap-2"><Icon icon="lucide:zap" className="text-[#FFA83D]" aria-hidden /> Pure skill</span>
              </div>
            </div>

            {/* Signature: the glowing consensus line that draws itself. */}
            <div className="lg:col-span-5 reveal relative" style={{ animationDelay: '120ms' }}>
              <div className="bob absolute -top-4 -left-2 sm:-left-4 z-20 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur px-3 py-2 shadow-lg">
                <span className="inline-flex items-center gap-1.5 font-num text-xs font-bold text-white">
                  <Flag name="United States" className="text-sm" />USA 2–0 BIH · <span className="text-emerald-400">WON</span>
                </span>
              </div>
              <div className="bob-2 absolute -bottom-4 -right-1 sm:-right-3 z-20 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur px-3 py-2 shadow-lg">
                <span className="inline-flex items-center gap-1.5 font-num text-xs font-bold text-white">
                  <Flag name="Spain" className="text-sm" />ESP · entry <span className="text-[#FF8A5E]">72%</span>
                </span>
              </div>
              <div className="relative rounded-2xl p-6 bg-white/[0.06] ring-1 ring-white/10 backdrop-blur overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.18em]">Consensus line · demo</span>
                  <span className="inline-flex items-center gap-1 font-num text-sm font-extrabold text-[#FF8A5E]">
                    CLV <CountUp value={heroClv} format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`} />
                  </span>
                </div>
                <LineMotif dark className="w-full h-48" />
                <div className="flex justify-between mt-3 font-num text-[10px] font-bold text-white/40 tracking-tight">
                  <span className="text-[#FF8A5E]">● ENTRY</span>
                  <span>PRE-MATCH</span>
                  <span className="text-white">● CLOSE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Kinetic broadcast marquee ═══════════════════════════════════ */}
      <section className="marquee-band overflow-hidden border-y border-slate-200/70 bg-white/50 py-5 md:py-7" aria-hidden>
        <div className="marquee-xl" style={{ '--mq': '26s' } as any}>
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center">
              {MARQUEE.map((w, i) => (
                <span key={`${k}-${i}`} className="flex items-center">
                  <span className={`font-display font-extrabold text-4xl md:text-6xl tracking-tight ${i % 2 ? 'text-outline' : 'text-[#1E3A5F]'}`}>{w}</span>
                  <span className="mx-6 md:mx-9 text-[#FF6B35] text-2xl md:text-4xl">●</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Concept: what CLV is ─────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-20 md:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-6">
            <Eyebrow>The metric</Eyebrow>
            <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.08]">
              The line was never <span className="text-electric">provable</span>.
            </h2>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              Sharp bettors don't measure themselves by whether a bet won — they measure themselves by the
              <span className="font-bold text-[#1E3A5F]"> closing line</span>, the market's final and most efficient price.
              Beat it consistently and you have an edge, even on bets that lose.
            </p>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              The catch: "the line" lived in a screenshot you had to trust. Sharpe records the implied probability of your
              pick when you lock it, and again when the market closes. The gap is your
              <span className="font-bold text-[#FF6B35]"> CLV</span> — and every number is a proof.
            </p>
          </Reveal>

          <Reveal className="lg:col-span-6" delay={120}>
            <div className="soft-card lift rounded-2xl p-6 md:p-8 ring-inset">
              <ProbBar label="Entry line" value={52.9} tone="navy" />
              <div className="my-5 line-divider" />
              <ProbBar label="Closing line" value={55.1} tone="accent" />
              <div className="mt-7 flex items-center justify-between rounded-xl bg-[#1E3A5F] px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Closing Line Value</span>
                <span className="font-num text-lg font-extrabold text-[#FF8A5E]">+2.2%</span>
              </div>
              <p className="mt-4 text-sm text-slate-500 leading-relaxed">
                Positive CLV means the market moved toward your side <span className="font-semibold text-slate-600">after</span> you
                committed. You were early — and sharp.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Ticker of what gets proven (divides metric ↔ how-it-works) ───── */}
      <section className="px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <ProofTicker />
        </div>
      </section>

      {/* ── How it works: three proofs ───────────────────────────────────── */}
      <section id="how" className="px-4 md:px-8 py-20 md:py-28 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.08]">
              Four proofs, <span className="text-electric">one score</span>.
            </h2>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed">
              Every step that touches your CLV is gated by a TxLINE verifier running on-chain. Nothing advances on trust.
            </p>
          </Reveal>

          <Reveal className="mt-12">
            <ol className="relative ml-3 space-y-10 border-l-2 border-slate-200/80">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative pl-8 md:pl-10">
                  <span className="absolute -left-[15px] top-0 flex h-7 w-7 items-center justify-center rounded-full accent-gradient-2 font-num text-xs font-extrabold text-white shadow-[0_6px_16px_-4px_rgba(255,107,53,0.6)]">
                    {i + 1}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl md:text-2xl font-display font-extrabold text-[#1E3A5F]">{s.title}</h3>
                    <Primitive name={s.primitive} />
                  </div>
                  <p className="mt-2 text-slate-600 leading-relaxed max-w-2xl">{s.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ══ Trust band (deep-navy signature) ════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0F2138] text-white">
        <div className="glow-blob float-b" style={{ top: '-30%', right: '-6%', width: '40%', height: '90%', background: 'radial-gradient(circle, rgba(255,107,53,0.4), transparent 68%)' }} aria-hidden />
        <div className="grid-overlay" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-28">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            <Reveal className="lg:col-span-5">
              <Eyebrow tone="dark">Trust model</Eyebrow>
              <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold leading-[1.06]">
                No oracle.<br />No admin.<br /><span className="text-electric">Just proofs.</span>
              </h2>
              <p className="mt-6 text-white/70 leading-relaxed">
                Everyone can prove a <span className="font-semibold text-white">score</span>. Sharpe also proves the consensus
                <span className="font-semibold text-white"> odds</span> with <span className="font-num font-bold text-[#FF8A5E]">validate_odds</span>,
                and anchors both to a kickoff proven by <span className="font-num font-bold text-[#FF8A5E]">validate_fixture</span>.
                Without that anchor, an authentic line quoted after the whistle would score as pure edge.
              </p>
            </Reveal>

            <Reveal className="lg:col-span-7" delay={120}>
              <div className="space-y-3">
                {PROOFS.map((p) => (
                  <div key={p.label} className="proof-shimmer flex items-center justify-between gap-4 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 px-5 py-4">
                    <div className="min-w-0">
                      <div className="font-display font-bold text-lg">{p.label}</div>
                      <div className="text-sm text-white/50 truncate">{p.desc}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Primitive name={p.primitive} tone="dark" />
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
                        <Icon icon="lucide:shield-check" aria-hidden /> Proven
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Proof it's real: a settled devnet scoreboard ─────────────────── */}
      <section className="px-4 md:px-8 py-20 md:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-5">
            <Eyebrow>Not a mockup</Eyebrow>
            <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.08]">
              Real proofs, <span className="text-electric">from devnet</span>.
            </h2>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              This call settled end-to-end on Solana devnet through our program — entry and close proven with
              <span className="font-num font-semibold text-[#1E3A5F]"> validate_odds</span>, the result with
              <span className="font-num font-semibold text-[#1E3A5F]"> validate_stat</span>. The numbers are on-chain.
            </p>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed">
              Note it <span className="font-semibold text-slate-600">won</span> with slightly negative CLV — which is exactly why
              CLV, not win-or-lose, is the honest measure of skill.
            </p>
          </Reveal>

          <Reveal className="lg:col-span-7" delay={120}>
            <div className="relative soft-card lift rounded-2xl overflow-hidden ring-1 ring-slate-100">
              <Confetti />
              <div className="relative flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Settled · devnet</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600">
                  <Icon icon="lucide:trophy" aria-hidden /> Won
                </span>
              </div>
              <div className="px-6 py-8">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex flex-col items-center">
                    <Flag name="United States" className="text-3xl md:text-4xl" />
                    <div className="mt-2 text-2xl md:text-3xl font-display font-extrabold text-[#1E3A5F]">USA</div>
                    <div className="mt-0.5 text-[10px] font-bold tracking-[0.2em] text-slate-400">HOME</div>
                  </div>
                  <div className="font-num text-4xl md:text-5xl font-extrabold text-[#1E3A5F] tabular px-1">2&nbsp;–&nbsp;0</div>
                  <div className="flex flex-col items-center">
                    <Flag name="Bosnia & Herzegovina" className="text-3xl md:text-4xl" />
                    <div className="mt-2 text-2xl md:text-3xl font-display font-extrabold text-[#1E3A5F]">BIH</div>
                    <div className="mt-0.5 text-[10px] font-bold tracking-[0.2em] text-slate-400">AWAY</div>
                  </div>
                </div>
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {/* The values the chain stores: entry_prob_bps 7210, close_prob_bps 7163,
                      clv_bps -47. `prob_bps` rounds, so 10_000_000/1387 is 7210, not 7209. */}
                  <Stat label="Entry (Home)" value={<CountStat to={72.10} format={(n) => `${n.toFixed(2)}%`} />} />
                  <Stat label="Close" value={<CountStat to={71.63} format={(n) => `${n.toFixed(2)}%`} />} />
                  <Stat label="CLV" value={<CountStat to={-0.47} format={(n) => `${n.toFixed(2)}%`} />} negative />
                </div>
              </div>
              <div className="flex items-center gap-2 px-6 py-4 bg-[#F8F7F5] border-t border-slate-100 text-xs text-slate-500">
                <Icon icon="lucide:link" className="text-slate-400" aria-hidden />
                <span className="font-num truncate">{trunc(CFG.clvProgram)}</span>
                <span className="text-slate-300">·</span>
                <span>on-chain settlement</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ Final CTA (electric panel) ══════════════════════════════════ */}
      <section className="px-4 md:px-8 py-20 md:py-28">
        <Reveal className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl accent-gradient-2 cta-glow px-6 py-16 md:py-20 text-center text-white">
            <div className="pitch-grid absolute inset-0 opacity-25" aria-hidden />
            <h2 className="relative text-4xl md:text-6xl font-display font-extrabold leading-[1.05]">Make your call.</h2>
            <p className="relative mt-5 text-lg text-white/90 max-w-xl mx-auto leading-relaxed">
              Open a fixture, commit to a line, and settle it against proofs anyone can check.
            </p>
            <div className="relative mt-9 flex justify-center">
              <Link
                to="/matches"
                className="group inline-flex items-center gap-2 bg-white text-[#1E3A5F] font-extrabold px-8 py-4 rounded-xl shadow-lg transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF6B35]"
              >
                Enter Sharpe
                <Icon icon="lucide:arrow-right" className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  )
}

/* ── Section-local pieces + data ───────────────────────────────────────── */

function ProbBar({ label, value, tone }: { label: string; value: number; tone: 'navy' | 'accent' }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 })
  const bar = tone === 'accent' ? 'bg-[#FF6B35]' : 'bg-[#1E3A5F]'
  const text = tone === 'accent' ? 'text-[#FF6B35]' : 'text-[#1E3A5F]'
  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-bold text-slate-500">{label}</span>
        <span className={`font-num text-lg font-extrabold tabular ${text}`}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: inView ? `${value}%` : '0%', transition: 'width 1.1s var(--ease-out)' }} />
      </div>
    </div>
  )
}

function Stat({ label, value, negative = false }: { label: string; value: ReactNode; negative?: boolean }) {
  return (
    <div className="rounded-xl bg-[#F8F7F5] px-3 py-3 text-center">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-num text-lg font-extrabold tabular ${negative ? 'text-red-500' : 'text-[#1E3A5F]'}`}>{value}</div>
    </div>
  )
}

function trunc(s: string) {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s
}

const MARQUEE = ['BEAT THE CLOSE', 'PROVEN ON SOLANA', 'CLOSING LINE VALUE', 'NO ORACLE']

const STEPS = [
  {
    title: 'Prove the kickoff',
    primitive: 'validate_fixture',
    body: 'Before anything else, the match\'s kickoff time is proven on-chain and written once. Every rule that follows is anchored to it. A proof tells you an odds record is authentic; only a proven kickoff tells you it was quoted before the match.',
  },
  {
    title: 'Commit your call',
    primitive: 'validate_odds',
    body: 'Pick a side. Sharpe pins the quote you took by its timestamp and message hash. The odds root for that quote publishes on the next 5-minute batch, so the proof lands moments later — it cannot be faked, and only the exact quote you took satisfies it.',
  },
  {
    title: 'The market closes',
    primitive: 'validate_odds',
    body: 'Once the match starts, the last pre-match line is proven the same way. Your CLV is computed on-chain as close minus entry, a pure function of two proven numbers.',
  },
  {
    title: 'The final whistle',
    primitive: 'validate_stat',
    body: 'The final score is proven against the exact predicate stored when you opened the call. Win or lose is settled deterministically, with no oracle and no admin who can change it.',
  },
]

const PROOFS = [
  { label: 'The kickoff', primitive: 'validate_fixture', desc: 'what makes the other three mean anything' },
  { label: 'Entry line', primitive: 'validate_odds', desc: 'the price you took, pinned by message hash' },
  { label: 'Closing line', primitive: 'validate_odds', desc: 'the final pre-match price' },
  { label: 'Match result', primitive: 'validate_stat', desc: 'the on-chain final score' },
]
