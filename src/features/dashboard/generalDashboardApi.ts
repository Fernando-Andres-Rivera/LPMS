import { supabase } from '../../lib/supabase'
import type { PdcaStatus } from '../../lib/types'

export interface AxisActionPlan {
  id: string
  indicator_id: string
  description: string
  status: PdcaStatus
  causal_analysis_id: string | null
  root_cause: string | null
  responsible_name: string | null
  created_at: string
  due_date: string | null
  closed_at: string | null
}

/**
 * Planes de acción de varios indicadores (ej. todos los de un eje), con la
 * causa raíz del análisis al que quedaron vinculados (si lo están) — para
 * poder mostrar en una sola lista si la acción tiene un análisis detrás o
 * quedó "suelta". `range` acota a cuándo se REGISTRÓ la acción (created_at)
 * — es el rango de tiempo que se está revisando en la gestión, no de
 * ejecución.
 */
export async function fetchAxisActionPlans(
  indicatorIds: string[],
  range?: { from: string; to: string },
): Promise<AxisActionPlan[]> {
  if (indicatorIds.length === 0) return []
  let query = supabase
    .from('action_plans')
    .select(
      'id, indicator_id, description, status, causal_analysis_id, created_at, due_date, closed_at, ' +
        'causal_analyses(root_cause), responsible:profiles!action_plans_responsible_id_fkey(full_name)',
    )
    .in('indicator_id', indicatorIds)

  if (range) query = query.gte('created_at', range.from).lte('created_at', `${range.to}T23:59:59`)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error

  interface Row {
    id: string
    indicator_id: string
    description: string
    status: PdcaStatus
    causal_analysis_id: string | null
    created_at: string
    due_date: string | null
    closed_at: string | null
    causal_analyses: { root_cause: string | null } | null
    responsible: { full_name: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    indicator_id: row.indicator_id,
    description: row.description,
    status: row.status,
    causal_analysis_id: row.causal_analysis_id,
    root_cause: row.causal_analyses?.root_cause ?? null,
    responsible_name: row.responsible?.full_name ?? null,
    created_at: row.created_at,
    due_date: row.due_date,
    closed_at: row.closed_at,
  }))
}

/**
 * Días entre la fecha del período que originó cada análisis causal
 * (measurement.period_date) y cuándo quedó registrado ese análisis
 * (causal_analyses.created_at) — la métrica "< 5 días" de velocidad de
 * reacción. Solo cuenta análisis ligados a una medición puntual. `range`
 * acota a cuándo se REGISTRÓ el análisis (created_at), igual criterio que
 * fetchAxisActionPlans — el período de gestión que se está revisando.
 */
export async function fetchAnalysisSpeedDays(
  indicatorIds: string[],
  range?: { from: string; to: string },
): Promise<number[]> {
  if (indicatorIds.length === 0) return []
  let query = supabase
    .from('causal_analyses')
    .select('created_at, measurements(period_date)')
    .in('indicator_id', indicatorIds)

  if (range) query = query.gte('created_at', range.from).lte('created_at', `${range.to}T23:59:59`)

  const { data, error } = await query

  if (error) throw error

  interface Row {
    created_at: string
    measurements: { period_date: string } | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.measurements?.period_date)
    .map((row) => {
      const periodDate = new Date(row.measurements!.period_date + 'T00:00:00')
      const createdAt = new Date(row.created_at)
      return Math.max(0, Math.round((createdAt.getTime() - periodDate.getTime()) / 86400000))
    })
}
