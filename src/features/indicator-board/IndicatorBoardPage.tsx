import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { Semaforo } from '../../components/ui/Semaforo'
import { ActionPlanProgress } from '../../components/ui/ActionPlanProgress'
import { ParetoAxisTick } from '../../components/ui/ParetoAxisTick'
import { PeriodTypeSelector } from '../../components/ui/PeriodTypeSelector'
import { RangePicker } from '../../components/ui/RangePicker'
import { TrendSparkline } from '../../components/ui/TrendSparkline'
import { calcularSemaforo, SEMAFORO_COLOR } from '../../lib/semaforo'
import { buildPeriodBucketsInRange, type PeriodBucket } from '../../lib/periods'
import { defaultRange } from '../../lib/dateRange'
import { fetchIndicatorWithRelationsById, fetchProfiles } from '../indicators/indicatorsApi'
import type { IndicatorWithRelations } from '../indicators/indicatorsApi'
import {
  computeIndicatorSeries,
  fetchCurrentTarget,
  fetchIndicatorPeriodSeries,
  type PeriodResult,
} from '../dashboard/dashboardApi'
import { fetchCascadeData } from '../cascade/cascadeApi'
import { fetchCausalAnalyses, type CausalAnalysisWithAuthor } from '../causal-analysis/causalAnalysisApi'
import {
  advanceActionPlanStatus,
  createActionPlan,
  fetchActionPlansForIndicator,
  type ActionPlanWithNames,
} from '../action-plans/actionPlansApi'
import { ACTION_PLAN_STEPS, AGGREGATION_METHOD_LABEL, formatIndicatorValue } from '../../lib/types'
import type { PdcaStatus, PeriodType, Profile, Target } from '../../lib/types'
import './indicator-board.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Dos series a la vez para un indicador manual (measurements propios) o
 * calculado (rollup recursivo de sus indicadores hijo): la del RANGO
 * completo (un solo bucket [from, to], para el número de Resultado — así
 * "suma" realmente suma todo el rango, no solo el último período) y la
 * bucketeada por periodType (para la mini-tendencia). Comparten una sola
 * consulta del árbol de la organización cuando el indicador es calculado,
 * en vez de pagar ese costo dos veces.
 */
async function fetchRangeAndTrend(
  indicator: IndicatorWithRelations,
  rangeBucket: PeriodBucket[],
  trendBuckets: PeriodBucket[],
  organizationId: string,
): Promise<{ rangeSeries: PeriodResult[]; trendSeries: PeriodResult[] }> {
  if (!indicator.is_calculated) {
    const [rangeSeries, trendSeries] = await Promise.all([
      fetchIndicatorPeriodSeries(indicator.id, rangeBucket, indicator.aggregation_method),
      fetchIndicatorPeriodSeries(indicator.id, trendBuckets, indicator.aggregation_method),
    ])
    return { rangeSeries, trendSeries }
  }
  const { indicators, links } = await fetchCascadeData(organizationId)
  const [rangeSeries, trendSeries] = await Promise.all([
    computeIndicatorSeries(indicator, indicators, links, rangeBucket),
    computeIndicatorSeries(indicator, indicators, links, trendBuckets),
  ])
  return { rangeSeries, trendSeries }
}

