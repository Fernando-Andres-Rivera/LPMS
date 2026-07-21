import { supabase } from '../../lib/supabase'
import type { Axis, Organization, Profile, Site, UserRole } from '../../lib/types'
import { describeAuthError } from '../auth/authErrorMessages'

export async function fetchAllAxesCatalog(): Promise<Axis[]> {
  const { data, error } = await supabase.from('axes').select('*').order('sort_order')
  if (error) throw error
  return data ?? []
}

export interface NewOrganizationInput {
  name: string
  industry: string | null
  siteName: string
  siteAddress: string | null
  axisIds: string[]
  createdBy: string
}

// Misma lista sembrada por la migración 20260712000000_indicator_units.sql
// para organizaciones existentes, así ningún cliente nuevo arranca con el
// desplegable de unidades vacío. No incluye "unidades" a propósito — es un
// nombre genérico que no describe nada real y se prestaba a confundirse con
// "%" al definir el objetivo (ver migración 20260724000000).
const STARTER_UNITS = [
  '%', 'horas', 'horas-hombre', 'días', 'turnos',
  'accidentes', 'defectos', 'unidades no conformes', 'paradas',
  'minutos', 'kg', 'litros', '$', 'ppm', 'piezas', 'puntos',
]

/** Crea la organización, su primer sitio, y habilita los ejes elegidos. Devuelve el id de la organización. */
export async function createOrganizationWithSite(input: NewOrganizationInput): Promise<string> {
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: input.name, industry: input.industry })
    .select('id')
    .single()
  if (orgError) throw orgError

  const { error: siteError } = await supabase
    .from('sites')
    .insert({ organization_id: org.id, name: input.siteName, address: input.siteAddress })
  if (siteError) throw siteError

  if (input.axisIds.length > 0) {
    const { error: axesError } = await supabase
      .from('organization_axes')
      .insert(input.axisIds.map((axis_id) => ({ organization_id: org.id, axis_id, active: true })))
    if (axesError) throw axesError
  }

  const { error: unitsError } = await supabase
    .from('units')
    .insert(STARTER_UNITS.map((name) => ({ organization_id: org.id, name, created_by: input.createdBy })))
  if (unitsError) throw unitsError

  return org.id
}

export async function fetchOrganizationsList(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('active', true)
    .eq('is_demo', false)
    .order('name')
  if (error) throw error
  return data ?? []
}

/** Todas las organizaciones reales (activas e inactivas) — para la gestión de
 * clientes del admin_consultora. Excluye las orgs Demo de auto-registro, que
 * viven en su propio reporte de registros. La RLS ya restringe esto al rol. */
export async function fetchAllOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_demo', false)
    .order('name')
  if (error) throw error
  return data ?? []
}

/** Desactiva (borrado suave) o reactiva un cliente. Desactivar NO borra datos:
 * la organización desaparece del switcher y de las listas, pero todo su
 * histórico se conserva y puede reactivarse. */
export async function setOrganizationActive(organizationId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('organizations').update({ active }).eq('id', organizationId)
  if (error) throw error
}

/** Actualiza los datos básicos del cliente — ej. cambio de razón social o de
 * industria. No toca nada más: sitios, usuarios e histórico siguen intactos. */
export async function updateOrganization(
  organizationId: string,
  values: { name: string; industry: string | null },
): Promise<void> {
  const { error } = await supabase.from('organizations').update(values).eq('id', organizationId)
  if (error) throw error
}

/** Borrado FÍSICO e irreversible — arrastra en cascada sitios, indicadores,
 * mediciones, análisis causales, planes de acción y usuarios de esa
 * organización. Solo para limpiar datos de prueba; para un cliente real usa
 * setOrganizationActive(id, false). Restringido a admin_consultora por RLS. */
export async function deleteOrganizationPermanently(organizationId: string): Promise<void> {
  const { error } = await supabase.from('organizations').delete().eq('id', organizationId)
  if (error) throw error
}

export async function fetchSitesForOrganization(organizationId: string): Promise<Site[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data ?? []
}

export interface InviteUserInput {
  email: string
  fullName: string
  organizationId: string
  role: UserRole
  siteIds: string[]
}

/**
 * Invita a una persona por correo — crea su cuenta de Supabase Auth (le
 * llega un correo para poner su contraseña), y en la misma operación deja
 * su perfil vinculado con el rol y sitio(s) definidos. Corre en una Edge
 * Function (supabase/functions/invite-user) porque requiere la service
 * role key, que nunca debe llegar al navegador — la autorización de quién
 * puede invitar a quién se revalida ahí mismo, no solo aquí.
 */
export async function inviteUser(input: InviteUserInput): Promise<{ userId: string }> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: {
      email: input.email,
      fullName: input.fullName,
      organizationId: input.organizationId,
      role: input.role,
      siteIds: input.siteIds,
    },
  })

  if (error) {
    // FunctionsHttpError trae la respuesta real (con el mensaje que arma la
    // función) en error.context — sin esto, el usuario solo vería "Edge
    // Function returned a non-2xx status code", sin explicación útil.
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      if (body?.error) throw new Error(describeAuthError('invite', body.code, body.error))
    }
    throw error
  }
  if (data?.error) throw new Error(describeAuthError('invite', data.code, data.error))
  return { userId: data.userId }
}

export interface OrgUserRow extends Profile {
  siteIds: string[]
}

/** Usuarios ya existentes de una organización, con sus sitios asignados —
 * para la gestión de roles/permisos en la pantalla de Usuarios. La RLS ya
 * restringe qué filas de profiles/profile_sites puede leer quien llama. */
export async function fetchOrganizationUsers(organizationId: string): Promise<OrgUserRow[]> {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .order('full_name')
  if (profilesError) throw profilesError

  const ids = (profiles ?? []).map((p) => p.id)
  const { data: profileSites, error: sitesError } =
    ids.length > 0
      ? await supabase.from('profile_sites').select('profile_id, site_id').in('profile_id', ids)
      : { data: [] as { profile_id: string; site_id: string }[], error: null }
  if (sitesError) throw sitesError

  const sitesByProfile = new Map<string, string[]>()
  for (const row of profileSites ?? []) {
    sitesByProfile.set(row.profile_id, [...(sitesByProfile.get(row.profile_id) ?? []), row.site_id])
  }
  return (profiles ?? []).map((p) => ({ ...p, siteIds: sitesByProfile.get(p.id) ?? [] }))
}

/** Cambia el rol de un usuario ya existente. La base de datos bloquea (vía
 * trigger) asignar admin_consultora si quien llama no lo es, y bloquea que
 * alguien cambie su propio rol — esta llamada solo falla en esos casos. */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}

/** Activa o desactiva un usuario. Un usuario inactivo pierde acceso a toda
 * la aplicación de inmediato (current_role_name()/current_org_id() dejan de
 * resolver su rol/organización), no solo se le oculta de esta lista. */
export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', userId)
  if (error) throw error
}

/** Reemplaza la lista completa de sitios asignados a un usuario. */
export async function setUserSites(userId: string, siteIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('profile_sites').delete().eq('profile_id', userId)
  if (deleteError) throw deleteError
  if (siteIds.length === 0) return
  const { error: insertError } = await supabase
    .from('profile_sites')
    .insert(siteIds.map((site_id) => ({ profile_id: userId, site_id })))
  if (insertError) throw insertError
}
