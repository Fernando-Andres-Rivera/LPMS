import { ACTION_PLAN_STEPS } from '../../lib/types'
import type { PdcaStatus } from '../../lib/types'
import './ActionPlanProgress.css'

interface ActionPlanProgressProps {
  /** null = vacío (problema definido, sin plan de acción todavía). */
  status: PdcaStatus | null
  size?: number
}

const TOTAL_QUARTERS = 4

/**
 * Círculo de avance de 4 cuartos del formato SMQDC: vacío -> lanzada ->
 * en ejecución -> terminada -> eficaz (círculo completo, en verde).
 * Reutilizable en el tablero del indicador y en listados de planes.
 */
export function ActionPlanProgress({ status, size = 56 }: ActionPlanProgressProps) {
  const step = ACTION_PLAN_STEPS.find((s) => s.status === status)
  const quarters = step?.quarters ?? 0
  const isEffective = status === 'cerrado'
  const percent = (quarters / TOTAL_QUARTERS) * 100
  const color = isEffective ? 'var(--color-ok)' : 'var(--color-primary)'

  const background =
    quarters === 0
      ? 'var(--color-surface)'
      : `conic-gradient(${color} ${percent}%, var(--color-bg) ${percent}% 100%)`

  return (
    <div className="action-plan-progress" style={{ width: size, height: size }}>
      <div className="action-plan-progress__circle" style={{ background }}>
        <div className="action-plan-progress__inner">{quarters}/{TOTAL_QUARTERS}</div>
      </div>
      <span className="action-plan-progress__label">{step?.label ?? 'Problema definido'}</span>
    </div>
  )
}
