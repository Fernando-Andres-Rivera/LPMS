import { supabase } from '../../lib/supabase'
import type { Unit } from '../../lib/types'

export async function fetchUnits(organizationId: string): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createUnit(params: {
  organizationId: string
  name: string
  createdBy: string
}): Promise<Unit> {
  const { data, error } = await supabase
    .from('units')
    .upsert(
      { organization_id: params.organizationId, name: params.name, created_by: params.createdBy },
      { onConflict: 'organization_id,name', ignoreDuplicates: false },
    )
    .select('*')
    .single()

  if (error) throw error
  return data
}
