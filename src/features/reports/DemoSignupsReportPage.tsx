import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchDemoSignups, type DemoSignupRow } from './demoSignupsApi'
import './capture-authorizations.css'

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
      <h1>Registros Demo (posibles clientes)</h1>
      <p className="page-subtitle">
        Cada persona que se registró por su cuenta desde la pantalla de inicio y quedó con su propio entorno Demo —
        tu base de posibles clientes, con cuántos llegan por día.
      </p>

      {loadError && <p className="capture-auth-error">No se pudo cargar el reporte: {loadError}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : rows.length === 0 ? (
        <p>Todavía nadie se ha registrado por su cuenta.</p>
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
            <div className="table-scroll">
              <table className="capture-auth-table">
                <thead>
                  <tr>
                    <th>Registrado el</th>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Entorno Demo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.createdAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{row.fullName}</td>
                      <td>{row.email}</td>
                      <td>{row.orgName}</td>
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
