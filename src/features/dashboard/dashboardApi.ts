import { supabase } from '../../lib/supabase'
import { aggregateValues, type PeriodBucket } from '../../lib/periods'
import type { AggregationMethod, Axis, Indicator, IndicatorLink, Target } from '../../lib/types'

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

/**
 * Indicadores de un eje, opcionalmente acotados a un sitio — igual que
 * fetchIndicatorsByLevel, incluye los corporativos (site_id nulo) junto con
 * los del sitio elegido, para no perder de vista los objetivos que aplican
 * a toda la organización.
 */
export async function fetchIndicatorsByAxis(
  organizationId: string,
  axisId: string,
  siteId?: string | null,
): Promise<Indicator[]> {
  let query = supabase
    .from('indicators')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('axis_id', axisId)
    .eq('active', true)

  query = siteId ? query.or(`site_id.eq.${siteId},site_id.is.null`) : query

  const { data, error } = await query.order('level', { ascending: true })
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

/**
 * Fila de la vista indicator_status: el indicador con su último valor,
 * objetivo vigente y nombres de eje/sitio/responsable ya unidos. Una sola
 * consulta resuelve todo el resumen, sin el patrón N+1 de antes.
 */
export interface IndicatorStatus {
  id: string
  organization_id: string
  site_id: string | null
  site_location_id: string | null
  axis_id: string
  level: 1 | 2 | 3
  name: string
  unit: string
  frequency: Indicator['frequency']
  improvement_direction: Indicator['improvement_direction']
  aggregation_method: Indicator['aggregation_method']
  responsible_id: string | null
  active: boolean
  axis_name: string | null
  axis_color: string | null
  site_name: string | null
  responsible_name: string | null
  latest_value: number | null
  latest_period_date: string | null
  target_value: number | null
  value_type: Indicator['value_type']
}

export async function fetchIndicatorStatuses(
  organizationId: string,
  siteId?: string | null,
): Promise<IndicatorStatus[]> {
  let query = supabase
    .from('indicator_status')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)

  // Igual que fetchIndicatorsByAxis/fetchIndicatorsByLevel: filtrar por sitio
  // no debe ocultar los indicadores corporativos (site_id nulo), que aplican
  // a toda la organización sin importar el sitio elegido.
  query = siteId ? query.or(`site_id.eq.${siteId},site_id.is.null`) : query

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as IndicatorStatus[]
}

/**
 * Igual que fetchIndicatorStatuses, pero latest_value/latest_period_date se
 * calculan a partir de las mediciones DENTRO del rango dado (agregadas según
 * la regla de cada indicador), en vez de "la última medición sin importar
 * cuándo" — y target_value usa el objetivo vigente al final del rango. Así
 * el semáforo de estas pantallas responde "cómo íbamos en ese período", no
 * siempre el estado de hoy. Si un indicador no tiene mediciones dentro del
 * rango, queda en sin_datos aunque sí tenga un valor más reciente fuera de él.
 */
export async function fetchIndicatorStatusesInRange(
  organizationId: string,
  range: { from: string; to: string },
  siteId?: string | null,
): Promise<IndicatorStatus[]> {
  const statuses = await fetchIndicatorStatuses(organizationId, siteId)
  if (statuses.length === 0) return []

  const ids = statuses.map((s) => s.id)
  const [measurementRows, targetMap] = await Promise.all([
    fetchMeasurementsInRange(ids, range.from, range.to),
    fetchCurrentTargetsForIndicators(ids, Number(range.to.slice(0, 4)), Number(range.to.slice(5, 7))),
  ])

  const measByIndicator = new Map<string, { period_date: string; value: number }[]>()
  for (const m of measurementRows) {
    const list = measByIndicator.get(m.indicator_id) ?? []
    list.push({ period_date: m.period_date, value: m.value })
    measByIndicator.set(m.indicator_id, list)
  }

  return statuses.map((status) => {
    const rows = measByIndicator.get(status.id) ?? []
    const latestPeriodDate = rows.length
      ? rows.reduce((max, r) => (r.period_date > max ? r.period_date : max), rows[0].period_date)
      : null
    return {
      ...status,
      latest_value: aggregateValues(rows, status.aggregation_method),
      latest_period_date: latestPeriodDate,
      target_value: targetMap.get(status.id) ?? status.target_value,
    }
  })
}

