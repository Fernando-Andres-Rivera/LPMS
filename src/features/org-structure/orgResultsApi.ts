import { calcularSemaforo } from '../../lib/semaforo'
import { fetchAllIndicatorsWithContext, fetchCurrentTarget, fetchIndicatorTrend } from '../dashboard/dashboardApi'
import type { SemaforoEstado } from '../../lib/types'

export type SiteStatusCounts = Record<SemaforoEstado, number>

function emptyCounts(): SiteStatusCounts {
  return { cumple: 0, riesgo: 0, incumple: 0, sin_datos: 0 }
}

/** Cuenta el estado (semáforo) de los indicadores activos de la organización, agrupados por sitio. */
export async function fetchIndicatorStatusBySite(organizationId: string): Promise<Record<string, SiteStatusCounts>> {
  const indicators = await fetchAllIndicatorsWithContext(organizationId)
  const now = new Date()
  const counts: Record<string, SiteStatusCounts> = {}

  await Promise.all(
    indicators.map(async (indicator) => {
      if (!indicator.site_id) return
      const [trend, target] = await Promise.all([
        fetchIndicatorTrend(indicator.id),
        fetchCurrentTarget(indicator.id, now.getFullYear(), now.getMonth() + 1),
      ])
      const latestValue = trend.length ? trend[trend.length - 1].value : null
      const estado = calcularSemaforo(latestValue, target?.target_value, indicator.improvement_direction)
      const bucket = counts[indicator.site_id] ?? emptyCounts()
      bucket[estado] += 1
      counts[indicator.site_id] = bucket
    }),
  )

  return counts
}

export function sumCounts(a: SiteStatusCounts, b: SiteStatusCounts): SiteStatusCounts {
  return {
    cumple: a.cumple + b.cumple,
    riesgo: a.riesgo + b.riesgo,
    incumple: a.incumple + b.incumple,
    sin_datos: a.sin_datos + b.sin_datos,
  }
}
