import { supabase } from '../../lib/supabase'
import type { ExposureFrequency, ExposureSchedule } from '../../lib/types'

export async function fetchExposureSchedule(organizationId: string): Promise<ExposureSchedule | null> {
  const { data, error } = await supabase
    .from('exposure_schedules')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function saveExposureSchedule(params: {
  organizationId: string
  frequency: ExposureFrequency
  weekday: number | null
  dayOfMonth: number | null
  startDate: string
  exposureTime: string | null
  createdBy: string
}): Promise<void> {
  const { error } = await supabase.from('exposure_schedules').upsert(
    {
      organization_id: params.organizationId,
      frequency: params.frequency,
      weekday: params.weekday,
      day_of_month: params.dayOfMonth,
      start_date: params.startDate,
      exposure_time: params.exposureTime,
      created_by: params.createdBy,
    },
    { onConflict: 'organization_id' },
  )

  if (error) throw error
}
