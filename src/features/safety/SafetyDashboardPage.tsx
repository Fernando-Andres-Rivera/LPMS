import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { RangePicker } from '../../components/ui/RangePicker'
import { defaultRange } from '../../lib/dateRange'
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
import { PageHeader } from '../../components/ui/PageHeader'
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
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [formSiteId, setFormSiteId] = useState('')
  const [loading, setLoading] = useState(true)

  const [referenceDate, setReferenceDate] = useState(today())
  const refDate = new Date(`${referenceDate}T00:00:00`)
  const refYear = refDate.getFullYear()
  const refMonth = refDate.getMonth() + 1

  const [range, setRange] = useState(defaultRange())

  const [monthEvents, setMonthEvents] = useState<SafetyEvent[]>([])
  const [yearEvents, setYearEvents] = useState<SafetyEvent[]>([])
  const [rangeEvents, setRangeEvents] = useState<SafetyEvent[]>([])
  const [daysWithoutAccidents, setDaysWithoutAccidents] = useState<number | null>(null)
  const [pendingStartDates, setPendingStartDates] = useState<Record<string, string>>({})
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
      if (visible.length) {
        setSelectedSiteIds((current) =>
          current.length ? current.filter((id) => visible.some((s) => s.id === id)) : visible.map((s) => s.id),
        )
        setFormSiteId((current) => (current && visible.some((s) => s.id === current) ? current : visible[0].id))
      } else {
        // Sin sitios no hay nada más que cargar — evita que la página se quede
        // en "Cargando…" para siempre esperando sitios que nunca llegan.
        setLoading(false)
      }
    })
  }, [organizationId, profile, siteIds])

  const selectedSites = sites.filter((s) => selectedSiteIds.includes(s.id))
  const sortedSelection = [...selectedSiteIds].sort().join(',')
  const loadKey = `${sortedSelection}|${referenceDate}|${range.from}|${range.to}`

  // Vuelve a mostrar "Cargando…" cuando cambia la selección de sitios o la
  // fecha de referencia — ajuste de estado durante el render, no en un
  // efecto (ver AppLayout.tsx para el mismo patrón).
  if (sites.length > 0 && loadKey !== lastLoadKey) {
    setLastLoadKey(loadKey)
    setLoading(true)
    setLoadError(null)
  }

  async function fetchSafetyData(): Promise<{
    monthEvents: SafetyEvent[]
    yearEvents: SafetyEvent[]
    rangeEvents: SafetyEvent[]
    daysWithoutAccidents: number | null
  }> {
    if (selectedSiteIds.length === 0) {
      return { monthEvents: [], yearEvents: [], rangeEvents: [], daysWithoutAccidents: null }
    }
    const { start, endExclusive } = monthRange(refYear, refMonth)
    const yearRange = monthRange(refYear, 12)
    const rangeEndExclusive = (() => {
      const d = new Date(`${range.to}T00:00:00`)
      d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    })()
    const [monthData, yearData, rangeData, latestAccident] = await Promise.all([
      fetchSafetyEventsInRange(selectedSiteIds, start, endExclusive),
      fetchSafetyEventsInRange(selectedSiteIds, `${refYear}-01-01`, yearRange.endExclusive),
      fetchSafetyEventsInRange(selectedSiteIds, range.from, rangeEndExclusive),
      fetchLatestAccident(selectedSiteIds),
    ])
    // Con varios sitios seleccionados, la base "sin accidentes" es el sitio
    // que arrancó operación más tarde — no se puede reclamar como seguro un
    // tramo en el que ese sitio todavía no operaba.
    const starts = selectedSites.map((s) => s.operation_start_date).filter((d): d is string => !!d)
    const operationStartBase = starts.length ? starts.sort().at(-1)! : null
    return {
      monthEvents: monthData,
      yearEvents: yearData,
      rangeEvents: rangeData,
      daysWithoutAccidents: computeDaysWithoutAccidents(
        operationStartBase,
        latestAccident?.event_date ?? null,
        refDate,
      ),
    }
  }

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchSafetyData()
      setMonthEvents(data.monthEvents)
      setYearEvents(data.yearEvents)
      setRangeEvents(data.rangeEvents)
      setDaysWithoutAccidents(data.daysWithoutAccidents)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la información de seguridad.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sites.length === 0) return
    let cancelled = false
    fetchSafetyData()
      .then((data) => {
        if (cancelled) return
        setMonthEvents(data.monthEvents)
        setYearEvents(data.yearEvents)
        setRangeEvents(data.rangeEvents)
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
  }, [sortedSelection, referenceDate, range, sites])

  function toggleSite(id: string) {
    setSelectedSiteIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]))
  }

  async function handleSaveOperationStart(siteId: string) {
    const value = pendingStartDates[siteId]
    if (!value) return
    await setSiteOperationStartDate(siteId, value)
    setSites((current) => current.map((s) => (s.id === siteId ? { ...s, operation_start_date: value } : s)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !organizationId || !formSiteId) return
    setSaving(true)
    setError(null)
    try {
      await createSafetyEvent({
        organizationId,
        siteId: formSiteId,
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

  const crossColors = computeSafetyCross(monthEvents, refYear, refMonth, refDate)
  const monthlyStats = computeMonthlyStats(monthEvents)
  const pyramid = computeHeinrichPyramid(yearEvents)
  const sitesMissingStart = selectedSites.filter((s) => !s.operation_start_date)

  return (
    <div className="safety-page">
      <PageHeader
        eyebrow="Diario · Seguridad y salud"
        title="Seguridad y Salud en el Trabajo"
        subtitle="Cada sitio lleva su propio conteo. Registra un accidente, incidente, acto o condición insegura con su fecha y el resto (días sin accidentes, cruz de seguridad, pirámide) se calcula solo."
      />

      <div className="safety-filters">
        <div className="safety-site-filter">
          <button
            type="button"
            className={`safety-site-chip safety-site-chip--all${
              selectedSiteIds.length === sites.length ? ' safety-site-chip--active' : ''
            }`}
            onClick={() => setSelectedSiteIds(sites.map((s) => s.id))}
          >
            Todos los sitios
          </button>
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              className={`safety-site-chip${selectedSiteIds.includes(site.id) ? ' safety-site-chip--active' : ''}`}
              onClick={() => toggleSite(site.id)}
            >
              {site.name}
            </button>
          ))}
        </div>
        <label className="safety-date-filter">
          Fecha de referencia
          <input type="date" value={referenceDate} max={today()} onChange={(e) => setReferenceDate(e.target.value)} />
        </label>
      </div>

      {selectedSiteIds.length === 0 && <p className="safety-error">Selecciona al menos un sitio para ver los datos.</p>}

      {sitesMissingStart.length > 0 && (
        <div className="safety-operation-start">
          <span>
            Estos sitios no tienen fecha de inicio de operación configurada — "días sin accidentes" no los tiene en
            cuenta hasta que la definas:
          </span>
          {sitesMissingStart.map((site) => (
            <div key={site.id} className="safety-operation-start__row">
              <span>{site.name}</span>
              <input
                type="date"
                value={pendingStartDates[site.id] ?? ''}
                onChange={(e) => setPendingStartDates((cur) => ({ ...cur, [site.id]: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => handleSaveOperationStart(site.id)}
                disabled={!pendingStartDates[site.id]}
              >
                Guardar
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <div className="safety-summary-row">
            <div className="safety-counter">
              <span className="safety-counter__label">CUMPLIMOS AL {referenceDate}</span>
              <span className="safety-counter__value">{daysWithoutAccidents ?? '—'}</span>
              <span className="safety-counter__label">Días sin accidentes</span>
            </div>

            <div className="safety-stats-grid">
              <div className="safety-stat">
                <span className="safety-stat__value">
                  {refMonth}/{refYear}
                </span>
                <span className="safety-stat__label">Mes evaluado</span>
              </div>
              <div className="safety-stat">
                <span className="safety-stat__value">{monthlyStats.accidentCount}</span>
                <span className="safety-stat__label">Accidentes del mes</span>
              </div>
              <div className="safety-stat">
                <span className="safety-stat__value">{monthlyStats.workersInjured}</span>
                <span className="safety-stat__label">Trabajadores accidentados</span>
              </div>
              <div className="safety-stat">
                <span className="safety-stat__value">{monthlyStats.disabilityDays}</span>
                <span className="safety-stat__label">Días de incapacidad</span>
              </div>
              <div className="safety-stat">
                <span className="safety-stat__value">{monthlyStats.unsafeActsReported}</span>
                <span className="safety-stat__label">Actos inseguros</span>
              </div>
              <div className="safety-stat">
                <span className="safety-stat__value">{monthlyStats.unsafeConditionsReported}</span>
                <span className="safety-stat__label">Condiciones inseguras</span>
              </div>
            </div>

            <SafetyCross year={refYear} month={refMonth} colors={crossColors} />
          </div>

          <section className="safety-card">
            <h2>Pirámide de Heinrich</h2>
            <HeinrichPyramid data={pyramid} />
          </section>

          <section className="safety-card">
            <h2>Registrar evento</h2>
            <form className="safety-form" onSubmit={handleSubmit}>
              <div className="safety-form__row">
                <label>
                  Sitio
                  <select value={formSiteId} onChange={(e) => setFormSiteId(e.target.value)}>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
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
            <div className="safety-card__header">
              <h2>Eventos</h2>
              <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
            </div>
            {rangeEvents.length === 0 && <p>Sin eventos registrados en este rango.</p>}
            <ul className="safety-event-list">
              {rangeEvents.map((ev) => (
                <li key={ev.id}>
                  <span className={`safety-event-tag safety-event-tag--${ev.event_type}`}>
                    {SAFETY_EVENT_TYPE_LABEL[ev.event_type]}
                  </span>
                  <span>{ev.event_date}</span>
                  <span className="safety-event-list__site">{sites.find((s) => s.id === ev.site_id)?.name}</span>
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
