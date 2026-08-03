import { useEffect, useRef, useState } from 'react'

/**
 * Número que "cuenta" hasta su valor al montar o al cambiar — el patrón
 * number-ticker de los tableros modernos, aplicado al dato que más pesa en
 * la reunión. Anima desde el valor anterior (no desde 0 en cada cambio de
 * rango); si el usuario pidió menos movimiento, el primer frame ya pinta
 * el valor final (duración 0).
 */
export function NumberTicker({ value, durationMs = 700 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const frameRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 0 : durationMs
    const start = performance.now()

    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, durationMs])

  return <>{shown}</>
}
