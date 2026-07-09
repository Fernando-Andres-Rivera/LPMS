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

export interface NewCausalAnalysis {
  organization_id: string
  indicator_id: string
  measurement_id: string | null
  methodology: CausalMethodology
  description: string | null
  root_cause: string
  data: Record<string, unknown>
  created_by: string
}

export async function createCausalAnalysis(payload: NewCausalAnalysis): Promise<string> {
  const { data, error } = await supabase.from('causal_analyses').insert(payload).select('id').single()
  if (error) throw error
  return data.id
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
