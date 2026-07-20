import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import './login.css'

type AalStatus = 'checking' | 'ok' | 'challenge'

interface MfaChallengeProps {
  onVerified: () => void
}

/** Pantalla de código de verificación en dos pasos — aparece cuando la
 * sesión recién iniciada (aal1) todavía no confirma un factor MFA ya
 * verificado en cuentas anteriores (nextLevel aal2). */
function MfaChallenge({ onVerified }: MfaChallengeProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setError(null)
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) throw factorsError
      const factor = factorsData?.totp[0]
      if (!factor) throw new Error('No se encontró un factor de verificación activo.')

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      })
      if (verifyError) throw verifyError
      onVerified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido. Intenta de nuevo.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel" style={{ flex: '1 1 100%' }}>
        <form className="login-card" onSubmit={handleSubmit}>
          <h2 className="login-card__title">Verificación en dos pasos</h2>
          <p className="login-card__subtitle">Ingresa el código de 6 dígitos de tu app de autenticación.</p>

          <label className="login-label" htmlFor="mfa-code">
            Código
          </label>
          <input
            id="mfa-code"
            className="login-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            autoFocus
            required
          />

          {error && <p className="login-error">{error}</p>}

          <button className="login-button" type="submit" disabled={verifying || code.length < 6}>
            {verifying ? 'Verificando…' : 'Verificar'}
          </button>
        </form>
      </div>
    </div>
  )
}

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
