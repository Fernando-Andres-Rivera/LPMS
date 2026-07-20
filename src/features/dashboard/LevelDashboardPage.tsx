import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { IndicatorCard } from '../../components/ui/IndicatorCard'
import { RangePicker } from '../../components/ui/RangePicker'
import { aggregateValues, buildPeriodBucketsInRange } from '../../lib/periods'
import { defaultRange } from '../../lib/dateRange'
import {
  fetchActiveAxes,
  fetchCurrentTargetsForIndicators,
  fetchIndicatorsByLevel,
  fetchMeasurementsInRange,
} from './dashboardApi'
import { fetchSites } from '../indicators/indicatorsApi'
import {
  computeDaysWithoutAccidents,
  fetchLatestAccident,
  fetchSafetyEventsInRange,
  isDaysWithoutAccidentsIndicatorName,
} from '../safety/safetyApi'
import type { Axis, Indicator, SemaforoEstado, Site } from '../../lib/types'
import './dashboard.css'

interface IndicatorRow {
  indicator: Indicator
  latestValue: number | null
  targetValue: number | null
  trend: { period_date: string; value: number | null }[]
  estadoOverride?: SemaforoEstado
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
  const [range, setRange] = useState(defaultRange())
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

      const from = new Date(`${range.from}T00:00:00`)
      const to = new Date(`${range.to}T00:00:00`)
      const buckets = buildPeriodBucketsInRange('dia', from, to)
      const ids = indicators.map((i) => i.id)

      // 2 consultas en total en vez de 2 por indicador (patrón N+1).
      const [measRows, targetMap] = await Promise.all([
        fetchMeasurementsInRange(ids, range.from, range.to),
        fetchCurrentTargetsForIndicators(ids, to.getFullYear(), to.getMonth() + 1),
      ])
      if (cancelled) return

      const measByIndicator = new Map<string, { period_date: string; value: number }[]>()
      for (const m of measRows) {
        const list = measByIndicator.get(m.indicator_id) ?? []
        list.push({ period_date: m.period_date, value: m.value })
        measByIndicator.set(m.indicator_id, list)
      }

      // "Días sin accidentes" no se captura a mano — se calcula igual que en
      // Seguridad y Salud en el Trabajo, a partir de la fecha de inicio de
      // operación o el último accidente del sitio del indicador.
      const daysWithoutAccidentsIndicators = indicators.filter(
        (i) => i.site_id && isDaysWithoutAccidentsIndicatorName(i.name),
      )
      const daysWithoutAccidentsMap = new Map<string, number | null>()
      // El conteo acumulado siempre "cumple" un objetivo de 0 — lo que
      // realmente indica si el rango elegido estuvo bien o mal es si hubo
      // un accidente reportado DENTRO de ese rango, sin importar cuántos
      // días lleva la racha desde entonces.
      const daysWithoutAccidentsEstadoMap = new Map<string, SemaforoEstado>()
      if (daysWithoutAccidentsIndicators.length > 0) {
        const rangeEndExclusive = (() => {
          const d = new Date(`${range.to}T00:00:00`)
          d.setDate(d.getDate() + 1)
          return d.toISOString().slice(0, 10)
        })()
        await Promise.all(
          daysWithoutAccidentsIndicators.map(async (indicator) => {
            const site = sites.find((s) => s.id === indicator.site_id)
            const [latestAccident, rangeEvents] = await Promise.all([
              fetchLatestAccident([indicator.site_id!]),
              fetchSafetyEventsInRange([indicator.site_id!], range.from, rangeEndExclusive),
            ])
            daysWithoutAccidentsMap.set(
              indicator.id,
              computeDaysWithoutAccidents(site?.operation_start_date ?? null, latestAccident?.event_date ?? null, to),
            )
            const hasAccidentInRange = rangeEvents.some((e) => e.event_type === 'accidente')
            daysWithoutAccidentsEstadoMap.set(indicator.id, hasAccidentInRange ? 'incumple' : 'cumple')
          }),
        )
      }
      if (cancelled) return

      const rowsData = indicators.map((indicator) => {
        const indMeas = measByIndicator.get(indicator.id) ?? []
        const series = buckets.map((b) => ({
          label: b.label,
          date: b.startDate,
          value: aggregateValues(
            indMeas.filter((r) => r.period_date >= b.startDate && r.period_date <= b.endDate),
            indicator.aggregation_method,
          ),
        }))
        // El KPI del rango completo (no solo el último bucket): "suma" debe
        // sumar TODO el rango elegido, igual que el Tablero — antes esto
        // tomaba el valor del último día, que no reflejaba el rango.
        const latestValue = daysWithoutAccidentsMap.has(indicator.id)
          ? (daysWithoutAccidentsMap.get(indicator.id) ?? null)
          : aggregateValues(indMeas, indicator.aggregation_method)
        return {
          indicator,
          latestValue,
          targetValue: targetMap.get(indicator.id) ?? null,
          trend: series.map((p) => ({ period_date: p.date, value: p.value })),
          estadoOverride: daysWithoutAccidentsEstadoMap.get(indicator.id),
        }
      })
      if (!cancelled) setRows(rowsData)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, level, selectedSite, range, sites])

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

        <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />

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
              {axisRows.map(({ indicator, latestValue, targetValue, trend, estadoOverride }) => (
                <IndicatorCard
                  key={indicator.id}
                  id={indicator.id}
                  name={indicator.name}
                  unit={indicator.unit}
                  level={indicator.level}
                  improvementDirection={indicator.improvement_direction}
                  valueType={indicator.value_type}
                  latestValue={latestValue}
                  targetValue={targetValue}
                  trend={trend}
                  estadoOverride={estadoOverride}
                  isFocus={indicator.is_focus}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
