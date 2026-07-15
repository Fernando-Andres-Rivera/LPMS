import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { fetchLevelCutoffs, setLevelCutoff } from './captureCutoffsApi'
import { DAY_OFFSET_LABEL, type LevelCaptureCutoff } from '../../lib/types'
import './meeting-schedule.css'

const LEVELS: { level: 1 | 2 | 3; label: string }[] = [
  { level: 1, label: 'Nivel 1 — Operativo' },
  { level: 2, label: 'Nivel 2 — Administrativo' },
  { level: 3, label: 'Nivel 3 — Gerencial' },
]

const OFFSET_OPTIONS = [0, -1, -2, -3]

interface Draft {
  time: string
  offset: number
}

function draftsFromCutoffs(data: LevelCaptureCutoff[]): Record<number, Draft> {
  const drafts: Record<number, Draft> = {}
  for (const c of data) drafts[c.level] = { time: c.cutoff_time.slice(0, 5), offset: c.evaluated_day_offset }
  return drafts
}

export function MeetingScheduleConfigPage() {
  const { profile, organizationId } = useAuth()
  const [cutoffs, setCutoffs] = useState<LevelCaptureCutoff[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [savingLevel, setSavingLevel] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadAll() {
    if (!organizationId) return
    setLoading(true)
    const data = await fetchLevelCutoffs(organizationId)
    setCutoffs(data)
    setDrafts(draftsFromCutoffs(data))
    setLoading(false)
  }

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    fetchLevelCutoffs(organizationId).then((data) => {
      if (cancelled) return
      setCutoffs(data)
      setDrafts(draftsFromCutoffs(data))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [organizationId])

  function updateDraft(level: number, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [level]: { time: d[level]?.time ?? '', offset: d[level]?.offset ?? 0, ...patch } }))
  }

  async function handleSave(level: 1 | 2 | 3) {
    if (!profile || !organizationId) return
    const draft = drafts[level]
    if (!draft?.time?.trim()) return
    setSavingLevel(level)
    try {
      await setLevelCutoff({
        organizationId,
        level,
        cutoffTime: draft.time,
        evaluatedDayOffset: draft.offset,
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
      await setLevelCutoff({ organizationId, level, cutoffTime: null, evaluatedDayOffset: 0, createdBy: profile.id })
      await loadAll()
    } finally {
      setSavingLevel(null)
    }
  }

  if (loading) return <p>Cargando horario de reuniones…</p>

  return (
    <div className="meeting-schedule-page">
      <h1>Horario de reuniones</h1>
      <p className="page-subtitle">
        Cada nivel tiene su propia reunión: define a qué hora empieza y qué día evalúa — una reunión de hoy no
        siempre revisa el dato de hoy (ej. la gerencial de la mañana puede estar evaluando el cierre de ayer).
        Pasada esa hora, la captura del día evaluado se bloquea para indicadores de ese nivel; los días anteriores
        siguen disponibles para ponerse al día. Déjalo vacío si ese nivel no necesita bloqueo.
      </p>

      <div className="meeting-schedule-list">
        {LEVELS.map(({ level, label }) => {
          const current = cutoffs.find((c) => c.level === level)
          const draft = drafts[level] ?? { time: '', offset: 0 }
          return (
            <section key={level} className="meeting-schedule-card">
              <h2>{label}</h2>
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
              <div className="meeting-schedule-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => handleSave(level)}
                  disabled={savingLevel === level || !draft.time.trim()}
                >
                  {savingLevel === level ? 'Guardando…' : 'Guardar'}
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
                  Hoy a las {current.cutoff_time.slice(0, 5)}, se bloquea la captura del{' '}
                  {DAY_OFFSET_LABEL[current.evaluated_day_offset]?.toLowerCase() ?? 'día evaluado'} para este nivel.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
