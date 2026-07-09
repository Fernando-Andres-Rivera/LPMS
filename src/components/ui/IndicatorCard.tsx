import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { calcularSemaforo, SEMAFORO_COLOR } from '../../lib/semaforo'
import { Semaforo } from './Semaforo'
import type { ImprovementDirection } from '../../lib/types'
import './IndicatorCard.css'

export interface IndicatorCardTrendPoint {
  period_date: string
  value: number
}

interface IndicatorCardProps {
  id: string
  name: string
  unit: string
  level: 1 | 2 | 3
  improvementDirection: ImprovementDirection
  latestValue: number | null
  targetValue: number | null
  trend: IndicatorCardTrendPoint[]
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
  latestValue,
  targetValue,
  trend,
}: IndicatorCardProps) {
  const estado = calcularSemaforo(latestValue, targetValue, improvementDirection)

  return (
    <Link to={`/tablero/${id}`} className="indicator-card">
      <div className="indicator-card__header">
        <span className="indicator-card__level">Nivel {level}</span>
        <Semaforo estado={estado} showLabel={false} size="sm" />
      </div>

      <h3 className="indicator-card__name">{name}</h3>

      <div className="indicator-card__values">
        <span className="indicator-card__value">
          {latestValue ?? '—'} <span className="indicator-card__unit">{unit}</span>
        </span>
        <span className="indicator-card__target">
          Objetivo: {targetValue ?? '—'} {unit}
        </span>
      </div>

      {trend.length > 1 && (
        <div className="indicator-card__sparkline">
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={trend}>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={SEMAFORO_COLOR[estado]}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Link>
  )
}
