import { Link } from 'react-router-dom'
import { calcularSemaforo, ESTADO_ICON, MARCO_COLOR, SEMAFORO_COLOR, SEMAFORO_LABEL } from '../../lib/semaforo'
import { TrendSparkline } from './TrendSparkline'
import {
  computeCardMetrics,
  formatIndicatorValue,
  isLightPillarCard,
  pillarCardBackground,
  type AggregateBreakdown,
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
  /** Indicador marcado como "foco" — el fondo de la tarjeta cambia a azul
   * (en vez del color del pilar) mientras esté marcado; al quitarlo vuelve
   * a mostrarse con el color del pilar. */
  isFocus?: boolean
  /** El detalle detrás del % (ej. "18/20") — solo aplica a razón y a
   * binario en modo "promedio"; null en cualquier otro caso, y entonces las
   * 3 métricas secundarias quedan en "Sin datos". */
  breakdown?: AggregateBreakdown | null
  /** Color del eje/pilar del indicador — colorea el fondo completo de la
   * tarjeta (oscurecido con un navy casi negro, NUNCA mezclado con otro tono
   * saturado como el navy corporativo: pilares complementarios al azul, como
   * el naranja de Seguridad, se ven sucios/pardos si se mezclan con otro
   * color en vez de solo oscurecerse) para identificar el pilar de un
   * vistazo, sin importar en qué pantalla se vea. */
  axisColor: string
  /** `code` del eje/pilar — algunos pilares (hoy solo Seguridad) van con la
   * tarjeta en claro, sin fondo de color; ver isLightPillarCard. */
  axisCode?: string | null
}

/** % de la barra de progreso: razón y binario-% ya vienen en escala 0-100;
 * un binario de lectura única es 0 o 100; numérico se mide contra su
 * objetivo (o 0 sin objetivo). */
function computeProgressPercent(
  valueType: IndicatorValueType,
  value: number | null,
  target: number | null,
): number {
  if (value === null) return 0
  if (valueType === 'binario' || valueType === 'razon') return Math.max(0, Math.min(100, value))
  if (target === null || target === 0) return 0
  return Math.max(0, Math.min(100, (Math.abs(value) / Math.abs(target)) * 100))
}

/**
 * Tarjeta de indicador estándar de toda la app: fondo coloreado por pilar,
 * insignia de estado, resultado principal, barra de progreso y las 3
 * métricas secundarias (ej. Sí / No / % o Real / Programado / %) que arman
 * ese resultado — mismo molde en Dashboard, reunión por eje/nivel y Tablero.
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
  breakdown = null,
  axisColor,
  axisCode = null,
}: IndicatorCardProps) {
  const estado = estadoOverride ?? calcularSemaforo(latestValue, targetValue, improvementDirection)
  const metrics = computeCardMetrics(valueType, breakdown)
  const progressPct = computeProgressPercent(valueType, latestValue, targetValue)
  /* El foco gana sobre el pilar: un indicador en foco siempre se ve con el
     fondo azul, aunque su pilar sea de los que van con la tarjeta en claro. */
  const isLight = !isFocus && isLightPillarCard(axisCode)

  return (
    <Link
      to={`/tablero/${id}`}
      className={`indicator-card${isLight ? ' indicator-card--light' : ''}${isFocus ? ' kpi-focus' : ''}`}
      style={{
        background: isLight
          ? 'var(--color-surface)'
          : pillarCardBackground(isFocus ? 'var(--color-focus)' : axisColor),
        borderColor: MARCO_COLOR[estado],
      }}
    >
      <div className="indicator-card__top">
        <span className="indicator-card__level">Nivel {level}</span>
        <span className={`indicator-card__badge indicator-card__badge--${estado}`}>
          {ESTADO_ICON[estado]} {SEMAFORO_LABEL[estado].toUpperCase()}
        </span>
      </div>

      <h3 className="indicator-card__name">{name}</h3>

      <div className="indicator-card__main">
        {valueType === 'binario' ? (
          <span className="indicator-card__value">{formatIndicatorValue(latestValue, 'binario', '')}</span>
        ) : valueType === 'razon' ? (
          <span className="indicator-card__value">{formatIndicatorValue(latestValue, 'razon', '')}</span>
        ) : (
          <span className="indicator-card__value">
            {latestValue ?? '—'} <span className="indicator-card__unit">{unit}</span>
          </span>
        )}
        {/* Objetivo en TODAS las tarjetas, sin importar el tipo — antes solo
            aparecía en numérico, así que el resto del contenido (barra,
            tendencia, chips) quedaba más arriba o más abajo según el tipo. */}
        <span className="indicator-card__target">Objetivo: {formatIndicatorValue(targetValue, valueType, unit)}</span>
      </div>

      <div className="indicator-card__progress">
        <div
          className="indicator-card__progress-fill"
          style={{ width: `${progressPct}%`, background: SEMAFORO_COLOR[estado] }}
        />
      </div>

      {/* El contenedor de la mini-tendencia siempre reserva el mismo alto,
          tenga o no datos para dibujar — si no, los chips de abajo suben o
          bajan según si hubo tendencia que mostrar. */}
      <div className="indicator-card__sparkline">
        {trend.length > 0 && (
          <TrendSparkline
            data={trend.map((p) => ({ date: p.period_date, value: p.value }))}
            color={SEMAFORO_COLOR[estado]}
            height={36}
          />
        )}
      </div>

      <div className="indicator-card__metrics">
        {metrics.map((metric, i) => (
          <div key={i} className={`indicator-card__metric indicator-card__metric--${metric.tone}`}>
            <span className="indicator-card__metric-value">{metric.value}</span>
            <span className="indicator-card__metric-label">{metric.label}</span>
          </div>
        ))}
      </div>
    </Link>
  )
}
