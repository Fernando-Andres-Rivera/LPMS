import {
  dateToMonthInputValue,
  dateToQuincenaHalf,
  dateToTrimesterStartMonth,
  dateToWeekInputValue,
  maxPeriodInputValue,
  monthInputLabel,
  monthInputValueToDate,
  quincenaLabel,
  quincenaToDate,
  trimesterLabel,
  trimesterStartMonthToDate,
  weekInputLabel,
  weekInputValueToDate,
} from './periodCapture'
import type { IndicatorFrequency } from '../../lib/types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface PeriodPickerProps {
  frequency: IndicatorFrequency
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

/**
 * Selector de período adecuado a la frecuencia del indicador — en vez de
 * obligar a elegir un día exacto para algo que se mide por semana, quincena,
 * mes o trimestre móvil. measurements.period_date sigue siendo una fecha
 * exacta (la ancla del período: lunes de la semana, día 1/16 de la
 * quincena, día 1 del mes o del mes de inicio del trimestre) — este
 * componente solo traduce entre esa fecha y el selector nativo apropiado.
 */
export function PeriodPicker({ frequency, value, onChange, disabled }: PeriodPickerProps) {
  const max = maxPeriodInputValue(frequency, today())

  if (frequency === 'semanal') {
    const weekValue = dateToWeekInputValue(value)
    return (
      <>
        <input
          className="capture-date"
          type="week"
          value={weekValue}
          max={max}
          onChange={(e) => e.target.value && onChange(weekInputValueToDate(e.target.value))}
          disabled={disabled}
        />
        <span className="capture-period-hint">{weekInputLabel(weekValue)}</span>
      </>
    )
  }

  if (frequency === 'mensual') {
    const monthValue = dateToMonthInputValue(value)
    return (
      <>
        <input
          className="capture-date"
          type="month"
          value={monthValue}
          max={max}
          onChange={(e) => e.target.value && onChange(monthInputValueToDate(e.target.value))}
          disabled={disabled}
        />
        <span className="capture-period-hint">{monthInputLabel(monthValue)}</span>
      </>
    )
  }

  if (frequency === 'quincenal') {
    const monthValue = dateToMonthInputValue(value)
    const half = dateToQuincenaHalf(value)
    return (
      <>
        <input
          className="capture-date"
          type="month"
          value={monthValue}
          max={max}
          onChange={(e) => e.target.value && onChange(quincenaToDate(e.target.value, half))}
          disabled={disabled}
        />
        <div className="capture-quincena-toggle">
          <button
            type="button"
            className={half === 1 ? 'active' : ''}
            onClick={() => onChange(quincenaToDate(monthValue, 1))}
            disabled={disabled}
          >
            1ra quincena
          </button>
          <button
            type="button"
            className={half === 2 ? 'active' : ''}
            onClick={() => onChange(quincenaToDate(monthValue, 2))}
            disabled={disabled}
          >
            2da quincena
          </button>
        </div>
        <span className="capture-period-hint">{quincenaLabel(monthValue, half)}</span>
      </>
    )
  }

  if (frequency === 'trimestral') {
    const startMonth = dateToTrimesterStartMonth(value)
    return (
      <>
        <input
          className="capture-date"
          type="month"
          value={startMonth}
          max={max}
          onChange={(e) => e.target.value && onChange(trimesterStartMonthToDate(e.target.value))}
          disabled={disabled}
        />
        <span className="capture-period-hint">
          Trimestre móvil: {trimesterLabel(startMonth)} — elige el mes en que empieza
        </span>
      </>
    )
  }

  return (
    <input
      className="capture-date"
      type="date"
      value={value}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  )
}
