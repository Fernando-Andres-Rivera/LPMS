import { supabase } from '../../lib/supabase'
import type { OrgUnit, Site, SiteLocation } from '../../lib/types'

/**
 * Postgres bloquea con error 23503 (llave foránea) el borrado de un nodo de
 * la estructura que tiene indicadores o mediciones históricas colgando — esa
 * protección es deliberada. Aquí se traduce ese error técnico a un mensaje
 * accionable; cualquier otro error se relanza tal cual.
 */
function translateStructureDeleteError(error: { code?: string; message: string }, nombre: string): Error {
  if (error.code === '23503') {
    return new Error(
      `"${nombre}" tiene indicadores o mediciones históricas vinculadas y no se puede eliminar sin perder ese histórico. Usa "Desactivar" para sacarla de las listas conservando los datos.`,
    )
  }
  return new Error(error.message)
}

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

export async function renameOrgUnit(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('org_units').update({ name }).eq('id', id)
  if (error) throw error
}

/** Borra una unidad de negocio o región mal creada. Sus regiones hijas se
 * borran en cascada y los sitios que tuviera asignados quedan "sin asignar"
 * (no se borran) — requiere la migración 20260722000000. */
export async function deleteOrgUnit(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('org_units').delete().eq('id', id)
  if (error) throw translateStructureDeleteError(error, nombre)
}

export async function renameSite(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('sites').update({ name }).eq('id', id)
  if (error) throw error
}

/** Borra un sitio mal creado. Si tiene indicadores o mediciones históricas,
 * la base de datos lo bloquea y el error resultante sugiere desactivarlo. */
export async function deleteSite(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('sites').delete().eq('id', id)
  if (error) throw translateStructureDeleteError(error, nombre)
}

/** Desactivar saca el sitio de todas las listas (captura, tableros, Pareto)
 * conservando su histórico intacto. */
export async function setSiteActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('sites').update({ active }).eq('id', id)
  if (error) throw error
}

export async function renameSiteLocation(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('site_locations').update({ name }).eq('id', id)
  if (error) throw error
}

/** Borra una instalación mal creada (y sus sub-niveles en cascada). Si ella o
 * alguno de sus sub-niveles tiene indicadores o mediciones históricas, la
 * base de datos bloquea el borrado y el error sugiere desactivarla. */
export async function deleteSiteLocation(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('site_locations').delete().eq('id', id)
  if (error) throw translateStructureDeleteError(error, nombre)
}

export async function setSiteLocationActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('site_locations').update({ active }).eq('id', id)
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
