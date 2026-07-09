import { supabase } from '../../lib/supabase'
import type { Indicator, Profile } from '../../lib/types'

export interface IndicatorWithSiteName extends Indicator {
  sites: { name: string } | null
}

/** Indicadores de frecuencia diaria, para el reporte de cumplimiento de captura. */
export async function fetchDailyIndicators(
  organizationId: string,
  siteId: string | null,
): Promise<IndicatorWithSiteName[]> {
  let query = supabase
    .from('indicators')
    .select('*, sites(name)')
    .eq('organization_id', organizationId)
    .eq('frequency', 'diaria')
    .eq('active', true)

  if (siteId) query = query.eq('site_id', siteId)

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
  let query = supabase.from('indicators').select('*').eq('organization_id', organizationId).eq('active', true)

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

export async function saveMeasurement(params: {
  indicatorId: string
  periodDate: string
  value: number
  comment: string | null
  siteLocationId: string | null
  capturedBy: string
}) {
  const { error } = await supabase.from('measurements').upsert(
    {
      indicator_id: params.indicatorId,
      period_date: params.periodDate,
      value: params.value,
      comment: params.comment,
      site_location_id: params.siteLocationId,
      captured_by: params.capturedBy,
    },
    { onConflict: 'indicator_id,period_date' },
  )

  if (error) throw error
}
