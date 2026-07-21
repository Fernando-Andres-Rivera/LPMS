import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Organization, Profile } from '../lib/types'

export interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  siteIds: string[]
  loading: boolean
  /** Mensaje a mostrar en el login cuando la sesión se cerró porque el
   * usuario fue desactivado — se limpia al intentar iniciar sesión de nuevo. */
  blockedReason: string | null
  /** Organización efectiva para todas las consultas de datos. Para la mayoría de
   * los roles es siempre profile.organization_id; para admin_consultora puede
   * cambiar mediante setOrganizationId (selector de cliente). */
  organizationId: string | null
  /** Lista de organizaciones disponibles para cambiar — solo se llena para admin_consultora. */
  organizations: Organization[]
  setOrganizationId: (id: string) => void
  /** Vuelve a cargar la lista de organizaciones (ej. tras crear una nueva) y, si se pasa, selecciona esa. */
  refreshOrganizations: (selectId?: string) => Promise<void>
  /** captchaToken es obligatorio en la práctica: Supabase Auth tiene la
   * protección CAPTCHA activada a nivel de proyecto (todos los endpoints de
   * password-grant), así que sin un token válido de Turnstile la llamada falla.
   * `code` es el código de error ESTABLE de Supabase (ej. 'email_not_confirmed',
   * 'invalid_credentials') — úsalo para decidir el mensaje a mostrar en vez de
   * el `error` (texto en inglés, pensado para logs, no para el usuario final). */
  signIn: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: string | null; code?: string }>
  /** Registro público — crea la cuenta; el trigger handle_new_user la
   * aprovisiona con una organización Demo propia. Con confirmación de correo
   * activa, no devuelve sesión hasta que el usuario confirma.
   * `alreadyRegistered` es true cuando Supabase respondió "éxito" pero en
   * realidad el correo ya tenía cuenta y no mandó nada (ver AuthContext). */
  signUp: (
    email: string,
    password: string,
    fullName: string,
    captchaToken?: string,
  ) => Promise<{ error: string | null; code?: string; alreadyRegistered?: boolean }>
  /** Envía el correo de recuperación de contraseña. */
  resetPassword: (email: string, captchaToken?: string) => Promise<{ error: string | null; code?: string }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
