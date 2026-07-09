import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './login.css'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError('Credenciales inválidas. Verifica tu correo y contraseña.')
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-title">LPMS</h1>
        <p className="login-subtitle">Lean Performance Management System</p>

        <label className="login-label" htmlFor="email">
          Correo electrónico
        </label>
        <input
          id="email"
          type="email"
          className="login-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <label className="login-label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="login-error">{error}</p>}

        <button className="login-button" type="submit" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
