import { useEffect, useRef, useState } from 'react'

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

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
