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
  root_cause: string
  impact_value: number
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
    .select('id, indicator_id, root_cause, impact_value, measurements(site_location_id)')
    .eq('organization_id', params.organizationId)
    .in('indicator_id', indicatorIds)
    .gte('created_at', params.range.from)
    .lte('created_at', `${params.range.to}T23:59:59`)

  if (analysesError) throw analysesError

  interface AnalysisWithMeasurementLocation {
    id: string
    indicator_id: string
    root_cause: string
    impact_value: number | null
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

  // impact_value viaja en el análisis (no en la etiqueta) — se adjunta a cada
  // par para que el Pareto pueda sumar impacto acumulado en vez de solo
  // contar ocurrencias sueltas (mismo patrón que fetchIndicatorCauseTags).
  const analysisById = new Map(scopedAnalyses.map((a) => [a.id, a]))

  const { data: causes, error: causesError } = await supabase
    .from('causal_analysis_causes')
    .select('causal_analysis_id, cause_category_id')
    .in('causal_analysis_id', analysisIds)

  if (causesError) throw causesError
  return (causes ?? []).flatMap((row) => {
    const analysis = analysisById.get(row.causal_analysis_id)
    if (!analysis) return []
    return [
      {
        ...row,
        root_cause: analysis.root_cause,
        impact_value: analysis.impact_value ?? 1,
      },
    ]
  })
}

export interface ParetoRow {
  category: CauseCategory
  count: number
  impactTotal: number
}

function childrenOf(categories: CauseCategory[], id: string | null): CauseCategory[] {
  return categories.filter((c) => c.parent_id === id)
}

/** Un nodo y todos sus descendientes — para acumular (rollup) lo que cuelga
 * de él sin importar cuántos niveles de sub-causas tenga debajo. */
export function collectCategoryDescendantIds(categories: CauseCategory[], id: string): Set<string> {
  const ids = new Set([id])
  const stack = [id]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of childrenOf(categories, current)) {
      if (!ids.has(child.id)) {
        ids.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return ids
}

// Por análisis, no por etiqueta: un mismo causal_analysis podría (en teoría)
// quedar tageado más de una vez hacia el mismo subárbol — se deduplica por
// id antes de sumar para no contar su impact_value dos veces.
function sumUniqueImpact(matchingTags: TaggedCause[]): { count: number; impactTotal: number } {
  const impactByAnalysis = new Map<string, number>()
  for (const t of matchingTags) impactByAnalysis.set(t.causal_analysis_id, t.impact_value)
  let impactTotal = 0
  for (const v of impactByAnalysis.values()) impactTotal += v
  return { count: impactByAnalysis.size, impactTotal }
}

/**
 * Para cada hijo directo de `parentId`, ACUMULA el impact_value de los
 * análisis distintos que caen bajo ese hijo o cualquiera de sus
 * descendientes (rollup) — no solo los cuenta. Así el orden refleja quién
 * pesa más en total, no solo quién se repitió más veces; el conteo de casos
 * se conserva como dato secundario. También separa un balde "general" para
 * análisis etiquetados exactamente en `parentId` (sin especificar un hijo).
 */
export function computeParetoForParent(
  categories: CauseCategory[],
  tagged: TaggedCause[],
  parentId: string | null,
): { rows: ParetoRow[]; generalCount: number; generalImpact: number } {
  const rows = childrenOf(categories, parentId)
    .map((category) => {
      const descendantIds = collectCategoryDescendantIds(categories, category.id)
      const { count, impactTotal } = sumUniqueImpact(tagged.filter((t) => descendantIds.has(t.cause_category_id)))
      return { category, count, impactTotal }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.impactTotal - a.impactTotal)

  const general = parentId ? sumUniqueImpact(tagged.filter((t) => t.cause_category_id === parentId)) : null

  return { rows, generalCount: general?.count ?? 0, generalImpact: general?.impactTotal ?? 0 }
}

export interface CauseEvidence {
  causal_analysis_id: string
  root_cause: string
  impact_value: number
}

/** Los registros reales (causa + impacto) detrás de un nodo del árbol,
 * acumulados con sus descendientes — la evidencia concreta que explica por
 * qué esa barra pesa lo que pesa. Sin fecha ni autor: en este Pareto lo que
 * importa es cuál causal impacta más, no cuándo ni quién la registró. */
export function getCategoryEvidence(categories: CauseCategory[], tagged: TaggedCause[], categoryId: string): CauseEvidence[] {
  const descendantIds = collectCategoryDescendantIds(categories, categoryId)
  const seen = new Map<string, CauseEvidence>()
  for (const t of tagged) {
    if (!descendantIds.has(t.cause_category_id)) continue
    seen.set(t.causal_analysis_id, {
      causal_analysis_id: t.causal_analysis_id,
      root_cause: t.root_cause,
      impact_value: t.impact_value,
    })
  }
  return Array.from(seen.values()).sort((a, b) => b.impact_value - a.impact_value)
}
