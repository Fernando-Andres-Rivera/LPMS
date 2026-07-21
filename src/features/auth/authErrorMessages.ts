/**
 * Traduce el `code` estable de un error de Supabase Auth (no el `message`,
 * que viene en inglés y no siempre es claro para el usuario final) a un
 * mensaje en español que dice qué pasó y qué debe hacer la persona —
 * en vez de un genérico "credenciales inválidas" para todo.
 */
export function describeAuthError(
  mode: 'login' | 'register' | 'forgot' | 'invite',
  code: string | undefined,
  fallback: string,
): string {
  switch (code) {
    case 'invalid_credentials':
      return 'El correo o la contraseña no son correctos. Verifica ambos, o usa "¿Olvidaste tu contraseña?" si no la recuerdas.'
    case 'email_not_confirmed':
      return 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada (y la carpeta de spam) y haz clic en el enlace que te enviamos al registrarte.'
    case 'user_already_exists':
    case 'email_exists':
      return mode === 'invite'
        ? 'Ya existe una cuenta de acceso con este correo. Búscala en la lista de usuarios de abajo; si no aparece ahí, hay que eliminarla antes de volver a crearla.'
        : 'Ya existe una cuenta con este correo. Inicia sesión, o usa "¿Olvidaste tu contraseña?" si no la recuerdas.'
    case 'weak_password':
      return 'Esa contraseña es demasiado débil o común. Usa una combinación menos predecible, de al menos 8 caracteres.'
    case 'over_email_send_rate_limit':
      return 'Supabase solo permite unos pocos correos por hora en el plan actual y ese límite ya se alcanzó. Espera unos minutos y vuelve a intentar — para que esto no vuelva a pasar con clientes reales, hay que configurar un proveedor de correo propio (SMTP) en el dashboard de Supabase.'
    case 'over_request_rate_limit':
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentar.'
    case 'captcha_failed':
      return 'No se pudo verificar la seguridad de este intento. Recarga la página e inténtalo de nuevo.'
    case 'user_banned':
      return 'Esta cuenta está suspendida. Contacta a tu administrador.'
    case 'signup_disabled':
      return 'El registro de cuentas nuevas está deshabilitado por ahora.'
    case 'same_password':
      return 'La nueva contraseña debe ser distinta a la anterior.'
    case 'insufficient_aal':
      return 'Esta cuenta tiene verificación en dos pasos activada — completa ese paso antes de continuar.'
    case 'session_expired':
    case 'session_not_found':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return mode === 'forgot'
        ? 'Este enlace ya expiró o ya se usó. Solicita uno nuevo con "¿Olvidaste tu contraseña?".'
        : 'Este enlace ya expiró o ya se usó. Solicita uno nuevo.'
    default:
      return fallback
  }
}
