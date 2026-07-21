import { supabase } from '../../lib/supabase'

export interface MeasurementAuthorizationRow {
  id: string
  organizationId: string
  organizationName: string
  indicatorId: string
  indicatorName: string
  siteName: string
  periodDate: string
  reasonName: string
  comment: string | null
  authorizedByName: string
  authorizedAt: string
}

interface RawRow {
  id: string
  organization_id: string
  indicator_id: string
  period_date: string
  comment: string | null
  authorized_at: string
  organizations: { name: string } | null
  indicators: { name: string; sites: { name: string } | null } | null
  measurement_override_reasons: { name: string } | null
  profiles: { full_name: string } | null
}

/**
 * Todas las autorizaciones de edición tardía dentro de un rango — sin
 * filtrar por organización: la RLS de measurement_edit_authorizations ya
 * deja a admin_consultora ver las de todos los clientes (igual que
 * fetchAllOrganizations), que es exactamente lo que este reporte
 * necesita para comparar entre clientes.
 */
export async function fetchMeasurementAuthorizations(range: {
  from: string
  to: string
}): Promise<MeasurementAuthorizationRow[]> {
  const { data, error } = await supabase
    .from('measurement_edit_authorizations')
    .select(
      'id, organization_id, indicator_id, period_date, comment, authorized_at, ' +
        'organizations(name), indicators(name, sites(name)), measurement_override_reasons(name), ' +
        'profiles!measurement_edit_authorizations_authorized_by_fkey(full_name)',
    )
    .gte('authorized_at', range.from)
    .lte('authorized_at', `${range.to}T23:59:59`)
    .order('authorized_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organizations?.name ?? '—',
    indicatorId: row.indicator_id,
    indicatorName: row.indicators?.name ?? '—',
    siteName: row.indicators?.sites?.name ?? 'Corporativo',
    periodDate: row.period_date,
    reasonName: row.measurement_override_reasons?.name ?? '—',
    comment: row.comment,
    authorizedByName: row.profiles?.full_name ?? '—',
    authorizedAt: row.authorized_at,
  }))
}
