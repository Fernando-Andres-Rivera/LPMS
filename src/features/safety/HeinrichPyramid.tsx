import type { HeinrichPyramid as HeinrichPyramidData } from './safetyApi'
import './safety.css'

interface HeinrichPyramidProps {
  data: HeinrichPyramidData
}

const BANDS: { key: keyof HeinrichPyramidData; label: string; className: string }[] = [
  { key: 'fatal', label: 'Accidente fatal', className: 'heinrich-band--fatal' },
  { key: 'serio', label: 'Accidentes serios (>2 días de incapacidad)', className: 'heinrich-band--serio' },
  { key: 'leve', label: 'Accidentes leves (<2 días de incapacidad)', className: 'heinrich-band--leve' },
  { key: 'incidentes', label: 'Incidentes que no producen daño', className: 'heinrich-band--base' },
]

/**
 * Pirámide de Heinrich del año en curso — el número junto a cada franja es
 * el conteo real de eventos registrados (misma lógica que "días sin
 * accidentes": si no hay eventos, el resultado es 0 en todas las franjas),
 * no la proporción teórica clásica 1:10:30:600.
 */
export function HeinrichPyramid({ data }: HeinrichPyramidProps) {
  return (
    <div className="heinrich-pyramid">
      <div className="heinrich-pyramid__visual">
        {BANDS.map((band) => (
          <div key={band.key} className={`heinrich-band ${band.className}`}>
            <span className="heinrich-band__count">{data[band.key]}</span>
          </div>
        ))}
      </div>
      <div className="heinrich-pyramid__legend">
        {BANDS.map((band) => (
          <div key={band.key} className="heinrich-legend-row">
            <span className="heinrich-legend-row__count">{data[band.key]}</span>
            <span className="heinrich-legend-row__label">{band.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
