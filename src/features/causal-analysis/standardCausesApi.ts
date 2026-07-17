import { supabase } from '../../lib/supabase'
import type { IndicatorCause, IndicatorRootCause } from '../../lib/types'

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

/** Igual que fetchIndicatorCauses pero para varios indicadores a la vez —
 * evita N consultas al armar un resumen de todo un eje (ej. el Dashboard). */
export async function fetchIndicatorCausesForMany(indicatorIds: string[]): Promise<Map<string, IndicatorCause[]>> {
  if (indicatorIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('indicator_causes')
    .select('*')
    .in('indicator_id', indicatorIds)
    .eq('active', true)
    .order('name')

  if (error) throw error
  const map = new Map<string, IndicatorCause[]>()
  for (const row of data ?? []) {
    const list = map.get(row.indicator_id) ?? []
    list.push(row)
    map.set(row.indicator_id, list)
  }
  return map
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

export async function fetchIndicatorRootCauses(indicatorId: string): Promise<IndicatorRootCause[]> {
  const { data, error } = await supabase
    .from('indicator_root_causes')
    .select('*')
    .eq('indicator_id', indicatorId)
    .order('text')

  if (error) throw error
  return data ?? []
}

/** Agrega una frase nueva al catálogo de causa raíz de este indicador. Si
 * otro usuario guardó la misma frase (sin distinguir mayúsculas) apenas
 * antes, no es un error de verdad — se recupera esa fila existente en vez
 * de fallar, para no bloquear a quien solo se adelantó por una carrera. */
export async function createIndicatorRootCause(params: {
  indicatorId: string
  text: string
  createdBy: string
}): Promise<IndicatorRootCause> {
  const { data, error } = await supabase
    .from('indicator_root_causes')
    .insert({ indicator_id: params.indicatorId, text: params.text, created_by: params.createdBy })
    .select('*')
    .single()

  if (!error) return data

  if (error.code === '23505') {
    const { data: existing, error: fetchError } = await supabase
      .from('indicator_root_causes')
      .select('*')
      .eq('indicator_id', params.indicatorId)
      .ilike('text', params.text)
      .single()
    if (fetchError) throw fetchError
    return existing
  }
  throw error
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

/** Borra un nodo mal creado (típico error: escritura, ubicación equivocada
 * en el árbol). Sus sub-causas se van con él en cascada, y las etiquetas
 * hacia este nodo o sus sub-causas también — el ANÁLISIS (causa raíz
 * identificada) no se borra, solo pierde su clasificación en el Pareto.
 * Por eso siempre se avisa con countCauseImpact antes de confirmar. */
export async function deleteIndicatorCause(id: string): Promise<void> {
  const { error } = await supabase.from('indicator_causes').delete().eq('id', id)
  if (error) throw error
}

export interface IndicatorCauseTag {
  causal_analysis_id: string
  indicator_cause_id: string
  impact_value: number
}

/**
 * Pares (análisis, causa) de la metodología "causas_estandar" de este
 * indicador. Igual que fetchTaggedCauses del Pareto general: primero se
 * traen los análisis del indicador, luego sus etiquetas — evita depender
 * de filtros embebidos de PostgREST sobre la tabla relacionada.
 *
 * impact_value viaja en el análisis (no en la etiqueta) — se adjunta a
 * cada par para que el Pareto pueda sumar impacto en vez de solo contar.
 */
export async function fetchIndicatorCauseTags(indicatorId: string): Promise<IndicatorCauseTag[]> {
  const { data: analyses, error: analysesError } = await supabase
    .from('causal_analyses')
    .select('id, impact_value')
    .eq('indicator_id', indicatorId)
    .eq('methodology', 'causas_estandar')

  if (analysesError) throw analysesError
  const impactById = new Map((analyses ?? []).map((a) => [a.id, a.impact_value ?? 1]))
  const analysisIds = (analyses ?? []).map((a) => a.id)
  if (analysisIds.length === 0) return []

  const { data, error } = await supabase
    .from('causal_analysis_indicator_causes')
    .select('causal_analysis_id, indicator_cause_id')
    .in('causal_analysis_id', analysisIds)

  if (error) throw error
  return (data ?? []).map((row) => ({
    ...row,
    impact_value: impactById.get(row.causal_analysis_id) ?? 1,
  }))
}

/** Igual que fetchIndicatorCauseTags pero para varios indicadores a la vez —
 * evita N consultas al armar un resumen de todo un eje (ej. el Dashboard). */
export async function fetchIndicatorCauseTagsForMany(
  indicatorIds: string[],
): Promise<Map<string, IndicatorCauseTag[]>> {
  if (indicatorIds.length === 0) return new Map()
  const { data: analyses, error: analysesError } = await supabase
    .from('causal_analyses')
    .select('id, indicator_id, impact_value')
    .in('indicator_id', indicatorIds)
    .eq('methodology', 'causas_estandar')

  if (analysesError) throw analysesError
  const impactById = new Map((analyses ?? []).map((a) => [a.id, a.impact_value ?? 1]))
  const indicatorByAnalysis = new Map((analyses ?? []).map((a) => [a.id, a.indicator_id]))
  const analysisIds = (analyses ?? []).map((a) => a.id)
  if (analysisIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('causal_analysis_indicator_causes')
    .select('causal_analysis_id, indicator_cause_id')
    .in('causal_analysis_id', analysisIds)

  if (error) throw error
  const map = new Map<string, IndicatorCauseTag[]>()
  for (const row of data ?? []) {
    const indicatorId = indicatorByAnalysis.get(row.causal_analysis_id)
    if (!indicatorId) continue
    const list = map.get(indicatorId) ?? []
    list.push({ ...row, impact_value: impactById.get(row.causal_analysis_id) ?? 1 })
    map.set(indicatorId, list)
  }
  return map
}

export interface IndicatorCauseParetoRow {
  cause: IndicatorCause
  count: number
  impactTotal: number
}

/**
 * Igual que computeParetoForParent del Pareto general (causeTaxonomyApi.ts),
 * pero recorriendo el árbol PROPIO del indicador: para cada hijo directo de
 * `parentId`, suma el impact_value de los análisis distintos que caen bajo
 * ese hijo o cualquiera de sus descendientes (además de contarlos). Así
 * "paradas por máquina" cambia a "fallas por componentes de esa máquina" al
 * entrar a un nodo, y el orden refleja impacto acumulado, no solo cuántas
 * veces se repitió — relevante cuando un indicador acumula muchos hallazgos
 * de severidad distinta (ej. novedades de gemba walk) en un mismo mes.
 */
export function computeIndicatorCauseParetoForParent(
  causes: IndicatorCause[],
  tags: IndicatorCauseTag[],
  parentId: string | null,
): { rows: IndicatorCauseParetoRow[]; generalCount: number; generalImpact: number } {
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

  // Por análisis, no por etiqueta: cada causal_analysis se tagea con un solo
  // indicator_cause_id, pero de todos modos se deduplica por id para evitar
  // sumar el mismo impact_value dos veces si esa relación cambiara.
  function sumUniqueImpact(matchingTags: IndicatorCauseTag[]): { count: number; impactTotal: number } {
    const impactByAnalysis = new Map<string, number>()
    for (const t of matchingTags) impactByAnalysis.set(t.causal_analysis_id, t.impact_value)
    let impactTotal = 0
    for (const v of impactByAnalysis.values()) impactTotal += v
    return { count: impactByAnalysis.size, impactTotal }
  }

  const rows = childrenOf(parentId)
    .map((cause) => {
      const descendantIds = collectDescendantIds(cause.id)
      const { count, impactTotal } = sumUniqueImpact(tags.filter((t) => descendantIds.has(t.indicator_cause_id)))
      return { cause, count, impactTotal }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.impactTotal - a.impactTotal)

  const general = parentId ? sumUniqueImpact(tags.filter((t) => t.indicator_cause_id === parentId)) : null

  return { rows, generalCount: general?.count ?? 0, generalImpact: general?.impactTotal ?? 0 }
}

export interface CauseDeletionImpact {
  descendantCount: number
  taggedAnalysesCount: number
}

/** Cuántas sub-causas y cuántos análisis distintos quedarían afectados (no
 * borrados — pierden su clasificación) si se elimina este nodo. Se calcula
 * antes de confirmar el borrado, porque el borrado en sí no lanza ningún
 * error — la cascada es silenciosa a nivel de base de datos. */
export function countCauseImpact(
  causes: IndicatorCause[],
  tags: IndicatorCauseTag[],
  nodeId: string,
): CauseDeletionImpact {
  const childrenOf = (id: string) => causes.filter((c) => c.parent_id === id)
  const descendantIds = new Set<string>()
  const stack = [nodeId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of childrenOf(current)) {
      if (!descendantIds.has(child.id)) {
        descendantIds.add(child.id)
        stack.push(child.id)
      }
    }
  }

  const affectedIds = new Set([nodeId, ...descendantIds])
  const taggedAnalysesCount = new Set(
    tags.filter((t) => affectedIds.has(t.indicator_cause_id)).map((t) => t.causal_analysis_id),
  ).size

  return { descendantCount: descendantIds.size, taggedAnalysesCount }
}
