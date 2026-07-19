import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { IndicatorCard } from '../../components/ui/IndicatorCard'
import { Semaforo } from '../../components/ui/Semaforo'
import { RangePicker } from '../../components/ui/RangePicker'
import { calcularSemaforo, SEMAFORO_COLOR } from '../../lib/semaforo'
import { aggregateValues, buildPeriodBucketsInRange } from '../../lib/periods'
import { daysAgo, yesterday, DEFAULT_RANGE_DAYS } from '../../lib/dateRange'
import { formatIndicatorValue, type Axis, type Indicator } from '../../lib/types'
import {
  fetchActiveAxes,
  fetchIndicatorsByAxis,
  fetchIndicatorStatusesInRange,
  fetchMeasurementsInRange,
  type IndicatorStatus,
} from './dashboardApi'
import { fetchAnalysisSpeedDays, fetchAxisActionPlans, type AxisActionPlan } from './generalDashboardApi'
import {
  computeIndicatorCauseParetoForParent,
  fetchIndicatorCausesForMany,
  fetchIndicatorCauseTagsForMany,
  type IndicatorCauseTag,
} from '../causal-analysis/standardCausesApi'
import { ExposureSection } from './ExposureSection'
import { fetchExposureSchedule } from './exposureScheduleApi'
import type { ExposureSchedule, IndicatorCause } from '../../lib/types'
import './general-dashboard.css'

const CAN_EDIT_EXPOSURE_ROLES = ['admin_consultora', 'admin_cliente', 'gerente']

const TOP_CAUSES = 3

interface KpiTileProps {
  indicator: Indicator
  status: IndicatorStatus | undefined
  trend: { period_date: string; value: number | null }[]
}

/**
 * Elige cómo mostrar cada indicador según su naturaleza, no un único
 * formato para todos: Sí/No es un ESTADO (tarjeta), un % ya es una barra
 * de avance por definición, y numérico es progreso contra un objetivo
 * (barra con la marca del objetivo) — el mismo criterio que se explicó al
 * usuario al construirlo.
 */
function KpiTile({ indicator, status, trend }: KpiTileProps) {
  const latestValue = status?.latest_value ?? null
  const targetValue = status?.target_value ?? null
  const estado = calcularSemaforo(latestValue, targetValue, indicator.improvement_direction)

  if (indicator.value_type === 'binario') {
    return (
      <IndicatorCard
        id={indicator.id}
        name={indicator.name}
        unit={indicator.unit}
        level={indicator.level}
        improvementDirection={indicator.improvement_direction}
        valueType="binario"
        latestValue={latestValue}
        targetValue={targetValue}
        trend={trend}
      />
    )
  }

  if (indicator.value_type === 'razon') {
    const pct = latestValue !== null ? Math.max(0, Math.min(100, latestValue)) : 0
    return (
      <Link
        to={`/tablero/${indicator.id}`}
        className="gdash-card gdash-card--bar"
        style={{ borderLeftColor: SEMAFORO_COLOR[estado] }}
      >
        <div className="gdash-card__header">
          <span className="gdash-card__level">Nivel {indicator.level}</span>
          <Semaforo estado={estado} showLabel={false} size="sm" />
        </div>
        <h3 className="gdash-card__name">{indicator.name}</h3>
        <div className="gdash-progress">
          <div className="gdash-progress__fill" style={{ width: `${pct}%`, background: SEMAFORO_COLOR[estado] }} />
        </div>
        <span className="gdash-card__value">{formatIndicatorValue(latestValue, 'razon', '')}</span>
      </Link>
    )
  }

  // numérico: barra de valor vs. objetivo, con la marca del objetivo encima
  const scale = Math.max(Math.abs(latestValue ?? 0), Math.abs(targetValue ?? 0), 1) * 1.15
  const valuePct = latestValue !== null ? (Math.abs(latestValue) / scale) * 100 : 0
  const targetPct = targetValue !== null ? (Math.abs(targetValue) / scale) * 100 : null

  return (
    <Link
      to={`/tablero/${indicator.id}`}
      className="gdash-card gdash-card--bar"
      style={{ borderLeftColor: SEMAFORO_COLOR[estado] }}
    >
      <div className="gdash-card__header">
        <span className="gdash-card__level">Nivel {indicator.level}</span>
        <Semaforo estado={estado} showLabel={false} size="sm" />
      </div>
      <h3 className="gdash-card__name">{indicator.name}</h3>
      <div className="gdash-progress">
        <div className="gdash-progress__fill" style={{ width: `${valuePct}%`, background: SEMAFORO_COLOR[estado] }} />
        {targetPct !== null && <div className="gdash-progress__target" style={{ left: `${targetPct}%` }} />}
      </div>
      <span className="gdash-card__value">
        {latestValue ?? '—'} {indicator.unit}
        <small> · Objetivo: {targetValue ?? '—'} {indicator.unit}</small>
      </span>
    </Link>
  )
}

