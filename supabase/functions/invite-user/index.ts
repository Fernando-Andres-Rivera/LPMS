import { createClient } from 'jsr:@supabase/supabase-js@2'

// ============================================================
// Crea un usuario nuevo con acceso inmediato y lo deja vinculado (perfil +
// rol + sitios) en una sola operación — reemplaza el flujo manual anterior
// (crear en el panel de Supabase, copiar el UID, pegarlo en un formulario).
//
// IMPORTANTE — por qué NO se usa el correo de invitación: el servicio de
// correo compartido de Supabase tiene un límite de pocos envíos por hora
// (over_email_send_rate_limit) y muy mala entrega a Gmail/Hotmail, así que
// las invitaciones "quedaban" creadas pero el usuario nunca recibía el
// enlace para poner su contraseña y no podía entrar. En su lugar se crea la
// cuenta con el correo ya confirmado (email_confirm) y una contraseña
// temporal generada aquí, que se DEVUELVE al admin para que la entregue
// directamente (WhatsApp, etc.). El usuario entra de una y luego la cambia
// en "Seguridad de la cuenta". No depende del correo para nada.
//
// Requiere privilegios que el navegador nunca debe tener (crear cuentas de
// Auth, leer/escribir profiles sin las restricciones de RLS), así que esta
// lógica vive aquí — server-side, con la service role key — y no en el
// cliente. La autorización de QUIÉN puede crear a quién se revalida en
// cada llamada con el JWT de quien invoca; la service role bypassa RLS,
// así que esta es la única barrera real para esta ruta de escritura.
// ============================================================

/** Contraseña temporal legible pero con la complejidad suficiente para
 * cualquier política de Auth: prefijo con mayúscula/minúscula fijas + un
 * bloque aleatorio + dígitos. Alfabeto sin caracteres ambiguos (0/O, 1/l)
 * para que se pueda dictar por teléfono sin confusiones. */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  return `Lpms-${body}`
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VALID_ROLES = ['admin_consultora', 'admin_cliente', 'gerente', 'administrativo', 'operativo']
const SITE_SCOPED_ROLES = ['administrativo', 'operativo']

interface InviteBody {
  email?: string
  fullName?: string
  organizationId?: string
  role?: string
  siteIds?: string[]
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

  // Solo para saber quién llama (auth.getUser valida el JWT contra Supabase) —
  // nunca se usa este cliente para escribir con privilegios elevados.
  const supabaseCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseCaller.auth.getUser()
  if (callerError || !caller) return json({ error: 'Sesión inválida.' }, 401)

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  let body: InviteBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }

  const email = body.email?.trim().toLowerCase()
  const fullName = body.fullName?.trim()
  const organizationId = body.organizationId?.trim()
  const role = body.role?.trim()
  const siteIds = Array.isArray(body.siteIds) ? body.siteIds : []

  if (!email || !fullName || !organizationId || !role) {
    return json({ error: 'Completa correo, nombre, organización y rol.' }, 400)
  }
  if (!VALID_ROLES.includes(role)) {
    return json({ error: 'Rol inválido.' }, 400)
  }
  if (SITE_SCOPED_ROLES.includes(role) && siteIds.length === 0) {
    return json({ error: 'Este rol necesita al menos un sitio asignado.' }, 400)
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', caller.id)
    .single()

  if (callerProfileError || !callerProfile) {
    return json({ error: 'No se encontró tu perfil.' }, 403)
  }

  const isConsultora = callerProfile.role === 'admin_consultora'
  const isClienteOfThisOrg =
    callerProfile.role === 'admin_cliente' && callerProfile.organization_id === organizationId

  if (!isConsultora && !isClienteOfThisOrg) {
    return json({ error: 'No tienes permiso para invitar usuarios en esta organización.' }, 403)
  }
  if (!isConsultora && role === 'admin_consultora') {
    return json({ error: 'Solo el equipo de LeanProLogistic puede asignar ese rol.' }, 403)
  }

  if (siteIds.length > 0) {
    const { data: validSites, error: sitesError } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', siteIds)
    if (sitesError) return json({ error: 'No se pudieron validar los sitios.' }, 500)
    if ((validSites ?? []).length !== siteIds.length) {
      return json({ error: 'Uno o más sitios no pertenecen a esta organización.' }, 400)
    }
  }

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (existingProfile) {
    return json({ error: 'Ya existe un usuario vinculado con este correo.' }, 409)
  }

  const tempPassword = generateTempPassword()

  // Cuenta con acceso inmediato: email_confirm evita el bloqueo "Email not
  // confirmed" al entrar, y la contraseña temporal se entrega al admin (no
  // se manda ningún correo). Si el correo del usuario ya existe en Auth
  // (ej. una invitación fantasma anterior), Supabase devuelve un code
  // estable (email_exists) que el cliente traduce.
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'No se pudo crear el usuario.', code: createError?.code }, 500)
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id,
    organization_id: organizationId,
    role,
    full_name: fullName,
    email,
  })
  if (profileError) {
    // Si el perfil falla no debe quedar una cuenta fantasma sin perfil (RLS
    // la dejaría sin acceso a nada de todos modos, pero mejor no dejarla).
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return json({ error: profileError.message }, 500)
  }

  if (siteIds.length > 0) {
    const { error: sitesLinkError } = await supabaseAdmin
      .from('profile_sites')
      .insert(siteIds.map((site_id: string) => ({ profile_id: created.user.id, site_id })))
    if (sitesLinkError) {
      return json(
        { error: `Usuario creado, pero no se pudieron asignar los sitios: ${sitesLinkError.message}` },
        500,
      )
    }
  }

  return json({ success: true, userId: created.user.id, email, tempPassword })
})
