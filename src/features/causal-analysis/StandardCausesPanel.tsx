import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ParetoAxisTick } from '../../components/ui/ParetoAxisTick'
import {
  createCausalAnalysis,
  deleteCausalAnalysis,
  fetchCausesForMeasurement,
  type MeasurementCause,
} from './causalAnalysisApi'
import { fetchMeasurementById } from '../measurements/measurementsApi'
import { IndicatorCausePicker } from './IndicatorCausePicker'
import { RootCausePicker } from './RootCausePicker'
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
  const [impactValue, setImpactValue] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [path, setPath] = useState<IndicatorCause[]>([])
  // Cambia después de cada guardado exitoso para forzar el remount de
  // RootCausePicker: su cuadro de texto libre ("Otra, especificar") guarda
  // lo escrito en estado LOCAL, y limpiar rootCause aquí no lo toca — sin
  // este remount, el texto de la causa anterior queda visualmente y se
  // reenvía tal cual si el usuario vuelve a guardar sin notarlo.
  const [rootCauseResetKey, setRootCauseResetKey] = useState(0)

  // Distribución del día: valor real de la medición vinculada y las causas
  // ya registradas contra ella — para repartir "20 inconsistencias" entre
  // varias causales sin pasarse ni dejar el faltante invisible.
  const [dayValue, setDayValue] = useState<number | null>(null)
  const [dayDate, setDayDate] = useState<string | null>(null)
  const [dayCauses, setDayCauses] = useState<MeasurementCause[]>([])

  async function reloadDay() {
    if (!measurementId) return
    const [measurement, causesRows] = await Promise.all([
      fetchMeasurementById(measurementId),
      fetchCausesForMeasurement(measurementId),
    ])
    setDayValue(measurement ? Number(measurement.value) : null)
    setDayDate(measurement?.period_date ?? null)
    setDayCauses(causesRows)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!measurementId) {
        setDayValue(null)
        setDayDate(null)
        setDayCauses([])
        return
      }
      const [measurement, causesRows] = await Promise.all([
        fetchMeasurementById(measurementId),
        fetchCausesForMeasurement(measurementId),
      ])
      if (cancelled) return
      setDayValue(measurement ? Number(measurement.value) : null)
      setDayDate(measurement?.period_date ?? null)
      setDayCauses(causesRows)
    }

    load().catch((err) => console.error('No se pudo cargar la distribución del día:', err))
    return () => {
      cancelled = true
    }
  }, [measurementId])

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

  const assignedTotal = dayCauses.reduce((sum, c) => sum + c.impact_value, 0)
  // Solo tiene sentido "cuadrar" contra el valor del día en KPIs numéricos
  // (conteos): en razón/binario el valor no es una cantidad repartible.
  const distributesAgainstDay = indicator.value_type === 'numerico' && dayValue !== null
  const remaining = distributesAgainstDay ? dayValue - assignedTotal : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rootCause.trim() || !selectedCause) {
      setError('Describe la causa raíz y elige un nodo del árbol de causas antes de guardar.')
      setSavedMessage(null)
      return
    }
    // La suma de las causas no puede superar el valor real del KPI ese día:
    // si hubo 20 inconsistencias, entre todas las causales deben explicar
    // máximo 20. Al re-registrar la MISMA causa se descuenta la versión que
    // va a ser reemplazada, para que corregir un valor no cuente doble.
    if (distributesAgainstDay) {
      const newValue = impactValue.trim() ? Number(impactValue) : 1
      const normalized = rootCause.trim().toLowerCase()
      const replacedSum = dayCauses
        .filter((c) => (c.root_cause ?? '').trim().toLowerCase() === normalized && !c.hasPlan)
        .reduce((sum, c) => sum + c.impact_value, 0)
      const projected = assignedTotal - replacedSum + newValue
      if (projected > (dayValue as number)) {
        setError(
          `La suma de las causas quedaría en ${projected}, pero el KPI de este día registró ${dayValue} ${indicator.unit}. Ajusta el valor de esta causa (o corrige las ya registradas) para que la distribución no supere la cantidad real.`,
        )
        setSavedMessage(null)
        return
      }
    }
    setSaving(true)
    setError(null)
    setSavedMessage(null)
    try {
      const newAnalysisId = await createCausalAnalysis({
        organization_id: indicator.organization_id,
        indicator_id: indicator.id,
        measurement_id: measurementId,
        methodology: 'causas_estandar',
        description: description || null,
        root_cause: rootCause,
        data: {},
        impact_value: impactValue.trim() ? Number(impactValue) : undefined,
        created_by: createdBy,
      })
      await tagCausalAnalysisWithIndicatorCause(newAnalysisId, selectedCause.id)

      setRootCause('')
      setImpactValue('')
      setDescription('')
      setSelectedCause(null)
      setRootCauseResetKey((k) => k + 1)
      setSavedMessage('Causa registrada. Si el incumplimiento tuvo más de una causa, agrégala aquí mismo: elige otro nodo del árbol y describe la siguiente causa raíz.')
      await Promise.all([reloadTree(), reloadDay()])
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el análisis.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDayCause(cause: MeasurementCause) {
    if (cause.hasPlan) return
    const label = cause.root_cause ?? 'esta causa'
    if (!window.confirm(`¿Eliminar "${label}" (valor ${cause.impact_value}) de este día? El registro se borra definitivamente.`)) {
      return
    }
    setError(null)
    setSavedMessage(null)
    try {
      await deleteCausalAnalysis(cause.id)
      await Promise.all([reloadTree(), reloadDay()])
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la causa.')
    }
  }

  const currentParentId = path.length ? path[path.length - 1].id : null
  const { rows, generalCount, generalImpact } = useMemo(
    () => computeIndicatorCauseParetoForParent(causes, tags, currentParentId),
    [causes, tags, currentParentId],
  )

  const totalImpact = rows.reduce((sum, r) => sum + r.impactTotal, 0) + generalImpact
  const chartData = rows.map((row, index) => {
    const cumulativeImpact = rows.slice(0, index + 1).reduce((sum, r) => sum + r.impactTotal, 0)
    return {
      name: row.cause.name,
      count: row.count,
      impactTotal: row.impactTotal,
      cumulativePercent: totalImpact ? Math.round((cumulativeImpact / totalImpact) * 1000) / 10 : 0,
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
      {distributesAgainstDay && dayDate && (
        <div className="causal-day-summary">
          <h3>
            Distribución del {new Date(`${dayDate}T00:00:00`).toLocaleDateString('es-CO')} — el KPI registró{' '}
            {dayValue} {indicator.unit}
          </h3>
          <p
            className={`causal-day-summary__status ${
              (remaining as number) === 0
                ? 'causal-day-summary__status--ok'
                : (remaining as number) > 0
                  ? 'causal-day-summary__status--pending'
                  : 'causal-day-summary__status--over'
            }`}
          >
            {(remaining as number) === 0
              ? `✓ Distribución completa: las causas explican los ${dayValue} ${indicator.unit} del día.`
              : (remaining as number) > 0
                ? `Asignado a causas: ${assignedTotal} de ${dayValue} — faltan ${remaining} ${indicator.unit} por explicar con una causal.`
                : `Las causas suman ${assignedTotal}, más que los ${dayValue} ${indicator.unit} del día — corrige los valores.`}
          </p>
          {dayCauses.length > 0 && (
            <ul className="causal-day-list">
              {dayCauses.map((cause) => (
                <li key={cause.id} className="causal-day-item">
                  <span className="causal-day-item__value">{cause.impact_value}</span>
                  <span className="causal-day-item__body">
                    {cause.root_cause}
                    {cause.causeName && <small> · {cause.causeName}</small>}
                  </span>
                  {cause.hasPlan ? (
                    <span className="causal-day-item__locked" title="Tiene un plan de acción vinculado — no se puede eliminar.">
                      Con plan
                    </span>
                  ) : (
                    <button type="button" className="causal-day-item__delete" onClick={() => handleDeleteDayCause(cause)}>
                      Eliminar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          <RootCausePicker
            key={rootCauseResetKey}
            indicatorId={indicator.id}
            createdBy={createdBy}
            value={rootCause}
            onChange={setRootCause}
          />
        </label>

        <label>
          Valor de esta causa (opcional)
          <input
            type="number"
            step="any"
            min={0}
            placeholder="Ej. costo, horas perdidas, unidades afectadas…"
            value={impactValue}
            onChange={(e) => setImpactValue(e.target.value)}
          />
          <span className="causal-form__hint">
            {distributesAgainstDay && (remaining as number) > 0
              ? `Cuántas de las ${dayValue} ${indicator.unit} del día corresponden a esta causa — quedan ${remaining} por asignar. Si no lo llenas, cuenta como 1.`
              : 'Si no lo llenas, cuenta como 1 en el Pareto — úsalo para ponderar hallazgos que no pesan lo mismo (ej. varias novedades de un mismo gemba walk).'}
          </span>
        </label>

        <label>
          Notas / contexto (opcional)
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {error && <p className="causal-error">{error}</p>}
        {savedMessage && <p className="causal-success">{savedMessage}</p>}

        <div className="causal-form__actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar análisis'}
          </button>
        </div>
      </form>

      <h2>Pareto de causas de este indicador</h2>
      <p className="page-subtitle">
        El nivel más alto muestra el nodo raíz con más valor acumulado (no solo más casos); entra a uno para ver el
        Pareto de sus hijos — ej. la máquina que más para, y al entrar, los componentes que más fallan de esa
        máquina en específico.
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
      ) : totalImpact === 0 ? (
        <p>Todavía no hay ocurrencias registradas en este nivel del árbol.</p>
      ) : (
        <>
          <div className="pareto-chart">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={chartData}
                margin={{ bottom: 12 }}
                onClick={(state) => {
                  const payload = (state as { activePayload?: { payload: { causeId: string } }[] })?.activePayload
                  if (payload?.[0]) drillInto(payload[0].payload.causeId)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={<ParetoAxisTick />} interval={0} height={50} />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="impactTotal" fill="var(--color-primary)" name="Valor" cursor="pointer" />
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
                  <th>Valor</th>
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
                    <td>{row.impactTotal}</td>
                    <td>{row.count}</td>
                    <td>{totalImpact ? Math.round((row.impactTotal / totalImpact) * 1000) / 10 : 0}%</td>
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
                    <td>{generalImpact}</td>
                    <td>{generalCount}</td>
                    <td>{totalImpact ? Math.round((generalImpact / totalImpact) * 1000) / 10 : 0}%</td>
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
