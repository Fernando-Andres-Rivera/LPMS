import { supabase } from '../../lib/supabase'
import type { OrgUnit, Site, SiteLocation } from '../../lib/types'

export async function fetchOrgUnits(organizationId: string): Promise<OrgUnit[]> {
  const { data, error } = await supabase
    .from('org_units')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createOrgUnit(params: {
  organizationId: string
  parentId: string | null
  level: 2 | 3
  name: string
  createdBy: string
}): Promise<OrgUnit> {
  const { data, error } = await supabase
    .from('org_units')
    .insert({
      organization_id: params.organizationId,
      parent_id: params.parentId,
      level: params.level,
      name: params.name,
      created_by: params.createdBy,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function assignSiteToOrgUnit(siteId: string, orgUnitId: string | null): Promise<void> {
  const { error } = await supabase.from('sites').update({ org_unit_id: orgUnitId }).eq('id', siteId)
  if (error) throw error
}

/**
 * Da de alta un sitio nuevo para un cliente que ya existe (una planta,
 * bodega u oficina adicional) — el mismo alta que hoy solo pasa una vez,
 * al crear el cliente, ahora se puede repetir cuantas veces haga falta a
 * medida que el servicio de la consultora se expande dentro de esa
 * organización.
 */
export async function createSite(params: {
  organizationId: string
  name: string
  address: string | null
  orgUnitId: string | null
}): Promise<Site> {
  const { data, error } = await supabase
    .from('sites')
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      address: params.address,
      org_unit_id: params.orgUnitId,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function fetchSiteLocations(siteId: string): Promise<SiteLocation[]> {
  const { data, error } = await supabase
    .from('site_locations')
    .select('*')
    .eq('site_id', siteId)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function fetchSiteLocationsForSites(siteIds: string[]): Promise<SiteLocation[]> {
  if (siteIds.length === 0) return []
  const { data, error } = await supabase
    .from('site_locations')
    .select('*')
    .in('site_id', siteIds)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createSiteLocation(params: {
  siteId: string
  parentId: string | null
  level: number
  name: string
  createdBy: string
}): Promise<SiteLocation> {
  const { data, error } = await supabase
    .from('site_locations')
    .insert({
      site_id: params.siteId,
      parent_id: params.parentId,
      level: params.level,
      name: params.name,
      created_by: params.createdBy,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function fetchSitesWithOrgUnit(organizationId: string): Promise<Site[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}
