import { supabase } from '../../lib/supabase'
import { calcularSemaforo } from '../../lib/semaforo'
import type { CausalAnalysis, CausalMethodology, Indicator, Target } from '../../lib/types'

export interface CausalAnalysisWithAuthor extends CausalAnalysis {
  profiles: { full_name: string } | null
  measurements: { period_date: string; site_locations: { name: string } | null } | null
}

export async function fetchCausalAnalyses(indicatorId: string): Promise<CausalAnalysisWithAuthor[]> {
  const { data, error } = await supabase
    .from('causal_analyses')
    .select('*, profiles(full_name), measurements(period_date, site_locations(name))')
    .eq('indicator_id', indicatorId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as CausalAnalysisWithAuthor[]
}

/** Causa raíz más reciente de varios indicadores, en una sola consulta.
 * Devuelve un mapa indicador -> causa raíz (el análisis más reciente con causa). */
export async function fetchLatestRootCauses(indicatorIds: string[]): Promise<Map<string, string>> {
  if (indicatorIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('causal_analyses')
    .select('indicator_id, root_cause, created_at')
    .in('indicator_id', indicatorIds)
    .order('created_at', { ascending: false })

  if (error) throw error
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.root_cause && !map.has(row.indicator_id)) map.set(row.indicator_id, row.root_cause)
  }
  return map
}

export interface NewCausalAnalysis {
  organization_id: string
  indicator_id: string
  measurement_id: string | null
  methodology: CausalMethodology
  description: string | null
  root_cause: string
  data: Record<string, unknown>
  impact_value?: number
  created_by: string
}

export async function createCausalAnalysis(payload: NewCausalAnalysis): Promise<string> {
  if (payload.measurement_id) {
    await replaceCausalAnalysesForMeasurement(payload.measurement_id, payload.root_cause)
  }
  const { data, error } = await supabase.from('causal_analyses').insert(payload).select('id').single()
  if (error) throw error
  return data.id
}

/**
 * Un mismo día puede tener varias causas REALES distintas (ej. el 14: una
 * inconsistencia por "Novedades con los EPP´S" y otra por "No cumplimiento
 * a la cantidad y calidad programada") — esas deben coexistir, no
 * pisarse. Lo que sí se reemplaza es la MISMA causa re-registrada para la
 * misma medición (mismo texto de causa raíz, sin distinguir mayúsculas ni
 * espacios): eso es un reintento porque la pantalla no confirmó el
 * guardado, no una segunda causa real, y dejarlo tal cual duplicaba el
 * impacto en el Pareto sin que nadie lo notara.
 *
 * Se preservan intactos los análisis que ya tienen un plan de acción
 * vinculado — borrarlos borraría también el plan (ON DELETE CASCADE), y
 * eso sí sería pérdida de trabajo real, no un duplicado.
 */
async function replaceCausalAnalysesForMeasurement(measurementId: string, rootCause: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('causal_analyses')
    .select('id, root_cause, action_plans(id)')
    .eq('measurement_id', measurementId)

  if (fetchError) throw fetchError

  const normalized = rootCause.trim().toLowerCase()
  const idsToReplace = (existing ?? [])
    .filter((a) => (a.root_cause ?? '').trim().toLowerCase() === normalized)
    .filter((a) => !a.action_plans || (Array.isArray(a.action_plans) && a.action_plans.length === 0))
    .map((a) => a.id)

  if (idsToReplace.length === 0) return

  const { error: tagsError } = await supabase
    .from('causal_analysis_indicator_causes')
    .delete()
    .in('causal_analysis_id', idsToReplace)
  if (tagsError) throw tagsError

  const { error: deleteError } = await supabase.from('causal_analyses').delete().in('id', idsToReplace)
  if (deleteError) throw deleteError
}

export interface MeasurementCause {
  id: string
  root_cause: string | null
  impact_value: number
  causeName: string | null
  hasPlan: boolean
}

/**
 * Las causas ya registradas contra UNA medición puntual (un día de un KPI),
 * con el nodo del árbol al que se etiquetaron y si ya tienen plan de acción
 * — la base del panel de distribución: "de las 20 inconsistencias del día,
 * cuántas ya están explicadas por cuál causal".
 */
export async function fetchCausesForMeasurement(measurementId: string): Promise<MeasurementCause[]> {
  const { data, error } = await supabase
    .from('causal_analyses')
    .select('id, root_cause, impact_value, action_plans(id), causal_analysis_indicator_causes(indicator_causes(name))')
    .eq('measurement_id', measurementId)
    .order('created_at')

  if (error) throw error

  interface RawRow {
    id: string
    root_cause: string | null
    impact_value: number
    action_plans: { id: string }[] | null
    causal_analysis_indicator_causes: { indicator_causes: { name: string } | null }[] | null
  }

  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    root_cause: row.root_cause,
    impact_value: Number(row.impact_value),
    causeName: row.causal_analysis_indicator_causes?.[0]?.indicator_causes?.name ?? null,
    hasPlan: (row.action_plans?.length ?? 0) > 0,
  }))
}

/** Borra un registro de causa puntual (corrección de mala digitación). El
 * llamador es responsable de no ofrecerlo cuando hay un plan de acción
 * vinculado — la cascada de la base de datos borraría el plan también. */
export async function deleteCausalAnalysis(id: string): Promise<void> {
  const { error: tagsError } = await supabase
    .from('causal_analysis_indicator_causes')
    .delete()
    .eq('causal_analysis_id', id)
  if (tagsError) throw tagsError

  const { error } = await supabase.from('causal_analyses').delete().eq('id', id)
  if (error) throw error
}

const RIGOR_STREAK = 3

/**
 * Un indicador requiere un análisis más riguroso cuando lleva `RIGOR_STREAK`
 * mediciones seguidas en estado "incumple" contra el objetivo vigente.
 */
export async function checkRequiresRigor(indicator: Indicator, currentTarget: Target | null): Promise<boolean> {
  if (!currentTarget) return false

  const { data, error } = await supabase
    .from('measurements')
    .select('value')
    .eq('indicator_id', indicator.id)
    .order('period_date', { ascending: false })
    .limit(RIGOR_STREAK)

  if (error) throw error
  if (!data || data.length < RIGOR_STREAK) return false

  return data.every(
    (m) => calcularSemaforo(m.value, currentTarget.target_value, indicator.improvement_direction) === 'incumple',
  )
}
