import { PERIOD_TYPE_LABEL, type PeriodType } from '../../lib/types'
import './PeriodTypeSelector.css'

const OPTIONS: PeriodType[] = ['dia', 'semana', 'quincena', 'mes', 'trimestre']

interface PeriodTypeSelectorProps {
  value: PeriodType
  onChange: (type: PeriodType) => void
}

/**
 * Elige con qué ventana de tiempo se revisan los resultados (día, semana,
 * quincena, mes, trimestre): agrupa las mediciones ya capturadas, no cambia
 * cómo se capturan. Reutilizable en cualquier tablero de resultados.
 */
export function PeriodTypeSelector({ value, onChange }: PeriodTypeSelectorProps) {
  return (
    <div className="period-type-selector">
      {OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          className={opt === value ? 'active' : ''}
          onClick={() => onChange(opt)}
        >
          {PERIOD_TYPE_LABEL[opt]}
        </button>
      ))}
    </div>
  )
}
