import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createCausalAnalysis } from './causalAnalysisApi'
import { IndicatorCausePicker } from './IndicatorCausePicker'
import {
  computeIndicatorCauseParetoForParent,
  fetchIndicatorCauseTags,
  fetchIndicatorCauses,
  tagCausalAnalysisWithIndicatorCause,
  type IndicatorCauseTag,
} from './standardCausesApi'
import type { Indicator, IndicatorCause } from '../../lib/types'

interface StandardCausesPanelProps {
  indicator: Indicator
  measurementId: string | null
  createdBy: string
  onSaved: () => void
}

/**
 * Pestaña "Causas posibles": registra ocurrencias contra un árbol de causas
 * PROPIO de este indicador (ej. Máquina -> Extrusora 3 -> Motor) y muestra
 * un Pareto que se re-enfoca al entrar a un nodo — "paradas por máquina"
 * cambia a "fallas por componentes de esa máquina" al hacer clic en ella.
 */
export function StandardCausesPanel({ indicator, measurementId, createdBy, onSaved }: StandardCausesPanelProps) {
  const [causes, setCauses] = useState<IndicatorCause[]>([])
  const [tags, setTags] = useState<IndicatorCauseTag[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCause, setSelectedCause] = useState<IndicatorCause | null>(null)
  const [rootCause, setRootCause] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [path, setPath] = useState<IndicatorCause[]>([])

  async function fetchTree(): Promise<{ causes: IndicatorCause[]; tags: IndicatorCauseTag[] }> {
    const [causesData, tagsData] = await Promise.all([
      fetchIndicatorCauses(indicator.id),
      fetchIndicatorCauseTags(indicator.id),
    ])
    return { causes: causesData, tags: tagsData }
  }

  async function reloadTree() {
    const tree = await fetchTree()
    setCauses(tree.causes)
    setTags(tree.tags)
  }

  useEffect(() => {
    let cancelled = false
    fetchTree()
      .then((tree) => {
        if (cancelled) return
        setCauses(tree.causes)
        setTags(tree.tags)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el árbol de causas.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rootCause.trim() || !selectedCause) {
      setError('Describe la causa raíz y elige un nodo del árbol de causas antes de guardar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const newAnalysisId = await createCausalAnalysis({
        organization_id: indicator.organization_id,
        indicator_id: indicator.id,
        measurement_id: measurementId,
        methodology: 'causas_estandar',
        description: description || null,
        root_cause: rootCause,
        data: {},
        created_by: createdBy,
      })
      await tagCausalAnalysisWithIndicatorCause(newAnalysisId, selectedCause.id)

      setRootCause('')
      setDescription('')
      setSelectedCause(null)
      await reloadTree()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el análisis.')
    } finally {
      setSaving(false)
    }
  }

  const currentParentId = path.length ? path[path.length - 1].id : null
  const { rows, generalCount } = useMemo(
    () => computeIndicatorCauseParetoForParent(causes, tags, currentParentId),
    [causes, tags, currentParentId],
  )

  const totalCount = rows.reduce((sum, r) => sum + r.count, 0) + generalCount
  const chartData = rows.map((row, index) => {
    const cumulativeCount = rows.slice(0, index + 1).reduce((sum, r) => sum + r.count, 0)
    return {
      name: row.cause.name,
      count: row.count,
      cumulativePercent: totalCount ? Math.round((cumulativeCount / totalCount) * 1000) / 10 : 0,
      causeId: row.cause.id,
    }
  })

  function drillInto(causeId: string) {
    const node = causes.find((c) => c.id === causeId)
    if (node) setPath((p) => [...p, node])
  }

  if (loadError) {
    return (
      <p className="causal-error">
        No se pudo cargar la pestaña de causas posibles: {loadError}
      </p>
    )
  }

  return (
    <div className="standard-causes-panel">
      <form className="causal-form" onSubmit={handleSubmit}>
        <label>
          Árbol de causas de este indicador
          <IndicatorCausePicker
            indicatorId={indicator.id}
            createdBy={createdBy}
            causes={causes}
            tags={tags}
            onCausesChange={setCauses}
            selected={selectedCause}
            onSelectedChange={setSelectedCause}
            onDeleted={reloadTree}
          />
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

      <h2>Pareto de causas de este indicador</h2>
      <p className="page-subtitle">
        El nivel más alto muestra el nodo raíz que más se repite; entra a uno para ver el Pareto de sus hijos —
        ej. la máquina que más para, y al entrar, los componentes que más fallan de esa máquina en específico.
      </p>

      <div className="pareto-breadcrumb">
        <button type="button" onClick={() => setPath([])} disabled={path.length === 0}>
          Raíz
        </button>
        {path.map((node, i) => (
          <span key={node.id}>
            {' › '}
            <button type="button" onClick={() => setPath((p) => p.slice(0, i + 1))} disabled={i === path.length - 1}>
              {node.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : totalCount === 0 ? (
        <p>Todavía no hay ocurrencias registradas en este nivel del árbol.</p>
      ) : (
        <>
          <div className="pareto-chart">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={chartData}
                onClick={(state) => {
                  const payload = (state as { activePayload?: { payload: { causeId: string } }[] })?.activePayload
                  if (payload?.[0]) drillInto(payload[0].payload.causeId)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="count" fill="var(--color-primary)" name="Casos" cursor="pointer" />
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

          <div className="table-scroll">
            <table className="pareto-table">
              <thead>
                <tr>
                  <th>Causa</th>
                  <th>Casos</th>
                  <th>%</th>
                  <th>% acumulado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr key={row.causeId}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                    <td>{totalCount ? Math.round((row.count / totalCount) * 1000) / 10 : 0}%</td>
                    <td>{row.cumulativePercent}%</td>
                    <td>
                      <button type="button" onClick={() => drillInto(row.causeId)}>
                        Desglosar →
                      </button>
                    </td>
                  </tr>
                ))}
                {generalCount > 0 && (
                  <tr>
                    <td>General (sin desglosar)</td>
                    <td>{generalCount}</td>
                    <td>{totalCount ? Math.round((generalCount / totalCount) * 1000) / 10 : 0}%</td>
                    <td>100%</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && rows.every((r) => !causes.some((c) => c.parent_id === r.cause.id)) && (
            <p className="pareto-leaf-note">
              Ninguna de estas causas tiene sub-causas registradas todavía — este es el nivel más específico
              alcanzado hasta ahora.
            </p>
          )}
        </>
      )}
    </div>
  )
}
