import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../../components/ui/PageHeader'
import {
  fetchDemoSignups,
  deleteDemoSignup,
  createDemoSignup,
  type DemoSignupRow,
  type CreateDemoSignupResult,
} from './demoSignupsApi'
import './capture-authorizations.css'
import '../onboarding/clients.css'
import '../onboarding/onboarding.css'

/** Fecha local (no UTC) en formato YYYY-MM-DD — evita el corrimiento de un día
 * para zonas horarias con offset negativo (Colombia, GMT-5) al pasar de la
 * medianoche UTC. */
function toLocalDay(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DemoSignupsReportPage() {
  const [rows, setRows] = useState<DemoSignupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdResult, setCreatedResult] = useState<CreateDemoSignupResult | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim()) {
      setCreateError('Completa el nombre y el correo.')
      return
    }
    setCreating(true)
    setCreateError(null)
    setCreatedResult(null)
    setCopied(false)
    try {
      const result = await createDemoSignup({ email: email.trim(), fullName: fullName.trim() })
      setCreatedResult(result)
      setFullName('')
      setEmail('')
      const data = await fetchDemoSignups()
      setRows(data)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo crear el registro.')
    } finally {
      setCreating(false)
    }
  }

  async function copyCredentials() {
    if (!createdResult) return
    const text =
      `Acceso Demo a LPMS\n` +
      `Correo: ${createdResult.email}\n` +
      `Contraseña temporal: ${createdResult.tempPassword}\n` +
      `Entra en https://lpms-rouge.vercel.app y cámbiala en "Seguridad de la cuenta".`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function handleDelete(row: DemoSignupRow) {
    setBusyId(row.id)
    setDeleteError(null)
    try {
      await deleteDemoSignup(row.id)
      setRows((current) => current.filter((r) => r.id !== row.id))
      setDeletingId(null)
      setDeleteConfirmText('')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo borrar el registro.')
    } finally {
      setBusyId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchDemoSignups()
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const byDay = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const day = toLocalDay(row.createdAt)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    return [...counts.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day))
  }, [rows])

  const last7Days = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    return rows.filter((r) => new Date(r.createdAt) >= cutoff).length
  }, [rows])

  const today = toLocalDay(new Date().toISOString())
  const todayCount = useMemo(() => rows.filter((r) => toLocalDay(r.createdAt) === today).length, [rows, today])

  return (
    <div className="capture-auth-page">
      <PageHeader
        eyebrow="Consultora · Posibles clientes"
        title="Registros Demo"
        subtitle="Cada persona con su propio entorno Demo — autorregistrada desde la pantalla de inicio o creada aquí manualmente por el equipo — tu base de posibles clientes, con cuántos llegan por día."
      />

      <section className="capture-auth-card">
        <h2>Crear registro Demo manualmente</h2>
        <p className="capture-auth-card__subtitle">
          Para cuando el equipo levanta la cuenta durante una llamada con un prospecto, en vez de que se
          autorregistre — no depende de ningún correo de confirmación.
        </p>
        <form className="onboarding-form" onSubmit={handleCreate}>
          <div className="onboarding-form__row">
            <label>
              Nombre completo
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Correo
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </div>

          {createError && <p className="capture-auth-error">{createError}</p>}
          {createdResult && (
            <div className="onboarding-credentials">
              <p className="onboarding-credentials__title">
                Registro Demo creado. Entrega estas credenciales al prospecto — no se envía correo.
              </p>
              <dl className="onboarding-credentials__grid">
                <dt>Correo</dt>
                <dd>{createdResult.email}</dd>
                <dt>Contraseña temporal</dt>
                <dd>
                  <code>{createdResult.tempPassword}</code>
                </dd>
              </dl>
              <p className="onboarding-credentials__hint">
                La persona entra con estos datos y cambia la contraseña en «Seguridad de la cuenta». Esta
                contraseña no se vuelve a mostrar.
              </p>
              <button type="button" className="onboarding-credentials__copy" onClick={copyCredentials}>
                {copied ? '✓ Copiado' : 'Copiar credenciales'}
              </button>
            </div>
          )}

          <div className="onboarding-form__actions">
            <button type="submit" className="button-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear registro Demo'}
            </button>
          </div>
        </form>
      </section>

      {loadError && <p className="capture-auth-error">No se pudo cargar el reporte: {loadError}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : rows.length === 0 ? (
        <p>Todavía no hay ningún registro Demo.</p>
      ) : (
        <>
          <div className="capture-auth-summary">
            <div className="capture-auth-stat">
              <span className="capture-auth-stat__value">{rows.length}</span>
              <span className="capture-auth-stat__label">Registros en total</span>
            </div>
            <div className="capture-auth-stat">
              <span className="capture-auth-stat__value">{last7Days}</span>
              <span className="capture-auth-stat__label">En los últimos 7 días</span>
            </div>
            <div className="capture-auth-stat">
              <span className="capture-auth-stat__value">{todayCount}</span>
              <span className="capture-auth-stat__label">Hoy</span>
            </div>
          </div>

          <section className="capture-auth-card">
            <h2>Nuevos registros por día</h2>
            <p className="capture-auth-card__subtitle">Cantidad de personas que crearon una cuenta cada día.</p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                  <Tooltip formatter={(value) => [value, 'Registros']} />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="capture-auth-card">
            <h2>Detalle</h2>
            <p className="capture-auth-card__subtitle">
              Borrar un registro elimina su cuenta de acceso y su entorno Demo por completo — libera el correo para
              que pueda registrarse de nuevo. Es irreversible.
            </p>
            {deleteError && <p className="capture-auth-error">{deleteError}</p>}
            <div className="table-scroll">
              <table className="capture-auth-table">
                <thead>
                  <tr>
                    <th>Registrado el</th>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Entorno Demo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.createdAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{row.fullName}</td>
                      <td>{row.email}</td>
                      <td>{row.orgName}</td>
                      <td>
                        {deletingId === row.id ? (
                          <div className="clients-confirm clients-confirm--danger">
                            <span className="clients-confirm__prompt">
                              Escribe <strong>{row.email}</strong> para confirmar:
                            </span>
                            <input
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              placeholder={row.email}
                              autoFocus
                            />
                            <div className="clients-confirm__actions">
                              <button
                                type="button"
                                className="clients-delete"
                                onClick={() => handleDelete(row)}
                                disabled={deleteConfirmText.trim() !== row.email || busyId === row.id}
                              >
                                {busyId === row.id ? 'Borrando…' : 'Borrar definitivamente'}
                              </button>
                              <button
                                type="button"
                                className="clients-cancel"
                                onClick={() => {
                                  setDeletingId(null)
                                  setDeleteConfirmText('')
                                }}
                                disabled={busyId === row.id}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="clients-delete-trigger"
                            onClick={() => {
                              setDeletingId(row.id)
                              setDeleteConfirmText('')
                              setDeleteError(null)
                            }}
                          >
                            Borrar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
