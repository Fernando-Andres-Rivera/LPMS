import { supabase } from '../../lib/supabase'
import type { LevelCaptureCutoff } from '../../lib/types'

export async function fetchLevelCutoffs(organizationId: string): Promise<LevelCaptureCutoff[]> {
  const { data, error } = await supabase
    .from('level_capture_cutoffs')
    .select('*')
    .eq('organization_id', organizationId)

  if (error) throw error
  return data ?? []
}

/**
 * Guarda el horario de reunión de un nivel — general (siteId null) o
 * específico de un sitio — o lo quita si cutoffTime es null. No usa
 * upsert: la unicidad real está en dos índices parciales (uno para el
 * general, otro para los de sitio), y el cliente de Supabase no puede
 * apuntar el onConflict a un índice parcial, así que se resuelve con un
 * select previo y luego insert o update según corresponda.
 */
export async function setLevelCutoff(params: {
  organizationId: string
  level: 1 | 2 | 3
  siteId: string | null
  cutoffTime: string | null
  evaluatedDayOffset: number
  weekdays: number[]
  createdBy: string
}): Promise<void> {
  if (params.cutoffTime === null) {
    let query = supabase
      .from('level_capture_cutoffs')
      .delete()
      .eq('organization_id', params.organizationId)
      .eq('level', params.level)
    query = params.siteId ? query.eq('site_id', params.siteId) : query.is('site_id', null)
    const { error } = await query
    if (error) throw error
    return
  }

  let findQuery = supabase
    .from('level_capture_cutoffs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('level', params.level)
  findQuery = params.siteId ? findQuery.eq('site_id', params.siteId) : findQuery.is('site_id', null)
  const { data: existing, error: findError } = await findQuery.maybeSingle()
  if (findError) throw findError

  const payload = {
    cutoff_time: params.cutoffTime,
    evaluated_day_offset: params.evaluatedDayOffset,
    weekdays: params.weekdays,
    created_by: params.createdBy,
  }

  if (existing) {
    const { error } = await supabase.from('level_capture_cutoffs').update(payload).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('level_capture_cutoffs').insert({
      organization_id: params.organizationId,
      level: params.level,
      site_id: params.siteId,
      ...payload,
    })
    if (error) throw error
  }
}