interface MiniParetoProps {
  indicator: Indicator
  causes: IndicatorCause[]
  tags: IndicatorCauseTag[]
}

function MiniParetoCard({ indicator, causes, tags }: MiniParetoProps) {
  const { rows } = useMemo(
    () => computeIndicatorCauseParetoForParent(causes, tags, null),
    [causes, tags],
  )
  const top = rows.slice(0, TOP_CAUSES)
  const totalImpact = rows.reduce((sum, r) => sum + r.impactTotal, 0)

  return (
    <div className="gdash-pareto-card">
      <h3>{indicator.name}</h3>
      {top.length === 0 ? (
        <p className="gdash-pareto-empty">
          Sin causas registradas todavía en "Causas posibles" para este indicador.
        </p>
      ) : (
        <ul className="gdash-pareto-list">
          {top.map((row, i) => (
            <li key={row.cause.id}>
              <span className="gdash-pareto-rank">{i + 1}</span>
              <span className="gdash-pareto-name">{row.cause.name}</span>
              <div className="gdash-pareto-bar">
                <div
                  className="gdash-pareto-bar__fill"
                  style={{ width: `${totalImpact ? (row.impactTotal / totalImpact) * 100 : 0}%` }}
                />
              </div>
              <span className="gdash-pareto-weight">{row.impactTotal}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/analisis-causal/${indicator.id}`} className="gdash-pareto-link">
        Ver Pareto completo →
      </Link>
    </div>
  )
}

interface ActionRowProps {
  plan: AxisActionPlan
  indicatorName: string
  isTopCause: boolean
}

function ActionRow({ plan, indicatorName, isTopCause }: ActionRowProps) {
  return (
    <div className={`gdash-action-row gdash-action-row--${plan.status}`}>
      <div className="gdash-action-row__status">
        <span className={`gdash-action-badge gdash-action-badge--${plan.status}`}>{plan.status}</span>
      </div>
      <div className="gdash-action-row__body">
        <p className="gdash-action-row__description">{plan.description}</p>
        <p className="gdash-action-row__meta">
          {indicatorName}
          {plan.responsible_name && <> · {plan.responsible_name}</>}
          {plan.due_date && <> · Plazo: {plan.due_date}</>}
        </p>
        {plan.root_cause ? (
          <p className="gdash-action-row__cause">
            <strong>Causa:</strong> {plan.root_cause}
            {isTopCause && <span className="gdash-action-row__top-tag">🎯 causa principal</span>}
          </p>
        ) : (
          <p className="gdash-action-row__no-cause">⚠ No está vinculada a ningún análisis de causa.</p>
        )}
      </div>
    </div>
  )
}

export function GeneralDashboardPage() {
  const { organizationId, profile } = useAuth()
  const canEditExposure = !!profile && CAN_EDIT_EXPOSURE_ROLES.includes(profile.role)
  const [exposureSchedule, setExposureSchedule] = useState<ExposureSchedule | null>(null)
  const [exposureLoading, setExposureLoading] = useState(true)
  const [rangeFrom, setRangeFrom] = useState(daysAgo(DEFAULT_RANGE_DAYS))
  const [rangeTo, setRangeTo] = useState(yesterday())
  const [axes, setAxes] = useState<Axis[]>([])
  const [axisId, setAxisId] = useState('')
  const [allIndicators, setAllIndicators] = useState<Indicator[]>([])
  const [statuses, setStatuses] = useState<IndicatorStatus[]>([])
  const [causesMap, setCausesMap] = useState<Map<string, IndicatorCause[]>>(new Map())
  const [tagsMap, setTagsMap] = useState<Map<string, IndicatorCauseTag[]>>(new Map())
  const [actionPlans, setActionPlans] = useState<AxisActionPlan[]>([])
  const [analysisSpeedDays, setAnalysisSpeedDays] = useState<number[]>([])
  const [measurements, setMeasurements] = useState<{ indicator_id: string; period_date: string; value: number }[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false

    async function loadExposure() {
      setExposureLoading(true)
      try {
        const schedule = await fetchExposureSchedule(organizationId!)
        if (!cancelled) setExposureSchedule(schedule)
      } catch {
        // La periodicidad es informativa — si falla, el resto del Dashboard sigue funcionando.
      } finally {
        if (!cancelled) setExposureLoading(false)
      }
    }

    loadExposure()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    fetchActiveAxes(organizationId)
      .then((axesData) => {
        if (cancelled) return
        setAxes(axesData)
        if (axesData.length && !axisId) setAxisId(axesData[0].id)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  useEffect(() => {
    if (!organizationId || !axisId) return
    let cancelled = false
    const range = { from: rangeFrom, to: rangeTo }

    async function load() {
      setLoading(true)
      try {
        const indicatorsData = await fetchIndicatorsByAxis(organizationId!, axisId)
        if (cancelled) return
        const indicatorIds = indicatorsData.map((i) => i.id)

        const [statusesData, causesData, tagsData, actionPlansData, speedData, measurementsData] = await Promise.all([
          fetchIndicatorStatusesInRange(organizationId!, range),
          fetchIndicatorCausesForMany(indicatorIds),
          fetchIndicatorCauseTagsForMany(indicatorIds, range),
          fetchAxisActionPlans(indicatorIds, range),
          fetchAnalysisSpeedDays(indicatorIds, range),
          fetchMeasurementsInRange(indicatorIds, range.from, range.to),
        ])
        if (cancelled) return

        setAllIndicators(indicatorsData)
        setStatuses(statusesData)
        setCausesMap(causesData)
        setTagsMap(tagsData)
        setActionPlans(actionPlansData)
        setAnalysisSpeedDays(speedData)
        setMeasurements(measurementsData)
        setLoadError(null)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, axisId, rangeFrom, rangeTo])

  const statusByIndicator = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const indicatorById = useMemo(() => new Map(allIndicators.map((i) => [i.id, i])), [allIndicators])

  const trendByIndicator = useMemo(() => {
    const map = new Map<string, { period_date: string; value: number }[]>()
    for (const m of measurements) {
      const list = map.get(m.indicator_id) ?? []
      list.push({ period_date: m.period_date, value: m.value })
      map.set(m.indicator_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.period_date.localeCompare(b.period_date))
    return map
  }, [measurements])

  // Serie densa (un punto por día del rango, incluidos los días sin
  // registro) solo para la mini-tendencia de las tarjetas — a diferencia de
  // trendByIndicator (arriba), que debe seguir siendo solo mediciones
  // reales para que noRecurrenceRate detecte correctamente "sin datos
  // después del cierre".
  const sparklineByIndicator = useMemo(() => {
    const from = new Date(`${rangeFrom}T00:00:00`)
    const to = new Date(`${rangeTo}T00:00:00`)
    const buckets = buildPeriodBucketsInRange('dia', from, to)
    const map = new Map<string, { period_date: string; value: number | null }[]>()
    for (const indicator of allIndicators) {
      const indMeas = trendByIndicator.get(indicator.id) ?? []
      map.set(
        indicator.id,
        buckets.map((b) => ({
          period_date: b.startDate,
          value: aggregateValues(
            indMeas.filter((m) => m.period_date >= b.startDate && m.period_date <= b.endDate),
            indicator.aggregation_method,
          ),
        })),
      )
    }
    return map
  }, [allIndicators, trendByIndicator, rangeFrom, rangeTo])

  // Ids de las TOP_CAUSES causas más pesadas por indicador — para marcar en
  // la lista de acciones cuáles sí apuntan a lo que realmente pesa.
  const topCauseIdsByIndicator = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const indicator of allIndicators) {
      const { rows } = computeIndicatorCauseParetoForParent(
        causesMap.get(indicator.id) ?? [],
        tagsMap.get(indicator.id) ?? [],
        null,
      )
      map.set(indicator.id, new Set(rows.slice(0, TOP_CAUSES).map((r) => r.cause.id)))
    }
    return map
  }, [allIndicators, causesMap, tagsMap])

  const actionCauseIdByAnalysis = useMemo(() => {
    const map = new Map<string, string>()
    for (const tags of tagsMap.values()) {
      for (const tag of tags) map.set(tag.causal_analysis_id, tag.indicator_cause_id)
    }
    return map
  }, [tagsMap])

  const linkedRate = actionPlans.length
    ? Math.round((actionPlans.filter((p) => p.causal_analysis_id).length / actionPlans.length) * 100)
    : null

  const avgAnalysisDays = analysisSpeedDays.length
    ? Math.round((analysisSpeedDays.reduce((sum, d) => sum + d, 0) / analysisSpeedDays.length) * 10) / 10
    : null

  const noRecurrenceRate = useMemo(() => {
    const closed = actionPlans.filter((p) => p.status === 'cerrado' && p.closed_at)
    if (closed.length === 0) return null
    let withoutRecurrence = 0
    let evaluable = 0
    for (const plan of closed) {
      const indicator = indicatorById.get(plan.indicator_id)
      const status = statusByIndicator.get(plan.indicator_id)
      const trend = trendByIndicator.get(plan.indicator_id) ?? []
      if (!indicator || !status) continue
      const after = trend.filter((m) => m.period_date > plan.closed_at!.slice(0, 10))
      if (after.length === 0) continue
      evaluable++
      const recurred = after.some(
        (m) => calcularSemaforo(m.value, status.target_value, indicator.improvement_direction) === 'incumple',
      )
      if (!recurred) withoutRecurrence++
    }
    return evaluable ? Math.round((withoutRecurrence / evaluable) * 100) : null
  }, [actionPlans, indicatorById, statusByIndicator, trendByIndicator])

  const currentAxis = axes.find((a) => a.id === axisId)

  return (
    <div className="gdash-page">
      <h1>Dashboard</h1>
      <p className="page-subtitle">
        Lectura estructurada por pilar: cómo van los indicadores, cuáles causas pesan más, y si las acciones
        realmente están atacando esas causas.
      </p>

      {organizationId && profile && (
        <ExposureSection
          organizationId={organizationId}
          createdBy={profile.id}
          canEdit={canEditExposure}
          schedule={exposureSchedule}
          loading={exposureLoading}
          onSaved={setExposureSchedule}
        />
      )}

      <div className="gdash-filters-row">
        {axes.length > 0 && (
          <label className="gdash-axis-select">
            Pilar
            <select value={axisId} onChange={(e) => setAxisId(e.target.value)}>
              {axes.map((axis) => (
                <option key={axis.id} value={axis.id}>
                  {axis.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <RangePicker from={rangeFrom} to={rangeTo} onChange={(from, to) => { setRangeFrom(from); setRangeTo(to) }} />
      </div>

      {loadError && <p className="gdash-error">No se pudo cargar el dashboard: {loadError}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <section className="gdash-section">
            <h2 style={{ color: currentAxis?.color }}>Indicadores {currentAxis && `— ${currentAxis.name}`}</h2>
            {allIndicators.length === 0 ? (
              <p>Este pilar no tiene indicadores activos todavía.</p>
            ) : (
              <div className="gdash-kpi-grid">
                {allIndicators.map((indicator) => (
                  <KpiTile
                    key={indicator.id}
                    indicator={indicator}
                    status={statusByIndicator.get(indicator.id)}
                    trend={sparklineByIndicator.get(indicator.id) ?? []}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="gdash-section">
            <h2>Causas más relevantes por indicador</h2>
            <p className="page-subtitle">
              Del {rangeFrom} al {rangeTo} — ordenadas por peso acumulado (no solo por cuántas veces se repitieron)
              — registra el valor de cada causa en "Causas posibles" para que este ranking sea preciso.
            </p>
            {allIndicators.length === 0 ? (
              <p>—</p>
            ) : (
              <div className="gdash-pareto-grid">
                {allIndicators.map((indicator) => (
                  <MiniParetoCard
                    key={indicator.id}
                    indicator={indicator}
                    causes={causesMap.get(indicator.id) ?? []}
                    tags={tagsMap.get(indicator.id) ?? []}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="gdash-section">
            <h2>Acciones</h2>
            <p className="page-subtitle">Del {rangeFrom} al {rangeTo}</p>
            <div className="gdash-actions-summary">
              <div className={`gdash-stat ${linkedRate !== null && linkedRate >= 60 ? 'gdash-stat--ok' : ''}`}>
                <span className="gdash-stat__value">{linkedRate !== null ? `${linkedRate}%` : '—'}</span>
                <span className="gdash-stat__label">Acciones vinculadas al análisis</span>
                <span className="gdash-stat__target">Meta: &gt; 60%</span>
              </div>
              <div className={`gdash-stat ${avgAnalysisDays !== null && avgAnalysisDays <= 5 ? 'gdash-stat--ok' : ''}`}>
                <span className="gdash-stat__value">{avgAnalysisDays !== null ? `${avgAnalysisDays}` : '—'}</span>
                <span className="gdash-stat__label">Días promedio hasta el análisis</span>
                <span className="gdash-stat__target">Meta: &lt; 5 días</span>
              </div>
              <div
                className={`gdash-stat ${noRecurrenceRate !== null && noRecurrenceRate >= 80 ? 'gdash-stat--ok' : ''}`}
              >
                <span className="gdash-stat__value">{noRecurrenceRate !== null ? `${noRecurrenceRate}%` : '—'}</span>
                <span className="gdash-stat__label">Acciones cerradas sin reincidencia</span>
                <span className="gdash-stat__target">El problema no vuelve</span>
              </div>
            </div>

            {actionPlans.length === 0 ? (
              <p>Todavía no hay planes de acción registrados para los indicadores de este pilar.</p>
            ) : (
              <div className="gdash-actions-list">
                {actionPlans.map((plan) => {
                  const causeId = plan.causal_analysis_id
                    ? actionCauseIdByAnalysis.get(plan.causal_analysis_id)
                    : undefined
                  const isTopCause = causeId ? (topCauseIdsByIndicator.get(plan.indicator_id)?.has(causeId) ?? false) : false
                  return (
                    <ActionRow
                      key={plan.id}
                      plan={plan}
                      indicatorName={indicatorById.get(plan.indicator_id)?.name ?? '—'}
                      isTopCause={isTopCause}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
