import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { IndicatorCard } from '../../components/ui/IndicatorCard'
import { Semaforo } from '../../components/ui/Semaforo'
import { RangePicker } from '../../components/ui/RangePicker'
import { calcularSemaforo, SEMAFORO_COLOR } from '../../lib/semaforo'
import { aggregateValues, buildPeriodBucketsInRange } from '../../lib/periods'
import { daysAgo, yesterday, DEFAULT_RANGE_DAYS } from '../../lib/dateRange'
import { formatIndicatorValue, type Axis, type Indicator, type Site } from '../../lib/types'
import {
  fetchActiveAxes,
  fetchCurrentTargetsForIndicators,
  fetchIndicatorsByAxis,
  fetchIndicatorStatusesInRange,
  fetchMeasurementsInRange,
  type IndicatorStatus,
} from './dashboardApi'
import { fetchSites } from '../indicators/indicatorsApi'
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
import { PageHeader } from '../../components/ui/PageHeader'
import './general-dashboard.css'

const CAN_EDIT_EXPOSURE_ROLES = ['admin_consultora', 'admin_cliente', 'gerente']

const TOP_CAUSES = 3

interface PillarDailyPoint {
  date: string
  label: string
  pct: number | null
  cumplidos: number
  total: number
}

function pillarPctColor(pct: number | null): string {
  if (pct === null) return 'var(--color-border)'
  if (pct >= 80) return 'var(--color-ok)'
  if (pct >= 50) return 'var(--color-risk)'
  return 'var(--color-fail)'
}

/**
 * Resultado del pilar día por día: de los indicadores que reportaron ese
 * día, qué % cumplió su objetivo — un solo número que resume el pilar
 * completo, sin importar cuántos indicadores tenga ni su frecuencia
 * individual (un indicador semanal solo aporta al día en que se capturó).
 */
function computePillarDailyResult(
  indicators: Indicator[],
  measurements: { indicator_id: string; period_date: string; value: number }[],
  statusByIndicator: Map<string, IndicatorStatus>,
  rangeFrom: string,
  rangeTo: string,
): PillarDailyPoint[] {
  const indicatorById = new Map(indicators.map((i) => [i.id, i]))
  const byDate = new Map<string, { indicator_id: string; value: number }[]>()
  for (const m of measurements) {
    if (!indicatorById.has(m.indicator_id)) continue
    const list = byDate.get(m.period_date) ?? []
    list.push(m)
    byDate.set(m.period_date, list)
  }

  const from = new Date(`${rangeFrom}T00:00:00`)
  const to = new Date(`${rangeTo}T00:00:00`)
  const buckets = buildPeriodBucketsInRange('dia', from, to)

  return buckets.map((bucket) => {
    const dayMeasurements = byDate.get(bucket.startDate) ?? []
    let cumplidos = 0
    let total = 0
    for (const m of dayMeasurements) {
      const indicator = indicatorById.get(m.indicator_id)
      const status = statusByIndicator.get(m.indicator_id)
      if (!indicator || !status) continue
      const estado = calcularSemaforo(m.value, status.target_value, indicator.improvement_direction)
      if (estado === 'sin_datos') continue
      total++
      if (estado === 'cumple') cumplidos++
    }
    return {
      date: bucket.startDate,
      label: bucket.label,
      cumplidos,
      total,
      pct: total > 0 ? Math.round((cumplidos / total) * 100) : null,
    }
  })
}

export interface PeriodCompliance {
  cumplidos: number
  total: number
  pct: number | null
}

/** Desplaza un rango de fechas N meses y/o N años (para comparar contra el
 * mismo rango del mes o del año anterior). */
export function shiftRange(
  range: { from: string; to: string },
  monthsDelta: number,
  yearsDelta: number,
): { from: string; to: string } {
  function shift(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    d.setFullYear(d.getFullYear() + yearsDelta)
    d.setMonth(d.getMonth() + monthsDelta)
    return d.toISOString().slice(0, 10)
  }
  return { from: shift(range.from), to: shift(range.to) }
}

/** % de cumplimiento agregado de un conjunto de indicadores en un rango
 * cualquiera — misma lógica que computePillarDailyResult pero sin
 * desglosar por día, para comparar el resultado total de un período contra
 * otro (mes anterior, año anterior). */
