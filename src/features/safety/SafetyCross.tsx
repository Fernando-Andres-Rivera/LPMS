import type { SafetyCrossColor } from './safetyApi'
import './safety.css'

interface CrossCell {
  day: number
  col: number
}

/**
 * Distribución en forma de cruz de la "cruz de seguridad" tradicional: un
 * tallo angosto (2 columnas, centrado) para los días 1-8 y 25-31, y una
 * barra ancha (8 columnas) para los días 9-24 — así se ve como una cruz, no
 * como un calendario rectangular normal.
 */
function buildCrossLayout(daysInMonth: number): CrossCell[][] {
  const rows: CrossCell[][] = []
  let day = 1

  // Tallo superior: 4 filas de 2 días, centradas en las columnas 4-5 de 8.
  for (let r = 0; r < 4 && day <= daysInMonth; r++) {
    const row: CrossCell[] = []
    for (let c = 0; c < 2 && day <= daysInMonth; c++) {
      row.push({ day, col: 4 + c })
      day++
    }
    rows.push(row)
  }

  // Barra ancha: 2 filas de 8 días (columnas 1-8).
  for (let r = 0; r < 2 && day <= daysInMonth; r++) {
    const row: CrossCell[] = []
    for (let c = 0; c < 8 && day <= daysInMonth; c++) {
      row.push({ day, col: 1 + c })
      day++
    }
    rows.push(row)
  }

  // Tallo inferior: el resto de días, 2 por fila, centrados.
  while (day <= daysInMonth) {
    const row: CrossCell[] = []
    for (let c = 0; c < 2 && day <= daysInMonth; c++) {
      row.push({ day, col: 4 + c })
      day++
    }
    rows.push(row)
  }

  return rows
}

interface SafetyCrossProps {
  year: number
  month: number
  colors: Record<number, SafetyCrossColor>
}

export function SafetyCross({ year, month, colors }: SafetyCrossProps) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const rows = buildCrossLayout(daysInMonth)

  return (
    <div className="safety-cross">
      {rows.map((row, i) => (
        <div key={i} className="safety-cross__row">
          {row.map(({ day, col }) => (
            <span
              key={day}
              className={`safety-cross__cell safety-cross__cell--${colors[day] ?? 'verde'}`}
              style={{ gridColumn: col }}
            >
              {day}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
