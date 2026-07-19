export const DEFAULT_RANGE_DAYS = 30

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Día anterior a hoy (N-1) — el rango de análisis se ancla aquí y no en
 * "hoy" porque la captura del día en curso normalmente todavía no está
 * completa cuando se revisan los resultados. */
export function yesterday(): string {
  return daysAgo(1)
}

export interface DateRange {
  from: string
  to: string
}

export function defaultRange(): DateRange {
  return { from: daysAgo(DEFAULT_RANGE_DAYS), to: yesterday() }
}
