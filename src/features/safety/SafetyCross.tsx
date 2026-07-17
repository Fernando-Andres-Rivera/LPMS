import type { SafetyCrossColor } from './safetyApi'
import './safety.css'

const TOTAL_DAYS = 31

interface CrossCell {
  day: number
  col: number
  big?: boolean
  exists: boolean
}

/**
 * Distribución en forma de cruz de la "cruz de seguridad" tradicional: un
 * tallo angosto (2 columnas, centrado) para los días 1-8 y 25-31, y una
 * barra ancha (8 columnas) para los días 9-24 — así se ve como una cruz, no
 * como un calendario rectangular normal.
 *
 * Siempre dibuja las 31 posiciones, sin importar cuántos días tenga el mes
 * — así la forma de la cruz no cambia de un mes a otro. Los días que no
 * existen en el mes (28-31 en febrero, 31 en los meses de 30 días) quedan
 * marcados con exists=false para pintarse en gris en vez de con un color de
 * estado que no les corresponde.
 */
function buildCrossLayout(daysInMonth: number): CrossCell[][] {
  const rows: CrossCell[][] = []
  let day = 1

  // Tallo superior: 4 filas de 2 días, centradas en las columnas 4-5 de 8.
  for (let r = 0; r < 4 && day <= TOTAL_DAYS; r++) {
    const row: CrossCell[] = []
    for (let c = 0; c < 2 && day <= TOTAL_DAYS; c++) {
      row.push({ day, col: 4 + c, exists: day <= daysInMonth })
      day++
    }
    rows.push(row)
  }

  // Barra ancha: 2 filas de 8 días (columnas 1-8).
  for (let r = 0; r < 2 && day <= TOTAL_DAYS; r++) {
    const row: CrossCell[] = []
    for (let c = 0; c < 8 && day <= TOTAL_DAYS; c++) {
      row.push({ day, col: 1 + c, exists: day <= daysInMonth })
      day++
    }
    rows.push(row)
  }

  // Tallo inferior: el resto de días, 2 por fila, centrados. El día 31
  // siempre queda solo en la última fila — se dibuja al doble de ancho
  // ocupando las 2 columnas del tallo, para rematar la cruz en vez de
  // quedar un cuadro chico y descentrado a un lado.
  while (day <= TOTAL_DAYS) {
    if (TOTAL_DAYS - day === 0) {
      rows.push([{ day, col: 4, big: true, exists: day <= daysInMonth }])
      break
    }
    const row: CrossCell[] = []
    for (let c = 0; c < 2 && day <= TOTAL_DAYS; c++) {
      row.push({ day, col: 4 + c, exists: day <= daysInMonth })
      day++
    }
    rows.push(row)
  }

  return rows
}

const LEGEND: { color: SafetyCrossColor | 'gris'; label: string }[] = [
  { color: 'verde', label: 'Día seguro' },
  { color: 'amarillo', label: 'Incidente' },
  { color: 'rojo', label: 'Accidente' },
  { color: 'blanco', label: 'No transcurrido' },
  { color: 'gris', label: 'No existe en este mes' },
]

interface SafetyCrossProps {
  year: number
  month: number
  colors: Record<number, SafetyCrossColor>
}

export function SafetyCross({ year, month, colors }: SafetyCrossProps) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const rows = buildCrossLayout(daysInMonth)

  return (
    <div className="safety-cross-card">
      <div className="safety-cross">
        {rows.map((row, i) => (
          <div key={i} className="safety-cross__row">
            {row.map(({ day, col, big, exists }) => (
              <span
                key={day}
                className={`safety-cross__cell safety-cross__cell--${exists ? (colors[day] ?? 'verde') : 'gris'}${
                  big ? ' safety-cross__cell--big' : ''
                }`}
                style={{ gridColumn: big ? `${col} / span 2` : col }}
              >
                {day}
              </span>
            ))}
          </div>
        ))}
      </div>
      <ul className="safety-cross-legend">
        {LEGEND.map(({ color, label }) => (
          <li key={color} className="safety-cross-legend__item">
            <span className={`safety-cross-legend__dot safety-cross-legend__dot--${color}`} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
