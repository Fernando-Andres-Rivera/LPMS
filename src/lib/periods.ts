import type { AggregationMethod, PeriodType } from './types'

export interface PeriodBucket {
  label: string
  startDate: string
  endDate: string
}

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0 = domingo
  const diff = (day === 0 ? -6 : 1) - day // retrocede al lunes
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return monday
}

export function quincenaStart(d: Date): Date {
  const day = d.getDate() <= 15 ? 1 : 16
  return new Date(d.getFullYear(), d.getMonth(), day)
}

export function quincenaEnd(start: Date): Date {
  if (start.getDate() === 1) return new Date(start.getFullYear(), start.getMonth(), 15)
  return new Date(start.getFullYear(), start.getMonth() + 1, 0)
}

/**
 * Genera los últimos `count` períodos del tipo dado, terminando en el que
 * contiene `reference` (normalmente "hoy"). No navega a períodos futuros ni
 * permite elegir un ancla distinta — mantiene los tableros siempre viendo
 * el presente, igual que el resto del aplicativo.
 */
export function buildPeriodBuckets(type: PeriodType, reference: Date, count = 6): PeriodBucket[] {
  const buckets: PeriodBucket[] = []

  for (let i = count - 1; i >= 0; i--) {
    if (type === 'dia') {
      const d = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - i)
      buckets.push({ label: `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`, startDate: toIso(d), endDate: toIso(d) })
    } else if (type === 'semana') {
      const monday = startOfWeek(reference)
      monday.setDate(monday.getDate() - i * 7)
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
      buckets.push({
        label: `${monday.getDate()} ${MESES_CORTOS[monday.getMonth()]} - ${sunday.getDate()} ${MESES_CORTOS[sunday.getMonth()]}`,
        startDate: toIso(monday),
        endDate: toIso(sunday),
      })
    } else if (type === 'quincena') {
      const approx = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - i * 15)
      const start = quincenaStart(approx)
      const end = quincenaEnd(start)
      const half = start.getDate() === 1 ? '1ra' : '2da'
      buckets.push({
        label: `${half} quincena ${MESES_CORTOS[start.getMonth()]}`,
        startDate: toIso(start),
        endDate: toIso(end),
      })
    } else if (type === 'mes') {
      const start = new Date(reference.getFullYear(), reference.getMonth() - i, 1)
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
      buckets.push({
        label: `${MESES_CORTOS[start.getMonth()]} ${start.getFullYear()}`,
        startDate: toIso(start),
        endDate: toIso(end),
      })
    } else {
      const currentQuarterIndex = reference.getFullYear() * 4 + Math.floor(reference.getMonth() / 3) - i
      const year = Math.floor(currentQuarterIndex / 4)
      const quarter = currentQuarterIndex - year * 4
      const start = new Date(year, quarter * 3, 1)
      const end = new Date(year, quarter * 3 + 3, 0)
      buckets.push({ label: `T${quarter + 1} ${year}`, startDate: toIso(start), endDate: toIso(end) })
    }
  }

  return buckets
}

/** Combina varias mediciones dentro de un período en un único resultado, según la regla del indicador. */
export function aggregateValues(
  values: { period_date: string; value: number }[],
  method: AggregationMethod,
): number | null {
  if (values.length === 0) return null

  switch (method) {
    case 'suma':
      return values.reduce((sum, v) => sum + v.value, 0)
    case 'promedio':
      return values.reduce((sum, v) => sum + v.value, 0) / values.length
    case 'maximo':
      return Math.max(...values.map((v) => v.value))
    case 'minimo':
      return Math.min(...values.map((v) => v.value))
    case 'ultimo':
    default:
      return [...values].sort((a, b) => a.period_date.localeCompare(b.period_date))[values.length - 1].value
  }
}
