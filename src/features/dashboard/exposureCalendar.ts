import type { ExposureSchedule } from '../../lib/types'

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Fechas de exposición dentro del mes dado (`month` 0-based), según la
 * periodicidad configurada. Nunca antes de `start_date` — es el ancla que
 * el expositor o el cliente eligió para empezar a contar.
 */
export function computeExposureDatesInMonth(schedule: ExposureSchedule, year: number, month: number): string[] {
  const start = new Date(schedule.start_date + 'T00:00:00')
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const dates: string[] = []

  if (schedule.frequency === 'mensual') {
    if (schedule.day_of_month == null) return dates
    const day = Math.min(schedule.day_of_month, monthEnd.getDate())
    const d = new Date(year, month, day)
    if (d >= start) dates.push(toIso(d))
    return dates
  }

  if (schedule.frequency === 'semanal') {
    if (schedule.weekday == null) return dates
    const cursor = new Date(monthStart)
    while (cursor <= monthEnd) {
      if (cursor.getDay() === schedule.weekday && cursor >= start) dates.push(toIso(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return dates
  }

  // quincenal: cada 14 días desde start_date, tope de seguridad ante fechas
  // ancla muy lejanas (~76 años) para no iterar sin fin.
  const cursor = new Date(start)
  let guard = 0
  while (cursor <= monthEnd && guard < 2000) {
    if (cursor >= monthStart) dates.push(toIso(cursor))
    cursor.setDate(cursor.getDate() + 14)
    guard++
  }
  return dates
}

/** Próxima fecha de exposición desde `from` (inclusive) — para mostrar
 * "próxima exposición: …" sin tener que abrir el calendario. */
export function nextExposureDate(schedule: ExposureSchedule, from: Date): string | null {
  for (let i = 0; i < 3; i++) {
    const year = from.getFullYear()
    const month = from.getMonth() + i
    const dates = computeExposureDatesInMonth(schedule, year, month).filter((d) => d >= toIso(from))
    if (dates.length > 0) return dates[0]
  }
  return null
}
