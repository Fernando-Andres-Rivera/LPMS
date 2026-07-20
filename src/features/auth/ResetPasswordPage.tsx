import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { describeAuthError } from './authErrorMessages'
import './login.css'

/**
 * Pantalla a la que llega tanto el enlace de "olvidé mi contraseña" como el
 * de invitación/confirmación de correo — ambos dejan una sesión ya activa
 * (así funcionan los enlaces de Supabase), así que esta pantalla no depende
 * de detectar ningún evento: solo mira si hay sesión (via useAuth, que ya la
 * captura apenas el cliente la establece) y muestra el formulario.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (done) return <Navigate to="/" replace />
  if (loading) return <div className="page-loading">Cargando…</div>

  if (!session) {
    return (
      <div className="login-page">
        <div className="login-panel" style={{ flex: '1 1 100%' }}>
          <div className="login-card">
            <h2 className="login-card__title">Este enlace ya no es válido</h2>
            <p className="login-card__subtitle">
              Ya expiró o ya se usó. Vuelve a la pantalla de inicio y usa "¿Olvidaste tu contraseña?" para pedir uno
              nuevo.
            </p>
            <Link to="/login" className="login-button login-button--link">
              Volver a iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setError(describeAuthError('forgot', error.code, error.message))
    } else {
      setDone(true)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel" style={{ flex: '1 1 100%' }}>
        <form className="login-card" onSubmit={handleSubmit}>
          <h2 className="login-card__title">Define tu contraseña</h2>
          <p className="login-card__subtitle">Escríbela dos veces para confirmarla y entra directo a tu cuenta.</p>

          <label className="login-label" htmlFor="new-password">
            Nueva contraseña
          </label>
          <input
            id="new-password"
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />

          <label className="login-label" htmlFor="confirm-password">
            Confirmar contraseña
          </label>
          <input
            id="confirm-password"
            className="login-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <p className="login-error">{error}</p>}

          <button className="login-button" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
