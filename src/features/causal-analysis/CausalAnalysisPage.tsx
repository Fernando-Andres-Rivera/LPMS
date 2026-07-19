import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { fetchIndicatorById } from '../indicators/indicatorsApi'
import { fetchCurrentTarget } from '../dashboard/dashboardApi'
import { fetchCauseCategories, tagCausalAnalysis } from '../pareto/causeTaxonomyApi'
import { CauseTaxonomyPicker } from './CauseTaxonomyPicker'
import { StandardCausesPanel } from './StandardCausesPanel'
import { fetchIndicatorCauseTags, fetchIndicatorCauses } from './standardCausesApi'
import {
  checkRequiresRigor,
  createCausalAnalysis,
  fetchCausalAnalyses,
  type CausalAnalysisWithAuthor,
} from './causalAnalysisApi'
import {
  CAUSAL_METHODOLOGY_LABEL,
  ISHIKAWA_CATEGORIES,
  ISHIKAWA_CATEGORY_LABEL,
  type CausalMethodology,
  type CauseCategory,
  type Indicator,
  type IshikawaCategoryKey,
} from '../../lib/types'
import './causal-analysis.css'

const MIN_CATEGORIES_WHEN_RIGOROUS = 3

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

type HistorySortField = 'reporte' | 'registro' | null
type HistorySortDir = 'asc' | 'desc'

// null cuando el análisis no está ligado a una medición — se empujan al
// final sin importar la dirección, en vez de fingir que su fecha de
// reporte es la de registro.
function reportDate(analysis: CausalAnalysisWithAuthor): number | null {
  if (!analysis.measurements?.period_date) return null
  return new Date(analysis.measurements.period_date + 'T00:00:00').getTime()
}

function registeredDate(analysis: CausalAnalysisWithAuthor): number {
  return new Date(analysis.created_at).getTime()
}

