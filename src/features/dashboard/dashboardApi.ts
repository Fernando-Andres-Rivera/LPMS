import { supabase } from '../../lib/supabase'
import { aggregateValues, type PeriodBucket } from '../../lib/periods'
import type { AggregationMethod, Axis, Indicator, Measurement, Target } from '../../lib/types'

/** Ejes activos para la organización del usuario, ordenados por sort_order. */
export async function fetchActiveAxes(organizationId: string): Promise<Axis[]> {
  const { data, error } = await supabase
    .from('organization_axes')
    .select('active, axes(*)')
    .eq('organization_id', organizationId)
    .eq('active', true)

  if (error) throw error
  return (data ?? [])
    .map((row) => row.axes as unknown as Axis)
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function fetchAxisById(axisId: string): Promise<Axis | null> {
  const { data, error } = await supabase.from('axes').select('*').eq('id', axisId).single()
  if (error) return null
  return data
}

export async function fetchIndicatorsByAxis(organizationId: string, axisId: string): Promise<Indicator[]> {
  const { data, error } = await supabase
    .from('indicators')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('axis_id', axisId)
    .eq('active', true)
    .order('level', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Indicadores de un nivel específico, para las reuniones de gestión que se
 * organizan por nivel (revisando los 7 ejes juntos) en vez de por eje.
 * Incluye los indicadores corporativos (site_id nulo) junto con los del
 * sitio seleccionado, para no perder de vista los objetivos que aplican a
 * toda la organización.
 */
export async function fetchIndicatorsByLevel(
  organizationId: string,
  level: 1 | 2 | 3,
  siteId: string | null,
): Promise<Indicator[]> {
  let query = supabase
    .from('indicators')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('level', level)
    .eq('active', true)

  query = siteId ? query.or(`site_id.eq.${siteId},site_id.is.null`) : query

  const { data, error } = await query.order('axis_id')
  if (error) throw error
  return data ?? []
}

export interface IndicatorWithContext extends Indicator {
  axes: Pick<Axis, 'id' | 'name' | 'color'> | null
  sites: { id: string; name: string } | null
  profiles: { full_name: string } | null
}

/** Todos los indicadores activos de la organización, con eje, sitio y responsable embebidos. */
export async function fetchAllIndicatorsWithContext(organizationId: string): Promise<IndicatorWithContext[]> {
  const { data, error } = await supabase
    .from('indicators')
    .select('*, axes(id, name, color), sites(id, name), profiles(full_name)')
    .eq('organization_id', organizationId)
    .eq('active', true)

  if (error) throw error
  return (data ?? []) as unknown as IndicatorWithContext[]
}

const TREND_LENGTH = 6

export async function fetchIndicatorTrend(indicatorId: string): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from('measurements')
    .select('*')
    .eq('indicator_id', indicatorId)
    .order('period_date', { ascending: false })
    .limit(TREND_LENGTH)

  if (error) throw error
  return (data ?? []).reverse()
}

export interface PeriodResult {
  label: string
  value: number | null
}

/**
 * Trae las mediciones del indicador que caen dentro de los `buckets` dados
 * (una sola consulta cubriendo el rango completo) y las agrega por período
 * según la regla del indicador (suma/promedio/último/máximo/mínimo). El
 * último elemento del resultado es el período vigente (ej. "esta semana").
 */
export async function fetchIndicatorPeriodSeries(
  indicatorId: string,
  buckets: PeriodBucket[],
  method: AggregationMethod,
): Promise<PeriodResult[]> {
  if (buckets.length === 0) return []

  const { data, error } = await supabase
    .from('measurements')
    .select('period_date, value')
    .eq('indicator_id', indicatorId)
    .gte('period_date', buckets[0].startDate)
    .lte('period_date', buckets[buckets.length - 1].endDate)

  if (error) throw error
  const rows = data ?? []

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: aggregateValues(
      rows.filter((r) => r.period_date >= bucket.startDate && r.period_date <= bucket.endDate),
      method,
    ),
  }))
}

export async function fetchCurrentTarget(indicatorId: string, year: number, month: number): Promise<Target | null> {
  // Primero busca el objetivo específico del mes; si no existe, cae al objetivo anual (period_month null).
  const { data, error } = await supabase
    .from('targets')
    .select('*')
    .eq('indicator_id', indicatorId)
    .eq('period_year', year)
    .in('period_month', [month])
    .maybeSingle()

  if (error) throw error
  if (data) return data

  const { data: annual, error: annualError } = await supabase
    .from('targets')
    .select('*')
    .eq('indicator_id', indicatorId)
    .eq('period_year', year)
    .is('period_month', null)
    .maybeSingle()

  if (annualError) throw annualError
  return annual
}
