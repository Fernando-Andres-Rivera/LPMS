import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { fetchLevelCutoffs, setLevelCutoff } from './captureCutoffsApi'
import { fetchSites } from '../indicators/indicatorsApi'
import { DAY_OFFSET_LABEL, WEEKDAY_OPTIONS, type LevelCaptureCutoff, type Site } from '../../lib/types'
import { PageHeader } from '../../components/ui/PageHeader'
import './meeting-schedule.css'

const LEVELS: { level: 1 | 2 | 3; label: string }[] = [
  { level: 1, label: 'Nivel 1 — Operativo' },
  { level: 2, label: 'Nivel 2 — Administrativo' },
  { level: 3, label: 'Nivel 3 — Gerencial' },
]

const OFFSET_OPTIONS = [0, -1, -2, -3]

// Lunes a sábado por defecto para un nivel recién configurado — el caso más
// común en operaciones industriales; el usuario quita los días que no
// aplican con un clic (ej. dejar solo lunes y viernes).
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5, 6]

interface Draft {
  time: string
  offset: number
  weekdays: number[]
}

function draftsFromCutoffs(data: LevelCaptureCutoff[]): Record<number, Draft> {
  const drafts: Record<number, Draft> = {}
  for (const c of data) {
    drafts[c.level] = {
      time: c.cutoff_time.slice(0, 5),
      offset: c.evaluated_day_offset,
      weekdays: c.weekdays,
    }
  }
  return drafts
}

/** "Lun-Vie", "Lun, Mié y Vie", etc. — un resumen legible del patrón elegido,
 * en el mismo orden en que se muestran los botones (lunes primero). */
function summarizeWeekdays(weekdays: number[]): string {
  const ordered = WEEKDAY_OPTIONS.filter((opt) => weekdays.includes(opt.value))
  if (ordered.length === 0) return 'ningún día'
  if (ordered.length === 7) return 'todos los días'

  // Detecta un tramo continuo (ej. lunes a viernes) en el orden de la semana.
  const values = ordered.map((opt) => opt.value)
  const weekOrder = WEEKDAY_OPTIONS.map((opt) => opt.value)
  const indices = values.map((v) => weekOrder.indexOf(v))
  const isConsecutive = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1)
  if (isConsecutive && ordered.length > 1) {
    return `${ordered[0].label}-${ordered[ordered.length - 1].label}`
  }
  return ordered.map((opt) => opt.label).join(', ')
}

/** Resumen de un horario ya guardado, para mostrar tanto el propio de un
 * sitio como el general del que hereda por defecto. */
function summarizeCutoff(cutoff: LevelCaptureCutoff): string {
  return `${summarizeWeekdays(cutoff.weekdays)}, a las ${cutoff.cutoff_time.slice(0, 5)} (evalúa el ${DAY_OFFSET_LABEL[
    cutoff.evaluated_day_offset
  ]?.toLowerCase() ?? 'día evaluado'})`
}

