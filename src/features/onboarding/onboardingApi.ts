import { supabase } from '../../lib/supabase'
import type { Axis, Organization, Site, UserRole } from '../../lib/types'

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
  const { data, error } = await supabase.from('organizations').select('*').eq('active', true).order('name')
  if (error) throw error
  return data ?? []
}

/** Todas las organizaciones (activas e inactivas) — para la gestión de clientes
 * del admin_consultora. La RLS ya restringe esto solo a ese rol. */
export async function fetchAllOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase.from('organizations').select('*').order('name')
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
      if (body?.error) throw new Error(body.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return { userId: data.userId }
}
