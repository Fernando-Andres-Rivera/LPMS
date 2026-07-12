import type { HeinrichPyramid as HeinrichPyramidData } from './safetyApi'
import './safety.css'

interface HeinrichPyramidProps {
  data: HeinrichPyramidData
}

const BANDS: { key: keyof HeinrichPyramidData; ratio: string; label: string; className: string }[] = [
  { key: 'fatal', ratio: '1', label: 'Accidente fatal', className: 'heinrich-band--fatal' },
  { key: 'serio', ratio: '10', label: 'Accidentes serios (>2 días de incapacidad)', className: 'heinrich-band--serio' },
  { key: 'leve', ratio: '30', label: 'Accidentes leves (<2 días de incapacidad)', className: 'heinrich-band--leve' },
  { key: 'incidentes', ratio: '600', label: 'Incidentes que no producen daño', className: 'heinrich-band--base' },
]

/** Pirámide de Heinrich (proporción clásica 1:10:30:600) del año en curso. */
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
            <span className="heinrich-legend-row__ratio">{band.ratio}</span>
            <span className="heinrich-legend-row__label">{band.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
