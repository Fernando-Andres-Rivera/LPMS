import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { IndicatorCard } from '../../components/ui/IndicatorCard'
import { PeriodTypeSelector } from '../../components/ui/PeriodTypeSelector'
import { RangePicker } from '../../components/ui/RangePicker'
import { calcularSemaforo } from '../../lib/semaforo'
import { aggregateValues, buildPeriodBucketsInRange } from '../../lib/periods'
import { defaultRange } from '../../lib/dateRange'
import {
  fetchAxisById,
  fetchCurrentTargetsForIndicators,
  fetchIndicatorsByAxis,
  fetchMeasurementsInRange,
} from './dashboardApi'
import { fetchLatestRootCauses } from '../causal-analysis/causalAnalysisApi'
import { fetchActionPlanCounts } from '../action-plans/actionPlansApi'
import type { Axis, Indicator, PeriodType, SemaforoEstado } from '../../lib/types'
import './dashboard.css'

type Diagnostico = 'cumple' | 'sin_datos' | 'sin_causa' | 'falta_gestion' | 'falta_eficacia'

interface IndicatorRow {
  indicator: Indicator
  latestValue: number | null
  targetValue: number | null
  trend: { period_date: string; value: number }[]
  estado: SemaforoEstado
  rootCause: string | null
  actionPlanCount: number
}

/**
 * Diagnóstico rápido de gestión: si ya sabemos la causa raíz de un
 * indicador que no cumple, la pregunta siguiente es si el problema es que
 * nadie ha actuado (0 planes de acción) o que ya se actuó y no funcionó
 * (hay planes generados y el indicador sigue sin cumplir).
 */
function diagnosticar(estado: SemaforoEstado, rootCause: string | null, actionPlanCount: number): Diagnostico {
  if (estado === 'cumple') return 'cumple'
  if (estado === 'sin_datos') return 'sin_datos'
  if (!rootCause) return 'sin_causa'
  return actionPlanCount === 0 ? 'falta_gestion' : 'falta_eficacia'
}

const DIAGNOSTICO_LABEL: Record<Exclude<Diagnostico, 'cumple'>, string> = {
  sin_datos: 'Sin mediciones capturadas todavía',
  sin_causa: 'Sin análisis de causa registrado',
  falta_gestion: 'Falta de gestión',
  falta_eficacia: 'Falta de eficacia',
}

export function AxisDashboardPage() {
  const { axisId } = useParams<{ axisId: string }>()
  const { organizationId } = useAuth()
  const [axis, setAxis] = useState<Axis | null>(null)
  const [periodType, setPeriodType] = useState<PeriodType>('dia')
  const [range, setRange] = useState(defaultRange())
  const [rows, setRows] = useState<IndicatorRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId || !axisId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const [axisData, indicators] = await Promise.all([
        fetchAxisById(axisId!),
        fetchIndicatorsByAxis(orgId, axisId!),
      ])
      if (cancelled) return
      setAxis(axisData)

      const from = new Date(`${range.from}T00:00:00`)
      const to = new Date(`${range.to}T00:00:00`)
      const buckets = buildPeriodBucketsInRange(periodType, from, to)
      const ids = indicators.map((i) => i.id)

      // 4 consultas en total (mediciones del rango, objetivos, causas, conteo de
      // planes) sin importar cuántos indicadores haya — antes eran ~5 por indicador.
      const [measRows, targetMap, causeMap, planCountMap] = await Promise.all([
        fetchMeasurementsInRange(ids, range.from, range.to),
        fetchCurrentTargetsForIndicators(ids, to.getFullYear(), to.getMonth() + 1),
        fetchLatestRootCauses(ids),
        fetchActionPlanCounts(ids),
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
        const latestValue = withData.length ? (withData[withData.length - 1].value as number) : null
        const targetValue = targetMap.get(indicator.id) ?? null
        return {
          indicator,
          latestValue,
          targetValue,
          trend: withData.map((p) => ({ period_date: p.label, value: p.value as number })),
          estado: calcularSemaforo(latestValue, targetValue, indicator.improvement_direction),
          rootCause: causeMap.get(indicator.id) ?? null,
          actionPlanCount: planCountMap.get(indicator.id) ?? 0,
        }
      })
      if (!cancelled) setRows(rowsData)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, axisId, periodType, range])

  if (loading) return <p>Cargando indicadores…</p>

  return (
    <div>
      <h1 style={{ color: axis?.color }}>{axis?.name}</h1>
      <p className="page-subtitle">
        Indicadores del eje frente a su objetivo — y, para los que no cumplen, la causa identificada y si el
        problema es falta de gestión o falta de eficacia de las acciones ya tomadas.
      </p>

      <div className="period-row">
        <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <PeriodTypeSelector value={periodType} onChange={setPeriodType} />
      </div>

      {rows.length === 0 && <p>Este eje no tiene indicadores activos todavía.</p>}

      <div className="indicators-grid">
        {rows.map(({ indicator, latestValue, targetValue, trend, estado, rootCause, actionPlanCount }) => {
          const diagnostico = diagnosticar(estado, rootCause, actionPlanCount)
          return (
            <div key={indicator.id} className="indicator-cell">
              <IndicatorCard
                id={indicator.id}
                name={indicator.name}
                unit={indicator.unit}
                level={indicator.level}
                improvementDirection={indicator.improvement_direction}
                valueType={indicator.value_type}
                latestValue={latestValue}
                targetValue={targetValue}
                trend={trend}
              />

              {diagnostico !== 'cumple' && (
                <div className={`indicator-diagnostic indicator-diagnostic--${diagnostico}`}>
                  <span className="indicator-diagnostic__label">{DIAGNOSTICO_LABEL[diagnostico]}</span>

                  {(diagnostico === 'falta_gestion' || diagnostico === 'falta_eficacia') && (
                    <p className="indicator-diagnostic__cause">Causa: {rootCause}</p>
                  )}
                  {diagnostico === 'falta_eficacia' && (
                    <p className="indicator-diagnostic__meta">
                      {actionPlanCount} plan{actionPlanCount === 1 ? '' : 'es'} de acción generado
                      {actionPlanCount === 1 ? '' : 's'} — el indicador sigue sin cumplir.
                    </p>
                  )}

                  <Link
                    to={diagnostico === 'sin_causa' ? `/analisis-causal/${indicator.id}` : `/tablero/${indicator.id}`}
                    className="indicator-diagnostic__link"
                  >
                    {diagnostico === 'sin_causa' ? 'Registrar análisis de causa →' : 'Ver tablero y planes de acción →'}
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
