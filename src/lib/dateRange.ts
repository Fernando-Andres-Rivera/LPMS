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

/**
 * Día anterior a una fecha dada (no a hoy) — para pantallas que se pueden
 * consultar en retrospectiva: al abrir el tablero de un día pasado, los
 * resultados que se revisaron en esa reunión son los del día anterior a ESE
 * día, no los de ayer.
 *
 * Parte la cadena aaaa-mm-dd y arma la fecha con sus componentes en horario
 * local; `new Date('2026-07-26')` se interpretaría como medianoche UTC y en
 * Colombia (GMT-5) devolvería el día 25.
 */
export function dayBefore(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() - 1)
  return toLocalIso(d)
}

export interface DateRange {
  from: string
  to: string
}

export function defaultRange(): DateRange {
  return { from: daysAgo(DEFAULT_RANGE_DAYS), to: yesterday() }
}
