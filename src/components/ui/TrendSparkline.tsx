import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'
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
  /** Si se da, cada barra se pinta según si ESE día cumplió su propio
   * objetivo (verde) o no (rojo), en vez de un único color para toda la
   * tendencia — para indicadores donde el objetivo se evalúa día a día
   * (binario: "¿se hizo?"; razón: "¿llegó al 100%?"). Sin esto, un
   * indicador con días buenos y malos se veía con todas las barras del
   * mismo color, el del estado agregado del rango completo. */
  colorForValue?: (value: number) => string
  /** Todas las barras a la misma altura, sin importar el valor — necesario
   * en binario: el valor real es 0 o 1, y una barra a altura PROPORCIONAL
   * (lo normal en el resto de tipos) literalmente desaparece en los días
   * "No" (0 = piso del eje = 0px de alto), sin importar qué color se le dé.
   */
  constantHeight?: boolean
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

/**
 * Mini-tendencia estándar para todas las tarjetas y tableros de KPI: eje X
 * con el día calendario de cada punto (tenue, domingos en rojo) y barras
 * sólidas únicamente en los días con registro real, para distinguirlos de
 * los días sin captura dentro del mismo rango.
 */
export function TrendSparkline({ data, color, height = 44, colorForValue, constantHeight = false }: TrendSparklineProps) {
  const registeredCount = data.filter((p) => p.value !== null).length
  if (registeredCount < 2) return null

  // El color (Cell) siempre lee el valor ORIGINAL de `data`; solo la altura
  // que recharts dibuja (dataKey="value" de este chartData) se aplana a 1.
  const chartData = constantHeight ? data.map((p) => ({ date: p.date, value: p.value === null ? null : 1 })) : data

  return (
    <div className="trend-sparkline">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="date" tick={<DayTick />} axisLine={false} tickLine={false} interval={0} height={16} />
          <YAxis hide domain={constantHeight ? [0, 1] : [0, 'dataMax']} />
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {colorForValue &&
              data.map((p, i) => <Cell key={i} fill={p.value === null ? color : colorForValue(p.value)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
