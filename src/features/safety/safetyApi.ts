import { supabase } from '../../lib/supabase'
import type { AccidentSeverity, SafetyEvent, SafetyEventType } from '../../lib/types'

export async function setSiteOperationStartDate(siteId: string, date: string | null): Promise<void> {
  const { error } = await supabase.from('sites').update({ operation_start_date: date }).eq('id', siteId)
  if (error) throw error
}

export interface NewSafetyEvent {
  organizationId: string
  siteId: string
  eventType: SafetyEventType
  eventDate: string
  severity: AccidentSeverity | null
  disabilityDays: number | null
  workersAffected: number | null
  description: string | null
  createdBy: string
}

export async function createSafetyEvent(input: NewSafetyEvent): Promise<void> {
  const { error } = await supabase.from('safety_events').insert({
    organization_id: input.organizationId,
    site_id: input.siteId,
    event_type: input.eventType,
    event_date: input.eventDate,
    severity: input.severity,
    disability_days: input.disabilityDays,
    workers_affected: input.workersAffected,
    description: input.description,
    created_by: input.createdBy,
  })
  if (error) throw error
}

export async function deleteSafetyEvent(id: string): Promise<void> {
  const { error } = await supabase.from('safety_events').delete().eq('id', id)
  if (error) throw error
}

export async function fetchSafetyEventsInRange(
  siteId: string,
  startDate: string,
  endDateExclusive: string,
): Promise<SafetyEvent[]> {
  const { data, error } = await supabase
    .from('safety_events')
    .select('*')
    .eq('site_id', siteId)
    .gte('event_date', startDate)
    .lt('event_date', endDateExclusive)
    .order('event_date', { ascending: false })

  if (error) throw error
  return data ?? []
}

/** El accidente más reciente del sitio (de cualquier año) — junto con
 * operation_start_date, es la base para calcular "días sin accidentes". */
export async function fetchLatestAccident(siteId: string): Promise<SafetyEvent | null> {
  const { data, error } = await supabase
    .from('safety_events')
    .select('*')
    .eq('site_id', siteId)
    .eq('event_type', 'accidente')
    .order('event_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/** "Días sin accidentes" cuenta desde el accidente más reciente; si nunca ha
 * habido uno, cuenta desde que arrancó la operación. Sin ninguna de las dos
 * fechas no hay nada que calcular (operación sin fecha de inicio configurada). */
export function computeDaysWithoutAccidents(
  operationStartDate: string | null,
  latestAccidentDate: string | null,
): number | null {
  const base = latestAccidentDate ?? operationStartDate
  if (!base) return null
  const baseDate = new Date(`${base}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - baseDate.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export type SafetyCrossColor = 'verde' | 'amarillo' | 'rojo'

/** Un accidente pinta el día de rojo; un incidente sin daño lo pinta de
 * amarillo (a menos que ese mismo día ya haya un accidente, que manda);
 * cualquier otro día del mes queda verde por defecto. Actos y condiciones
 * inseguras no pintan la cruz — son observaciones proactivas, no eventos con
 * consecuencia ese día. */
export function computeSafetyCross(
  events: SafetyEvent[],
  year: number,
  month: number,
): Record<number, SafetyCrossColor> {
  const daysInMonth = new Date(year, month, 0).getDate()
  const colors: Record<number, SafetyCrossColor> = {}
  for (let day = 1; day <= daysInMonth; day++) colors[day] = 'verde'

  for (const event of events) {
    const day = Number(event.event_date.slice(8, 10))
    if (event.event_type === 'accidente') colors[day] = 'rojo'
    else if (event.event_type === 'incidente' && colors[day] !== 'rojo') colors[day] = 'amarillo'
  }
  return colors
}

export interface SafetyMonthlyStats {
  workersInjured: number
  disabilityDays: number
  accidentCount: number
  unsafeActsReported: number
  unsafeConditionsReported: number
}

export function computeMonthlyStats(events: SafetyEvent[]): SafetyMonthlyStats {
  const accidents = events.filter((e) => e.event_type === 'accidente')
  return {
    workersInjured: accidents.reduce((sum, e) => sum + (e.workers_affected ?? 1), 0),
    disabilityDays: accidents.reduce((sum, e) => sum + (e.disability_days ?? 0), 0),
    accidentCount: accidents.length,
    unsafeActsReported: events.filter((e) => e.event_type === 'acto_inseguro').length,
    unsafeConditionsReported: events.filter((e) => e.event_type === 'condicion_insegura').length,
  }
}

export interface HeinrichPyramid {
  fatal: number
  serio: number
  leve: number
  incidentes: number
}

/** Pirámide de Heinrich (proporción clásica 1:10:30:600 entre accidente
 * fatal, serio, leve, e incidentes sin daño) — se calcula sobre el año en
 * curso completo, no solo el mes, porque un solo mes casi nunca acumula
 * suficientes eventos para que la pirámide diga algo. */
export function computeHeinrichPyramid(events: SafetyEvent[]): HeinrichPyramid {
  return {
    fatal: events.filter((e) => e.event_type === 'accidente' && e.severity === 'fatal').length,
    serio: events.filter((e) => e.event_type === 'accidente' && e.severity === 'serio').length,
    leve: events.filter((e) => e.event_type === 'accidente' && e.severity === 'leve').length,
    incidentes: events.filter((e) => e.event_type === 'incidente').length,
  }
}
