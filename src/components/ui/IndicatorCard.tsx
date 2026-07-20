import { Link } from 'react-router-dom'
import { calcularSemaforo, SEMAFORO_COLOR } from '../../lib/semaforo'
import { Semaforo } from './Semaforo'
import { TrendSparkline } from './TrendSparkline'
import {
  formatIndicatorValue,
  type ImprovementDirection,
  type IndicatorValueType,
  type SemaforoEstado,
} from '../../lib/types'
import './IndicatorCard.css'

export interface IndicatorCardTrendPoint {
  /** Fecha ISO (yyyy-mm-dd) del día; null en `value` = sin registro ese día. */
  period_date: string
  value: number | null
}

interface IndicatorCardProps {
  id: string
  name: string
  unit: string
  level: 1 | 2 | 3
  improvementDirection: ImprovementDirection
  valueType?: IndicatorValueType
  latestValue: number | null
  targetValue: number | null
  trend: IndicatorCardTrendPoint[]
  /** Para indicadores cuyo semáforo no se decide comparando valor vs.
   * objetivo (ej. "días sin accidentes": el conteo siempre "cumple" un
   * objetivo de 0, pero lo que importa es si hubo un accidente DENTRO del
   * rango elegido) — cuando se da, reemplaza el cálculo genérico. */
  estadoOverride?: SemaforoEstado
  /** Indicador marcado como "foco" — se resalta con un borde azul muy visible. */
  isFocus?: boolean
}

/**
 * Tarjeta de indicador reutilizable: nombre, semáforo, último valor vs.
 * objetivo, y mini-tendencia de los últimos períodos.
 */
export function IndicatorCard({
  id,
  name,
  unit,
  level,
  improvementDirection,
  valueType = 'numerico',
  latestValue,
  targetValue,
  trend,
  estadoOverride,
  isFocus = false,
}: IndicatorCardProps) {
  const estado = estadoOverride ?? calcularSemaforo(latestValue, targetValue, improvementDirection)

  return (
    <Link
      to={`/tablero/${id}`}
      className={`indicator-card${isFocus ? ' kpi-focus' : ''}`}
      style={{ borderLeftColor: SEMAFORO_COLOR[estado] }}
    >
      <div className="indicator-card__header">
        <span className="indicator-card__level">Nivel {level}</span>
        <Semaforo estado={estado} showLabel={false} size="sm" />
      </div>

      <h3 className="indicator-card__name">{name}</h3>

      <div className="indicator-card__values">
        {valueType === 'binario' ? (
          <span className="indicator-card__value">{formatIndicatorValue(latestValue, 'binario', '')}</span>
        ) : valueType === 'razon' ? (
          <span className="indicator-card__value">{formatIndicatorValue(latestValue, 'razon', '')}</span>
        ) : (
          <>
            <span className="indicator-card__value">
              {latestValue ?? '—'} <span className="indicator-card__unit">{unit}</span>
            </span>
            <span className="indicator-card__target">
              Objetivo: {targetValue ?? '—'} {unit}
            </span>
          </>
        )}
      </div>

      <div className="indicator-card__sparkline">
        {trend.length > 0 && (
          <TrendSparkline
            data={trend.map((p) => ({ date: p.period_date, value: p.value }))}
            color={SEMAFORO_COLOR[estado]}
            height={40}
          />
        )}
      </div>
    </Link>
  )
}
