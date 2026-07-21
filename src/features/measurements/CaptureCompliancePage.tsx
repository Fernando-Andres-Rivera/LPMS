import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { fetchSites } from '../indicators/indicatorsApi'
import { fetchActiveAxes } from '../dashboard/dashboardApi'
import { fetchCapturedDates, fetchDailyIndicators, type IndicatorWithSiteName } from './measurementsApi'
import type { Axis, Site } from '../../lib/types'
import { PageHeader } from '../../components/ui/PageHeader'
import './compliance.css'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Días del mes en curso, del 1 hasta hoy — no tiene sentido mostrar días
 * futuros que todavía no se pueden capturar. */
function currentMonthDatesToToday(): string[] {
  const now = new Date()
  const dates: string[] = []
  for (let day = 1; day <= now.getDate(); day++) {
    dates.push(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}`)
  }
  return dates
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
}

function currentMonthLabel(): string {
  const label = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function CaptureCompliancePage() {
  const { organizationId } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSite, setSelectedSite] = useState<string | null>(null)
  const [axes, setAxes] = useState<Axis[]>([])
  const [selectedAxis, setSelectedAxis] = useState<string | null>(null)
  const [indicators, setIndicators] = useState<IndicatorWithSiteName[]>([])
  const [capturedByIndicator, setCapturedByIndicator] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)

  const dates = currentMonthDatesToToday()

  useEffect(() => {
    if (!organizationId) return
    Promise.all([fetchSites(organizationId), fetchActiveAxes(organizationId)]).then(([sitesData, axesData]) => {
      setSites(sitesData)
      setAxes(axesData)
    })
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const indicatorsData = await fetchDailyIndicators(orgId, selectedSite, selectedAxis)
      if (cancelled) return
      setIndicators(indicatorsData)

      const captured = await fetchCapturedDates(
        indicatorsData.map((i) => i.id),
        dates[0],
        dates[dates.length - 1],
      )
      if (cancelled) return

      const map = new Map<string, Set<string>>()
      for (const row of captured) {
        const set = map.get(row.indicator_id) ?? new Set<string>()
        set.add(row.period_date)
        map.set(row.indicator_id, set)
      }
      setCapturedByIndicator(map)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, selectedSite, selectedAxis])

  return (
    <div>
      <PageHeader
        eyebrow="Diario · Disciplina de captura"
        title="Cumplimiento de captura"
        subtitle={`Indicadores de frecuencia diaria y si su medición fue registrada en cada día de ${currentMonthLabel()}.`}
      />

      <div className="compliance-filters">
        {axes.length > 0 && (
          <select
            className="level-site-select compliance-site-select"
            value={selectedAxis ?? ''}
            onChange={(e) => setSelectedAxis(e.target.value || null)}
          >
            <option value="">Todos los ejes</option>
            {axes.map((axis) => (
              <option key={axis.id} value={axis.id}>
                {axis.name}
              </option>
            ))}
          </select>
        )}

        {sites.length > 0 && (
          <select
            className="level-site-select compliance-site-select"
            value={selectedSite ?? ''}
            onChange={(e) => setSelectedSite(e.target.value || null)}
          >
            <option value="">Todos los sitios</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : indicators.length === 0 ? (
        <p>No hay indicadores de frecuencia diaria para este filtro.</p>
      ) : (
        <div className="table-scroll">
        <table className="compliance-table">
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Sitio</th>
              {dates.map((d) => (
                <th key={d}>{formatDay(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map((indicator) => {
              const capturedDates = capturedByIndicator.get(indicator.id) ?? new Set<string>()
              return (
                <tr key={indicator.id}>
                  <td>{indicator.name}</td>
                  <td>{indicator.sites?.name ?? 'Corporativo'}</td>
                  {dates.map((d) => (
                    <td key={d} className="compliance-cell">
                      {capturedDates.has(d) ? (
                        <span className="compliance-ok">✓</span>
                      ) : (
                        <span className="compliance-missing">✗</span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
