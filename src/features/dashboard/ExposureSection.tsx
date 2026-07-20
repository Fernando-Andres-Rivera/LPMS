import { useMemo, useState, type FormEvent } from 'react'
import { computeExposureDatesInMonth, nextExposureDate } from './exposureCalendar'
import { saveExposureSchedule } from './exposureScheduleApi'
import { WEEKDAY_LABEL, type ExposureFrequency, type ExposureSchedule } from '../../lib/types'

const MES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const WEEKDAY_SHORT = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const FREQUENCY_LABEL: Record<ExposureFrequency, string> = {
  semanal: 'Semanal',
  quincenal: 'Quincenal (cada 14 días)',
  mensual: 'Mensual',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${WEEKDAY_LABEL[d.getDay()]} ${d.getDate()} de ${MES_NOMBRE[d.getMonth()]} de ${d.getFullYear()}`
}

interface CalendarGridProps {
  schedule: ExposureSchedule
}

function CalendarGrid({ schedule }: CalendarGridProps) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const exposureDates = useMemo(
    () => new Set(computeExposureDatesInMonth(schedule, year, month)),
    [schedule, year, month],
  )

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  return (
    <div className="gdash-calendar">
      <div className="gdash-calendar__header">
        <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Mes anterior">
          ‹
        </button>
        <span>
          {MES_NOMBRE[month]} {year}
        </span>
        <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Mes siguiente">
          ›
        </button>
      </div>
      <div className="gdash-calendar__weekdays">
        {WEEKDAY_SHORT.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="gdash-calendar__grid">
        {cells.map((iso, i) => (
          <div
            key={i}
            className={`gdash-calendar__cell ${iso === null ? 'gdash-calendar__cell--empty' : ''} ${
              iso && exposureDates.has(iso) ? 'gdash-calendar__cell--exposure' : ''
            }`}
          >
            {iso && <span className="gdash-calendar__day">{Number(iso.slice(-2))}</span>}
            {iso && exposureDates.has(iso) && <span className="gdash-calendar__badge">Exposición</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

interface ScheduleFormProps {
  organizationId: string
  createdBy: string
  schedule: ExposureSchedule | null
  onSaved: (schedule: ExposureSchedule) => void
}

function ScheduleForm({ organizationId, createdBy, schedule, onSaved }: ScheduleFormProps) {
  const [frequency, setFrequency] = useState<ExposureFrequency>(schedule?.frequency ?? 'mensual')
  const [weekday, setWeekday] = useState(schedule?.weekday ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(schedule?.day_of_month ?? 1)
  const [startDate, setStartDate] = useState(schedule?.start_date ?? today())
  const [exposureTime, setExposureTime] = useState(schedule?.exposure_time?.slice(0, 5) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await saveExposureSchedule({
        organizationId,
        frequency,
        weekday: frequency === 'mensual' ? null : weekday,
        dayOfMonth: frequency === 'mensual' ? dayOfMonth : null,
        startDate,
        exposureTime: exposureTime || null,
        createdBy,
      })
      onSaved({
        id: schedule?.id ?? '',
        organization_id: organizationId,
        frequency,
        weekday: frequency === 'mensual' ? null : weekday,
        day_of_month: frequency === 'mensual' ? dayOfMonth : null,
        start_date: startDate,
        exposure_time: exposureTime ? `${exposureTime}:00` : null,
        created_by: createdBy,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la periodicidad.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="gdash-exposure-form" onSubmit={handleSubmit}>
      <label>
        Frecuencia
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExposureFrequency)}>
          {(['semanal', 'quincenal', 'mensual'] as ExposureFrequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
      </label>

      {frequency === 'mensual' ? (
        <label>
          Día del mes
          <input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
          />
        </label>
      ) : (
        <label>
          Día de la semana
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAY_LABEL.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        {frequency === 'quincenal' ? 'Fecha de la primera exposición (ancla)' : 'Vigente desde'}
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </label>

      <label>
        Hora (opcional)
        <input type="time" value={exposureTime} onChange={(e) => setExposureTime(e.target.value)} />
      </label>

      {error && <p className="gdash-error">{error}</p>}

      <div className="gdash-exposure-form__actions">
        <button type="submit" className="button-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar periodicidad'}
        </button>
      </div>
    </form>
  )
}

interface ExposureSectionProps {
  organizationId: string
  createdBy: string
  canEdit: boolean
  schedule: ExposureSchedule | null
  loading: boolean
  onSaved: (schedule: ExposureSchedule) => void
}

/**
 * Calendario de la periodicidad con la que se expone/revisa el Dashboard —
 * la define el expositor o el cliente (gerente/admin_cliente), es una sola
 * cadencia para toda la organización, no por pilar.
 */
export function ExposureSection({ organizationId, createdBy, canEdit, schedule, loading, onSaved }: ExposureSectionProps) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Abre el formulario (y despliega el bloque) solo la primera vez que se
  // confirma que no hay periodicidad configurada — ajuste de estado durante
  // el render, no en un efecto (mismo patrón que el resto del proyecto).
  const [autoOpenChecked, setAutoOpenChecked] = useState(false)
  if (!loading && !autoOpenChecked) {
    setAutoOpenChecked(true)
    if (!schedule && canEdit) {
      setEditing(true)
      setExpanded(true)
    }
  }

  const upcoming = schedule ? nextExposureDate(schedule, new Date()) : null

  return (
    <section className="gdash-exposure">
      <div className="gdash-exposure__header">
        <p className="gdash-exposure__summary">
          <strong>Exposición:</strong>{' '}
          {schedule ? (
            <>
              {FREQUENCY_LABEL[schedule.frequency]}
              {schedule.exposure_time && ` · ${schedule.exposure_time.slice(0, 5)}`}
              {upcoming && <> · Próxima: {formatLong(upcoming)}</>}
            </>
          ) : (
            'sin definir'
          )}
        </p>
        <div className="gdash-exposure__actions">
          <button type="button" className="gdash-exposure__toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Ocultar ▴' : 'Ver calendario ▾'}
          </button>
          {canEdit && !editing && (
            <button
              type="button"
              className="gdash-exposure__edit"
              onClick={() => {
                setEditing(true)
                setExpanded(true)
              }}
            >
              {schedule ? 'Editar' : 'Definir'}
            </button>
          )}
        </div>
      </div>

      {expanded &&
        (loading ? (
          <p>Cargando…</p>
        ) : (
          <div className="gdash-exposure__body">
            {editing && canEdit && (
              <ScheduleForm
                organizationId={organizationId}
                createdBy={createdBy}
                schedule={schedule}
                onSaved={(s) => {
                  onSaved(s)
                  setEditing(false)
                }}
              />
            )}
            {schedule && <CalendarGrid schedule={schedule} />}
          </div>
        ))}
    </section>
  )
}
