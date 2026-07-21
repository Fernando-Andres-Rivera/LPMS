import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { MfaChallenge } from './MfaChallenge'
import './login.css'

type AalStatus = 'checking' | 'ok' | 'challenge'

/** Redirige a /login si no hay sesión activa, y exige el código de
 * verificación en dos pasos cuando el usuario ya tiene un factor MFA
 * verificado pero esta sesión todavía no lo confirmó. Definir contraseña
 * (primera vez, o recuperación) vive en su propia pantalla dedicada
 * (ResetPasswordPage, ruta /restablecer-contrasena) — no aquí, para no
 * depender de cachar el evento PASSWORD_RECOVERY justo a tiempo. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const [aalStatus, setAalStatus] = useState<AalStatus>('checking')
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function checkAal() {
      setAalStatus('checking')
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      setCheckedUserId(session!.user.id)
      setAalStatus(data && data.nextLevel === 'aal2' && data.currentLevel !== data.nextLevel ? 'challenge' : 'ok')
    }

    checkAal()
    return () => {
      cancelled = true
    }
    // Se controla por user.id a propósito: la refresca cada vez que renueva el
    // token (mismo usuario, objeto session nuevo) volvería a pedir el código.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  if (loading) return <div className="page-loading">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (checkedUserId !== session.user.id || aalStatus === 'checking') {
    return <div className="page-loading">Cargando…</div>
  }
  if (aalStatus === 'challenge') {
    return <MfaChallenge onVerified={() => setAalStatus('ok')} />
  }

  return <Outlet />
}
