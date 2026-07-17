import { MESES_CORTOS, quincenaStart, toIso } from '../../lib/periods'
import type { IndicatorFrequency } from '../../lib/types'

/**
 * Convierte measurements.period_date (siempre una fecha exacta, sin
 * importar la frecuencia — ver 20260713000000_period_aggregation.sql) hacia
 * y desde el selector nativo apropiado según la frecuencia del indicador:
 * <input type="date"> para diaria, type="week" para semanal, type="month"
 * para mensual/quincenal/trimestral (quincenal agrega un toggle 1ra/2da
 * porque el navegador no tiene un selector de quincena; trimestral
 * interpreta el mes elegido como el PRIMERO de una ventana de 3 meses
 * consecutivos que se desliza mes a mes — ene-feb-mar, feb-mar-abr… — no
 * un trimestre fijo de calendario).
 */

// ---- Semanal: <input type="week"> (valor "YYYY-Www", ISO 8601) ----

export function dateToWeekInputValue(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function weekInputValueToDate(value: string): string {
  const [yearStr, weekStr] = value.split('-W')
  const year = Number(yearStr)
  const week = Number(weekStr)
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7))
  const dayOfWeek = simple.getUTCDay() || 7
  const monday = new Date(simple)
  monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1)
  return monday.toISOString().slice(0, 10)
}

export function weekInputLabel(value: string): string {
  const start = new Date(weekInputValueToDate(value) + 'T00:00:00')
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return `${start.getDate()} ${MESES_CORTOS[start.getMonth()]} - ${end.getDate()} ${MESES_CORTOS[end.getMonth()]}`
}

// ---- Mensual: <input type="month"> (valor "YYYY-MM") ----

export function dateToMonthInputValue(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function monthInputValueToDate(value: string): string {
  return `${value}-01`
}

export function monthInputLabel(value: string): string {
  const [year, month] = value.split('-').map(Number)
  return `${MESES_CORTOS[month - 1]} ${year}`
}

// ---- Quincenal: <input type="month"> + toggle 1ra/2da ----

export function dateToQuincenaHalf(dateStr: string): 1 | 2 {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDate() <= 15 ? 1 : 2
}

export function quincenaToDate(month: string, half: 1 | 2): string {
  const [year, m] = month.split('-').map(Number)
  return toIso(quincenaStart(new Date(year, m - 1, half === 1 ? 1 : 16)))
}

export function quincenaLabel(month: string, half: 1 | 2): string {
  return `${half === 1 ? '1ra' : '2da'} quincena de ${monthInputLabel(month)}`
}

// ---- Trimestral (móvil): <input type="month"> = mes de inicio ----

export function dateToTrimesterStartMonth(dateStr: string): string {
  return dateToMonthInputValue(dateStr)
}

export function trimesterStartMonthToDate(month: string): string {
  return monthInputValueToDate(month)
}

export function trimesterLabel(startMonth: string): string {
  const [year, month] = startMonth.split('-').map(Number)
  const months = [0, 1, 2].map((i) => {
    const zeroBased = month - 1 + i
    return { name: MESES_CORTOS[zeroBased % 12], year: year + Math.floor(zeroBased / 12) }
  })
  const monthsStr = months.map((m) => m.name).join('-')
  return months[0].year === months[2].year
    ? `${monthsStr} ${months[0].year}`
    : `${monthsStr} ${months[0].year}/${months[2].year}`
}

/** Tope máximo seleccionable del período (no navegar a fechas futuras),
 * expresado en el formato del selector nativo de cada frecuencia. */
export function maxPeriodInputValue(frequency: IndicatorFrequency, todayIso: string): string {
  if (frequency === 'diaria') return todayIso
  if (frequency === 'semanal') return dateToWeekInputValue(todayIso)
  return dateToMonthInputValue(todayIso)
}
