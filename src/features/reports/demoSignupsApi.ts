import { supabase } from '../../lib/supabase'
import { describeAuthError } from '../auth/authErrorMessages'

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

export interface CreateDemoSignupResult {
  userId: string
  email: string
  /** Contraseña temporal generada por el servidor — se muestra UNA vez al
   * admin para que la entregue al prospecto. Se cambia luego en "Seguridad
   * de la cuenta". */
  tempPassword: string
}

/**
 * Crea un registro Demo con acceso inmediato (correo ya confirmado +
 * contraseña temporal), sin que la persona tenga que autorregistrarse ni
 * depender de ningún correo de confirmación — el mismo motivo que
 * inviteUser: el plan actual de Supabase falla por límite de envíos. Corre
 * en una Edge Function porque requiere la service role key.
 */
export async function createDemoSignup(input: { email: string; fullName: string }): Promise<CreateDemoSignupResult> {
  const { data, error } = await supabase.functions.invoke('create-demo-signup', {
    body: { email: input.email, fullName: input.fullName },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      if (body?.error) throw new Error(describeAuthError('invite', body.code, body.error))
    }
    throw error
  }
  if (data?.error) throw new Error(describeAuthError('invite', data.code, data.error))
  return { userId: data.userId, email: data.email, tempPassword: data.tempPassword }
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