export async function fetchPeriodCompliance(
  indicatorIds: string[],
  indicatorById: Map<string, Indicator>,
  range: { from: string; to: string },
): Promise<PeriodCompliance> {
  if (indicatorIds.length === 0) return { cumplidos: 0, total: 0, pct: null }
  const to = new Date(`${range.to}T00:00:00`)
  const [measRows, targetMap] = await Promise.all([
    fetchMeasurementsInRange(indicatorIds, range.from, range.to),
    fetchCurrentTargetsForIndicators(indicatorIds, to.getFullYear(), to.getMonth() + 1),
  ])
  let cumplidos = 0
  let total = 0
  for (const m of measRows) {
    const indicator = indicatorById.get(m.indicator_id)
    if (!indicator) continue
    const estado = calcularSemaforo(m.value, targetMap.get(m.indicator_id) ?? null, indicator.improvement_direction)
    if (estado === 'sin_datos') continue
    total++
    if (estado === 'cumple') cumplidos++
  }
  return { cumplidos, total, pct: total > 0 ? Math.round((cumplidos / total) * 100) : null }
}

const STATUS_PILL: Record<'ok' | 'risk' | 'fail', { label: string; className: string }> = {
  ok: { label: '✓ En camino', className: 'gdash-status-pill--ok' },
  risk: { label: '⚠ En riesgo', className: 'gdash-status-pill--risk' },
  fail: { label: '✗ Fuera de objetivo', className: 'gdash-status-pill--fail' },
}

function statusTier(pct: number | null): 'ok' | 'risk' | 'fail' {
  if (pct === null) return 'fail'
  if (pct >= 80) return 'ok'
  if (pct >= 50) return 'risk'
  return 'fail'
}

interface ComparisonBoxProps {
  label: string
  current: PeriodCompliance
  previous: PeriodCompliance
}

/** Compara el % del período actual contra otro período (mes/año anterior):
 * flecha + diferencia en puntos porcentuales, y debajo el valor real de ese
 * período anterior para dar contexto (no solo la diferencia). */
function ComparisonBox({ label, current, previous }: ComparisonBoxProps) {
  if (current.pct === null || previous.pct === null) {
    return (
      <div className="gdash-compare-box">
        <span className="gdash-compare-box__label">{label}</span>
        <span className="gdash-compare-box__value gdash-compare-box__value--muted">Sin datos suficientes</span>
      </div>
    )
  }
  const delta = current.pct - previous.pct
  const up = delta >= 0
  return (
    <div className="gdash-compare-box">
      <span className="gdash-compare-box__label">{label}</span>
      <span className={`gdash-compare-box__value ${up ? 'gdash-compare-box__value--up' : 'gdash-compare-box__value--down'}`}>
        {up ? '▲' : '▼'} {Math.abs(delta)} pp
      </span>
      <span className="gdash-compare-box__sub">
        {previous.pct}% ({previous.cumplidos}/{previous.total}) en ese período
      </span>
    </div>
  )
}

interface PillarResultSectionProps {
  axisName: string | undefined
  rangeFrom: string
  rangeTo: string
  dailyData: PillarDailyPoint[]
  current: PeriodCompliance
  prevMonth: PeriodCompliance
  prevYear: PeriodCompliance
}

/**
 * Tarjeta de resultado del pilar: valor agregado del período en grande +
 * estado, comparación contra el mes y el año anterior, y abajo las barras
 * con el valor diario — mismo espíritu que un tablero de KPI financiero
 * (resultado, comparativas, tendencia), aplicado al % de cumplimiento.
 */
