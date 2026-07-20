import { daysAgo, today, yesterday } from '../../lib/dateRange'
import './RangePicker.css'

interface RangePickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  label?: string
}

/**
 * Rango de fechas para acotar a qué período se refiere una visualización
 * (Pareto, tendencia, estado de indicadores) — compacto a propósito: dos
 * fechas y atajos, no un calendario grande. Distinto del calendario de
 * periodicidad de exposición del Dashboard, que define CUÁNDO se presenta,
 * no qué datos se muestran.
 */
export function RangePicker({ from, to, onChange, label = 'Rango de análisis' }: RangePickerProps) {
  return (
    <div className="range-picker">
      <span className="range-picker__label">{label}</span>
      <div className="range-picker__controls">
        <input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} />
        <span>a</span>
        <input type="date" value={to} min={from} max={today()} onChange={(e) => onChange(from, e.target.value)} />
        <div className="range-picker__presets">
          <button type="button" onClick={() => onChange(daysAgo(7), yesterday())}>
            7d
          </button>
          <button type="button" onClick={() => onChange(daysAgo(30), yesterday())}>
            30d
          </button>
          <button type="button" onClick={() => onChange(daysAgo(90), yesterday())}>
            90d
          </button>
          <button type="button" onClick={() => onChange(yesterday(), yesterday())}>
            N-1
          </button>
        </div>
      </div>
    </div>
  )
}
