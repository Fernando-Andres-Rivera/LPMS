import { calcularSemaforo } from '../../lib/semaforo'
import { fetchIndicatorStatuses } from '../dashboard/dashboardApi'
import type { SemaforoEstado } from '../../lib/types'

export type SiteStatusCounts = Record<SemaforoEstado, number>

function emptyCounts(): SiteStatusCounts {
  return { cumple: 0, riesgo: 0, incumple: 0, sin_datos: 0 }
}

/** Cuenta el estado (semáforo) de los indicadores activos de la organización,
 * agrupados por sitio — en una sola consulta a la vista indicator_status. */
export async function fetchIndicatorStatusBySite(organizationId: string): Promise<Record<string, SiteStatusCounts>> {
  const statuses = await fetchIndicatorStatuses(organizationId)
  const counts: Record<string, SiteStatusCounts> = {}

  for (const status of statuses) {
    if (!status.site_id) continue
    const estado = calcularSemaforo(status.latest_value, status.target_value, status.improvement_direction)
    const bucket = counts[status.site_id] ?? emptyCounts()
    bucket[estado] += 1
    counts[status.site_id] = bucket
  }

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
