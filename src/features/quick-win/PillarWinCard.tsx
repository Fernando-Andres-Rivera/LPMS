import { AxisIcon } from '../../components/ui/AxisIcon'
import type { Axis, Profile } from '../../lib/types'
import { WinCardRow, type WinRowValues } from './WinCardRow'
import type { QuickWinCandidateWithNames } from './quickWinApi'

interface PillarWinCardProps {
  axis: Axis
  siteName: string
  boardDate: string
  profiles: Profile[]
  /** Ya filtrados por el padre a los de ESTE pilar. */
  candidates: QuickWinCandidateWithNames[]
  problemaDelDia: string
  problemaAxisId: string
  savingProblema: boolean
  savingProblemaAxis: boolean
  onChangeProblemaText: (text: string) => void
  onSaveProblema: () => void
  onAssignProblemaHere: () => void
  onChoose: (candidate: QuickWinCandidateWithNames) => void
  onSave: (candidate: QuickWinCandidateWithNames | null, values: WinRowValues) => Promise<void>
  onToggleEscalation: (candidate: QuickWinCandidateWithNames) => void
  onEscalate: (candidate: QuickWinCandidateWithNames) => void
  canDelete: boolean
  onDelete: (candidate: QuickWinCandidateWithNames) => void
}

const WIN_SLOTS = 3

/**
 * La pestaña de un pilar — como en la tarjeta de referencia (INPUT O&P):
 * solo los wins de ESE pilar y el problema propuesto para él, sin la fila de
 * resultados N1 ni la de focos, que son la vista consolidada de Operaciones.
 */
export function PillarWinCard({
  axis,
  siteName,
  boardDate,
  profiles,
  candidates,
  problemaDelDia,
  problemaAxisId,
  savingProblema,
  savingProblemaAxis,
  onChangeProblemaText,
  onSaveProblema,
  onAssignProblemaHere,
  onChoose,
  onSave,
  onToggleEscalation,
  onEscalate,
  canDelete,
  onDelete,
}: PillarWinCardProps) {
  const chosen = candidates.find((c) => c.is_selected) ?? null
  const frameModifier = chosen ? (chosen.needs_escalation ? ' win-card--red' : ' win-card--green') : ''
  const slotCount = Math.max(WIN_SLOTS, candidates.length)
  const problemaIsHere = problemaAxisId === axis.id

  return (
    <section className={`win-card${frameModifier}`}>
      <header
        className="win-card__head"
        style={frameModifier ? undefined : { background: axis.color }}
      >
        <AxisIcon icon={axis.icon} size={20} />
        <h2 className="win-card__title win-card__title--pillar">{axis.name}</h2>
        <span className="win-card__head-meta">
          {siteName} · {boardDate}
        </span>
        {chosen && (
          <div className="win-card__decision">
            <button
              type="button"
              className={`win-card__decision-toggle win-card__decision-toggle--${chosen.needs_escalation ? 'red' : 'green'}`}
              onClick={() => onToggleEscalation(chosen)}
            >
              {chosen.needs_escalation ? '● Necesita escalar' : '● Se resuelve aquí'}
            </button>
            {chosen.needs_escalation && chosen.level < 3 && (
              <button type="button" className="win-card__escalate" onClick={() => onEscalate(chosen)}>
                Escalar a Nivel {chosen.level + 1} →
              </button>
            )}
          </div>
        )}
      </header>

      {/* Problema propuesto — el mismo campo único de "problema del día" del
          tablero (solo puede haber uno), pero visto desde este pilar: si hoy
          pertenece a otro, se ofrece moverlo aquí en vez de mostrarlo como si
          fuera un texto aparte que en realidad no existe. */}
      <div className="win-card__problema">
        <div className="win-card__rowlabel">Problema propuesto</div>
        <div className="win-card__problema-body">
          {problemaIsHere ? (
            <>
              <textarea
                rows={2}
                value={problemaDelDia}
                onChange={(e) => onChangeProblemaText(e.target.value)}
                onBlur={onSaveProblema}
                placeholder={`¿Cuál es el problema propuesto para ${axis.name}?`}
                autoFocus={!problemaDelDia}
              />
              {(savingProblema || savingProblemaAxis) && <span className="win-card__saving">Guardando…</span>}
            </>
          ) : (
            <div className="win-card__problema-elsewhere">
              <p>
                {problemaAxisId
                  ? 'El problema del día está asignado a otro pilar.'
                  : 'Todavía no se definió el problema del día.'}
              </p>
              <button type="button" onClick={onAssignProblemaHere} disabled={savingProblemaAxis}>
                {savingProblemaAxis ? 'Asignando…' : `Definirlo en ${axis.name} →`}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="win-card__wins">
        <div className="win-card__wins-head">
          <span />
          <span>Win propuesto</span>
          <span>Responsable</span>
          <span>Hora</span>
          <span />
        </div>
        {Array.from({ length: slotCount }, (_, i) => {
          const candidate = candidates[i] ?? null
          const isLevel1 = !candidate || candidate.level === 1
          return (
            <WinCardRow
              key={candidate?.id ?? `empty-${i}`}
              position={i + 1}
              candidate={candidate}
              pillars={[axis]}
              lockedAxisId={axis.id}
              profiles={profiles}
              isChosen={!!candidate?.is_selected}
              onChoose={candidate && isLevel1 ? () => onChoose(candidate) : null}
              onSave={(values) => onSave(candidate, values)}
              canDelete={canDelete}
              onDelete={candidate ? () => onDelete(candidate) : null}
            />
          )
        })}
      </div>
    </section>
  )
}
