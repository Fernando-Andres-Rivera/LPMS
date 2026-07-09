import type { SemaforoEstado } from '../../lib/types'
import { SEMAFORO_COLOR, SEMAFORO_LABEL } from '../../lib/semaforo'
import './Semaforo.css'

interface SemaforoProps {
  estado: SemaforoEstado
  /** Si es false, solo muestra el punto de color sin la etiqueta de texto. */
  showLabel?: boolean
  size?: 'sm' | 'md'
}

/**
 * Indicador visual de semáforo (verde/naranja/rojo/gris) reutilizable
 * en tarjetas de indicador, tableros y futuras aplicaciones de la firma.
 */
export function Semaforo({ estado, showLabel = true, size = 'md' }: SemaforoProps) {
  return (
    <span className={`semaforo semaforo--${size}`} role="status" aria-label={SEMAFORO_LABEL[estado]}>
      <span className="semaforo__dot" style={{ backgroundColor: SEMAFORO_COLOR[estado] }} />
      {showLabel && <span className="semaforo__label">{SEMAFORO_LABEL[estado]}</span>}
    </span>
  )
}