/** Todas las mediciones de varios indicadores dentro de un rango, en una sola
 * consulta — para agregar por período en el cliente sin un round-trip por indicador. */
export async function fetchMeasurementsInRange(
  indicatorIds: string[],
  startDate: string,
  endDate: string,
): Promise<{ indicator_id: string; period_date: string; value: number }[]> {
  if (indicatorIds.length === 0) return []
  const { data, error } = await supabase
    .from('measurements')
    .select('indicator_id, period_date, value')
    .in('indicator_id', indicatorIds)
    .gte('period_date', startDate)
    .lte('period_date', endDate)

  if (error) throw error
  return data ?? []
}

/** Objetivo vigente (mensual con fallback a anual) de varios indicadores, en una
 * sola consulta. Devuelve un mapa indicador -> valor objetivo. */
export async function fetchCurrentTargetsForIndicators(
  indicatorIds: string[],
  year: number,
  month: number,
): Promise<Map<string, number>> {
  if (indicatorIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('targets')
    .select('indicator_id, period_month, target_value')
    .in('indicator_id', indicatorIds)
    .eq('period_year', year)
    .or(`period_month.eq.${month},period_month.is.null`)

  if (error) throw error

  const monthly = new Map<string, number>()
  const annual = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.period_month === month) monthly.set(row.indicator_id, row.target_value)
    else if (row.period_month === null) annual.set(row.indicator_id, row.target_value)
  }
  const result = new Map<string, number>()
  for (const id of indicatorIds) {
    const value = monthly.get(id) ?? annual.get(id)
    if (value !== undefined) result.set(id, value)
  }
  return result
}

export interface PeriodResult {
  label: string
  date: string
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
    date: bucket.startDate,
    value: aggregateValues(
      rows.filter((r) => r.period_date >= bucket.startDate && r.period_date <= bucket.endDate),
      method,
    ),
  }))
}

/**
 * Igual que fetchIndicatorPeriodSeries, pero para un indicador CALCULADO: en
 * vez de leer measurements propios, combina — con la misma
 * aggregation_method — el valor de cada bucket de sus indicadores hijo
 * (recursivo: un hijo también puede ser calculado). `allIndicators`/`allLinks`
 * se traen una sola vez para toda la organización (mismo patrón que
 * cascadeApi.fetchCascadeData) y se reutilizan en cada nivel de la
 * recursión, para no hacer una consulta nueva por cada indicador del árbol.
 */
export async function computeIndicatorSeries(
  indicator: Indicator,
  allIndicators: Indicator[],
  allLinks: IndicatorLink[],
  buckets: PeriodBucket[],
): Promise<PeriodResult[]> {
  if (!indicator.is_calculated) {
    return fetchIndicatorPeriodSeries(indicator.id, buckets, indicator.aggregation_method)
  }

  const childIds = allLinks.filter((l) => l.parent_indicator_id === indicator.id).map((l) => l.child_indicator_id)
  const children = allIndicators.filter((i) => childIds.includes(i.id))
  if (children.length === 0) return buckets.map((b) => ({ label: b.label, date: b.startDate, value: null }))

  const childSeries = await Promise.all(
    children.map((child) => computeIndicatorSeries(child, allIndicators, allLinks, buckets)),
  )

  return buckets.map((bucket, i) => {
    const values = childSeries
      .map((series) => series[i]?.value)
      .filter((v): v is number => v !== null && v !== undefined)
      .map((value) => ({ period_date: bucket.endDate, value }))
    return { label: bucket.label, date: bucket.startDate, value: aggregateValues(values, indicator.aggregation_method) }
  })
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
