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

/** Dado el inicio de un bucket, arma su {label, startDate, endDate} — la
 * misma regla de etiquetado para las dos formas de generar buckets (los
 * últimos N terminando en una fecha, o los que caben dentro de un rango). */
function describeBucket(type: PeriodType, start: Date): PeriodBucket {
  if (type === 'dia') {
    return { label: `${start.getDate()} ${MESES_CORTOS[start.getMonth()]}`, startDate: toIso(start), endDate: toIso(start) }
  }
  if (type === 'semana') {
    const sunday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    return {
      label: `${start.getDate()} ${MESES_CORTOS[start.getMonth()]} - ${sunday.getDate()} ${MESES_CORTOS[sunday.getMonth()]}`,
      startDate: toIso(start),
      endDate: toIso(sunday),
    }
  }
  if (type === 'quincena') {
    const end = quincenaEnd(start)
    const half = start.getDate() === 1 ? '1ra' : '2da'
    return { label: `${half} quincena ${MESES_CORTOS[start.getMonth()]}`, startDate: toIso(start), endDate: toIso(end) }
  }
  if (type === 'mes') {
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return { label: `${MESES_CORTOS[start.getMonth()]} ${start.getFullYear()}`, startDate: toIso(start), endDate: toIso(end) }
  }
  const quarter = Math.floor(start.getMonth() / 3)
  const end = new Date(start.getFullYear(), quarter * 3 + 3, 0)
  return { label: `T${quarter + 1} ${start.getFullYear()}`, startDate: toIso(start), endDate: toIso(end) }
}

/** Inicio del bucket que contiene `reference`, desplazado `i` buckets hacia
 * atrás en el tiempo (i=0 es el bucket que contiene `reference`). */
function bucketStartAtOffset(type: PeriodType, reference: Date, i: number): Date {
  if (type === 'dia') return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - i)
  if (type === 'semana') {
    const monday = startOfWeek(reference)
    monday.setDate(monday.getDate() - i * 7)
    return monday
  }
  if (type === 'quincena') {
    const approx = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - i * 15)
    return quincenaStart(approx)
  }
  if (type === 'mes') return new Date(reference.getFullYear(), reference.getMonth() - i, 1)
  const currentQuarterIndex = reference.getFullYear() * 4 + Math.floor(reference.getMonth() / 3) - i
  const year = Math.floor(currentQuarterIndex / 4)
  const quarter = currentQuarterIndex - year * 4
  return new Date(year, quarter * 3, 1)
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
    buckets.push(describeBucket(type, bucketStartAtOffset(type, reference, i)))
  }
  return buckets
}

/**
 * Igual que buildPeriodBuckets, pero anclado a un rango [from, to] explícito
 * en vez de "las últimas N terminando hoy" — para pantallas donde el rango
 * de análisis lo elige el usuario. Itera hacia adelante desde el bucket que
 * contiene `from` hasta cubrir `to`; maxBuckets es un tope de seguridad para
 * no generar cientos de barras con una granularidad fina sobre un rango
 * amplio (ej. "diaria" sobre varios años).
 */
export function buildPeriodBucketsInRange(type: PeriodType, from: Date, to: Date, maxBuckets = 400): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  let start = bucketStartAtOffset(type, from, 0)
  const toIsoValue = toIso(to)
  let guard = 0
  while (toIso(start) <= toIsoValue && guard < maxBuckets) {
    const bucket = describeBucket(type, start)
    buckets.push(bucket)
    const end = new Date(`${bucket.endDate}T00:00:00`)
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
    guard++
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
