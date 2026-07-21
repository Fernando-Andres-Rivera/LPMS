import { createClient } from 'jsr:@supabase/supabase-js@2'

// ============================================================
// Borra por completo un registro Demo de prueba (auto-registro público):
// la cuenta de Auth (lo que de verdad libera el correo para volver a
// registrarse) y su organización Demo con todos sus datos.
//
// El orden importa y tiene una dependencia circular real:
// - profiles.organization_id -> organizations es NO ACTION, así que no se
//   puede borrar la organización mientras el perfil siga existiendo.
// - Pero borrar el perfil (vía borrar su usuario de Auth, que cascada a
//   profiles) falla si otras tablas (units.created_by, measurements.
//   captured_by, etc.) todavía lo referencian — esas columnas NO tienen
//   cascada a propósito, para no perder el rastro de auditoría cuando
//   alguien dejaría la empresa en un cliente real.
// Se rompe el ciclo limpiando primero esas referencias (RPC
// null_profile_references, ver migración correspondiente) — para un
// registro Demo de prueba no importa perderlas, porque toda esa data
// desaparece de todos modos al borrar la organización un paso después.
//
// Restringido a organizaciones is_demo=true a propósito: esta ruta es para
// limpiar datos de prueba del registro público, no un borrado general de
// usuarios de clientes reales (eso ya existe aparte, vía RLS directa sobre
// organizations para admin_consultora).
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Falta autenticación.' }, 401)

  const supabaseCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseCaller.auth.getUser()
  if (callerError || !caller) return json({ error: 'Sesión inválida.' }, 401)

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (callerProfile?.role !== 'admin_consultora') {
    return json({ error: 'Solo el equipo de LeanProLogistic puede borrar registros de prueba.' }, 403)
  }

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }
  const userId = body.userId?.trim()
  if (!userId) return json({ error: 'Falta el id del usuario.' }, 400)

  const { data: targetProfile, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('organization_id, organizations!inner(is_demo)')
    .eq('id', userId)
    .single()
  if (targetError || !targetProfile) return json({ error: 'No se encontró ese registro.' }, 404)
  if (!(targetProfile.organizations as unknown as { is_demo: boolean }).is_demo) {
    return json({ error: 'Esto solo borra organizaciones Demo de auto-registro, no clientes reales.' }, 400)
  }

  const { error: nullRefsError } = await supabaseAdmin.rpc('null_profile_references', { p_user_id: userId })
  if (nullRefsError) return json({ error: nullRefsError.message }, 500)

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteUserError) return json({ error: deleteUserError.message }, 500)

  const { error: deleteOrgError } = await supabaseAdmin
    .from('organizations')
    .delete()
    .eq('id', targetProfile.organization_id)
  if (deleteOrgError) return json({ error: deleteOrgError.message }, 500)

  return json({ success: true })
})
