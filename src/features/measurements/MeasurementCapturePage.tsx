import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { Indicator, SemaforoEstado, SiteLocation } from '../../lib/types'
import { fetchCapturableIndicators, fetchMeasurementForPeriod, saveMeasurement } from './measurementsApi'
import { fetchCurrentTarget } from '../dashboard/dashboardApi'
import { fetchSiteLocations } from '../org-structure/orgStructureApi'
import { calcularSemaforo } from '../../lib/semaforo'
import './capture.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function MeasurementCapturePage() {
  const { profile, siteIds, organizationId } = useAuth()
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [indicatorId, setIndicatorId] = useState('')
  const [periodDate, setPeriodDate] = useState(today())
  const [value, setValue] = useState('')
  const [comment, setComment] = useState('')
  const [siteLocations, setSiteLocations] = useState<SiteLocation[]>([])
  const [siteLocationId, setSiteLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [deviation, setDeviation] = useState<{ estado: SemaforoEstado; measurementId: string } | null>(null)

  useEffect(() => {
    if (!profile || !organizationId) return
    fetchCapturableIndicators(profile, organizationId, siteIds).then((data) => {
      setIndicators(data)
      if (data.length && !indicatorId) setIndicatorId(data[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, organizationId, siteIds])

  const selectedIndicator = indicators.find((i) => i.id === indicatorId)

  useEffect(() => {
    if (!indicatorId || !periodDate) return
    fetchMeasurementForPeriod(indicatorId, periodDate).then((existing) => {
      setValue(existing ? String(existing.value) : '')
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
    setSaving(true)
    setMessage(null)
    setDeviation(null)
    try {
      await saveMeasurement({
        indicatorId,
        periodDate,
        value: Number(value),
        comment: comment || null,
        siteLocationId: siteLocationId || null,
        capturedBy: profile.id,
      })
      setMessage({ type: 'ok', text: 'Medición guardada correctamente.' })

      const now = new Date()
      const [saved, target] = await Promise.all([
        fetchMeasurementForPeriod(indicatorId, periodDate),
        fetchCurrentTarget(indicatorId, now.getFullYear(), now.getMonth() + 1),
      ])
      const estado = calcularSemaforo(Number(value), target?.target_value, selectedIndicator.improvement_direction)
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

      {indicators.length === 0 ? (
        <p>No tienes indicadores disponibles para capturar.</p>
      ) : (
        <form className="capture-form" onSubmit={handleSubmit}>
          <label className="capture-label">
            Indicador
            <select
              className="capture-select"
              value={indicatorId}
              onChange={(e) => setIndicatorId(e.target.value)}
            >
              {indicators.map((indicator) => (
                <option key={indicator.id} value={indicator.id}>
                  {indicator.name}
                </option>
              ))}
            </select>
          </label>

          <label className="capture-label">
            Fecha
            <input
              className="capture-date"
              type="date"
              value={periodDate}
              max={today()}
              onChange={(e) => setPeriodDate(e.target.value)}
            />
          </label>

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
            />
          </label>

          <label className="capture-label">
            Comentario (opcional)
            <textarea
              className="capture-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>

          {siteLocations.length > 0 && (
            <label className="capture-label">
              ¿Dónde ocurrió exactamente? (opcional)
              <select
                className="capture-select"
                value={siteLocationId}
                onChange={(e) => setSiteLocationId(e.target.value)}
              >
                <option value="">Sin precisar</option>
                {siteLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
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

          <button className="capture-submit" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar medición'}
          </button>
        </form>
      )}
    </div>
  )
}
