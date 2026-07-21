import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Turnstile } from '../../components/ui/Turnstile'
import { describeAuthError } from './authErrorMessages'
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

type Mode = 'login' | 'register' | 'forgot'

export function LoginPage() {
  const { session, signIn, signUp, resetPassword, blockedReason } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0)

  if (session) return <Navigate to="/" replace />

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSuccess(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!captchaToken) {
      setError('Espera a que termine la verificación de seguridad y vuelve a intentar.')
      return
    }

    if (mode === 'login') {
      setSubmitting(true)
      const { error, code } = await signIn(email, password, captchaToken)
      setSubmitting(false)
      setCaptchaResetSignal((k) => k + 1)
      if (error) setError(describeAuthError('login', code, error))
      return
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Escribe tu nombre.')
        return
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.')
        return
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.')
        return
      }
      setSubmitting(true)
      const { error, code, alreadyRegistered } = await signUp(email.trim(), password, fullName.trim(), captchaToken)
      setSubmitting(false)
      setCaptchaResetSignal((k) => k + 1)
      if (error) {
        setError(describeAuthError('register', code, error))
      } else if (alreadyRegistered) {
        setError(describeAuthError('register', 'user_already_exists', 'Ya existe una cuenta con este correo.'))
      } else {
        setSuccess(
          `Te enviamos un correo a ${email.trim()} para confirmar tu cuenta y entrar a tu entorno de prueba. ` +
            'Ábrelo y haz clic en el enlace — si no lo ves en unos minutos, revisa también la carpeta de spam.',
        )
      }
      return
    }

    // mode === 'forgot'
    setSubmitting(true)
    const { error, code } = await resetPassword(email.trim(), captchaToken)
    setSubmitting(false)
    setCaptchaResetSignal((k) => k + 1)
    if (error) {
      setError(describeAuthError('forgot', code, error))
    } else {
      setSuccess(
        `Si existe una cuenta con ${email.trim()}, te enviamos un correo con un enlace para poner una nueva contraseña. ` +
          'Revisa también la carpeta de spam — el enlace es válido por un tiempo limitado.',
      )
    }
  }

  const title = mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : 'Recuperar contraseña'
  const subtitle =
    mode === 'login'
      ? 'Ingresa tus credenciales para continuar.'
      : mode === 'register'
        ? 'Regístrate y prueba LPMS en tu propio entorno Demo, sin costo.'
        : 'Te enviaremos un enlace a tu correo para poner una nueva contraseña.'

  return (
    <div className="login-page">
      <div className="login-hero">
        <img
          src="/cascada-niveles-lpms-v2.png"
          alt="La cascada diaria de reuniones por niveles en LPMS: tres plataformas industriales con anillos de luz, equipos revisando indicadores en pantallas digitales, del nivel operativo a la dirección."
          className="login-hero__image"
        />
        <div className="login-hero__scrim" aria-hidden="true" />

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
        <div className="login-brand-mini" aria-hidden="true">
          <div className="login-brand-mini__bars">
            <span className="login-brand-mini__bar login-brand-mini__bar--1" />
            <span className="login-brand-mini__bar login-brand-mini__bar--2" />
            <span className="login-brand-mini__bar login-brand-mini__bar--3" />
            <span className="login-brand-mini__bar login-brand-mini__bar--4" />
          </div>
          <div className="login-brand-mini__text">
            <span className="login-brand-mini__wordmark">
              <span className="login-brand-mini__lean-pro">LeanPro</span>
              <span className="login-brand-mini__logistic">Logistic</span>
            </span>
            <span className="login-brand-mini__sas">sas</span>
          </div>
        </div>

        <div className="login-product-central">
          <span className="login-product-central__name">LPMS</span>
          <span className="login-product-central__tagline">Lean Performance Management System</span>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <h2 className="login-card__title">{title}</h2>
          <p className="login-card__subtitle">{subtitle}</p>

          {mode === 'register' && (
            <>
              <label className="login-label" htmlFor="fullName">
                Nombre completo
              </label>
              <input
                id="fullName"
                className="login-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoFocus
              />
            </>
          )}

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
            autoFocus={mode !== 'register'}
          />

          {mode !== 'forgot' && (
            <>
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
            </>
          )}

          {mode === 'register' && (
            <>
              <label className="login-label" htmlFor="confirmPassword">
                Confirmar contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="login-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </>
          )}

          <Turnstile onToken={setCaptchaToken} resetSignal={captchaResetSignal} />

          {(error || (mode === 'login' && blockedReason)) && (
            <p className="login-error">{error ?? blockedReason}</p>
          )}
          {success && <p className="login-success">{success}</p>}

          <button className="login-button" type="submit" disabled={submitting || !captchaToken}>
            {submitting
              ? 'Procesando…'
              : mode === 'login'
                ? 'Ingresar'
                : mode === 'register'
                  ? 'Crear mi cuenta Demo'
                  : 'Enviar enlace'}
          </button>

          <div className="login-switch">
            {mode === 'login' && (
              <>
                <button type="button" className="login-link" onClick={() => switchMode('register')}>
                  Crear una cuenta Demo
                </button>
                <button type="button" className="login-link" onClick={() => switchMode('forgot')}>
                  ¿Olvidaste tu contraseña?
                </button>
              </>
            )}
            {mode !== 'login' && (
              <button type="button" className="login-link" onClick={() => switchMode('login')}>
                ← Volver a iniciar sesión
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
