import type { ImprovementDirection, IndicatorValueType, SemaforoEstado } from './types'

/**
 * Calcula el estado de semáforo comparando el último valor medido contra el
 * objetivo vigente, respetando el sentido de mejora del indicador.
 * Banda de "riesgo": dentro del `toleranceRatio` (10% por defecto) del objetivo,
 * sin cumplirlo todavía.
 */
export function calcularSemaforo(
  value: number | null | undefined,
  targetValue: number | null | undefined,
  direction: ImprovementDirection,
  toleranceRatio = 0.1,
): SemaforoEstado {
  if (value === null || value === undefined || targetValue === null || targetValue === undefined) {
    return 'sin_datos'
  }

  const tolerance = Math.abs(targetValue * toleranceRatio)
  const cumple = direction === 'mayor_mejor' ? value >= targetValue : value <= targetValue
  if (cumple) return 'cumple'

  const dentroDeTolerancia =
    direction === 'mayor_mejor' ? value >= targetValue - tolerance : value <= targetValue + tolerance

  return dentroDeTolerancia ? 'riesgo' : 'incumple'
}

/**
 * Color de un % de cumplimiento agregado (un pilar, un sitio, un período) —
 * distinto de `calcularSemaforo`, que evalúa UN indicador contra SU objetivo.
 * Aquí ya no hay objetivo que comparar: 80% y 50% son los cortes con los que
 * la app lee un porcentaje de indicadores cumplidos.
 */
export function cumplimientoPctColor(pct: number | null): string {
  if (pct === null) return 'var(--color-border)'
  if (pct >= 80) return 'var(--color-ok)'
  if (pct >= 50) return 'var(--color-risk)'
  return 'var(--color-fail)'
}

export const SEMAFORO_COLOR: Record<SemaforoEstado, string> = {
  cumple: 'var(--color-ok)',
  riesgo: 'var(--color-risk)',
  incumple: 'var(--color-fail)',
  sin_datos: 'var(--color-gray)',
}

export const SEMAFORO_LABEL: Record<SemaforoEstado, string> = {
  cumple: 'Cumple',
  riesgo: 'En riesgo',
  incumple: 'Incumple',
  sin_datos: 'Sin datos',
}

/** Ícono de la insignia de estado en las tarjetas de KPI — "riesgo" lleva su
 * propio símbolo de advertencia en vez de la ✗ de "incumple": todavía no es
 * un fallo duro. */
export const ESTADO_ICON: Record<SemaforoEstado, string> = {
  cumple: '✓',
  riesgo: '!',
  incumple: '✗',
  sin_datos: '•',
}

/** Marco (borde) de la tarjeta de KPI — solo los dos estados clave llevan
 * marco de color (rojo incumple, verde cumple); "en riesgo" y "sin datos"
 * quedan sin marco (transparente) para no competir con el fondo del pilar,
 * que ya puede ser naranja/rojo/etc. */
export const MARCO_COLOR: Record<SemaforoEstado, string> = {
  cumple: 'var(--color-marco-cumple)',
  riesgo: 'transparent',
  incumple: 'var(--color-fail)',
  sin_datos: 'transparent',
}

interface DailyTrendStyle {
  /** Colorea CADA barra por separado según si ESE día cumplió su propio
   * objetivo — en vez del único color del estado agregado del rango
   * completo (lo que antes hacía que un indicador con días buenos y malos
   * se viera con todas las barras del mismo color). */
  colorForValue?: (value: number) => string
  /** Todas las barras a la misma altura, sin importar el valor — necesario
   * en binario: el valor real es 0 o 1, y una barra a altura PROPORCIONAL
   * (lo normal en el resto de tipos) literalmente desaparece en los días
   * "No" (0 = piso del eje = 0px de alto), sin importar qué color se le dé.
   * Con el color siendo lo único que comunica pase/no-pase, la altura no
   * necesita variar. */
  constantHeight?: boolean
}

/**
 * Estilo día a día para la mini-tendencia de un indicador — solo binario
 * ("¿se hizo?", objetivo fijo: Sí) y razón ("¿llegó al 100%?", objetivo
 * fijo: 100) tienen un objetivo fijo evaluable punto a punto; numérico no
 * — su objetivo varía por período y la tendencia no trae esa referencia
 * día a día, así que sigue con el color único de siempre (objeto vacío).
 */
export function dailyTrendStyle(valueType: IndicatorValueType): DailyTrendStyle {
  if (valueType === 'binario') {
    return {
      colorForValue: (value) => (value >= 1 ? SEMAFORO_COLOR.cumple : SEMAFORO_COLOR.incumple),
      constantHeight: true,
    }
  }
  if (valueType === 'razon') {
    return { colorForValue: (value) => (value >= 100 ? SEMAFORO_COLOR.cumple : SEMAFORO_COLOR.incumple) }
  }
  return {}
}