export function CausalAnalysisPage() {
  const { indicatorId } = useParams<{ indicatorId: string }>()
  const [searchParams] = useSearchParams()
  const measurementId = searchParams.get('measurement')
  const { profile, organizationId } = useAuth()

  const [indicator, setIndicator] = useState<Indicator | null>(null)
  const [requiresRigor, setRequiresRigor] = useState(false)
  const [history, setHistory] = useState<CausalAnalysisWithAuthor[]>([])
  const [historySortField, setHistorySortField] = useState<HistorySortField>(null)
  const [historySortDir, setHistorySortDir] = useState<HistorySortDir>('asc')
  const [loading, setLoading] = useState(true)

  // Cada botón cicla sus propios 3 estados (↑ → ↓ → desactivado); activar
  // uno desactiva al otro, porque solo un campo puede mandar el orden.
  function cycleHistorySort(field: 'reporte' | 'registro') {
    if (historySortField !== field) {
      setHistorySortField(field)
      setHistorySortDir('asc')
    } else if (historySortDir === 'asc') {
      setHistorySortDir('desc')
    } else {
      setHistorySortField(null)
    }
  }

  // Si llega con una medición puntual (ej. redirigido desde Captura porque
  // el valor incumplió el objetivo), arranca directo en "Causas posibles" —
  // es la lista estandarizada, no un texto libre por metodología distinta.
  const [methodology, setMethodology] = useState<CausalMethodology>(measurementId ? 'causas_estandar' : 'ishikawa')
  const [categoryText, setCategoryText] = useState<Record<IshikawaCategoryKey, string>>({
    mano_de_obra: '',
    metodo: '',
    maquina: '',
    material: '',
    medicion: '',
    medio_ambiente: '',
  })
  const [whys, setWhys] = useState(['', '', '', '', ''])
  const [rootCause, setRootCause] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<CauseCategory[]>([])
  const [selectedTags, setSelectedTags] = useState<CauseCategory[]>([])

  const [indicatorCauseByAnalysis, setIndicatorCauseByAnalysis] = useState<Map<string, string>>(new Map())

  /**
   * Nunca rechaza: si la tabla indicator_causes todavía no existe (migración
   * pendiente) u otro error transitorio ocurre, el resto de la página (que
   * no depende de la pestaña "Causas posibles") no debe quedarse colgada.
   */
  async function fetchIndicatorCauseHistory(id: string): Promise<Map<string, string>> {
    try {
      const [causesData, tagsData] = await Promise.all([fetchIndicatorCauses(id), fetchIndicatorCauseTags(id)])
      const byId = new Map(causesData.map((c) => [c.id, c.name]))
      const byAnalysis = new Map<string, string>()
      for (const tag of tagsData) {
        const name = byId.get(tag.indicator_cause_id)
        if (name && !byAnalysis.has(tag.causal_analysis_id)) byAnalysis.set(tag.causal_analysis_id, name)
      }
      return byAnalysis
    } catch (err) {
      console.error('No se pudo cargar el historial de causas posibles:', err)
      return new Map()
    }
  }

  // Refresco silencioso tras guardar un análisis: a propósito NO toca
  // `loading` (eso desmontaría toda la página, incluida esta misma pestaña,
  // borrando el mensaje de confirmación y el formulario justo reiniciado —
  // dando la impresión de que el guardado "no quedó" y llevando a
  // reintentar con la misma causa).
  async function loadAll() {
    if (!indicatorId) return
    const [indicatorData, analyses, causeHistory] = await Promise.all([
      fetchIndicatorById(indicatorId),
      fetchCausalAnalyses(indicatorId),
      fetchIndicatorCauseHistory(indicatorId),
    ])
    setIndicator(indicatorData)
    setHistory(analyses)
    setIndicatorCauseByAnalysis(causeHistory)

    if (indicatorData) {
      const now = new Date()
      const target = await fetchCurrentTarget(indicatorId, now.getFullYear(), now.getMonth() + 1)
      setRequiresRigor(await checkRequiresRigor(indicatorData, target))
    }
  }

  useEffect(() => {
    if (!indicatorId) return
    let cancelled = false

    Promise.all([
      fetchIndicatorById(indicatorId),
      fetchCausalAnalyses(indicatorId),
      fetchIndicatorCauseHistory(indicatorId),
    ]).then(async ([indicatorData, analyses, causeHistory]) => {
      if (cancelled) return
      setIndicator(indicatorData)
      setHistory(analyses)
      setIndicatorCauseByAnalysis(causeHistory)

      if (indicatorData) {
        const now = new Date()
        const target = await fetchCurrentTarget(indicatorId, now.getFullYear(), now.getMonth() + 1)
        if (cancelled) return
        setRequiresRigor(await checkRequiresRigor(indicatorData, target))
      }
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [indicatorId])

  useEffect(() => {
    if (!organizationId) return
    fetchCauseCategories(organizationId).then(setCategories)
  }, [organizationId])

  function validate(): string | null {
    if (!rootCause.trim()) return 'Describe la causa raíz identificada antes de guardar.'

    if (methodology === '5_porques') {
      const filled = whys.filter((w) => w.trim()).length
      if (requiresRigor && filled < 5) {
        return 'Este indicador es repetitivo: completa los 5 Porqués antes de guardar.'
      }
      if (!requiresRigor && filled < 1) return 'Completa al menos el primer Porqué.'
      return null
    }

    const filledCategories = ISHIKAWA_CATEGORIES.filter((cat) => linesToList(categoryText[cat]).length > 0).length
    if (requiresRigor && filledCategories < MIN_CATEGORIES_WHEN_RIGOROUS) {
      return `Este indicador es repetitivo: registra causas en al menos ${MIN_CATEGORIES_WHEN_RIGOROUS} categorías de Ishikawa antes de guardar.`
    }
    if (!requiresRigor && filledCategories < 1) return 'Registra al menos una causa en alguna categoría.'
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !indicator) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const data =
        methodology === '5_porques'
          ? { whys: whys.filter((w) => w.trim()) }
          : {
              categories: Object.fromEntries(
                ISHIKAWA_CATEGORIES.map((cat) => [cat, linesToList(categoryText[cat])]),
              ) as Record<IshikawaCategoryKey, string[]>,
            }

      const newAnalysisId = await createCausalAnalysis({
        organization_id: indicator.organization_id,
        indicator_id: indicator.id,
        measurement_id: measurementId,
        methodology,
        description: description || null,
        root_cause: rootCause,
        data,
        created_by: profile.id,
      })

      await tagCausalAnalysis(
        newAnalysisId,
        selectedTags.map((t) => t.id),
      )

      setRootCause('')
      setDescription('')
      setWhys(['', '', '', '', ''])
      setCategoryText({ mano_de_obra: '', metodo: '', maquina: '', material: '', medicion: '', medio_ambiente: '' })
      setSelectedTags([])
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el análisis.')
    } finally {
      setSaving(false)
    }
  }

  const sortedHistory = useMemo(() => {
    if (!historySortField) return history
    const dateOf = historySortField === 'reporte' ? reportDate : registeredDate
    return [...history].sort((a, b) => {
      const da = dateOf(a)
      const db = dateOf(b)
      // Sin fecha de reporte: siempre al final, sin importar la dirección.
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return historySortDir === 'desc' ? db - da : da - db
    })
  }, [history, historySortField, historySortDir])

  if (loading) return <p>Cargando análisis causal…</p>
  if (!indicator) return <p>Indicador no encontrado.</p>

  return (
    <div className="causal-page">
      <h1>Análisis causal</h1>
      <p className="page-subtitle">
        {indicator.name} · <Link to="/captura">Seguir capturando mediciones</Link> ·{' '}
        <Link to={`/tablero/${indicator.id}`}>Volver al tablero</Link> ·{' '}
        <Link to={`/pareto?indicator=${indicator.id}`}>Ver Pareto de este indicador</Link>
      </p>

      {requiresRigor && (
        <div className="causal-rigor-banner">
          Este indicador lleva 3 mediciones seguidas incumpliendo el objetivo. Se requiere un análisis más riguroso:
          completa los 5 Porqués o registra causas en al menos {MIN_CATEGORIES_WHEN_RIGOROUS} categorías de Ishikawa.
        </div>
      )}

      <div className="causal-methodology-toggle">
        <button
          type="button"
          className={methodology === 'ishikawa' ? 'active' : ''}
          onClick={() => setMethodology('ishikawa')}
        >
          Espina de pescado (Ishikawa)
        </button>
        <button
          type="button"
          className={methodology === '5_porques' ? 'active' : ''}
          onClick={() => setMethodology('5_porques')}
        >
          5 Porqués
        </button>
        <button
          type="button"
          className={methodology === 'causas_estandar' ? 'active' : ''}
          onClick={() => setMethodology('causas_estandar')}
        >
          Causas posibles
        </button>
      </div>

      {methodology === 'causas_estandar' ? (
        profile && (
          <StandardCausesPanel
            indicator={indicator}
            measurementId={measurementId}
            createdBy={profile.id}
            onSaved={loadAll}
          />
        )
      ) : (
      <form className="causal-form" onSubmit={handleSubmit}>
        {methodology === 'ishikawa' ? (
          <div className="causal-ishikawa-grid">
            {ISHIKAWA_CATEGORIES.map((cat) => (
              <label key={cat} className="causal-category">
                {ISHIKAWA_CATEGORY_LABEL[cat]}
                <textarea
                  rows={3}
                  placeholder="Una causa posible por línea…"
                  value={categoryText[cat]}
                  onChange={(e) => setCategoryText((c) => ({ ...c, [cat]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="causal-whys">
            {whys.map((why, i) => (
              <label key={i}>
                {i + 1}. ¿Por qué?
                <input
                  value={why}
                  onChange={(e) =>
                    setWhys((current) => current.map((w, idx) => (idx === i ? e.target.value : w)))
                  }
                  placeholder={i === 0 ? 'Por qué ocurrió la desviación…' : 'Por qué de la respuesta anterior…'}
                />
              </label>
            ))}
          </div>
        )}

        <label>
          Clasificación estructurada (para el Pareto)
          {profile && (
            <CauseTaxonomyPicker
              organizationId={indicator.organization_id}
              createdBy={profile.id}
              categories={categories}
              onCategoriesChange={setCategories}
              selected={selectedTags}
              onSelectedChange={setSelectedTags}
            />
          )}
        </label>

        <label>
          Causa raíz identificada
          <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} required />
        </label>

        <label>
          Notas / contexto (opcional)
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {error && <p className="causal-error">{error}</p>}

        <div className="causal-form__actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar análisis'}
          </button>
        </div>
      </form>
      )}

      <div className="causal-history-header">
        <h2>Historial</h2>
        {history.length > 0 && (
          <div className="causal-history-sort">
            <button
              type="button"
              className={historySortField === 'reporte' ? 'active' : ''}
              onClick={() => cycleHistorySort('reporte')}
            >
              Fecha del reporte{historySortField === 'reporte' && (historySortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className={historySortField === 'registro' ? 'active' : ''}
              onClick={() => cycleHistorySort('registro')}
            >
              Fecha de registro{historySortField === 'registro' && (historySortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
          </div>
        )}
      </div>
      {history.length === 0 && <p>Todavía no hay análisis registrados para este indicador.</p>}
      <div className="causal-history">
        {sortedHistory.map((analysis) => (
          <details key={analysis.id} className="causal-history-item">
            <summary>
              <span className="causal-history-methodology">{CAUSAL_METHODOLOGY_LABEL[analysis.methodology]}</span>
              <span className="causal-history-root">{analysis.root_cause}</span>
              <span className="causal-history-meta">
                {analysis.measurements?.period_date && (
                  <>
                    Reporte del{' '}
                    {new Date(analysis.measurements.period_date + 'T00:00:00').toLocaleDateString('es-CO')} ·{' '}
                  </>
                )}
                {analysis.profiles?.full_name ?? 'Usuario'} · Registrado el{' '}
                {new Date(analysis.created_at).toLocaleDateString('es-CO')}
              </span>
            </summary>
            {analysis.description && <p>{analysis.description}</p>}
            {analysis.methodology === 'causas_estandar' && (
              <p className="causal-history-detail">
                {indicatorCauseByAnalysis.has(analysis.id) && (
                  <>
                    <strong>Causa:</strong> {indicatorCauseByAnalysis.get(analysis.id)}
                    {' · '}
                  </>
                )}
                <strong>Valor:</strong> {analysis.impact_value}
              </p>
            )}
            {analysis.methodology === 'ishikawa' && analysis.data.categories && (
              <ul className="causal-history-detail">
                {ISHIKAWA_CATEGORIES.filter((cat) => (analysis.data.categories?.[cat]?.length ?? 0) > 0).map(
                  (cat) => (
                    <li key={cat}>
                      <strong>{ISHIKAWA_CATEGORY_LABEL[cat]}:</strong> {analysis.data.categories?.[cat]?.join(', ')}
                    </li>
                  ),
                )}
              </ul>
            )}
            {analysis.methodology === '5_porques' && analysis.data.whys && (
              <ol className="causal-history-detail">
                {analysis.data.whys.map((why, i) => (
                  <li key={i}>{why}</li>
                ))}
              </ol>
            )}
          </details>
        ))}
      </div>
    </div>
  )
}
