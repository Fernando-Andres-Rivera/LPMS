import { supabase } from '../../lib/supabase'
import type { IndicatorCause } from '../../lib/types'

export async function fetchIndicatorCauses(indicatorId: string): Promise<IndicatorCause[]> {
  const { data, error } = await supabase
    .from('indicator_causes')
    .select('*')
    .eq('indicator_id', indicatorId)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createIndicatorCause(params: {
  indicatorId: string
  parentId: string | null
  name: string
  createdBy: string
}): Promise<IndicatorCause> {
  const { data, error } = await supabase
    .from('indicator_causes')
    .insert({
      indicator_id: params.indicatorId,
      parent_id: params.parentId,
      name: params.name,
      created_by: params.createdBy,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function tagCausalAnalysisWithIndicatorCause(
  causalAnalysisId: string,
  indicatorCauseId: string,
): Promise<void> {
  const { error } = await supabase
    .from('causal_analysis_indicator_causes')
    .insert({ causal_analysis_id: causalAnalysisId, indicator_cause_id: indicatorCauseId })

  if (error) throw error
}

export interface IndicatorCauseTag {
  causal_analysis_id: string
  indicator_cause_id: string
}

/**
 * Pares (análisis, causa) de la metodología "causas_estandar" de este
 * indicador. Igual que fetchTaggedCauses del Pareto general: primero se
 * traen los análisis del indicador, luego sus etiquetas — evita depender
 * de filtros embebidos de PostgREST sobre la tabla relacionada.
 */
export async function fetchIndicatorCauseTags(indicatorId: string): Promise<IndicatorCauseTag[]> {
  const { data: analyses, error: analysesError } = await supabase
    .from('causal_analyses')
    .select('id')
    .eq('indicator_id', indicatorId)
    .eq('methodology', 'causas_estandar')

  if (analysesError) throw analysesError
  const analysisIds = (analyses ?? []).map((a) => a.id)
  if (analysisIds.length === 0) return []

  const { data, error } = await supabase
    .from('causal_analysis_indicator_causes')
    .select('causal_analysis_id, indicator_cause_id')
    .in('causal_analysis_id', analysisIds)

  if (error) throw error
  return data ?? []
}

export interface IndicatorCauseParetoRow {
  cause: IndicatorCause
  count: number
}

/**
 * Igual que computeParetoForParent del Pareto general (causeTaxonomyApi.ts),
 * pero recorriendo el árbol PROPIO del indicador: cuenta, para cada hijo
 * directo de `parentId`, cuántos análisis distintos caen bajo ese hijo o
 * cualquiera de sus descendientes. Así "paradas por máquina" cambia a
 * "fallas por componentes de esa máquina" al entrar a un nodo.
 */
export function computeIndicatorCauseParetoForParent(
  causes: IndicatorCause[],
  tags: IndicatorCauseTag[],
  parentId: string | null,
): { rows: IndicatorCauseParetoRow[]; generalCount: number } {
  const childrenOf = (id: string | null) => causes.filter((c) => c.parent_id === id)

  function collectDescendantIds(id: string): Set<string> {
    const ids = new Set([id])
    const stack = [id]
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const child of childrenOf(current)) {
        if (!ids.has(child.id)) {
          ids.add(child.id)
          stack.push(child.id)
        }
      }
    }
    return ids
  }

  const rows = childrenOf(parentId)
    .map((cause) => {
      const descendantIds = collectDescendantIds(cause.id)
      const analysisIds = new Set(
        tags.filter((t) => descendantIds.has(t.indicator_cause_id)).map((t) => t.causal_analysis_id),
      )
      return { cause, count: analysisIds.size }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)

  const generalCount = parentId
    ? new Set(tags.filter((t) => t.indicator_cause_id === parentId).map((t) => t.causal_analysis_id)).size
    : 0

  return { rows, generalCount }
}
