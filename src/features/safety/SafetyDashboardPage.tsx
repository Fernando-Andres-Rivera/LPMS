import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { PeriodSelector, type Period } from '../../components/ui/PeriodSelector'
import { fetchSites } from '../indicators/indicatorsApi'
import {
  computeDaysWithoutAccidents,
  computeHeinrichPyramid,
  computeMonthlyStats,
  computeSafetyCross,
  createSafetyEvent,
  deleteSafetyEvent,
  fetchLatestAccident,
  fetchSafetyEventsInRange,
  setSiteOperationStartDate,
} from './safetyApi'
import { SafetyCross } from './SafetyCross'
import { HeinrichPyramid } from './HeinrichPyramid'
import {
  ACCIDENT_SEVERITY_LABEL,
  SAFETY_EVENT_TYPE_LABEL,
  type AccidentSeverity,
  type SafetyEvent,
  type SafetyEventType,
  type Site,
} from '../../lib/types'
import './safety.css'

const EVENT_TYPES: SafetyEventType[] = ['accidente', 'incidente', 'acto_inseguro', 'condicion_insegura']
const SEVERITIES: AccidentSeverity[] = ['fatal', 'serio', 'leve']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthRange(year: number, month: number): { start: string; endExclusive: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1)
  return { start, endExclusive: endDate.toISOString().slice(0, 10) }
}

