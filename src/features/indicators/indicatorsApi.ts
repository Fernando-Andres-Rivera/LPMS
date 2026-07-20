import { supabase } from '../../lib/supabase'
import type { Axis, Indicator, Profile, Site } from '../../lib/types'

export interface IndicatorWithRelations extends Indicator {
  axes: Pick<Axis, 'id' | 'name' | 'color'> | null
  sites: Pick<Site, 'id' | 'name'> | null
}

export async function fetchIndicators(organizationId: string): Promise<IndicatorWithRelations[]> {
  const { data, error } = await supabase
    .from('indicators')
    .select('*, axes(id, name, color), sites(id, name)')
    .eq('organization_id', organizationId)
    .order('level', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as IndicatorWithRelations[]
}

export async function fetchIndicatorById(id: string): Promise<Indicator | null> {
  const { data, error } = await supabase.from('indicators').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function fetchIndicatorWithRelationsById(id: string): Promise<IndicatorWithRelations | null> {
  const { data, error } = await supabase
    .from('indicators')
    .select('*, axes(id, name, color), sites(id, name)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as IndicatorWithRelations
}

export async function fetchSites(organizationId: string): Promise<Site[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function fetchOrganizationAxes(organizationId: string): Promise<Axis[]> {
  const { data, error } = await supabase
    .from('organization_axes')
    .select('active, axes(*)')
    .eq('organization_id', organizationId)
    .eq('active', true)

  if (error) throw error
  return (data ?? [])
    .map((row) => row.axes as unknown as Axis)
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function fetchProfiles(organizationId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('full_name')

  if (error) throw error
  return data ?? []
}

/** Candidatos a padre: indicadores de nivel estrictamente mayor, excluyendo al propio indicador. */
export async function fetchParentCandidates(
  organizationId: string,
  childLevel: number,
  excludeId?: string,
): Promise<Indicator[]> {
  let query = supabase
    .from('indicators')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .gt('level', childLevel)
    .order('name')

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchIndicatorParentIds(childId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('indicator_links')
    .select('parent_indicator_id')
    .eq('child_indicator_id', childId)

  if (error) throw error
  return (data ?? []).map((row) => row.parent_indicator_id)
}

export interface IndicatorFormValues {
  organization_id: string
  site_id: string | null
  site_location_id: string | null
  axis_id: string
  level: 1 | 2 | 3
  name: string
  definition: string | null
  calculation_formula: string | null
  unit: string
  frequency: Indicator['frequency']
  improvement_direction: Indicator['improvement_direction']
  aggregation_method: Indicator['aggregation_method']
  responsible_id: string | null
  is_calculated: boolean
  value_type: Indicator['value_type']
  is_focus: boolean
}

export async function createIndicator(values: IndicatorFormValues, parentIds: string[]): Promise<string> {
  const { data, error } = await supabase.from('indicators').insert(values).select('id').single()
  if (error) throw error
  await setIndicatorParents(data.id, parentIds)
  return data.id
}

export async function updateIndicator(id: string, values: IndicatorFormValues, parentIds: string[]): Promise<void> {
  const { error } = await supabase.from('indicators').update(values).eq('id', id)
  if (error) throw error
  await setIndicatorParents(id, parentIds)
}

export async function setIndicatorParents(childId: string, parentIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('indicator_links').delete().eq('child_indicator_id', childId)
  if (deleteError) throw deleteError

  if (parentIds.length === 0) return

  const { error: insertError } = await supabase
    .from('indicator_links')
    .insert(parentIds.map((parent_indicator_id) => ({ child_indicator_id: childId, parent_indicator_id })))

  if (insertError) throw insertError
}

export async function setIndicatorActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('indicators').update({ active }).eq('id', id)
  if (error) throw error
}

/** Borrado FÍSICO e irreversible — arrastra en cascada objetivos, mediciones,
 * análisis causales y planes de acción de este indicador. Solo para limpiar
 * datos de prueba; para uso normal usa setIndicatorActive(id, false). */
export async function deleteIndicatorPermanently(id: string): Promise<void> {
  const { error } = await supabase.from('indicators').delete().eq('id', id)
  if (error) throw error
}