export function IndicatorBoardPage() {
  const { indicatorId } = useParams<{ indicatorId: string }>()
  const { profile, organizationId } = useAuth()

  const [indicator, setIndicator] = useState<IndicatorWithRelations | null>(null)
  const [periodType, setPeriodType] = useState<PeriodType>('dia')
  const [range, setRange] = useState(defaultRange())
  const [latestValue, setLatestValue] = useState<number | null>(null)
  const [trend, setTrend] = useState<{ date: string; value: number | null }[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [causes, setCauses] = useState<CausalAnalysisWithAuthor[]>([])
  const [plans, setPlans] = useState<ActionPlanWithNames[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [eventDate, setEventDate] = useState(today())
  const [dueDate, setDueDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    if (!indicatorId || !organizationId) return
    setLoading(true)
    const indicatorData = await fetchIndicatorWithRelationsById(indicatorId)
    const from = new Date(`${range.from}T00:00:00`)
    const to = new Date(`${range.to}T00:00:00`)
    const rangeBucket: PeriodBucket[] = [{ label: 'rango', startDate: range.from, endDate: range.to }]
    const trendBuckets = buildPeriodBucketsInRange(periodType, from, to)
    const [{ rangeSeries, trendSeries }, causesData, plansData, profilesData] = await Promise.all([
      indicatorData
        ? fetchRangeAndTrend(indicatorData, rangeBucket, trendBuckets, organizationId)
        : Promise.resolve({ rangeSeries: [], trendSeries: [] }),
      fetchCausalAnalyses(indicatorId),
      fetchActionPlansForIndicator(indicatorId),
      fetchProfiles(organizationId),
    ])
    setIndicator(indicatorData)
    setLatestValue(rangeSeries[0]?.value ?? null)
    setTrend(trendSeries.map((p) => ({ date: p.date, value: p.value })))
    setCauses(causesData)
    setPlans(plansData)
    setProfiles(profilesData)

    if (indicatorData) {
      setTarget(await fetchCurrentTarget(indicatorId, to.getFullYear(), to.getMonth() + 1))
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!indicatorId || !organizationId) return
    let cancelled = false

    fetchIndicatorWithRelationsById(indicatorId).then(async (indicatorData) => {
      if (cancelled) return
      const from = new Date(`${range.from}T00:00:00`)
      const to = new Date(`${range.to}T00:00:00`)
      const rangeBucket: PeriodBucket[] = [{ label: 'rango', startDate: range.from, endDate: range.to }]
      const trendBuckets = buildPeriodBucketsInRange(periodType, from, to)
      const [{ rangeSeries, trendSeries }, causesData, plansData, profilesData] = await Promise.all([
        indicatorData
          ? fetchRangeAndTrend(indicatorData, rangeBucket, trendBuckets, organizationId)
          : Promise.resolve({ rangeSeries: [], trendSeries: [] }),
        fetchCausalAnalyses(indicatorId),
        fetchActionPlansForIndicator(indicatorId),
        fetchProfiles(organizationId),
      ])
      if (cancelled) return
      setIndicator(indicatorData)
      setLatestValue(rangeSeries[0]?.value ?? null)
      setTrend(trendSeries.map((p) => ({ date: p.date, value: p.value })))
      setCauses(causesData)
      setPlans(plansData)
      setProfiles(profilesData)

      if (indicatorData) {
        const targetData = await fetchCurrentTarget(indicatorId, to.getFullYear(), to.getMonth() + 1)
        if (cancelled) return
        setTarget(targetData)
      }
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [indicatorId, organizationId, periodType, range])

  const estado = calcularSemaforo(latestValue, target?.target_value, indicator?.improvement_direction ?? 'mayor_mejor')
  const latestCause = causes[0]
  const eventLocationName = latestCause?.measurements?.site_locations?.name
  const whereLabel = eventLocationName
    ? `${indicator?.sites?.name ?? 'Corporativo'} · ${eventLocationName}`
    : (indicator?.sites?.name ?? 'Corporativo')

  // Todas las causas cuyo EVENTO (la fecha de la medición, no cuándo se
  // escribió la causa) cae dentro del rango elegido, ordenadas por cuánto
  // pesaron (impact_value) — no solo la más reciente, para que en la
  // reunión se vea de una vez cuáles causales dominaron el período. Se usa
  // la fecha del evento y no la de registro porque es común documentar
  // causas de días pasados varios días después (ej. poniéndose al día en
  // una reunión) — si se filtrara por cuándo se escribió, esas causas
  // reales desaparecerían del rango que sí les corresponde.
  const causesInRange = causes
    .filter((c) => {
      const eventDate = c.measurements?.period_date ?? c.created_at.slice(0, 10)
      return eventDate >= range.from && eventDate <= range.to
    })
    .sort((a, b) => b.impact_value - a.impact_value)

  // Pareto de causas de este indicador: acumula el impacto de cada causa
  // raíz distinta (no un impacto suelto por registro) para que se vea de
  // una vez cuál es la más ofensora dentro del rango — mismo criterio que
  // el Pareto general y el de "Causas posibles".
  const causeParetoRows = Object.values(
    causesInRange
      .filter((c): c is typeof c & { root_cause: string } => !!c.root_cause?.trim())
      .reduce<Record<string, { rootCause: string; impactTotal: number }>>((acc, c) => {
        const key = c.root_cause.trim().toLowerCase()
        const entry = acc[key] ?? { rootCause: c.root_cause, impactTotal: 0 }
        entry.impactTotal += c.impact_value
        acc[key] = entry
        return acc
      }, {}),
  ).sort((a, b) => b.impactTotal - a.impactTotal)

  const causeParetoTotal = causeParetoRows.reduce((sum, r) => sum + r.impactTotal, 0)
  const causeParetoData = causeParetoRows.map((row, index) => {
    const cumulative = causeParetoRows.slice(0, index + 1).reduce((sum, r) => sum + r.impactTotal, 0)
    return {
      name: row.rootCause,
      impactTotal: row.impactTotal,
      cumulativePercent: causeParetoTotal ? Math.round((cumulative / causeParetoTotal) * 1000) / 10 : 0,
    }
  })

  async function handleCreatePlan(e: FormEvent) {
    e.preventDefault()
    if (!profile || !indicator) return
    if (!description.trim()) {
      setError('Describe la acción a tomar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createActionPlan({
        organization_id: indicator.organization_id,
        indicator_id: indicator.id,
        causal_analysis_id: latestCause?.id ?? null,
        description,
        responsible_id: responsibleId || null,
        event_date: eventDate || null,
        due_date: dueDate || null,
        created_by: profile.id,
      })
      setDescription('')
      setResponsibleId('')
      setEventDate(today())
      setDueDate(today())
      setShowForm(false)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plan de acción.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdvance(planId: string, nextStatus: PdcaStatus) {
    await advanceActionPlanStatus(planId, nextStatus)
    await loadAll()
  }

  if (loading) return <p>Cargando tablero…</p>
  if (!indicator) return <p>Indicador no encontrado.</p>

  return (
    <div className="board-page">
      <div className="board-header">
        <div className="board-header__filters">
          <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <PeriodTypeSelector value={periodType} onChange={setPeriodType} />
        </div>
        <Link to={`/cascada/${indicator.id}`}>Ver cascada</Link>
      </div>

      <div className="board-columns">
      <div className="board-columns__main">
      <section className="board-card board-result" style={{ borderLeftColor: SEMAFORO_COLOR[estado] }}>
        <div className="board-result__header">
          <h2>{indicator.name}</h2>
        </div>
        <div className="board-result__content">
        {indicator.is_calculated && (
          <p className="board-result__calculated-note">
            Valor calculado automáticamente ({AGGREGATION_METHOD_LABEL[indicator.aggregation_method].toLowerCase()}{' '}
            de sus indicadores hijo) — no se captura a mano.
          </p>
        )}
        <div className={`board-result__badge board-result__badge--${estado}`}>
          {estado === 'cumple' ? '✓ CUMPLE' : estado === 'sin_datos' ? 'SIN DATOS' : '✗ NO CUMPLE'}
        </div>
        <div className="board-result__values">
          {indicator.value_type === 'binario' ? (
            <span className="board-result__value">{formatIndicatorValue(latestValue, 'binario', '')}</span>
          ) : indicator.value_type === 'razon' ? (
            <span className="board-result__value">{formatIndicatorValue(latestValue, 'razon', '')}</span>
          ) : (
            <span className="board-result__value">
              {latestValue ?? '—'} <small>{indicator.unit}</small>
            </span>
          )}
          {indicator.value_type === 'numerico' && (
            <span className="board-result__target">
              Objetivo: {target?.target_value ?? '—'} {indicator.unit}
            </span>
          )}
          <Semaforo estado={estado} />
        </div>
        <p className="board-result__period">
          Del {range.from} al {range.to} — {AGGREGATION_METHOD_LABEL[indicator.aggregation_method]} en ese rango
        </p>
        {trend.length > 0 && (
          <div className="board-result__sparkline">
            <TrendSparkline data={trend} color={SEMAFORO_COLOR[estado]} height={48} />
          </div>
        )}
        </div>
      </section>

      <section className="board-card">
        <h2>Análisis de causas</h2>
        <p className="board-causes-subtitle">
          Del {range.from} al {range.to} — cuánto pesó cada causa dentro de este período.
        </p>
        {causeParetoData.length > 0 && (
          <div className="board-causes-pareto">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={causeParetoData} margin={{ bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={<ParetoAxisTick />} interval={0} height={50} />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="impactTotal" fill="var(--color-primary)" name="Valor" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativePercent"
                  stroke="var(--color-orange)"
                  strokeWidth={2}
                  name="% acumulado"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {causeParetoData.length === 0 && <p>Sin causas registradas dentro de este rango.</p>}
        <Link to={`/analisis-causal/${indicator.id}`} className="button-primary board-link-button">
          {latestCause ? 'Ver historial / registrar otra causa' : 'Registrar análisis de causa'}
        </Link>
      </section>
      </div>

      <div className="board-columns__side">
      <section className="board-card board-card--plans">
        <div className="board-plans-header">
          <h2>Plan de acción</h2>
          <button type="button" className="button-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancelar' : '+ Nuevo plan'}
          </button>
        </div>

        {showForm && (
          <form className="board-plan-form" onSubmit={handleCreatePlan}>
            <div className="board-plan-form__grid">
              <label>
                Problema encontrado
                <input value={indicator.name} disabled />
              </label>
              <label>
                Quién (registra)
                <input value={profile?.full_name ?? ''} disabled />
              </label>
              <label>
                Cuándo (fecha del evento)
                <input type="date" value={eventDate} max={today()} onChange={(e) => setEventDate(e.target.value)} />
              </label>
              <label>
                Dónde
                <input value={whereLabel} disabled />
              </label>
              <label className="board-plan-form__full">
                Cuál es la causa origen
                <input value={latestCause?.root_cause ?? 'Sin causa registrada todavía'} disabled />
              </label>
              <label className="board-plan-form__full">
                Acción
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} required />
              </label>
              <label>
                Responsable (ejecuta)
                <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Plazo
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </div>

            {error && <p className="causal-error">{error}</p>}

            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar plan de acción'}
            </button>
          </form>
        )}

        {plans.length === 0 && !showForm && <p>Todavía no hay planes de acción para este indicador.</p>}

        <div className="board-plans-list">
          {plans.map((plan) => (
            <div key={plan.id} className="board-plan-item">
              <ActionPlanProgress status={plan.status} />
              <div className="board-plan-item__body">
                <p className="board-plan-item__description">{plan.description}</p>
                {plan.causal_analysis?.root_cause ? (
                  <p className="board-plan-item__cause">
                    <strong>Causa raíz:</strong> {plan.causal_analysis.root_cause}
                  </p>
                ) : (
                  <p className="board-plan-item__no-cause">⚠ Sin análisis de causa vinculado</p>
                )}
                <p className="board-plan-item__meta">
                  Responsable: {plan.responsible?.full_name ?? 'Sin asignar'} · Plazo:{' '}
                  {plan.due_date ?? '—'} · Registró: {plan.creator?.full_name ?? '—'}
                </p>
                {plan.status !== 'cerrado' && (
                  <div className="board-plan-item__actions">
                    {ACTION_PLAN_STEPS.filter(
                      (s) => s.quarters > (ACTION_PLAN_STEPS.find((c) => c.status === plan.status)?.quarters ?? 0),
                    ).map((s) => (
                      <button key={s.status} type="button" onClick={() => handleAdvance(plan.id, s.status)}>
                        Marcar: {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      </div>
      </div>
    </div>
  )
}