function PillarResultSection({ axisName, rangeFrom, rangeTo, dailyData, current, prevMonth, prevYear }: PillarResultSectionProps) {
  const tier = statusTier(current.pct)
  const hasDaily = dailyData.some((d) => d.pct !== null)

  return (
    <section className="gdash-section gdash-pillar-result">
      <div className="gdash-pillar-result__header">
        <div>
          <h2>Resultado global del pilar {axisName && `— ${axisName}`}</h2>
          <p className="gdash-pillar-result__period">
            {rangeFrom} · {rangeTo}
          </p>
        </div>
        {current.pct !== null && (
          <span className={`gdash-status-pill ${STATUS_PILL[tier].className}`}>{STATUS_PILL[tier].label}</span>
        )}
      </div>

      {current.pct === null ? (
        <p>Sin mediciones en este rango todavía.</p>
      ) : (
        <>
          <div className="gdash-pillar-result__value">
            {current.pct}%
            <span className="gdash-pillar-result__value-sub">
              {current.cumplidos}/{current.total} mediciones cumplen en el período
            </span>
          </div>

          <div className="gdash-pillar-result__compare">
            <ComparisonBox label="vs. mes anterior" current={current} previous={prevMonth} />
            <ComparisonBox label="vs. año anterior" current={current} previous={prevYear} />
          </div>

          {hasDaily && (
            <div className="gdash-pillar-result__chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Cumplimiento']} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {dailyData.map((p) => (
                      <Cell key={p.date} fill={pillarPctColor(p.pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  )
}

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
        isFocus={indicator.is_focus}
      />
    )
  }

  if (indicator.value_type === 'razon') {
    const pct = latestValue !== null ? Math.max(0, Math.min(100, latestValue)) : 0
    return (
      <Link
        to={`/tablero/${indicator.id}`}
        className={`gdash-card gdash-card--bar${indicator.is_focus ? ' kpi-focus' : ''}`}
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
      className={`gdash-card gdash-card--bar${indicator.is_focus ? ' kpi-focus' : ''}`}
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
  const { organizationId, profile, siteIds } = useAuth()
  const canEditExposure = !!profile && CAN_EDIT_EXPOSURE_ROLES.includes(profile.role)
  const [exposureSchedule, setExposureSchedule] = useState<ExposureSchedule | null>(null)
  const [exposureLoading, setExposureLoading] = useState(true)
  const [rangeFrom, setRangeFrom] = useState(daysAgo(DEFAULT_RANGE_DAYS))
  const [rangeTo, setRangeTo] = useState(yesterday())
  const [axes, setAxes] = useState<Axis[]>([])
  const [axisId, setAxisId] = useState('')
  const [sites, setSites] = useState<Site[]>([])
  // null = todavía no lo tocó el usuario; en ese caso se usa el primer sitio asignado por defecto.
  const [siteOverride, setSiteOverride] = useState<string | null>(null)
  const [siteTouched, setSiteTouched] = useState(false)
  const selectedSite = siteTouched ? siteOverride : (siteIds[0] ?? null)
  const [allIndicators, setAllIndicators] = useState<Indicator[]>([])
  const [statuses, setStatuses] = useState<IndicatorStatus[]>([])
  const [causesMap, setCausesMap] = useState<Map<string, IndicatorCause[]>>(new Map())
  const [tagsMap, setTagsMap] = useState<Map<string, IndicatorCauseTag[]>>(new Map())
  const [actionPlans, setActionPlans] = useState<AxisActionPlan[]>([])
  const [analysisSpeedDays, setAnalysisSpeedDays] = useState<number[]>([])
  const [measurements, setMeasurements] = useState<{ indicator_id: string; period_date: string; value: number }[]>(
    [],
  )
  const [currentCompliance, setCurrentCompliance] = useState<PeriodCompliance>({ cumplidos: 0, total: 0, pct: null })
  const [prevMonthCompliance, setPrevMonthCompliance] = useState<PeriodCompliance>({
    cumplidos: 0,
    total: 0,
    pct: null,
  })
  const [prevYearCompliance, setPrevYearCompliance] = useState<PeriodCompliance>({ cumplidos: 0, total: 0, pct: null })
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
    Promise.all([fetchActiveAxes(organizationId), fetchSites(organizationId)])
      .then(([axesData, sitesData]) => {
        if (cancelled) return
        setAxes(axesData)
        setSites(sitesData)
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
        const indicatorsData = await fetchIndicatorsByAxis(organizationId!, axisId, selectedSite)
        if (cancelled) return
        const indicatorIds = indicatorsData.map((i) => i.id)
        const indicatorByIdLocal = new Map(indicatorsData.map((i) => [i.id, i]))

        const [
          statusesData,
          causesData,
          tagsData,
          actionPlansData,
          speedData,
          measurementsData,
          prevMonthData,
          prevYearData,
        ] = await Promise.all([
          fetchIndicatorStatusesInRange(organizationId!, range),
          fetchIndicatorCausesForMany(indicatorIds),
          fetchIndicatorCauseTagsForMany(indicatorIds, range),
          fetchAxisActionPlans(indicatorIds, range),
          fetchAnalysisSpeedDays(indicatorIds, range),
          fetchMeasurementsInRange(indicatorIds, range.from, range.to),
          fetchPeriodCompliance(indicatorIds, indicatorByIdLocal, shiftRange(range, -1, 0)),
          fetchPeriodCompliance(indicatorIds, indicatorByIdLocal, shiftRange(range, 0, -1)),
        ])
        if (cancelled) return

        // Reusa las mediciones y objetivos ya traídos para el resultado
        // agregado del período actual — misma metodología que
        // fetchPeriodCompliance (mes/año anterior), sin pedirlos de nuevo.
        const targetMapCurrent = new Map(statusesData.map((s) => [s.id, s.target_value]))
        let curCumplidos = 0
        let curTotal = 0
        for (const m of measurementsData) {
          const indicator = indicatorByIdLocal.get(m.indicator_id)
          if (!indicator) continue
          const estado = calcularSemaforo(m.value, targetMapCurrent.get(m.indicator_id) ?? null, indicator.improvement_direction)
          if (estado === 'sin_datos') continue
          curTotal++
          if (estado === 'cumple') curCumplidos++
        }

        setAllIndicators(indicatorsData)
        setStatuses(statusesData)
        setCausesMap(causesData)
        setTagsMap(tagsData)
        setActionPlans(actionPlansData)
        setAnalysisSpeedDays(speedData)
        setMeasurements(measurementsData)
        setCurrentCompliance({
          cumplidos: curCumplidos,
          total: curTotal,
          pct: curTotal > 0 ? Math.round((curCumplidos / curTotal) * 100) : null,
        })
        setPrevMonthCompliance(prevMonthData)
        setPrevYearCompliance(prevYearData)
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
  }, [organizationId, axisId, selectedSite, rangeFrom, rangeTo])

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

  function goToAxis(delta: number) {
    if (axes.length === 0) return
    const currentIndex = axes.findIndex((a) => a.id === axisId)
    const nextIndex = (currentIndex + delta + axes.length) % axes.length
    setAxisId(axes[nextIndex].id)
  }

  const pillarDailyResult = useMemo(
    () => computePillarDailyResult(allIndicators, measurements, statusByIndicator, rangeFrom, rangeTo),
    [allIndicators, measurements, statusByIndicator, rangeFrom, rangeTo],
  )

  return (
    <div className="gdash-page">
      <PageHeader
        eyebrow="Gestión · Reporte por pilar"
        title="Dashboard"
        subtitle="Lectura estructurada por pilar: cómo van los indicadores, cuáles causas pesan más, y si las acciones realmente están atacando esas causas."
      />

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

      {axes.length > 0 && (
        <div className="gdash-pillar-nav">
          <button
            type="button"
            className="gdash-pillar-nav__btn"
            onClick={() => goToAxis(-1)}
            disabled={axes.length < 2}
          >
            ‹ Pilar anterior
          </button>
          <span className="gdash-pillar-nav__current" style={{ color: currentAxis?.color }}>
            {currentAxis?.name}
          </span>
          <button
            type="button"
            className="gdash-pillar-nav__btn"
            onClick={() => goToAxis(1)}
            disabled={axes.length < 2}
          >
            Pilar siguiente ›
          </button>
        </div>
      )}

      <div className="gdash-filters-row">
        <RangePicker from={rangeFrom} to={rangeTo} onChange={(from, to) => { setRangeFrom(from); setRangeTo(to) }} />

        {sites.length > 0 && (
          <select
            className="gdash-site-select"
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

      {loadError && <p className="gdash-error">No se pudo cargar el dashboard: {loadError}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <PillarResultSection
            axisName={currentAxis?.name}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            dailyData={pillarDailyResult}
            current={currentCompliance}
            prevMonth={prevMonthCompliance}
            prevYear={prevYearCompliance}
          />

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
