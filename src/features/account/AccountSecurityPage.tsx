import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import './account-security.css'

interface TotpFactor {
  id: string
  friendly_name?: string | null
  status: string
  created_at: string
}

export function AccountSecurityPage() {
  const { profile } = useAuth()
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadFactors() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) setLoadError(error.message)
    else setFactors(data?.totp ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      await loadFactors()
    }
    load()
  }, [])

  async function handleStartEnroll() {
    setError(null)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) {
      setError(error.message)
      return
    }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
  }

  async function handleCancelEnroll() {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId })
    setFactorId(null)
    setQrCode(null)
    setSecret(null)
    setVerifyCode('')
    setError(null)
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setSaving(true)
    setError(null)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      })
      if (verifyError) throw verifyError
      setFactorId(null)
      setQrCode(null)
      setSecret(null)
      setVerifyCode('')
      await loadFactors()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Código inválido. Verifica la hora de tu dispositivo e intenta de nuevo.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    await supabase.auth.mfa.unenroll({ factorId: id })
    await loadFactors()
  }

  const verifiedFactors = factors.filter((f) => f.status === 'verified')
  const hasVerifiedFactor = verifiedFactors.length > 0

  return (
    <div className="account-security-page">
      <h1>Seguridad de la cuenta</h1>
      <p className="page-subtitle">
        Verificación en dos pasos (MFA) con una app de autenticación (Google Authenticator, Authy, 1Password, etc.).
        {profile?.role === 'admin_consultora' && (
          <>
            {' '}
            <strong>Es obligatoria para cuentas Admin Consultora</strong>, porque tienen acceso a todos los clientes.
          </>
        )}
      </p>

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          {loadError && <p className="account-security-error">{loadError}</p>}

          {hasVerifiedFactor && (
            <section className="account-security-card">
              <h2>Verificación en dos pasos activa</h2>
              <ul className="account-security-factor-list">
                {verifiedFactors.map((f) => (
                  <li key={f.id}>
                    <span>{f.friendly_name || 'Aplicación de autenticación'}</span>
                    <button type="button" onClick={() => handleRemove(f.id)}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!hasVerifiedFactor && !factorId && (
            <section className="account-security-card">
              <h2>Sin verificación en dos pasos</h2>
              <p>Hoy tu cuenta solo está protegida por contraseña.</p>
              <button type="button" className="button-primary" onClick={handleStartEnroll}>
                Activar verificación en dos pasos
              </button>
            </section>
          )}

          {factorId && (
            <section className="account-security-card">
              <h2>Escanea el código QR</h2>
              <p>Ábrelo con tu app de autenticación (Google Authenticator, Authy, 1Password…).</p>
              {qrCode && (
                <img src={qrCode} alt="Código QR para verificación en dos pasos" className="account-security-qr" />
              )}
              {secret && (
                <p className="account-security-secret">
                  ¿No puedes escanear? Ingresa este código manualmente: <code>{secret}</code>
                </p>
              )}
              <form className="account-security-verify-form" onSubmit={handleVerify}>
                <label htmlFor="totp-code">Código de 6 dígitos</label>
                <input
                  id="totp-code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  required
                />
                {error && <p className="account-security-error">{error}</p>}
                <div className="account-security-verify-form__actions">
                  <button type="button" onClick={handleCancelEnroll}>
                    Cancelar
                  </button>
                  <button type="submit" className="button-primary" disabled={saving || verifyCode.length < 6}>
                    {saving ? 'Verificando…' : 'Confirmar'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  )
}
