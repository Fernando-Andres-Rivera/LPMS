import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RangePicker } from '../../components/ui/RangePicker'
import { defaultRange } from '../../lib/dateRange'
import { PageHeader } from '../../components/ui/PageHeader'
import { fetchMeasurementAuthorizations, type MeasurementAuthorizationRow } from './captureAuthorizationsApi'
import './capture-authorizations.css'

interface RankingRow {
  name: string
  count: number
}

/** Cuenta ocurrencias de `key(row)` y devuelve las filas ordenadas de mayor
 * a menor — mismo cálculo para el ranking por cliente y el conteo por día. */
function countBy(rows: MeasurementAuthorizationRow[], key: (row: MeasurementAuthorizationRow) => string): RankingRow[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const k = key(row)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

export function CaptureAuthorizationsReportPage() {
  const [range, setRange] = useState(defaultRange())
  const [allRows, setAllRows] = useState<MeasurementAuthorizationRow[]>([])
  const [siteFilter, setSiteFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMeasurementAuthorizations(range)
      .then((data) => {
        if (cancelled) return
        setAllRows(data)
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
  }, [range])

  // Nombres de sitio ya presentes en los datos cargados — sin consulta aparte,
  // ya que este reporte cruza todos los clientes y sus sitios.
  const sites = useMemo(
    () => [...new Set(allRows.map((r) => r.siteName))].sort((a, b) => a.localeCompare(b)),
    [allRows],
  )
  const rows = useMemo(
    () => (siteFilter ? allRows.filter((r) => r.siteName === siteFilter) : allRows),
    [allRows, siteFilter],
  )

  const byClient = useMemo(() => countBy(rows, (r) => r.organizationName), [rows])
  const byDay = useMemo(() => {
    const rowsWithDate = rows.map((r) => ({ ...r, day: r.authorizedAt.slice(0, 10) }))
    const counts = new Map<string, number>()
    for (const row of rowsWithDate) counts.set(row.day, (counts.get(row.day) ?? 0) + 1)
    return [...counts.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day))
  }, [rows])

  const totalClients = byClient.length

  return (
    <div className="capture-auth-page">
      <PageHeader
        eyebrow="Consultora · Auditoría"
        title="Autorizaciones de captura tardía"
        subtitle="Cada corrección que un administrador de LeanProLogistic autoriza sobre una fecha ya cerrada, en todos los clientes — quién la solicita más seguido, cuándo se concentran, y el detalle completo para auditoría."
      />

      <div className="period-row">
        <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} label="Rango de análisis (fecha de autorización)" />
        {sites.length > 0 && (
          <select
            className="level-site-select"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
          >
            <option value="">Todos los sitios</option>
            {sites.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loadError && <p className="capture-auth-error">No se pudo cargar el reporte: {loadError}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : allRows.length === 0 ? (
        <p>Ninguna organización autorizó correcciones tardías en este rango.</p>
      ) : rows.length === 0 ? (
        <p>Ninguna autorización para el sitio elegido en este rango.</p>
      ) : (
        <>
          <div className="capture-auth-summary">
            <div className="capture-auth-stat">
              <span className="capture-auth-stat__value">{rows.length}</span>
              <span className="capture-auth-stat__label">Autorizaciones — global de todos los clientes</span>
            </div>
            <div className="capture-auth-stat">
              <span className="capture-auth-stat__value">{totalClients}</span>
              <span className="capture-auth-stat__label">Clientes con al menos una autorización</span>
            </div>
            <div className="capture-auth-stat">
              <span className="capture-auth-stat__value">{byDay.length ? Math.max(...byDay.map((d) => d.count)) : 0}</span>
              <span className="capture-auth-stat__label">Máximo en un solo día</span>
            </div>
          </div>

          <section className="capture-auth-card">
            <h2>Quién solicita más autorizaciones</h2>
            <p className="capture-auth-card__subtitle">Clientes ordenados de mayor a menor cantidad en el rango.</p>
            <div style={{ width: '100%', height: Math.max(byClient.length * 44, 100) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byClient} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
                  <CartesianGrid horizontal={false} stroke="var(--color-border)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [value, 'Autorizaciones']} />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="capture-auth-card">
            <h2>Autorizaciones por día</h2>
            <p className="capture-auth-card__subtitle">Todos los clientes juntos, por fecha de autorización.</p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                  <Tooltip formatter={(value) => [value, 'Autorizaciones']} />
                  <Bar dataKey="count" fill="var(--color-risk)" radius={[4, 4, 0, 0]} />
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
                    <th>Autorizada el</th>
                    <th>Cliente</th>
                    <th>Sitio</th>
                    <th>Indicador</th>
                    <th>Fecha corregida</th>
                    <th>Causal</th>
                    <th>Autorizó</th>
                    <th>Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.authorizedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{row.organizationName}</td>
                      <td>{row.siteName}</td>
                      <td>{row.indicatorName}</td>
                      <td>{row.periodDate}</td>
                      <td>{row.reasonName}</td>
                      <td>{row.authorizedByName}</td>
                      <td>{row.comment ?? '—'}</td>
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
