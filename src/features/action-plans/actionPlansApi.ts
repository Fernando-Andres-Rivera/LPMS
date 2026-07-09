import { supabase } from '../../lib/supabase'
import type { ActionPlan, PdcaStatus } from '../../lib/types'

export interface ActionPlanWithNames extends ActionPlan {
  responsible: { full_name: string } | null
  creator: { full_name: string } | null
}

export async function fetchActionPlansForIndicator(indicatorId: string): Promise<ActionPlanWithNames[]> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*, responsible:profiles!action_plans_responsible_id_fkey(full_name), creator:profiles!action_plans_created_by_fkey(full_name)')
    .eq('indicator_id', indicatorId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ActionPlanWithNames[]
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
