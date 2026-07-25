import { AxisIcon } from '../../components/ui/AxisIcon'
import { QuickWinEvidence } from './QuickWinEvidence'
import type { QuickWinCandidateWithNames } from './quickWinApi'

interface QuickWinCandidateCardProps {
  candidate: QuickWinCandidateWithNames
  organizationId: string
  uploadedBy: string
  canRemoveEvidence: boolean
  /** Solo en la reunión donde se elige (Nivel 1): marcar cuál es el win. */
  onToggleSelected?: () => void
  /** Si no se pasa, la tarjeta queda de solo lectura (ej. un win que ya se
   * escaló y dejó de ser decisión de este nivel). */
  onToggleEscalation?: () => void
  /** Presente cuando needs_escalation está en true y level < 3 — sube el
   * win a la cola de decisión del siguiente nivel. */
  onEscalate?: () => void
  /** En el panel de wins escalados (Nivel 2/3) se ven de varios sitios a
   * la vez, así que hace falta aclarar de cuál es cada uno. */
  siteName?: string
}

/**
 * Tarjeta de un win — el mismo componente en la reunión donde se propone
 * (Nivel 1) y en el panel de wins que llegaron escalados (Nivel 2/3), para
 * que el toggle verde/rojo y la evidencia se vean y funcionen igual en
 * toda la cascada.
 */
export function QuickWinCandidateCard({
  candidate,
  organizationId,
  uploadedBy,
  canRemoveEvidence,
  onToggleSelected,
  onToggleEscalation,
  onEscalate,
  siteName,
}: QuickWinCandidateCardProps) {
  return (
    <div
      className={`quick-win-candidate-card${
        candidate.is_selected
          ? candidate.needs_escalation
            ? ' quick-win-candidate-card--red'
            : ' quick-win-candidate-card--green'
          : ''
      }`}
    >
      <div className="quick-win-candidate-card__axis" style={{ color: candidate.axisColor }}>
        <AxisIcon icon={candidate.axisIcon} size={16} />
        {candidate.axisName}
        {siteName && <span className="quick-win-candidate-card__site"> · {siteName}</span>}
      </div>
      <p className="quick-win-candidate-card__description">{candidate.description}</p>
      <p className="quick-win-candidate-card__meta">
        Responsable: {candidate.responsibleName ?? 'Sin asignar'}
        {candidate.execution_time && ` · Hora: ${candidate.execution_time.slice(0, 5)}`}
        {candidate.proposedByName && ` · Propuso: ${candidate.proposedByName}`}
      </p>

      {!onToggleEscalation && candidate.level > 1 && (
        <p className="quick-win-candidate-card__escalated-note">↑ Escalado a Nivel {candidate.level}</p>
      )}

      <div className="quick-win-candidate-card__actions">
        {onToggleSelected && (
          <button type="button" onClick={onToggleSelected}>
            {candidate.is_selected ? '✓ Elegido como el win' : 'Elegir como el win'}
          </button>
        )}
        {candidate.is_selected && onToggleEscalation && (
          <button
            type="button"
            className={`quick-win-toggle quick-win-toggle--${candidate.needs_escalation ? 'red' : 'green'}`}
            onClick={onToggleEscalation}
          >
            {candidate.needs_escalation ? '● Necesita escalar' : '● Se resuelve aquí'}
          </button>
        )}
        {candidate.needs_escalation && candidate.level < 3 && onEscalate && (
          <button type="button" className="quick-win-escalate" onClick={onEscalate}>
            Escalar a Nivel {candidate.level + 1} →
          </button>
        )}
      </div>

      {candidate.is_selected && (
        <QuickWinEvidence
          candidateId={candidate.id}
          organizationId={organizationId}
          uploadedBy={uploadedBy}
          canRemove={canRemoveEvidence}
        />
      )}
    </div>
  )
}
