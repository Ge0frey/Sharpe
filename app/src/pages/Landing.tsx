import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { LineMotif, ProofTicker } from '../components/graphics'
import { CountUp, Reveal } from '../components/motion'
import { CFG } from '../config'

/* ── Small, shared building blocks ─────────────────────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
      {children}
    </span>
  )
}

/** The name of a TxLINE verifier — the primitive that makes a step trustless. */
function Primitive({ name, tone = 'light' }: { name: string; tone?: 'light' | 'dark' }) {
  const cls = tone === 'dark'
    ? 'text-[#FF8A5E] bg-white/10'
    : 'text-[#FF6B35] bg-[#FF6B35]/10'
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
      className="group inline-flex items-center gap-2 accent-gradient btn-shine glow-accent text-white font-bold px-7 py-3.5 rounded-xl transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F7F5]"
    >
      {children}
      <Icon icon="lucide:arrow-right" className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function Landing() {
  // Count the hero CLV chip up from zero once, on load.
  const [heroClv, setHeroClv] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setHeroClv(4.2), 450)
    return () => clearTimeout(t)
  }, [])

  return (
    <main className="flex-1">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pt-16 md:pt-24 pb-10">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          <div className="lg:col-span-7 reveal">
            <Eyebrow>TxLINE Devnet · 2026 World Cup</Eyebrow>
            <h1 className="mt-7 text-5xl md:text-7xl font-display font-extrabold leading-[1.03] text-[#1E3A5F]">
              Prove you beat<br />the market.
            </h1>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-xl">
              Sharpe turns <span className="font-bold text-[#FF6B35]">Closing Line Value</span> — the pro measure of betting
              edge — into a trustless, on-chain score. Call a World Cup market, and your entry, the close, and the result
              are each a Merkle proof <span className="font-bold text-[#1E3A5F]">verified on Solana</span>.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <CtaPrimary to="/matches">Enter Sharpe</CtaPrimary>
              <a
                href="#how"
                className="inline-flex items-center gap-2 bg-white border border-slate-200 text-[#1E3A5F] font-bold px-6 py-3.5 rounded-xl transition-colors duration-200 hover:border-[#FF6B35]/50 hover:text-[#FF6B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A5F]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F7F5]"
              >
                See how it works
              </a>
            </div>
            <div className="mt-7 flex items-center gap-2 text-sm text-slate-500">
              <Icon icon="lucide:lock" className="text-[#1E3A5F]" aria-hidden />
              No stake. No oracle. Pure skill.
            </div>
          </div>

          {/* Signature: the consensus line that draws itself, entry + close marked. */}
          <div className="lg:col-span-5 reveal" style={{ animationDelay: '120ms' }}>
            <div className="soft-card rounded-2xl p-6 elev-lg overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Consensus line · demo</span>
                <span className="inline-flex items-center gap-1 font-num text-xs font-bold text-[#FF6B35]">
                  CLV <CountUp value={heroClv} format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`} />
                </span>
              </div>
              <LineMotif className="w-full h-44" />
              <div className="flex justify-between mt-3 font-num text-[10px] font-bold text-slate-400 tracking-tight">
                <span className="text-[#FF6B35]">● ENTRY</span>
                <span>PRE-MATCH</span>
                <span className="text-[#1E3A5F]">● CLOSE</span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-12">
          <ProofTicker />
        </div>
      </section>

      {/* ── Concept: what CLV is ─────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-20 md:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-6">
            <Eyebrow>The metric</Eyebrow>
            <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.08]">
              The line was never provable.
            </h2>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              Sharp bettors don't measure themselves by whether a bet won — they measure themselves by the
              <span className="font-bold text-[#1E3A5F]"> closing line</span>, the market's final and most efficient price.
              Beat it consistently and you have an edge, even on bets that lose.
            </p>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              The catch: "the line" lived in a screenshot you had to trust. Sharpe records the implied probability
              of your pick when you lock it, and again when the market closes. The gap is your
              <span className="font-bold text-[#FF6B35]"> CLV</span> — and every number is a proof.
            </p>
          </Reveal>

          {/* Mini-diagram: entry probability vs closing probability, delta = CLV. */}
          <Reveal className="lg:col-span-6" delay={120}>
            <div className="soft-card rounded-2xl p-6 md:p-8 ring-inset">
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

      {/* ── How it works: the three proofs ───────────────────────────────── */}
      <section id="how" className="px-4 md:px-8 py-20 md:py-28 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.08]">
              Three proofs, one score.
            </h2>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed">
              Every step that touches your CLV is gated by a TxLINE verifier running on-chain. Nothing advances on trust.
            </p>
          </Reveal>

          <Reveal className="mt-12">
            <ol className="relative ml-3 space-y-10 border-l-2 border-slate-200/80">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative pl-8 md:pl-10">
                  <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#FF6B35] bg-white font-num text-[11px] font-bold text-[#FF6B35]">
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

      {/* ── Trust band (signature deep-navy section) ─────────────────────── */}
      <section className="relative overflow-hidden bg-[#152945] text-white">
        <div
          className="absolute inset-0 opacity-[0.18] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(55% 45% at 85% 0%, #FF6B35, transparent 70%)' }}
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-28">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            <Reveal className="lg:col-span-5">
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                Trust model
              </span>
              <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold leading-[1.08]">
                No oracle.<br />No admin.<br />Just proofs.
              </h2>
              <p className="mt-6 text-white/70 leading-relaxed">
                The moat is <span className="font-num font-bold text-[#FF8A5E]">validate_odds</span> — proving the consensus
                <span className="font-semibold text-white"> odds</span> themselves, not just the score. Almost nobody does this.
                It's what makes the line, and your edge, trustless.
              </p>
            </Reveal>

            <Reveal className="lg:col-span-7" delay={120}>
              <div className="space-y-3">
                {PROOFS.map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 px-5 py-4"
                  >
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

      {/* ── Proof it's real: a settled devnet receipt ────────────────────── */}
      <section className="px-4 md:px-8 py-20 md:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-5">
            <Eyebrow>Not a mockup</Eyebrow>
            <h2 className="mt-6 text-3xl md:text-5xl font-display font-extrabold text-[#1E3A5F] leading-[1.08]">
              Real proofs, from devnet.
            </h2>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              This call settled end-to-end on Solana devnet through our program — entry and close proven with
              <span className="font-num font-semibold text-[#1E3A5F]"> validate_odds</span>, the result with
              <span className="font-num font-semibold text-[#1E3A5F]"> validate_stat</span>. The numbers below are on-chain.
            </p>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed">
              Note it <span className="font-semibold text-slate-600">won</span> with slightly negative CLV — which is exactly why
              CLV, not win-or-lose, is the honest measure of skill.
            </p>
          </Reveal>

          <Reveal className="lg:col-span-7" delay={120}>
            <div className="soft-card rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Settled · devnet</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600">
                  <Icon icon="lucide:shield-check" aria-hidden /> Won
                </span>
              </div>
              <div className="px-6 py-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xl md:text-2xl font-display font-extrabold text-[#1E3A5F]">USA</div>
                  <div className="font-num text-2xl font-extrabold text-[#1E3A5F] tabular">2 – 0</div>
                  <div className="text-xl md:text-2xl font-display font-extrabold text-[#1E3A5F] text-right">Bosnia&nbsp;&amp;&nbsp;H.</div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <Stat label="Entry (Home)" value="72.09%" />
                  <Stat label="Close" value="71.63%" />
                  <Stat label="CLV" value="−0.46%" negative />
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

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-20 md:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>Ready</Eyebrow>
          <h2 className="mt-6 text-4xl md:text-6xl font-display font-extrabold text-[#1E3A5F] leading-[1.05]">
            Make your call.
          </h2>
          <p className="mt-5 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            Open a fixture, lock the opening line, and let the proofs settle the rest.
          </p>
          <div className="mt-9 flex justify-center">
            <CtaPrimary to="/matches">Enter Sharpe</CtaPrimary>
          </div>
        </div>
      </section>
    </main>
  )
}

/* ── Section-local pieces + data ───────────────────────────────────────── */

function ProbBar({ label, value, tone }: { label: string; value: number; tone: 'navy' | 'accent' }) {
  const bar = tone === 'accent' ? 'bg-[#FF6B35]' : 'bg-[#1E3A5F]'
  const text = tone === 'accent' ? 'text-[#FF6B35]' : 'text-[#1E3A5F]'
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-bold text-slate-500">{label}</span>
        <span className={`font-num text-lg font-extrabold tabular ${text}`}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function Stat({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-xl bg-[#F8F7F5] px-3 py-3">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-num text-lg font-extrabold tabular ${negative ? 'text-red-500' : 'text-[#1E3A5F]'}`}>{value}</div>
    </div>
  )
}

function trunc(s: string) {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s
}

const STEPS = [
  {
    title: 'Lock the opening line',
    primitive: 'validate_odds',
    body: 'Pick Home, Draw, or Away. Sharpe fetches the Merkle proof for the opening odds and proves it on-chain before storing your entry probability — so the price you locked is authentic, not a screenshot.',
  },
  {
    title: 'The market closes',
    primitive: 'validate_odds',
    body: 'At kickoff the last pre-match line is proven the same way. Your CLV is computed on-chain as close minus entry — a pure function of two proven numbers.',
  },
  {
    title: 'The final whistle',
    primitive: 'validate_stat',
    body: 'The final score is proven against the exact predicate stored when you opened the call. Win or lose is settled deterministically, with no oracle and no admin who can change it.',
  },
]

const PROOFS = [
  { label: 'Entry line', primitive: 'validate_odds', desc: 'the opening consensus price' },
  { label: 'Closing line', primitive: 'validate_odds', desc: 'the final pre-match price' },
  { label: 'Match result', primitive: 'validate_stat', desc: 'the on-chain final score' },
]
