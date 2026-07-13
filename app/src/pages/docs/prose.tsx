import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'

const ring =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 rounded'

/* ── Headings ─────────────────────────────────────────────────────────────
   Each carries an id (the anchor target) and a hover-revealed "#" link.
   `scroll-mt-28` keeps the sticky nav from covering the heading on jump. */

function Anchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="Link to this section"
      className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-accent-ink ${ring}`}
    >
      <Icon icon="lucide:link" className="text-[0.7em]" aria-hidden />
    </a>
  )
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="group scroll-mt-28 flex items-center gap-2.5 mt-14 mb-4 text-2xl md:text-[1.7rem] font-display font-extrabold text-ink">
      {children}
      <Anchor id={id} />
    </h2>
  )
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="group scroll-mt-28 flex items-center gap-2 mt-9 mb-3 text-lg font-display font-bold text-ink">
      {children}
      <Anchor id={id} />
    </h3>
  )
}

/* ── Body copy ──────────────────────────────────────────────────────────── */

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="my-4 text-[15px] leading-[1.75] text-slate-600 [&_strong]:font-semibold [&_strong]:text-ink">
      {children}
    </p>
  )
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="my-4 text-[17px] leading-relaxed text-slate-600 [&_strong]:font-semibold [&_strong]:text-ink">{children}</p>
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="my-4 space-y-2.5">{children}</ul>
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[15px] leading-[1.75] text-slate-600 [&_strong]:font-semibold [&_strong]:text-ink">
      <span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-num text-[0.86em] font-semibold text-ink bg-ink/[0.06] px-1.5 py-0.5 rounded-md whitespace-nowrap">
      {children}
    </code>
  )
}

/** Internal docs / app link. */
export function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`font-semibold text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent transition-colors ${ring}`}>
      {children}
    </Link>
  )
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`font-semibold text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent transition-colors ${ring}`}>
      {children}
      <Icon icon="lucide:arrow-up-right" className="text-[0.75em] ml-0.5 align-baseline" aria-hidden />
    </a>
  )
}

/* ── Code blocks ──────────────────────────────────────────────────────────
   Docs blocks sit on the brand's ink ladder — the same near-black the app's
   dark sections use — with a copy affordance in the header bar. */

export function CodeBlock({ title, code }: { title?: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable (permissions / http) — the button just doesn't confirm */
    }
  }
  return (
    <figure className="my-6 rounded-2xl overflow-hidden bg-ink-900 ring-1 ring-black/40 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.5)]">
      <figcaption className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 truncate">
          {title ?? 'snippet'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 -my-1 rounded-lg text-[11px] font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
        >
          <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} className={copied ? 'text-emerald-400' : ''} aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-5 text-[13px] leading-[1.7] text-white/85 font-num">
        <code>{code}</code>
      </pre>
    </figure>
  )
}

/* ── Callouts ─────────────────────────────────────────────────────────── */

const CALLOUT = {
  info: { icon: 'lucide:info', box: 'bg-accent/[0.07] ring-accent/20', ic: 'text-accent-ink' },
  warn: { icon: 'lucide:triangle-alert', box: 'bg-amber-50 ring-amber-600/20', ic: 'text-amber-600' },
  proof: { icon: 'lucide:shield-check', box: 'bg-emerald-50 ring-emerald-600/20', ic: 'text-emerald-600' },
} as const

export function Callout({ tone = 'info', title, children }: {
  tone?: keyof typeof CALLOUT; title?: string; children: ReactNode
}) {
  const t = CALLOUT[tone]
  return (
    <aside className={`my-6 flex gap-3.5 rounded-2xl ring-1 p-4 md:p-5 ${t.box}`}>
      <Icon icon={t.icon} className={`text-lg mt-0.5 shrink-0 ${t.ic}`} aria-hidden />
      <div className="min-w-0 text-sm leading-relaxed text-slate-700 [&_strong]:font-semibold [&_strong]:text-ink">
        {title && <p className="font-bold text-ink mb-1">{title}</p>}
        {children}
      </div>
    </aside>
  )
}

/* ── Tables ───────────────────────────────────────────────────────────── */

export function DocTable({ head, rows, firstColBold = true }: {
  head: ReactNode[]; rows: ReactNode[][]; firstColBold?: boolean
}) {
  return (
    <div className="my-6 overflow-x-auto rounded-2xl soft-card">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-[#F8F7F5]">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 border-t border-slate-100 align-top leading-relaxed ${
                  j === 0 && firstColBold ? 'font-semibold text-ink whitespace-nowrap' : 'text-slate-600'
                }`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Numbered steps ───────────────────────────────────────────────────── */

export function Steps({ items }: { items: { title: ReactNode; body: ReactNode }[] }) {
  return (
    <ol className="my-6 space-y-0">
      {items.map((s, i) => (
        <li key={i} className="relative flex gap-4 pb-8 last:pb-0">
          {/* connective rule between step markers */}
          {i < items.length - 1 && <span className="absolute left-[15px] top-9 bottom-1 w-px bg-slate-200" aria-hidden />}
          <span className="relative z-10 mt-0.5 w-8 h-8 rounded-full accent-gradient text-white text-[13px] font-bold flex items-center justify-center shrink-0 shadow-[0_6px_14px_-6px_rgba(255,107,53,0.5)]">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink text-[15px] leading-8">{s.title}</p>
            <div className="text-[15px] leading-[1.75] text-slate-600 [&_strong]:font-semibold [&_strong]:text-ink">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}
