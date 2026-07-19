import { supabase } from '../../lib/supabase'
import type { ActionPlan, PdcaStatus } from '../../lib/types'

export interface ActionPlanWithNames extends ActionPlan {
  responsible: { full_name: string } | null
  creator: { full_name: string } | null
  causal_analysis: { root_cause: string | null } | null
}

export async function fetchActionPlansForIndicator(indicatorId: string): Promise<ActionPlanWithNames[]> {
  const { data, error } = await supabase
    .from('action_plans')
    .select(
      '*, responsible:profiles!action_plans_responsible_id_fkey(full_name), creator:profiles!action_plans_created_by_fkey(full_name), causal_analysis:causal_analyses(root_cause)',
    )
    .eq('indicator_id', indicatorId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ActionPlanWithNames[]
}

/** Cantidad de planes de acción por indicador, en una sola consulta.
 * Devuelve un mapa indicador -> número de planes. */
export async function fetchActionPlanCounts(indicatorIds: string[]): Promise<Map<string, number>> {
  if (indicatorIds.length === 0) return new Map()
  const { data, error } = await supabase.from('action_plans').select('indicator_id').in('indicator_id', indicatorIds)
  if (error) throw error
  const map = new Map<string, number>()
  for (const row of data ?? []) map.set(row.indicator_id, (map.get(row.indicator_id) ?? 0) + 1)
  return map
}

export interface NewActionPlan {
  organization_id: string
  indicator_id: string
  causal_analysis_id: string | null
  description: string
  responsible_id: string | null
  event_date: string | null
  due_date: string | null
  created_by: string
}

export async function createActionPlan(payload: NewActionPlan): Promise<void> {
  const { error } = await supabase.from('action_plans').insert({ ...payload, status: 'planificar' })
  if (error) throw error
}

export async function advanceActionPlanStatus(id: string, status: PdcaStatus): Promise<void> {
  const { error } = await supabase
    .from('action_plans')
    .update({ status, closed_at: status === 'cerrado' ? new Date().toISOString() : null })
    .eq('id', id)

  if (error) throw error
}
