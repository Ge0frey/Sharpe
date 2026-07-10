import type { ReactNode } from 'react'
import Icon from './Icon'

export function Card({ children, className = '', hover = false, onClick, style }: {
  children: ReactNode; className?: string; hover?: boolean; onClick?: (e: any) => void; style?: any
}) {
  return (
    <div onClick={onClick} style={style} className={`soft-card rounded-2xl ${hover ? 'soft-card-hover' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Button({ children, onClick, disabled, variant = 'primary', className = '' }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean
  variant?: 'primary' | 'ink' | 'ghost' | 'outline'; className?: string
}) {
  const styles = {
    primary: 'btn-shine accent-gradient text-white glow-accent hover:-translate-y-0.5',
    // Ink is already near-black, so hover lightens rather than darkens.
    ink: 'bg-ink text-white hover:bg-ink-800',
    ghost: 'text-slate-500 hover:bg-slate-100',
    outline: 'bg-white border border-slate-200 text-ink hover:border-[#FF6B35]/50 hover:text-[#FF6B35]',
  }[variant]
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-[transform,background-color,box-shadow,color,border-color] duration-150 ease-out active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:translate-y-0 ${styles} ${className}`}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'muted' }: {
  children: ReactNode; tone?: 'green' | 'red' | 'muted' | 'amber' | 'accent' | 'ink'
}) {
  const t = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    accent: 'bg-[#FF6B35]/10 text-[#FF6B35]',
    ink: 'bg-ink/10 text-ink',
    muted: 'bg-slate-100 text-slate-500',
  }[tone]
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t}`}>{children}</span>
}

export function CLV({ bps }: { bps: number }) {
  const pos = bps >= 0
  return (
    <span className={`tabular font-bold ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
      {pos ? '+' : ''}{(bps / 100).toFixed(2)}%
    </span>
  )
}

export function Shield({ ok }: { ok: boolean | null }) {
  if (ok === null) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
      <Icon icon="lucide:loader-circle" className="animate-spin" /> verifying…
    </span>
  )
  return ok ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600">
      <Icon icon="lucide:shield-check" /> Proven on Solana
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-red-50 text-red-600">
      <Icon icon="lucide:shield-x" /> unverified
    </span>
  )
}
