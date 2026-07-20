import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Organization, Profile } from '../lib/types'
import { AuthContext } from './auth-context'

const SELECTED_ORG_STORAGE_KEY = 'lpms_selected_org'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [organizationId, setOrganizationIdState] = useState<string | null>(null)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)

  async function loadProfile(userId: string) {
    const [{ data: profileData }, { data: sitesData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('profile_sites').select('site_id').eq('profile_id', userId),
    ])

    // Un perfil desactivado ya no puede leer/escribir nada (current_role_name()
    // y current_org_id() dejan de resolverlo en la base de datos) — se cierra
    // la sesión aquí mismo para que no se quede viendo pantallas vacías o
    // errores de permisos sin explicación.
    if (profileData && !profileData.active) {
      setBlockedReason('Tu usuario fue desactivado. Contacta a tu administrador si crees que esto es un error.')
      setProfile(null)
      setSiteIds([])
      setOrganizations([])
      setOrganizationIdState(null)
      await supabase.auth.signOut()
      return
    }

    setProfile(profileData ?? null)
    setSiteIds((sitesData ?? []).map((row) => row.site_id))

    if (profileData?.role === 'admin_consultora') {
      const { data: orgsData } = await supabase
        .from('organizations')
        .select('*')
        .eq('active', true)
        .eq('is_demo', false)
        .order('name')
      const orgs = orgsData ?? []
      setOrganizations(orgs)
      const stored = localStorage.getItem(SELECTED_ORG_STORAGE_KEY)
      const initial = stored && orgs.some((o) => o.id === stored) ? stored : (orgs[0]?.id ?? profileData.organization_id)
      setOrganizationIdState(initial)
    } else {
      setOrganizations([])
      setOrganizationIdState(profileData?.organization_id ?? null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) {
        await loadProfile(data.session.user.id)
      }
      setLoading(false)
    })

    // OJO: nunca hacer `await` sobre una consulta de Supabase directamente
    // dentro de este callback — produce un deadlock conocido del cliente de
    // Supabase (se traba esperando el propio lock de sesión). Se difiere
    // con setTimeout para salir del contexto síncrono del callback.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        setTimeout(() => {
          loadProfile(newSession.user.id)
        }, 0)
      } else {
        setProfile(null)
        setSiteIds([])
        setOrganizations([])
        setOrganizationIdState(null)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  function setOrganizationId(id: string) {
    if (profile?.role !== 'admin_consultora') return
    setOrganizationIdState(id)
    localStorage.setItem(SELECTED_ORG_STORAGE_KEY, id)
  }

  async function refreshOrganizations(selectId?: string) {
    if (profile?.role !== 'admin_consultora') return
    const { data: orgsData } = await supabase
      .from('organizations')
      .select('*')
      .eq('active', true)
      .eq('is_demo', false)
      .order('name')
    const orgs = orgsData ?? []
    setOrganizations(orgs)
    if (selectId) setOrganizationId(selectId)
  }

  async function signIn(email: string, password: string, captchaToken?: string) {
    setBlockedReason(null)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    return { error: error?.message ?? null, code: error?.code }
  }

  async function signUp(email: string, password: string, fullName: string, captchaToken?: string) {
    setBlockedReason(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // emailRedirectTo apunta a la pantalla dedicada de "definir contraseña"
      // — el mismo enlace de confirmación deja al usuario con una sesión ya
      // activa (así funciona el link de Supabase), así que esa pantalla solo
      // necesita mostrar el formulario, sin depender de cachar ningún evento.
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/restablecer-contrasena`,
        captchaToken,
      },
    })
    return { error: error?.message ?? null, code: error?.code }
  }

  async function resetPassword(email: string, captchaToken?: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
      captchaToken,
    })
    return { error: error?.message ?? null, code: error?.code }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        siteIds,
        loading,
        blockedReason,
        organizationId,
        organizations,
        setOrganizationId,
        refreshOrganizations,
        signIn,
        signUp,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
