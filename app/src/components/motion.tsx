import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** Fires once when the element scrolls into view. Drives scroll-triggered entrances. */
export function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px', ...options },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

/** Wraps children so they rise+fade in the first time they enter the viewport. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={`${inView ? 'reveal' : 'opacity-0'} ${className}`} style={inView ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

/** rAF count-up from the previous value to `target`. */
export function useCountUp(target: number, duration = 900): number {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const val = a + (target - a) * easeOut(p)
      setV(val)
      if (p < 1) raf = requestAnimationFrame(tick)
      else { setV(target); from.current = target }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return v
}

export function CountUp({ value, format, duration, className }: {
  value: number; format?: (n: number) => string; duration?: number; className?: string
}) {
  const v = useCountUp(value, duration)
  return <span className={className}>{format ? format(v) : Math.round(v).toString()}</span>
}
