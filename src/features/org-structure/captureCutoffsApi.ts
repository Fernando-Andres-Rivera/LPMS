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

/** Guarda el horario de reunión de un nivel, o lo quita si cutoffTime es null. */
export async function setLevelCutoff(params: {
  organizationId: string
  level: 1 | 2 | 3
  cutoffTime: string | null
  evaluatedDayOffset: number
  weekdays: number[]
  createdBy: string
}): Promise<void> {
  if (params.cutoffTime === null) {
    const { error } = await supabase
      .from('level_capture_cutoffs')
      .delete()
      .eq('organization_id', params.organizationId)
      .eq('level', params.level)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('level_capture_cutoffs').upsert(
    {
      organization_id: params.organizationId,
      level: params.level,
      cutoff_time: params.cutoffTime,
      evaluated_day_offset: params.evaluatedDayOffset,
      weekdays: params.weekdays,
      created_by: params.createdBy,
    },
    { onConflict: 'organization_id,level' },
  )
  if (error) throw error
}
