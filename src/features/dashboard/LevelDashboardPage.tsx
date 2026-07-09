import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { IndicatorCard } from '../../components/ui/IndicatorCard'
import { PeriodTypeSelector } from '../../components/ui/PeriodTypeSelector'
import { aggregateValues, buildPeriodBuckets } from '../../lib/periods'
import {
  fetchActiveAxes,
  fetchCurrentTargetsForIndicators,
  fetchIndicatorsByLevel,
  fetchMeasurementsInRange,
} from './dashboardApi'
import { fetchSites } from '../indicators/indicatorsApi'
import type { Axis, Indicator, PeriodType, Site } from '../../lib/types'
import './dashboard.css'

interface IndicatorRow {
  indicator: Indicator
  latestValue: number | null
  targetValue: number | null
  trend: { period_date: string; value: number }[]
}

const NIVELES = [1, 2, 3] as const

export function LevelDashboardPage() {
  const { level: levelParam } = useParams<{ level: string }>()
  const level = (Number(levelParam) as 1 | 2 | 3) || 1

  const { organizationId, siteIds } = useAuth()
  const [axes, setAxes] = useState<Axis[]>([])
  const [sites, setSites] = useState<Site[]>([])
  // null = todavía no lo tocó el usuario; en ese caso se usa el primer sitio asignado por defecto.
  const [siteOverride, setSiteOverride] = useState<string | null>(null)
  const [siteTouched, setSiteTouched] = useState(false)
  const selectedSite = siteTouched ? siteOverride : (siteIds[0] ?? null)
  const [periodType, setPeriodType] = useState<PeriodType>('dia')
  const [rows, setRows] = useState<IndicatorRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    Promise.all([fetchActiveAxes(organizationId), fetchSites(organizationId)]).then(([axesData, sitesData]) => {
      setAxes(axesData)
      setSites(sitesData)
    })
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const indicators = await fetchIndicatorsByLevel(orgId, level, selectedSite)
      if (cancelled) return

      const now = new Date()
      const buckets = buildPeriodBuckets(periodType, now)
      const ids = indicators.map((i) => i.id)

      // 2 consultas en total en vez de 2 por indicador (patrón N+1).
      const [measRows, targetMap] = await Promise.all([
        fetchMeasurementsInRange(ids, buckets[0].startDate, buckets[buckets.length - 1].endDate),
        fetchCurrentTargetsForIndicators(ids, now.getFullYear(), now.getMonth() + 1),
      ])
      if (cancelled) return

      const measByIndicator = new Map<string, { period_date: string; value: number }[]>()
      for (const m of measRows) {
        const list = measByIndicator.get(m.indicator_id) ?? []
        list.push({ period_date: m.period_date, value: m.value })
        measByIndicator.set(m.indicator_id, list)
      }

      const rowsData = indicators.map((indicator) => {
        const indMeas = measByIndicator.get(indicator.id) ?? []
        const series = buckets.map((b) => ({
          label: b.label,
          value: aggregateValues(
            indMeas.filter((r) => r.period_date >= b.startDate && r.period_date <= b.endDate),
            indicator.aggregation_method,
          ),
        }))
        const withData = series.filter((p) => p.value !== null)
        return {
          indicator,
          latestValue: withData.length ? (withData[withData.length - 1].value as number) : null,
          targetValue: targetMap.get(indicator.id) ?? null,
          trend: withData.map((p) => ({ period_date: p.label, value: p.value as number })),
        }
      })
      if (!cancelled) setRows(rowsData)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, level, selectedSite, periodType])

  const axisById = new Map(axes.map((a) => [a.id, a]))
  const rowsByAxis = new Map<string, IndicatorRow[]>()
  for (const row of rows) {
    const list = rowsByAxis.get(row.indicator.axis_id) ?? []
    list.push(row)
    rowsByAxis.set(row.indicator.axis_id, list)
  }

  return (
    <div>
      <h1>Reunión de Nivel {level}</h1>
      <p className="page-subtitle">Todos los indicadores de este nivel, agrupados por eje.</p>

      <div className="level-toolbar">
        <div className="level-tabs">
          {NIVELES.map((n) => (
            <Link key={n} to={`/niveles/${n}`} className={`level-tab ${n === level ? 'level-tab--active' : ''}`}>
              Nivel {n}
            </Link>
          ))}
        </div>

        <PeriodTypeSelector value={periodType} onChange={setPeriodType} />

        {sites.length > 0 && (
          <select
            className="level-site-select"
            value={selectedSite ?? ''}
            onChange={(e) => {
              setSiteOverride(e.target.value || null)
              setSiteTouched(true)
            }}
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

      {loading && <p>Cargando indicadores…</p>}

      {!loading && rows.length === 0 && <p>No hay indicadores de Nivel {level} para este filtro.</p>}

      {axes.map((axis) => {
        const axisRows = rowsByAxis.get(axis.id)
        if (!axisRows || axisRows.length === 0) return null
        return (
          <div className="level-section" key={axis.id}>
            <h3 style={{ color: axisById.get(axis.id)?.color }}>{axis.name}</h3>
            <div className="indicators-grid">
              {axisRows.map(({ indicator, latestValue, targetValue, trend }) => (
                <IndicatorCard
                  key={indicator.id}
                  id={indicator.id}
                  name={indicator.name}
                  unit={indicator.unit}
                  level={indicator.level}
                  improvementDirection={indicator.improvement_direction}
                  latestValue={latestValue}
                  targetValue={targetValue}
                  trend={trend}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
