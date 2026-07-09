import { supabase } from '../../lib/supabase'
import type { Target } from '../../lib/types'

/** Objetivo anual (period_month null) vigente para un indicador, si existe. */
export async function fetchAnnualTarget(indicatorId: string, year: number): Promise<Target | null> {
  const { data, error } = await supabase
    .from('targets')
    .select('*')
    .eq('indicator_id', indicatorId)
    .eq('period_year', year)
    .is('period_month', null)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Crea o actualiza el objetivo anual del indicador — no usa upsert porque el
 * índice único de targets es sobre una expresión (coalesce), no sobre columnas
 * planas, así que Postgres no puede resolver un ON CONFLICT directo. */
export async function saveAnnualTarget(params: {
  indicatorId: string
  year: number
  targetValue: number
  createdBy: string
}): Promise<void> {
  const existing = await fetchAnnualTarget(params.indicatorId, params.year)

  if (existing) {
    const { error } = await supabase
      .from('targets')
      .update({ target_value: params.targetValue })
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('targets').insert({
    indicator_id: params.indicatorId,
    period_year: params.year,
    period_month: null,
    target_value: params.targetValue,
    created_by: params.createdBy,
  })
  if (error) throw error
}
