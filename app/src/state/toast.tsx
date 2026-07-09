import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import Icon from '../components/Icon'

type Kind = 'success' | 'error'
type Toast = { id: number; kind: Kind; msg: string; href?: string }
type Api = { success: (msg: string, opts?: { href?: string }) => void; error: (msg: string, opts?: { href?: string }) => void }

const Ctx = createContext<Api | null>(null)

export function useToast(): Api {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used within ToastProvider')
  return c
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: Kind, msg: string, href?: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, msg, href }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  const api = useMemo<Api>(
    () => ({ success: (m, o) => push('success', m, o?.href), error: (m, o) => push('error', m, o?.href) }),
    [push],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)]" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className="animate-pop soft-card rounded-xl px-4 py-3 flex items-start gap-3">
            <Icon
              icon={t.kind === 'success' ? 'lucide:circle-check' : 'lucide:triangle-alert'}
              className={`text-lg mt-0.5 shrink-0 ${t.kind === 'success' ? 'text-emerald-500' : 'text-red-500'}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#1E3A5F] break-words">{t.msg}</div>
              {t.href && (
                <a href={t.href} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-[#FF6B35] hover:underline">
                  View transaction <Icon icon="lucide:external-link" className="text-[10px]" aria-hidden />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
