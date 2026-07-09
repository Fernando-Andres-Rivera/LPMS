import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { fetchSites } from '../indicators/indicatorsApi'
import { fetchCapturedDates, fetchDailyIndicators, type IndicatorWithSiteName } from './measurementsApi'
import type { Site } from '../../lib/types'
import './compliance.css'

const DAYS_BACK = 7

function lastNDates(n: number): string[] {
  const dates: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
}

export function CaptureCompliancePage() {
  const { organizationId } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSite, setSelectedSite] = useState<string | null>(null)
  const [indicators, setIndicators] = useState<IndicatorWithSiteName[]>([])
  const [capturedByIndicator, setCapturedByIndicator] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)

  const dates = lastNDates(DAYS_BACK)

  useEffect(() => {
    if (!organizationId) return
    fetchSites(organizationId).then(setSites)
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const indicatorsData = await fetchDailyIndicators(orgId, selectedSite)
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
  }, [organizationId, selectedSite])

  return (
    <div>
      <h1>Cumplimiento de captura</h1>
      <p className="page-subtitle">
        Indicadores de frecuencia diaria y si su medición fue registrada en cada uno de los últimos {DAYS_BACK} días.
      </p>

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
