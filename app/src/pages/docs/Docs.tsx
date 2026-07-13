import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { DEFAULT_SLUG, DOC_GROUPS, DOC_PAGES } from './registry'

const ring =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2'

type TocItem = { id: string; label: string; level: 2 | 3 }

/* ── Sidebar ────────────────────────────────────────────────────────────── */

function SideNav({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    if (!q) return DOC_GROUPS
    return DOC_GROUPS.map((g) => ({
      ...g,
      pages: g.pages.filter(
        (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.group.toLowerCase().includes(q),
      ),
    })).filter((g) => g.pages.length > 0)
  }, [q])

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Filter documentation pages</span>
        <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter pages…"
          autoComplete="off"
          className={`w-full rounded-xl bg-white ring-1 ring-slate-200 pl-9 pr-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:ring-2 focus:ring-accent-ink focus:outline-none transition-shadow`}
        />
      </label>

      {groups.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          No pages match <span className="font-semibold text-ink">“{query}”</span>.
        </p>
      )}

      {groups.map((g) => (
        <nav key={g.group} className="mt-7" aria-label={g.group}>
          <h3 className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{g.group}</h3>
          <ul className="mt-2 space-y-0.5">
            {g.pages.map((p) => {
              const isActive = p.slug === active
              return (
                <li key={p.slug}>
                  <Link
                    to={`/docs/${p.slug}`}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${ring} ${
                      isActive
                        ? 'bg-accent/10 text-accent-ink font-bold'
                        : 'text-slate-500 font-medium hover:text-ink hover:bg-ink/[0.04]'
                    }`}
                  >
                    {p.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      ))}
    </div>
  )
}

/* ── On this page ───────────────────────────────────────────────────────── */

function OnThisPage({ toc, activeId }: { toc: TocItem[]; activeId: string }) {
  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }
  return (
    <nav aria-label="On this page">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        <Icon icon="lucide:align-left" aria-hidden /> On this page
      </h3>
      <ul className="mt-3 border-l border-slate-200">
        {toc.map((t) => {
          const isActive = t.id === activeId
          return (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                onClick={(e) => jump(e, t.id)}
                className={`block py-1.5 pr-2 text-[13px] leading-snug border-l-2 -ml-px transition-colors ${ring} rounded-r ${
                  t.level === 3 ? 'pl-7' : 'pl-4'
                } ${
                  isActive
                    ? 'border-accent text-accent-ink font-bold'
                    : 'border-transparent text-slate-500 hover:text-ink'
                }`}
              >
                {t.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ── The page ───────────────────────────────────────────────────────────── */

export default function Docs() {
  const { slug } = useParams<{ slug: string }>()
  const { hash } = useLocation()
  const current = slug ?? DEFAULT_SLUG
  const idx = DOC_PAGES.findIndex((p) => p.slug === current)
  const page = idx >= 0 ? DOC_PAGES[idx] : undefined

  const articleRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  // Collect this page's headings from the rendered article — the TOC can never
  // drift from the content because it is read off the DOM, not declared twice.
  // That read can only happen after render, hence setState inside the effect.
  useEffect(() => {
    const article = articleRef.current
    if (!article) return
    const hs = Array.from(article.querySelectorAll<HTMLElement>('h2[id], h3[id]'))
    setToc(hs.map((h) => ({ id: h.id, label: h.textContent ?? '', level: h.tagName === 'H3' ? 3 : 2 })))
    setActiveId(hs[0]?.id ?? '')

    // Deep links: ScrollToTop has already reset the scroll for the route change,
    // so jump to the anchor after paint.
    if (hash) {
      const target = document.getElementById(hash.slice(1))
      if (target) requestAnimationFrame(() => target.scrollIntoView())
    } else {
      titleRef.current?.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // Scroll-spy: the active heading is the last one above the reading line.
  useEffect(() => {
    if (toc.length === 0) return
    let raf = 0
    const read = () => {
      raf = 0
      let id = toc[0].id
      for (const t of toc) {
        const el = document.getElementById(t.id)
        if (el && el.getBoundingClientRect().top <= 120) id = t.id
        else break
      }
      setActiveId(id)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [toc])

  if (!page) return <Navigate to="/docs" replace />
  const Body = page.body
  const prev = DOC_PAGES[idx - 1]
  const next = DOC_PAGES[idx + 1]

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8">
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_212px] lg:gap-10 xl:gap-12">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block py-10">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 pb-8">
            <SideNav active={current} />
          </div>
        </aside>

        {/* Sidebar — mobile disclosure */}
        <div className="lg:hidden pt-6">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className={`w-full flex items-center justify-between gap-3 rounded-2xl soft-card px-4 py-3 text-sm font-bold text-ink ${ring}`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <Icon icon="lucide:book-open" className="text-accent-ink" aria-hidden />
              <span className="truncate">{page.group} · {page.title}</span>
            </span>
            <Icon icon={menuOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'} aria-hidden />
          </button>
          {menuOpen && (
            <div className="mt-2 rounded-2xl soft-card p-4 animate-pop">
              <SideNav active={current} onNavigate={() => setMenuOpen(false)} />
            </div>
          )}
        </div>

        {/* Content */}
        <main className="min-w-0 py-10 lg:py-12">
          <article ref={articleRef} className="max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-ink">{page.group}</p>
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="mt-2 text-4xl md:text-5xl font-display font-extrabold text-ink focus:outline-none"
            >
              {page.title}
            </h1>
            <p className="mt-3 text-base text-slate-500 leading-relaxed">{page.description}</p>
            <div className="line-divider mt-8" aria-hidden />

            <Body />

            {/* Prev / next */}
            <nav className="mt-16 grid gap-3 sm:grid-cols-2" aria-label="Pagination">
              {prev ? (
                <Link
                  to={`/docs/${prev.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className={`group soft-card soft-card-hover rounded-2xl p-4 flex items-center gap-3 ${ring}`}
                >
                  <Icon icon="lucide:arrow-left" className="text-slate-400 group-hover:text-accent-ink transition-colors shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Previous</span>
                    <span className="block text-sm font-bold text-ink truncate">{prev.title}</span>
                  </span>
                </Link>
              ) : (
                <span aria-hidden />
              )}
              {next && (
                <Link
                  to={`/docs/${next.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className={`group soft-card soft-card-hover rounded-2xl p-4 flex items-center justify-end gap-3 text-right sm:col-start-2 ${ring}`}
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Next</span>
                    <span className="block text-sm font-bold text-ink truncate">{next.title}</span>
                  </span>
                  <Icon icon="lucide:arrow-right" className="text-slate-400 group-hover:text-accent-ink transition-colors shrink-0" aria-hidden />
                </Link>
              )}
            </nav>
          </article>
        </main>

        {/* On this page — wide screens */}
        <aside className="hidden xl:block py-12">
          {toc.length > 1 && (
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8">
              <OnThisPage toc={toc} activeId={activeId} />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
