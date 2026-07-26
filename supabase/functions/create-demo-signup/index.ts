import { createClient } from 'jsr:@supabase/supabase-js@2'

// ============================================================
// Crea un registro Demo manualmente — para cuando el equipo levanta la
// cuenta durante una llamada con un prospecto en vez de que la persona se
// autorregistre. Usa exactamente el mismo camino que el autorregistro
// público (admin.createUser sin invited_at ni perfil previo dispara el
// trigger on_auth_user_created, que crea la organización Demo, su sitio,
// ejes y unidades) — así no se duplica esa lógica de alta en dos lugares.
// La diferencia: el correo queda confirmado y la contraseña temporal se
// devuelve aquí mismo, sin depender del correo de confirmación, que en el
// plan actual de Supabase falla por límite de envíos (mismo motivo que
// invite-user). Restringido a admin_consultora.
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Misma generación que invite-user — alfabeto sin caracteres ambiguos
 * (0/O, 1/l) para que se pueda dictar por teléfono sin confusiones. */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  return `Lpms-${body}`
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
    return json({ error: 'Solo el equipo de LeanProLogistic puede crear registros Demo manualmente.' }, 403)
  }

  let body: { email?: string; fullName?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }
  const email = body.email?.trim().toLowerCase()
  const fullName = body.fullName?.trim()
  if (!email || !fullName) return json({ error: 'Completa correo y nombre.' }, 400)

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (existingProfile) {
    return json({ error: 'Ya existe una cuenta con este correo.', code: 'email_exists' }, 409)
  }

  const tempPassword = generateTempPassword()

  // Sin skip_demo_org: se deja que el trigger on_auth_user_created cree la
  // organización Demo, el sitio, los ejes y las unidades — el mismo camino
  // que el autorregistro público.
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'No se pudo crear el registro.', code: createError?.code }, 500)
  }

  return json({ success: true, userId: created.user.id, email, tempPassword })
})
