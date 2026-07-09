import type { ImprovementDirection, SemaforoEstado } from './types'

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
