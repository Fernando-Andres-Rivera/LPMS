import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  DAY_OFFSET_LABEL,
  isCaptureBlockedByTime,
  type Axis,
  type Indicator,
  type LevelCaptureCutoff,
  type SemaforoEstado,
  type Site,
  type SiteLocation,
} from '../../lib/types'
import { fetchCapturableIndicators, fetchMeasurementForPeriod, saveMeasurement } from './measurementsApi'
import { fetchActiveAxes, fetchCurrentTarget } from '../dashboard/dashboardApi'
import { fetchSites } from '../indicators/indicatorsApi'
import { fetchSiteLocations } from '../org-structure/orgStructureApi'
import { fetchLevelCutoffs } from '../org-structure/captureCutoffsApi'
import { calcularSemaforo } from '../../lib/semaforo'
import { PeriodPicker } from './PeriodPicker'
import './capture.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Etiqueta cada instalación con su ruta completa dentro del sitio
 * (Instalación › Línea › Estación …), para que al capturar se vea el lugar
 * exacto en la estructura, no solo el nombre del último nivel.
 */
function buildLocationOptions(locations: SiteLocation[]): { id: string; label: string }[] {
  const byId = new Map(locations.map((loc) => [loc.id, loc]))
  return locations
    .map((loc) => {
      const parts = [loc.name]
      let current = loc
      while (current.parent_id) {
        const parent = byId.get(current.parent_id)
        if (!parent) break
        parts.unshift(parent.name)
        current = parent
      }
      return { id: loc.id, label: parts.join(' › ') }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function MeasurementCapturePage() {
  const { profile, siteIds, organizationId } = useAuth()
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [axes, setAxes] = useState<Axis[]>([])
  const [axisId, setAxisId] = useState('')
  const [cutoffs, setCutoffs] = useState<LevelCaptureCutoff[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [indicatorId, setIndicatorId] = useState('')
  const [periodDate, setPeriodDate] = useState(today())
  const [value, setValue] = useState('')
  const [plannedValue, setPlannedValue] = useState('')
  const [realValue, setRealValue] = useState('')
  const [comment, setComment] = useState('')
  const [siteLocations, setSiteLocations] = useState<SiteLocation[]>([])
  const [siteLocationId, setSiteLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [deviation, setDeviation] = useState<{ estado: SemaforoEstado; measurementId: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile || !organizationId) return
    let cancelled = false
    Promise.all([
      fetchCapturableIndicators(profile, organizationId, siteIds),
      fetchSites(organizationId),
      fetchActiveAxes(organizationId),
      fetchLevelCutoffs(organizationId),
    ])
      .then(([indicatorsData, sitesData, axesData, cutoffsData]) => {
        if (cancelled) return
        setIndicators(indicatorsData)
        setSites(sitesData)
        setAxes(axesData)
        setCutoffs(cutoffsData)
        if (indicatorsData.length && !indicatorId) setIndicatorId(indicatorsData[0].id)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los indicadores.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, organizationId, siteIds])

  const filteredIndicators = axisId ? indicators.filter((i) => i.axis_id === axisId) : indicators
  const selectedIndicator = indicators.find((i) => i.id === indicatorId)
  const selectedSite = sites.find((s) => s.id === selectedIndicator?.site_id) ?? null
  const locationOptions = buildLocationOptions(siteLocations)
  const levelCutoff = cutoffs.find((c) => c.level === selectedIndicator?.level)
  const blockedByTime = isCaptureBlockedByTime(levelCutoff ?? null, periodDate, new Date())
  // Para indicadores de razón, value no se escribe directo — se deriva de
  // programado/real, igual que se compara siempre contra un objetivo de 100.
  const razonPercent =
    plannedValue.trim() && realValue.trim() && Number(plannedValue) > 0
      ? (Number(realValue) / Number(plannedValue)) * 100
      : null

  function handleAxisChange(nextAxisId: string) {
    setAxisId(nextAxisId)
    const nextList = nextAxisId ? indicators.filter((i) => i.axis_id === nextAxisId) : indicators
    if (!nextList.some((i) => i.id === indicatorId)) {
      setIndicatorId(nextList[0]?.id ?? '')
    }
  }

  useEffect(() => {
    if (!indicatorId || !periodDate) return
    fetchMeasurementForPeriod(indicatorId, periodDate).then((existing) => {
      setValue(existing ? String(existing.value) : '')
      setPlannedValue(existing?.planned_value != null ? String(existing.planned_value) : '')
      setRealValue(existing?.real_value != null ? String(existing.real_value) : '')
      setComment(existing?.comment ?? '')
      setSiteLocationId(existing?.site_location_id ?? selectedIndicator?.site_location_id ?? '')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorId, periodDate])

  useEffect(() => {
    let cancelled = false
    const request = selectedIndicator?.site_id ? fetchSiteLocations(selectedIndicator.site_id) : Promise.resolve([])
    request.then((data) => {
      if (!cancelled) setSiteLocations(data)
    })
    return () => {
      cancelled = true
    }
  }, [selectedIndicator?.site_id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !indicatorId || !selectedIndicator) return
    if (blockedByTime) {
      setMessage({ type: 'error', text: 'Ya pasó la hora límite de captura de hoy para este nivel.' })
      return
    }
    // Number('') es 0, no NaN — sin esta validación, enviar el formulario sin
    // elegir Sí/No registraría silenciosamente "No" por defecto.
    if (selectedIndicator.value_type === 'binario' && value !== '1' && value !== '0') {
      setMessage({ type: 'error', text: 'Elige Sí o No antes de guardar.' })
      return
    }
    if (selectedIndicator.value_type === 'razon' && razonPercent === null) {
      setMessage({ type: 'error', text: 'Escribe cuántos se programaron y cuántos ocurrieron realmente.' })
      return
    }
    const effectiveValue = selectedIndicator.value_type === 'razon' ? (razonPercent as number) : Number(value)
    setSaving(true)
    setMessage(null)
    setDeviation(null)
    try {
      await saveMeasurement({
        indicatorId,
        periodDate,
        value: effectiveValue,
        comment: comment || null,
        siteLocationId: siteLocationId || null,
        capturedBy: profile.id,
        plannedValue: selectedIndicator.value_type === 'razon' ? Number(plannedValue) : undefined,
        realValue: selectedIndicator.value_type === 'razon' ? Number(realValue) : undefined,
      })
      setMessage({ type: 'ok', text: 'Medición guardada correctamente.' })

      const now = new Date()
      const [saved, target] = await Promise.all([
        fetchMeasurementForPeriod(indicatorId, periodDate),
        fetchCurrentTarget(indicatorId, now.getFullYear(), now.getMonth() + 1),
      ])
      const estado = calcularSemaforo(effectiveValue, target?.target_value, selectedIndicator.improvement_direction)
      if (saved && (estado === 'riesgo' || estado === 'incumple')) {
        setDeviation({ estado, measurementId: saved.id })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la medición.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="capture-page">
      <h1>Captura de mediciones</h1>

      {loading ? (
        <p>Cargando…</p>
      ) : loadError ? (
        <p className="capture-message capture-message--error">No se pudo cargar la captura: {loadError}</p>
      ) : indicators.length === 0 ? (
        <p>No tienes indicadores disponibles para capturar.</p>
      ) : (
        <form className="capture-form" onSubmit={handleSubmit}>
          {axes.length > 0 && (
            <label className="capture-label">
              Pilar
              <select className="capture-select" value={axisId} onChange={(e) => handleAxisChange(e.target.value)}>
                <option value="">Todos los pilares</option>
                {axes.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    {axis.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="capture-label">
            Indicador
            {filteredIndicators.length === 0 ? (
              <p className="capture-location__empty">Ningún indicador de este pilar está disponible para capturar.</p>
            ) : (
              <select
                className="capture-select"
                value={indicatorId}
                onChange={(e) => setIndicatorId(e.target.value)}
              >
                {filteredIndicators.map((indicator) => (
                  <option key={indicator.id} value={indicator.id}>
                    {indicator.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="capture-label">
            {selectedIndicator?.frequency === 'diaria' || !selectedIndicator ? 'Fecha' : 'Período'}
            <PeriodPicker
              frequency={selectedIndicator?.frequency ?? 'diaria'}
              value={periodDate}
              onChange={setPeriodDate}
            />
          </label>

          {blockedByTime && levelCutoff && (
            <p className="capture-cutoff-warning">
              Ya pasó la hora de la reunión de Nivel {selectedIndicator?.level} ({levelCutoff.cutoff_time.slice(0, 5)}
              ) — se bloqueó la captura del {DAY_OFFSET_LABEL[levelCutoff.evaluated_day_offset]?.toLowerCase()}.
              Elige una fecha anterior si necesitas ponerte al día, o pide a gerencia que ajuste el horario en
              Horario de reuniones.
            </p>
          )}

          {selectedIndicator?.value_type === 'binario' ? (
            <div className="capture-label">
              ¿Se cumplió?
              <div className="capture-binary">
                <button
                  type="button"
                  className={`capture-binary__option capture-binary__option--si ${value === '1' ? 'active' : ''}`}
                  onClick={() => setValue('1')}
                  disabled={blockedByTime}
                >
                  Sí
                </button>
                <button
                  type="button"
                  className={`capture-binary__option capture-binary__option--no ${value === '0' ? 'active' : ''}`}
                  onClick={() => setValue('0')}
                  disabled={blockedByTime}
                >
                  No
                </button>
              </div>
            </div>
          ) : selectedIndicator?.value_type === 'razon' ? (
            <div className="capture-label">
              Programado vs Real {selectedIndicator.unit && `(${selectedIndicator.unit})`}
              <div className="capture-razon">
                <label className="capture-razon__field">
                  Programado
                  <input
                    className="capture-value"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={plannedValue}
                    onChange={(e) => setPlannedValue(e.target.value)}
                    required
                    autoFocus
                    disabled={blockedByTime}
                  />
                </label>
                <label className="capture-razon__field">
                  Real
                  <input
                    className="capture-value"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={realValue}
                    onChange={(e) => setRealValue(e.target.value)}
                    required
                    disabled={blockedByTime}
                  />
                </label>
              </div>
              <span className="capture-razon__hint">
                Cumplimiento:{' '}
                {razonPercent !== null ? `${Math.round(razonPercent * 10) / 10}%` : 'escribe ambos valores'}
              </span>
            </div>
          ) : (
            <label className="capture-label">
              Valor {selectedIndicator && `(${selectedIndicator.unit})`}
              <input
                className="capture-value"
                type="number"
                inputMode="decimal"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
                disabled={blockedByTime}
              />
            </label>
          )}

          <label className="capture-label">
            Comentario (opcional)
            <textarea
              className="capture-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>

          {selectedIndicator && (
            <div className="capture-location">
              <span className="capture-location__title">¿Dónde ocurrió en la estructura organizacional?</span>

              {selectedIndicator.site_id ? (
                <>
                  <p className="capture-location__site">
                    Sitio: <strong>{selectedSite?.name ?? '—'}</strong>
                  </p>
                  {locationOptions.length > 0 ? (
                    <select
                      className="capture-select"
                      value={siteLocationId}
                      onChange={(e) => setSiteLocationId(e.target.value)}
                    >
                      <option value="">Todo el sitio (sin precisar instalación)</option>
                      {locationOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="capture-location__empty">
                      Este sitio no tiene instalaciones registradas todavía — la medición queda a nivel del sitio.
                      Puedes agregar instalaciones en <Link to="/estructura-organizacional">Estructura organizacional</Link>.
                    </p>
                  )}
                </>
              ) : (
                <p className="capture-location__site">
                  Indicador corporativo — no está atado a un sitio específico de la estructura.
                </p>
              )}
            </div>
          )}

          {message && <p className={`capture-message capture-message--${message.type}`}>{message.text}</p>}

          {deviation && (
            <div className="capture-deviation">
              Este valor está {deviation.estado === 'incumple' ? 'incumpliendo' : 'en riesgo frente a'} el objetivo.
              <Link to={`/analisis-causal/${indicatorId}?measurement=${deviation.measurementId}`}>
                Registrar análisis de causa
              </Link>
            </div>
          )}

          <button className="capture-submit" type="submit" disabled={saving || blockedByTime}>
            {saving ? 'Guardando…' : blockedByTime ? 'Captura bloqueada' : 'Guardar medición'}
          </button>
        </form>
      )}
    </div>
  )
}
