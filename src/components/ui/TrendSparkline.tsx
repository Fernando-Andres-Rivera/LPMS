import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import './TrendSparkline.css'

export interface TrendSparklinePoint {
  /** Fecha ISO (yyyy-mm-dd) del día calendario que representa el punto. */
  date: string
  /** null cuando ese día no tiene un registro real — se conserva el hueco
   * en el eje para que la posición siga representando el calendario. */
  value: number | null
}

interface TrendSparklineProps {
  data: TrendSparklinePoint[]
  color: string
  height?: number
}

function isSunday(dateIso: string): boolean {
  return new Date(`${dateIso}T00:00:00`).getDay() === 0
}

/** Número de día calendario en gris tenue (o rojo si es domingo) para dar
 * referencia de ubicación en el tiempo sin competir visualmente con la línea. */
function DayTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x === undefined || y === undefined || !payload) return null
  const sunday = isSunday(payload.value)
  const day = new Date(`${payload.value}T00:00:00`).getDate()
  return (
    <text
      x={x}
      y={y + 9}
      textAnchor="middle"
      className={sunday ? 'trend-sparkline__tick trend-sparkline__tick--sunday' : 'trend-sparkline__tick'}
    >
      {day}
    </text>
  )
}

/** Solo dibuja el punto cuando el día tiene un registro real — así se
 * distingue de un vistazo qué días sí se capturaron dentro del rango. */
function RegisteredDot(color: string) {
  return function Dot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: TrendSparklinePoint }) {
    if (cx === undefined || cy === undefined || !payload || payload.value === null) return null
    return <circle cx={cx} cy={cy} r={2.5} fill={color} stroke="none" />
  }
}

/**
 * Mini-tendencia estándar para todas las tarjetas y tableros de KPI: eje X
 * con el día calendario de cada punto (tenue, domingos en rojo) y un punto
 * visible únicamente en los días con registro real, para distinguirlos de
 * los días sin captura dentro del mismo rango.
 */
export function TrendSparkline({ data, color, height = 44 }: TrendSparklineProps) {
  const registeredCount = data.filter((p) => p.value !== null).length
  if (registeredCount < 2) return null

  return (
    <div className="trend-sparkline">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="date" tick={<DayTick />} axisLine={false} tickLine={false} interval={0} height={16} />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={RegisteredDot(color)}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
