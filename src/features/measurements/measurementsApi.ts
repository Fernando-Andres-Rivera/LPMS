import { supabase } from '../../lib/supabase'
import type { Indicator, Profile } from '../../lib/types'

export interface IndicatorWithSiteName extends Indicator {
  sites: { name: string } | null
}

/** Indicadores de frecuencia diaria, para el reporte de cumplimiento de captura. */
export async function fetchDailyIndicators(
  organizationId: string,
  siteId: string | null,
  axisId: string | null,
): Promise<IndicatorWithSiteName[]> {
  let query = supabase
    .from('indicators')
    .select('*, sites(name)')
    .eq('organization_id', organizationId)
    .eq('frequency', 'diaria')
    .eq('active', true)

  if (siteId) query = query.eq('site_id', siteId)
  if (axisId) query = query.eq('axis_id', axisId)

  const { data, error } = await query.order('name')
  if (error) throw error
  return (data ?? []) as unknown as IndicatorWithSiteName[]
}

/** Fechas ya capturadas para un conjunto de indicadores, dentro de un rango. */
export async function fetchCapturedDates(
  indicatorIds: string[],
  startDate: string,
  endDate: string,
): Promise<{ indicator_id: string; period_date: string }[]> {
  if (indicatorIds.length === 0) return []

  const { data, error } = await supabase
    .from('measurements')
    .select('indicator_id, period_date')
    .in('indicator_id', indicatorIds)
    .gte('period_date', startDate)
    .lte('period_date', endDate)

  if (error) throw error
  return data ?? []
}

/**
 * Indicadores que el usuario puede capturar, filtrados en el cliente según su
 * rol y sitios asignados. La aplicación estricta del permiso ocurre en RLS;
 * este filtro solo mejora la experiencia mostrando únicamente opciones válidas.
 */
export async function fetchCapturableIndicators(
  profile: Profile,
  organizationId: string,
  siteIds: string[],
): Promise<Indicator[]> {
  let query = supabase
    .from('indicators')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .eq('is_calculated', false)

  if (profile.role === 'operativo') {
    query = query.eq('level', 1).in('site_id', siteIds.length ? siteIds : ['00000000-0000-0000-0000-000000000000'])
  } else if (profile.role === 'administrativo') {
    query = query
      .in('level', [1, 2])
      .in('site_id', siteIds.length ? siteIds : ['00000000-0000-0000-0000-000000000000'])
  }
  // gerente, admin_cliente y admin_consultora pueden capturar cualquier indicador del tenant

  const { data, error } = await query.order('level').order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchMeasurementById(id: string) {
  const { data, error } = await supabase.from('measurements').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchMeasurementForPeriod(indicatorId: string, periodDate: string) {
  const { data, error } = await supabase
    .from('measurements')
    .select('*')
    .eq('indicator_id', indicatorId)
    .eq('period_date', periodDate)
    .maybeSingle()

  if (error) throw error
  return data
}

export interface MeasurementOverrideReason {
  id: string
  code: string
  name: string
}

/** Catálogo de causales para autorizar una edición después del cierre — lo
 * gestiona admin_consultora (mismo patrón que el catálogo de ejes). */
export async function fetchMeasurementOverrideReasons(): Promise<MeasurementOverrideReason[]> {
  const { data, error } = await supabase
    .from('measurement_override_reasons')
    .select('id, code, name')
    .eq('active', true)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}

/**
 * Autoriza una corrección tardía Y guarda la medición en una sola llamada
 * atómica (función de servidor) — hacerlo como dos peticiones HTTP
 * separadas (autorizar, luego guardar) dejaba una carrera real: la
 * segunda a veces no alcanzaba a "ver" la autorización que la primera
 * acababa de insertar. Solo admin_consultora puede ejecutarla (la función
 * lo exige del lado del servidor, no solo aquí).
 */
export async function authorizeAndSaveMeasurement(params: {
  indicatorId: string
  periodDate: string
  reasonId: string
  authComment: string | null
  value: number
  measurementComment: string | null
  siteLocationId: string | null
  plannedValue?: number | null
  realValue?: number | null
}): Promise<void> {
  const { error } = await supabase.rpc('authorize_and_save_measurement', {
    p_indicator_id: params.indicatorId,
    p_period_date: params.periodDate,
    p_reason_id: params.reasonId,
    p_auth_comment: params.authComment,
    p_value: params.value,
    p_measurement_comment: params.measurementComment,
    p_site_location_id: params.siteLocationId,
    p_planned_value: params.plannedValue ?? null,
    p_real_value: params.realValue ?? null,
  })
  if (error) throw error
}

export async function saveMeasurement(params: {
  indicatorId: string
  periodDate: string
  value: number
  comment: string | null
  siteLocationId: string | null
  capturedBy: string
  // Solo para indicadores de razón (programado vs real) — value ya trae el
  // % calculado; estos dos quedan aparte para poder mostrarlos/editarlos
  // desglosados en la pantalla de captura.
  plannedValue?: number | null
  realValue?: number | null
}) {
  const { error } = await supabase.from('measurements').upsert(
    {
      indicator_id: params.indicatorId,
      period_date: params.periodDate,
      value: params.value,
      comment: params.comment,
      site_location_id: params.siteLocationId,
      captured_by: params.capturedBy,
      planned_value: params.plannedValue ?? null,
      real_value: params.realValue ?? null,
    },
    { onConflict: 'indicator_id,period_date' },
  )

  if (error) throw error
}
