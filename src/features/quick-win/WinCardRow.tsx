import { useState } from 'react'
import type { Axis, Profile } from '../../lib/types'
import type { QuickWinCandidateWithNames } from './quickWinApi'

export interface WinRowValues {
  axisId: string
  description: string
  responsibleId: string | null
  executionTime: string | null
}

interface WinCardRowProps {
  /** Número de la fila en la tarjeta (WIN#1, WIN#2, …). */
  position: number
  /** null = la fila todavía está vacía y se llenará en la reunión. */
  candidate: QuickWinCandidateWithNames | null
  pillars: Axis[]
  profiles: Profile[]
  isChosen: boolean
  /** null si esta fila ya no es decisión de este nivel (win escalado). */
  onChoose: (() => void) | null
  /** Crea el win si la fila estaba vacía, o actualiza el que ya existe. */
  onSave: (values: WinRowValues) => Promise<void>
  canDelete: boolean
  onDelete: (() => void) | null
  /** Si se pasa, la fila vive en la pestaña de ESE pilar — no tiene sentido
   * volver a elegirlo, así que el selector no se muestra y cada win nuevo
   * se crea directo en él. */
  lockedAxisId?: string
}

/**
 * Una fila de la WIN CARD, editable en el momento — como se llena la tarjeta
 * física en la reunión: se escribe directo sobre el renglón y cada campo se
 * guarda al salir de él, sin abrir formularios aparte.
 *
 * El pilar es obligatorio en la base (axis_id NOT NULL), así que una fila
 * vacía solo se convierte en win cuando ya tiene pilar y descripción; hasta
 * entonces lo escrito vive solo aquí.
 */
export function WinCardRow({
  position,
  candidate,
  pillars,
  profiles,
  isChosen,
  onChoose,
  onSave,
  canDelete,
  onDelete,
  lockedAxisId,
}: WinCardRowProps) {
  const [axisId, setAxisId] = useState(lockedAxisId ?? candidate?.axis_id ?? '')
  const [description, setDescription] = useState(candidate?.description ?? '')
  const [responsibleId, setResponsibleId] = useState(candidate?.responsible_id ?? '')
  // El input type="time" trabaja en HH:MM; la base guarda HH:MM:SS.
  const [executionTime, setExecutionTime] = useState(candidate?.execution_time?.slice(0, 5) ?? '')
  const [saving, setSaving] = useState(false)

  async function commit(next: Partial<WinRowValues> = {}) {
    const values: WinRowValues = {
      axisId: next.axisId ?? axisId,
      description: next.description ?? description,
      responsibleId: next.responsibleId ?? (responsibleId || null),
      executionTime: next.executionTime ?? (executionTime || null),
    }
    // Sin pilar y descripción no hay fila que guardar todavía.
    if (!values.axisId || !values.description.trim()) return
    setSaving(true)
    try {
      await onSave(values)
    } finally {
      setSaving(false)
    }
  }

  const axisColor = pillars.find((p) => p.id === axisId)?.color

  return (
    <div className={`win-card__win-row${isChosen ? ' win-card__win-row--chosen' : ''}`}>
      <div className="win-card__win-label">
        <span className="win-card__win-number">WIN#{position}</span>
        {onChoose ? (
          <button
            type="button"
            className={`win-card__choose${isChosen ? ' win-card__choose--on' : ''}`}
            onClick={onChoose}
            disabled={!candidate}
            title={!candidate ? 'Escribe el win antes de elegirlo' : undefined}
          >
            {isChosen ? '● Elegido' : '○ Elegir'}
          </button>
        ) : (
          candidate && <span className="win-card__win-escalated">↑ Nivel {candidate.level}</span>
        )}
      </div>

      <div className="win-card__win-body">
        {!lockedAxisId && (
          <select
            className="win-card__win-axis"
            value={axisId}
            style={axisColor ? { color: axisColor, fontWeight: 700 } : undefined}
            onChange={(e) => {
              setAxisId(e.target.value)
              commit({ axisId: e.target.value })
            }}
            aria-label={`Pilar del win ${position}`}
          >
            <option value="">Pilar…</option>
            {pillars.map((axis) => (
              <option key={axis.id} value={axis.id}>
                {axis.name}
              </option>
            ))}
          </select>
        )}
        {/* El texto del win es lo más importante de la tarjeta: va en un
            textarea, no en un input de una línea, para que se pueda escribir
            y leer completo sin recortes. */}
        <textarea
          className="win-card__win-text"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => commit()}
          placeholder={position === 1 ? 'Describe el win que se puede cerrar hoy…' : ''}
          aria-label={`Descripción del win ${position}`}
        />
      </div>

      <div className="win-card__win-cell">
        {/* El encabezado de columnas se oculta en móvil (no cabe la grilla
            de 5 columnas), así que esta etiqueta es la única forma de saber
            qué se registra en esta casilla ahí — en escritorio queda oculta
            por ser redundante con el encabezado. */}
        <span className="win-card__win-cell-label">Responsable</span>
        <select
          value={responsibleId}
          onChange={(e) => {
            setResponsibleId(e.target.value)
            commit({ responsibleId: e.target.value || null })
          }}
          aria-label={`Responsable del win ${position}`}
        >
          <option value="">—</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="win-card__win-cell">
        <span className="win-card__win-cell-label">Hora de bouclage</span>
        <input
          type="time"
          value={executionTime}
          onChange={(e) => {
            setExecutionTime(e.target.value)
            commit({ executionTime: e.target.value || null })
          }}
          aria-label={`Hora de bouclage del win ${position}`}
        />
      </div>

      <div className="win-card__win-cell win-card__win-cell--tools">
        {saving && <span className="win-card__saving">…</span>}
        {canDelete && candidate && onDelete && (
          <button type="button" className="win-card__win-delete" onClick={onDelete} title="Eliminar este win">
            ×
          </button>
        )}
      </div>
    </div>
  )
}
