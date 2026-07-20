export const DEFAULT_RANGE_DAYS = 30

/** Fecha local en formato aaaa-mm-dd — a propósito NO usa toISOString(),
 * que convierte a UTC: pasada la medianoche UTC (ej. después de las 7pm en
 * Colombia, GMT-5) eso adelantaría "hoy" un día frente al calendario local
 * del usuario. */
function toLocalIso(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function today(): string {
  return toLocalIso(new Date())
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalIso(d)
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
