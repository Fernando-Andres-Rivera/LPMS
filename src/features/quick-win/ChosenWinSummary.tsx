import { AxisIcon } from '../../components/ui/AxisIcon'
import type { QuickWinCandidateWithNames } from './quickWinApi'

interface ChosenWinSummaryProps {
  chosen: QuickWinCandidateWithNames | null
  siteName: string
  boardDate: string
  onGoToPillar: (axisId: string) => void
  onGoToOperaciones: () => void
}

/**
 * Lo primero que se ve al entrar a Quick Win: el win que el equipo ya
 * eligió ese día, de solo lectura — para cambiar cualquier dato hay que
 * entrar a la pestaña de Operaciones o la del pilar correspondiente.
 */
export function ChosenWinSummary({ chosen, siteName, boardDate, onGoToPillar, onGoToOperaciones }: ChosenWinSummaryProps) {
  const frameModifier = chosen ? (chosen.needs_escalation ? ' win-card--red' : ' win-card--green') : ''

  return (
    <section className={`win-card${frameModifier}`}>
      <header className="win-card__head">
        <h2 className="win-card__title">WIN CARD</h2>
        <span className="win-card__head-meta">
          {siteName} · {boardDate}
        </span>
      </header>

      {!chosen ? (
        <div className="win-card-summary win-card-summary--empty">
          <p>Todavía no se ha elegido el win de hoy.</p>
          <button type="button" className="button-primary" onClick={onGoToOperaciones}>
            Ir a Operaciones a elegirlo →
          </button>
        </div>
      ) : (
        <div className="win-card-summary">
          <div className="win-card-summary__pillar" style={{ color: chosen.axisColor }}>
            <AxisIcon icon={chosen.axisIcon} size={20} />
            {chosen.axisName}
          </div>
          <p className="win-card-summary__description">{chosen.description}</p>
          <dl className="win-card-summary__meta">
            <dt>Responsable</dt>
            <dd>{chosen.responsibleName ?? 'Sin asignar'}</dd>
            <dt>Hora</dt>
            <dd>{chosen.execution_time ? chosen.execution_time.slice(0, 5) : '—'}</dd>
            <dt>Estado</dt>
            <dd>
              {chosen.level > 1
                ? `↑ Escalado a Nivel ${chosen.level}`
                : chosen.needs_escalation
                  ? 'Necesita escalar'
                  : 'Se resuelve aquí'}
            </dd>
          </dl>
          <button type="button" className="win-card-summary__edit" onClick={() => onGoToPillar(chosen.axis_id)}>
            Editar en {chosen.axisName} →
          </button>
        </div>
      )}
    </section>
  )
}
