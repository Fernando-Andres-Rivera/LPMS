import { supabase } from '../../lib/supabase'
import type { CauseCategory } from '../../lib/types'

export async function fetchCauseCategories(organizationId: string): Promise<CauseCategory[]> {
  const { data, error } = await supabase
    .from('cause_categories')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createCauseCategory(params: {
  organizationId: string
  parentId: string | null
  name: string
  createdBy: string
}): Promise<CauseCategory> {
  const { data, error } = await supabase
    .from('cause_categories')
    .insert({
      organization_id: params.organizationId,
      parent_id: params.parentId,
      name: params.name,
      created_by: params.createdBy,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function tagCausalAnalysis(causalAnalysisId: string, causeCategoryIds: string[]): Promise<void> {
  if (causeCategoryIds.length === 0) return
  const { error } = await supabase
    .from('causal_analysis_causes')
    .insert(causeCategoryIds.map((cause_category_id) => ({ causal_analysis_id: causalAnalysisId, cause_category_id })))

  if (error) throw error
}

export interface TaggedCause {
  causal_analysis_id: string
  cause_category_id: string
}

/**
 * Pares (análisis, causa) etiquetados en el período dado, filtrados
 * opcionalmente por eje, indicador específico, o un alcance de estructura
 * organizacional (sitios y/o instalaciones puntuales). Base de datos para
 * construir el Pareto evolutivo en el cliente.
 *
 * La ubicación "más precisa" de un análisis es la del evento realmente
 * capturado (measurement.site_location_id) si existe; si no, cae a la
 * ubicación por defecto del indicador (site_location_id, o su sitio). Por
 * eso el filtro de instalación se resuelve después de traer los análisis,
 * no solo filtrando indicadores.
 */
export async function fetchTaggedCauses(params: {
  organizationId: string
  range: { from: string; to: string }
  axisId: string | null
  indicatorId: string | null
  siteIds: string[] | null
  locationIds: Set<string> | null
}): Promise<TaggedCause[]> {
  let indicatorsQuery = supabase
    .from('indicators')
    .select('id, site_location_id')
    .eq('organization_id', params.organizationId)

  if (params.indicatorId) indicatorsQuery = indicatorsQuery.eq('id', params.indicatorId)
  else {
    if (params.axisId) indicatorsQuery = indicatorsQuery.eq('axis_id', params.axisId)
    if (params.siteIds) indicatorsQuery = indicatorsQuery.in('site_id', params.siteIds)
  }

  const { data: indicatorRows, error: indicatorsError } = await indicatorsQuery
  if (indicatorsError) throw indicatorsError
  if (!indicatorRows || indicatorRows.length === 0) return []

  const indicatorIds = indicatorRows.map((row) => row.id)
  const defaultLocationByIndicator = new Map(indicatorRows.map((row) => [row.id, row.site_location_id]))

  const { data: analyses, error: analysesError } = await supabase
    .from('causal_analyses')
    .select('id, indicator_id, measurements(site_location_id)')
    .eq('organization_id', params.organizationId)
    .in('indicator_id', indicatorIds)
    .gte('created_at', params.range.from)
    .lte('created_at', `${params.range.to}T23:59:59`)

  if (analysesError) throw analysesError

  interface AnalysisWithMeasurementLocation {
    id: string
    indicator_id: string
    measurements: { site_location_id: string | null } | null
  }

  let scopedAnalyses = (analyses ?? []) as unknown as AnalysisWithMeasurementLocation[]
  if (params.locationIds) {
    scopedAnalyses = scopedAnalyses.filter((a) => {
      const effectiveLocation = a.measurements?.site_location_id ?? defaultLocationByIndicator.get(a.indicator_id) ?? null
      return effectiveLocation ? params.locationIds!.has(effectiveLocation) : false
    })
  }

  const analysisIds = scopedAnalyses.map((a) => a.id)
  if (analysisIds.length === 0) return []

  const { data: causes, error: causesError } = await supabase
    .from('causal_analysis_causes')
    .select('causal_analysis_id, cause_category_id')
    .in('causal_analysis_id', analysisIds)

  if (causesError) throw causesError
  return causes ?? []
}

export interface ParetoRow {
  category: CauseCategory
  count: number
}

/**
 * Cuenta, para cada hijo directo de `parentId`, cuántos análisis distintos
 * caen bajo ese hijo o cualquiera de sus descendientes (rollup). También
 * separa un balde "general" para análisis etiquetados exactamente en
 * `parentId` (sin especificar un hijo).
 */
export function computeParetoForParent(
  categories: CauseCategory[],
  tagged: TaggedCause[],
  parentId: string | null,
): { rows: ParetoRow[]; generalCount: number } {
  const childrenOf = (id: string | null) => categories.filter((c) => c.parent_id === id)

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
    .map((category) => {
      const descendantIds = collectDescendantIds(category.id)
      const analysisIds = new Set(tagged.filter((t) => descendantIds.has(t.cause_category_id)).map((t) => t.causal_analysis_id))
      return { category, count: analysisIds.size }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)

  const generalCount = parentId
    ? new Set(tagged.filter((t) => t.cause_category_id === parentId).map((t) => t.causal_analysis_id)).size
    : 0

  return { rows, generalCount }
}
