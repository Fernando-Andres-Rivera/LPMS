import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Semaforo } from '../../components/ui/Semaforo'
import { ActionPlanProgress } from '../../components/ui/ActionPlanProgress'
import { PeriodTypeSelector } from '../../components/ui/PeriodTypeSelector'
import { calcularSemaforo } from '../../lib/semaforo'
import { buildPeriodBuckets, type PeriodBucket } from '../../lib/periods'
import { fetchIndicatorWithRelationsById, fetchProfiles } from '../indicators/indicatorsApi'
import type { IndicatorWithRelations } from '../indicators/indicatorsApi'
import { computeIndicatorSeries, fetchCurrentTarget, fetchIndicatorPeriodSeries } from '../dashboard/dashboardApi'
import { fetchCascadeData } from '../cascade/cascadeApi'
import { fetchCausalAnalyses, type CausalAnalysisWithAuthor } from '../causal-analysis/causalAnalysisApi'
import {
  advanceActionPlanStatus,
  createActionPlan,
  fetchActionPlansForIndicator,
  type ActionPlanWithNames,
} from '../action-plans/actionPlansApi'
import { ACTION_PLAN_STEPS, AGGREGATION_METHOD_LABEL } from '../../lib/types'
import type { PdcaStatus, PeriodType, Profile, Target } from '../../lib/types'
import './indicator-board.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Serie de un indicador manual (measurements propios) o calculado (rollup
 * recursivo de sus indicadores hijo — solo trae el árbol completo de la
 * organización cuando realmente hace falta, para no pagar ese costo en el
 * caso común). */
async function fetchSeries(indicator: IndicatorWithRelations, buckets: PeriodBucket[], organizationId: string) {
  if (!indicator.is_calculated) {
    return fetchIndicatorPeriodSeries(indicator.id, buckets, indicator.aggregation_method)
  }
  const { indicators, links } = await fetchCascadeData(organizationId)
  return computeIndicatorSeries(indicator, indicators, links, buckets)
}

export function IndicatorBoardPage() {
  const { indicatorId } = useParams<{ indicatorId: string }>()
  const { profile, organizationId } = useAuth()

  const [indicator, setIndicator] = useState<IndicatorWithRelations | null>(null)
  const [periodType, setPeriodType] = useState<PeriodType>('dia')
  const [latestValue, setLatestValue] = useState<number | null>(null)
  const [latestLabel, setLatestLabel] = useState<string | null>(null)
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
    const buckets = buildPeriodBuckets(periodType, new Date())
    const [series, causesData, plansData, profilesData] = await Promise.all([
      indicatorData ? fetchSeries(indicatorData, buckets, organizationId) : Promise.resolve([]),
      fetchCausalAnalyses(indicatorId),
      fetchActionPlansForIndicator(indicatorId),
      fetchProfiles(organizationId),
    ])
    setIndicator(indicatorData)
    const withData = series.filter((p) => p.value !== null)
    const last = withData[withData.length - 1]
    setLatestValue(last ? (last.value as number) : null)
    setLatestLabel(last ? last.label : null)
    setCauses(causesData)
    setPlans(plansData)
    setProfiles(profilesData)

    if (indicatorData) {
      const now = new Date()
      setTarget(await fetchCurrentTarget(indicatorId, now.getFullYear(), now.getMonth() + 1))
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!indicatorId || !organizationId) return
    let cancelled = false

    fetchIndicatorWithRelationsById(indicatorId).then(async (indicatorData) => {
      if (cancelled) return
      const buckets = buildPeriodBuckets(periodType, new Date())
      const [series, causesData, plansData, profilesData] = await Promise.all([
        indicatorData ? fetchSeries(indicatorData, buckets, organizationId) : Promise.resolve([]),
        fetchCausalAnalyses(indicatorId),
        fetchActionPlansForIndicator(indicatorId),
        fetchProfiles(organizationId),
      ])
      if (cancelled) return
      setIndicator(indicatorData)
      const withData = series.filter((p) => p.value !== null)
      const last = withData[withData.length - 1]
      setLatestValue(last ? (last.value as number) : null)
      setLatestLabel(last ? last.label : null)
      setCauses(causesData)
      setPlans(plansData)
      setProfiles(profilesData)

      if (indicatorData) {
        const now = new Date()
        const targetData = await fetchCurrentTarget(indicatorId, now.getFullYear(), now.getMonth() + 1)
        if (cancelled) return
        setTarget(targetData)
      }
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [indicatorId, organizationId, periodType])

  const estado = calcularSemaforo(latestValue, target?.target_value, indicator?.improvement_direction ?? 'mayor_mejor')
  const latestCause = causes[0]
  const eventLocationName = latestCause?.measurements?.site_locations?.name
  const whereLabel = eventLocationName
    ? `${indicator?.sites?.name ?? 'Corporativo'} · ${eventLocationName}`
    : (indicator?.sites?.name ?? 'Corporativo')

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
        <h1>{indicator.name}</h1>
        <Link to={`/cascada/${indicator.id}`}>Ver cascada</Link>
      </div>

      <div className="board-columns">
      <div className="board-columns__main">
      <section className="board-card board-result">
        <div className="board-result__header">
          <h2>Resultado</h2>
          <PeriodTypeSelector value={periodType} onChange={setPeriodType} />
        </div>
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
          <span className="board-result__value">
            {latestValue ?? '—'} <small>{indicator.unit}</small>
          </span>
          <span className="board-result__target">
            Objetivo: {target?.target_value ?? '—'} {indicator.unit}
          </span>
          <Semaforo estado={estado} />
        </div>
        {latestLabel && <p className="board-result__period">Período: {latestLabel}</p>}
      </section>

      <section className="board-card">
        <h2>Análisis de causas</h2>
        {latestCause ? (
          <div className="board-cause">
            <p className="board-cause__root">{latestCause.root_cause}</p>
            <p className="board-cause__meta">
              {latestCause.methodology === 'ishikawa' ? 'Ishikawa' : '5 Porqués'} · {latestCause.profiles?.full_name} ·{' '}
              {new Date(latestCause.created_at).toLocaleDateString('es-CO')}
              {eventLocationName && <> · 📍 {eventLocationName}</>}
            </p>
          </div>
        ) : (
          <p>Todavía no hay una causa registrada para este indicador.</p>
        )}
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
