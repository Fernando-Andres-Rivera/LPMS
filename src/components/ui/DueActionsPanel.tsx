import { ActionPlanProgress } from './ActionPlanProgress'
import { ActionPlanEvidence } from './ActionPlanEvidence'
import { ACTION_PLAN_STEPS, type PdcaStatus } from '../../lib/types'
import './DueActionsPanel.css'

export interface DueAction {
  id: string
  description: string
  status: PdcaStatus
  responsibleName: string | null
  creatorName: string | null
  rootCause: string | null
}

interface DueActionsPanelProps {
  actions: DueAction[]
  advancingId: string | null
  onAdvance: (actionId: string, status: PdcaStatus) => void
  /** Para adjuntar evidencia directo desde la reunión — mismos datos que
   * exige el registro de calidad (quién sube, a qué organización). */
  organizationId: string
  uploadedBy: string
  canRemoveEvidence: boolean
  /** Borrado físico del plan — solo admin_consultora. */
  canDeleteRecords: boolean
  onDelete: (action: DueAction) => void
}

/**
 * Versión compacta de la tarjeta de "Plan de acción" del Tablero (mismo
 * círculo de avance, misma info, mismos botones de avance), pensada para ir
 * DEBAJO de cada tarjeta de indicador en la reunión por niveles — de un
 * vistazo, qué acciones vencen hoy sin tener que entrar al tablero de cada
 * KPI. Siempre ocupa el mismo alto (ver .due-actions-panel en el CSS) para
 * que la cuadrícula de tarjetas quede pareja, tenga o no acciones ese día.
 */
export function DueActionsPanel({
  actions,
  advancingId,
  onAdvance,
  organizationId,
  uploadedBy,
  canRemoveEvidence,
  canDeleteRecords,
  onDelete,
}: DueActionsPanelProps) {
  return (
    <div className="due-actions-panel">
      <span className="due-actions-panel__title">Acciones que vencen hoy</span>
      {actions.length === 0 ? (
        <p className="due-actions-panel__empty">Sin acciones a vencer</p>
      ) : (
        <div className="due-actions-panel__list">
          {actions.map((action) => {
            const currentQuarters = ACTION_PLAN_STEPS.find((s) => s.status === action.status)?.quarters ?? 0
            const nextSteps = ACTION_PLAN_STEPS.filter((s) => s.quarters > currentQuarters)
            return (
              <div key={action.id} className="due-action-item">
                <ActionPlanProgress status={action.status} size={40} />
                <div className="due-action-item__body">
                  <p className="due-action-item__description">{action.description}</p>
                  {action.rootCause && (
                    <p className="due-action-item__cause">
                      <strong>Causa raíz:</strong> {action.rootCause}
                    </p>
                  )}
                  <p className="due-action-item__meta">
                    Responsable: {action.responsibleName ?? 'Sin asignar'} · Registró: {action.creatorName ?? '—'}
                  </p>
                  {nextSteps.length > 0 && (
                    <div className="due-action-item__actions">
                      {nextSteps.map((s) => (
                        <button
                          key={s.status}
                          type="button"
                          disabled={advancingId === action.id}
                          onClick={() => onAdvance(action.id, s.status)}
                        >
                          Marcar: {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <ActionPlanEvidence
                    actionPlanId={action.id}
                    organizationId={organizationId}
                    uploadedBy={uploadedBy}
                    canRemove={canRemoveEvidence}
                  />
                  {canDeleteRecords && (
                    <button
                      type="button"
                      className="due-action-item__delete"
                      onClick={() => onDelete(action)}
                    >
                      Eliminar plan
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
