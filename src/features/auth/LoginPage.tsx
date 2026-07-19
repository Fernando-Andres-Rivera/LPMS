import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './login.css'

const CASCADE_STAGES = [
  {
    key: 1,
    tag: 'Nivel 1 · 07:00 AM',
    text: 'Operarios y líder de equipo revisan el tablero SQDCP y resuelven bloqueos en minutos.',
  },
  {
    key: 2,
    tag: 'Nivel 2 · 08:30 AM',
    text: 'Supervisión identifica tendencias entre equipos y asigna soporte donde se necesita.',
  },
  {
    key: 3,
    tag: 'Nivel 3 · 10:00 AM',
    text: 'Dirección revisa las desviaciones del sistema y define las prioridades del día.',
  },
]

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
      <div className="login-hero">
        <img
          src="/cascada-niveles-lpms-v2.png"
          alt="La cascada diaria de reuniones por niveles en LPMS: tres plataformas industriales con anillos de luz, equipos revisando indicadores en pantallas digitales, del nivel operativo a la dirección."
          className="login-hero__image"
        />
        <div className="login-hero__scrim" aria-hidden="true" />

        <div className="login-hero__brand">
          <span className="login-hero__brand-name">LeanProLogistic SAS</span>
          <span className="login-hero__brand-product">LPMS</span>
        </div>

        <div className="login-hero__captions">
          {CASCADE_STAGES.map((stage) => (
            <div key={stage.key} className={`login-hero__caption login-hero__caption--${stage.key}`}>
              <span className="login-hero__caption-tag">{stage.tag}</span>
              <p>{stage.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2 className="login-card__title">Iniciar sesión</h2>
          <p className="login-card__subtitle">Ingresa tus credenciales para continuar.</p>

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
    </div>
  )
}