export function MeetingScheduleConfigPage() {
  const { profile, organizationId } = useAuth()
  const [allCutoffs, setAllCutoffs] = useState<LevelCaptureCutoff[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [savingLevel, setSavingLevel] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // El horario general (site_id nulo) siempre aplica de fallback cuando el
  // sitio elegido no tiene uno propio configurado para ese nivel.
  const generalCutoffs = allCutoffs.filter((c) => c.site_id === null)
  const cutoffsForSelected = allCutoffs.filter((c) => c.site_id === selectedSiteId)

  async function loadAll() {
    if (!organizationId) return
    const data = await fetchLevelCutoffs(organizationId)
    setAllCutoffs(data)
  }

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    Promise.all([fetchLevelCutoffs(organizationId), fetchSites(organizationId)]).then(([cutoffsData, sitesData]) => {
      if (cancelled) return
      setAllCutoffs(cutoffsData)
      setSites(sitesData)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    setDrafts(draftsFromCutoffs(cutoffsForSelected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId, allCutoffs])

  function updateDraft(level: number, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [level]: {
        time: d[level]?.time ?? '',
        offset: d[level]?.offset ?? 0,
        weekdays: d[level]?.weekdays ?? DEFAULT_WEEKDAYS,
        ...patch,
      },
    }))
  }

  function toggleWeekday(level: number, day: number) {
    const current = drafts[level]?.weekdays ?? DEFAULT_WEEKDAYS
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    updateDraft(level, { weekdays: next })
  }

  async function handleSave(level: 1 | 2 | 3) {
    if (!profile || !organizationId) return
    const draft = drafts[level]
    if (!draft?.time?.trim()) return
    if (draft.weekdays.length === 0) return
    setSavingLevel(level)
    try {
      await setLevelCutoff({
        organizationId,
        level,
        siteId: selectedSiteId,
        cutoffTime: draft.time,
        evaluatedDayOffset: draft.offset,
        weekdays: draft.weekdays,
        createdBy: profile.id,
      })
      await loadAll()
    } finally {
      setSavingLevel(null)
    }
  }

  async function handleClear(level: 1 | 2 | 3) {
    if (!profile || !organizationId) return
    setSavingLevel(level)
    try {
      await setLevelCutoff({
        organizationId,
        level,
        siteId: selectedSiteId,
        cutoffTime: null,
        evaluatedDayOffset: 0,
        weekdays: [],
        createdBy: profile.id,
      })
      await loadAll()
    } finally {
      setSavingLevel(null)
    }
  }

  if (loading) return <p>Cargando horario de reuniones…</p>

  return (
    <div className="meeting-schedule-page">
      <PageHeader
        eyebrow="Configuración · Horario"
        title="Horario de reuniones"
        subtitle="Cada nivel tiene su propia reunión: define a qué hora empieza y qué día evalúa — una reunión de hoy no siempre revisa el dato de hoy (ej. la gerencial de la mañana puede estar evaluando el cierre de ayer). Pasada esa hora, esa fecha (y todas las anteriores) quedan cerradas para siempre para indicadores de ese nivel — no se reabren al día siguiente. Solo LeanProLogistic puede autorizar una corrección puntual, con causal, desde Captura de mediciones. Déjalo vacío si ese nivel no necesita bloqueo."
      />

      {sites.length > 0 && (
        <div className="meeting-schedule-site-row">
          <label className="meeting-schedule-site-label">
            Sitio
            <select
              className="meeting-schedule-site-select"
              value={selectedSiteId ?? ''}
              onChange={(e) => setSelectedSiteId(e.target.value || null)}
            >
              <option value="">General (todos los sitios sin horario propio)</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          {selectedSiteId && (
            <p className="meeting-schedule-site-hint">
              Este horario aplica solo a este sitio. Un nivel sin horario propio aquí sigue usando el horario General.
            </p>
          )}
        </div>
      )}

      <div className="meeting-schedule-list">
        {LEVELS.map(({ level, label }) => {
          const current = cutoffsForSelected.find((c) => c.level === level)
          const fallback = selectedSiteId ? generalCutoffs.find((c) => c.level === level) : undefined
          const draft = drafts[level] ?? { time: '', offset: 0, weekdays: DEFAULT_WEEKDAYS }
          return (
            <section key={level} className="meeting-schedule-card">
              <h2>{label}</h2>

              {selectedSiteId && !current && (
                <p className="meeting-schedule-fallback">
                  {fallback
                    ? `Este sitio usa el horario General: ${summarizeCutoff(fallback)}.`
                    : 'Este sitio no tiene horario propio ni hay un horario General configurado para este nivel — sin bloqueo de captura.'}
                </p>
              )}

              <div className="meeting-schedule-row">
                <label>
                  Hora de inicio de la reunión
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(e) => updateDraft(level, { time: e.target.value })}
                  />
                </label>
                <label>
                  Qué día evalúa
                  <select
                    value={draft.offset}
                    onChange={(e) => updateDraft(level, { offset: Number(e.target.value) })}
                  >
                    {OFFSET_OPTIONS.map((offset) => (
                      <option key={offset} value={offset}>
                        {DAY_OFFSET_LABEL[offset]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="meeting-schedule-weekdays">
                <span className="meeting-schedule-weekdays__label">Qué días de la semana se reúne</span>
                <div className="meeting-schedule-weekdays__grid">
                  {WEEKDAY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`meeting-schedule-weekday ${draft.weekdays.includes(opt.value) ? 'active' : ''}`}
                      onClick={() => toggleWeekday(level, opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {draft.weekdays.length === 0 && (
                  <span className="meeting-schedule-weekdays__warning">Elige al menos un día para guardar.</span>
                )}
              </div>
              <div className="meeting-schedule-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => handleSave(level)}
                  disabled={savingLevel === level || !draft.time.trim() || draft.weekdays.length === 0}
                >
                  {savingLevel === level ? 'Guardando…' : selectedSiteId ? 'Guardar horario de este sitio' : 'Guardar'}
                </button>
                {current && (
                  <button
                    type="button"
                    className="meeting-schedule-clear"
                    onClick={() => handleClear(level)}
                    disabled={savingLevel === level}
                  >
                    Quitar bloqueo
                  </button>
                )}
              </div>
              {current && (
                <p className="meeting-schedule-summary">
                  {summarizeWeekdays(current.weekdays)}, a las {current.cutoff_time.slice(0, 5)}, se cierra para
                  siempre la captura del{' '}
                  {DAY_OFFSET_LABEL[current.evaluated_day_offset]?.toLowerCase() ?? 'día evaluado'} (y de cualquier
                  fecha anterior) para este nivel{selectedSiteId ? ' en este sitio' : ''}.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
