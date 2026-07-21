import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import './login.css'

interface MfaChallengeProps {
  onVerified: () => void
}

/** Pantalla de código de verificación en dos pasos — aparece cuando la
 * sesión actual (aal1) todavía no confirma un factor MFA ya verificado en
 * cuentas anteriores (nextLevel aal2). La usan tanto RequireAuth (login
 * normal) como ResetPasswordPage (recuperar/definir contraseña) — Supabase
 * exige aal2 para cambiar la contraseña de una cuenta con MFA, sin importar
 * si la sesión viene de un login normal o de un enlace de recuperación. */
export function MfaChallenge({ onVerified }: MfaChallengeProps) {
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
