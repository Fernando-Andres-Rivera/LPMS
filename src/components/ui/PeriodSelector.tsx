import './PeriodSelector.css'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export interface Period {
  year: number
  month: number // 1-12
}

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  /** Cuántos años atrás ofrecer en el selector, además del actual. */
  yearsBack?: number
}

/**
 * Selector de período (mes/año) reutilizable en captura de mediciones,
 * definición de objetivos y tableros por eje.
 */
export function PeriodSelector({ value, onChange, yearsBack = 2 }: PeriodSelectorProps) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => currentYear - i)

  return (
    <div className="period-selector">
      <select
        aria-label="Mes"
        value={value.month}
        onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
      >
        {MESES.map((mes, i) => (
          <option key={mes} value={i + 1}>
            {mes}
          </option>
        ))}
      </select>
      <select
        aria-label="Año"
        value={value.year}
        onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
