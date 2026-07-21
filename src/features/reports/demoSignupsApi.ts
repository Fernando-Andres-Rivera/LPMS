import { supabase } from '../../lib/supabase'

export interface DemoSignupRow {
  id: string
  fullName: string
  email: string
  orgName: string
  createdAt: string
}

interface RawRow {
  id: string
  full_name: string
  email: string
  created_at: string
  organizations: { name: string } | null
}

/**
 * Todos los registros públicos (leads) — cada persona que se registró por su
 * cuenta y quedó en su propia organización Demo (is_demo). Sin filtrar por
 * organización: la RLS de profiles ya deja a admin_consultora ver todos los
 * perfiles, y el filtro embebido `organizations.is_demo` limita a las orgs
 * Demo. La ruta que usa esto es exclusiva de admin_consultora.
 */
export async function fetchDemoSignups(): Promise<DemoSignupRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at, organizations!inner(name, is_demo)')
    .eq('organizations.is_demo', true)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    orgName: row.organizations?.name ?? '—',
    createdAt: row.created_at,
  }))
}

/**
 * Borra por completo un registro Demo — la cuenta de Auth (lo que libera el
 * correo para volver a registrarse) y toda su organización de prueba.
 * Irreversible. Corre en una Edge Function porque borrar de Auth requiere
 * la service role key, que nunca debe llegar al navegador.
 */
export async function deleteDemoSignup(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-demo-signup', {
    body: { userId },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      if (body?.error) throw new Error(body.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
}