export function SafetyDashboardPage() {
  const { profile, organizationId, siteIds } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [period, setPeriod] = useState<Period>({ year: now.getFullYear(), month: now.getMonth() + 1 })

  const [monthEvents, setMonthEvents] = useState<SafetyEvent[]>([])
  const [yearEvents, setYearEvents] = useState<SafetyEvent[]>([])
  const [daysWithoutAccidents, setDaysWithoutAccidents] = useState<number | null>(null)
  const [operationStartDate, setOperationStartDateValue] = useState('')
  const [lastSiteId, setLastSiteId] = useState('')
  const [lastLoadKey, setLastLoadKey] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [eventType, setEventType] = useState<SafetyEventType>('accidente')
  const [eventDate, setEventDate] = useState(today())
  const [severity, setSeverity] = useState<AccidentSeverity>('leve')
  const [disabilityDays, setDisabilityDays] = useState('')
  const [workersAffected, setWorkersAffected] = useState('1')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    fetchSites(organizationId).then((data) => {
      const visible =
        profile && ['administrativo', 'operativo'].includes(profile.role)
          ? data.filter((s) => siteIds.includes(s.id))
          : data
      setSites(visible)
      if (visible.length && !siteId) setSiteId(visible[0].id)
      // Sin sitios no hay nada más que cargar — evita que la página se quede
      // en "Cargando…" para siempre esperando un siteId que nunca llega.
      else if (!visible.length) setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, profile, siteIds])

  const selectedSite = sites.find((s) => s.id === siteId) ?? null
  const loadKey = `${siteId}|${period.year}|${period.month}`

  // Resetea el campo de fecha de inicio de operación (al cambiar de sitio) y
  // vuelve a mostrar "Cargando…" (al cambiar sitio o período) — ajuste de
  // estado durante el render, no en un efecto (ver AppLayout.tsx para el
  // mismo patrón).
  if (siteId !== lastSiteId) {
    setLastSiteId(siteId)
    setOperationStartDateValue(selectedSite?.operation_start_date ?? '')
  }
  if (siteId && loadKey !== lastLoadKey) {
    setLastLoadKey(loadKey)
    setLoading(true)
    setLoadError(null)
  }

  async function fetchSafetyData(): Promise<{
    monthEvents: SafetyEvent[]
    yearEvents: SafetyEvent[]
    daysWithoutAccidents: number | null
  }> {
    const { start, endExclusive } = monthRange(period.year, period.month)
    const yearRange = monthRange(period.year, 12)
    const [monthData, yearData, latestAccident] = await Promise.all([
      fetchSafetyEventsInRange(siteId, start, endExclusive),
      fetchSafetyEventsInRange(siteId, `${period.year}-01-01`, yearRange.endExclusive),
      fetchLatestAccident(siteId),
    ])
    return {
      monthEvents: monthData,
      yearEvents: yearData,
      daysWithoutAccidents: computeDaysWithoutAccidents(
        selectedSite?.operation_start_date ?? null,
        latestAccident?.event_date ?? null,
      ),
    }
  }

  async function loadAll() {
    if (!siteId) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchSafetyData()
      setMonthEvents(data.monthEvents)
      setYearEvents(data.yearEvents)
      setDaysWithoutAccidents(data.daysWithoutAccidents)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la información de seguridad.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!siteId) return
    let cancelled = false
    fetchSafetyData()
      .then((data) => {
        if (cancelled) return
        setMonthEvents(data.monthEvents)
        setYearEvents(data.yearEvents)
        setDaysWithoutAccidents(data.daysWithoutAccidents)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la información de seguridad.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, period, selectedSite?.operation_start_date])

  async function handleSaveOperationStart() {
    if (!siteId) return
    await setSiteOperationStartDate(siteId, operationStartDate || null)
    setSites((current) =>
      current.map((s) => (s.id === siteId ? { ...s, operation_start_date: operationStartDate || null } : s)),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !organizationId || !siteId) return
    setSaving(true)
    setError(null)
    try {
      await createSafetyEvent({
        organizationId,
        siteId,
        eventType,
        eventDate,
        severity: eventType === 'accidente' ? severity : null,
        disabilityDays: eventType === 'accidente' && disabilityDays.trim() ? Number(disabilityDays) : null,
        workersAffected: eventType === 'accidente' && workersAffected.trim() ? Number(workersAffected) : null,
        description: description.trim() || null,
        createdBy: profile.id,
      })
      setEventDate(today())
      setDisabilityDays('')
      setWorkersAffected('1')
      setDescription('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el evento.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteEvent(id: string) {
    await deleteSafetyEvent(id)
    await loadAll()
  }

  if (sites.length === 0 && !loading) {
    return <p>No tienes sitios disponibles para el módulo de seguridad.</p>
  }

  if (loadError) {
    return <p className="safety-error">No se pudo cargar el módulo de seguridad: {loadError}</p>
  }

  const crossColors = computeSafetyCross(monthEvents, period.year, period.month)
  const monthlyStats = computeMonthlyStats(monthEvents)
  const pyramid = computeHeinrichPyramid(yearEvents)

  return (
    <div className="safety-page">
      <h1>Seguridad y Salud en el Trabajo</h1>
      <p className="page-subtitle">
        Cada sitio lleva su propio conteo. Registra un accidente, incidente, acto o condición insegura con su fecha
        y el resto (días sin accidentes, cruz de seguridad, pirámide) se calcula solo.
      </p>

      <div className="safety-filters">
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <PeriodSelector value={period} onChange={setPeriod} yearsBack={2} />
      </div>

      {!selectedSite?.operation_start_date && (
        <div className="safety-operation-start">
          <span>Este sitio no tiene fecha de inicio de operación configurada — "días sin accidentes" no se puede calcular hasta que la definas.</span>
          <input type="date" value={operationStartDate} onChange={(e) => setOperationStartDateValue(e.target.value)} />
          <button type="button" onClick={handleSaveOperationStart} disabled={!operationStartDate}>
            Guardar
          </button>
        </div>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <div className="safety-top-row">
            <div className="safety-counter">
              <span className="safety-counter__label">HOY CUMPLIMOS</span>
              <span className="safety-counter__value">{daysWithoutAccidents ?? '—'}</span>
              <span className="safety-counter__label">Días sin accidentes</span>
            </div>

            <table className="safety-kpi-table">
              <tbody>
                <tr>
                  <th>Mes</th>
                  <td>
                    {period.month}/{period.year}
                  </td>
                </tr>
                <tr>
                  <th>Total trabajadores accidentados</th>
                  <td>{monthlyStats.workersInjured}</td>
                </tr>
                <tr>
                  <th>Días de ausentismo por incapacidad AT</th>
                  <td>{monthlyStats.disabilityDays}</td>
                </tr>
              </tbody>
            </table>

            <SafetyCross year={period.year} month={period.month} colors={crossColors} />
          </div>

          <div className="safety-second-row">
            <HeinrichPyramid data={pyramid} />

            <div className="safety-unsafe-counters">
              <div className="safety-unsafe-counter">
                <span>Actos inseguros reportados</span>
                <strong>{monthlyStats.unsafeActsReported}</strong>
              </div>
              <div className="safety-unsafe-counter">
                <span>Condiciones inseguras reportadas</span>
                <strong>{monthlyStats.unsafeConditionsReported}</strong>
              </div>
              <p className="safety-summary">
                Accidentes presentados en el mes: {monthlyStats.accidentCount}
                <br />
                Días de incapacidad totales: {monthlyStats.disabilityDays}
              </p>
            </div>
          </div>

          <section className="safety-card">
            <h2>Registrar evento</h2>
            <form className="safety-form" onSubmit={handleSubmit}>
              <div className="safety-form__row">
                <label>
                  Tipo
                  <select value={eventType} onChange={(e) => setEventType(e.target.value as SafetyEventType)}>
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SAFETY_EVENT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha
                  <input type="date" value={eventDate} max={today()} onChange={(e) => setEventDate(e.target.value)} />
                </label>
              </div>

              {eventType === 'accidente' && (
                <div className="safety-form__row">
                  <label>
                    Severidad
                    <select value={severity} onChange={(e) => setSeverity(e.target.value as AccidentSeverity)}>
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {ACCIDENT_SEVERITY_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Días de incapacidad
                    <input
                      type="number"
                      min="0"
                      value={disabilityDays}
                      onChange={(e) => setDisabilityDays(e.target.value)}
                    />
                  </label>
                  <label>
                    Trabajadores afectados
                    <input
                      type="number"
                      min="1"
                      value={workersAffected}
                      onChange={(e) => setWorkersAffected(e.target.value)}
                    />
                  </label>
                </div>
              )}

              <label>
                Descripción (opcional)
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>

              {error && <p className="safety-error">{error}</p>}

              <div className="safety-form__actions">
                <button type="submit" className="button-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Registrar evento'}
                </button>
              </div>
            </form>
          </section>

          <section className="safety-card">
            <h2>Eventos del mes</h2>
            {monthEvents.length === 0 && <p>Sin eventos registrados este mes.</p>}
            <ul className="safety-event-list">
              {monthEvents.map((ev) => (
                <li key={ev.id}>
                  <span className={`safety-event-tag safety-event-tag--${ev.event_type}`}>
                    {SAFETY_EVENT_TYPE_LABEL[ev.event_type]}
                  </span>
                  <span>{ev.event_date}</span>
                  {ev.severity && <span>{ACCIDENT_SEVERITY_LABEL[ev.severity]}</span>}
                  {ev.description && <span className="safety-event-list__description">{ev.description}</span>}
                  <button type="button" onClick={() => handleDeleteEvent(ev.id)}>
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
