import { calcularSemaforo } from '../../lib/semaforo'
import { fetchIndicatorStatusesInRange } from '../dashboard/dashboardApi'
import { fetchAllAxesCatalog } from '../onboarding/onboardingApi'
import type { SemaforoEstado } from '../../lib/types'

export type SiteStatusCounts = Record<SemaforoEstado, number>

/** El pilar de Seguridad se identifica por su `code` del catálogo y no por su
 * nombre o su color, que sí se pueden reconfigurar desde la app — mismo
 * criterio que isLightPillarCard en types.ts. */
const SAFETY_AXIS_CODE = 'seguridad'

function emptyCounts(): SiteStatusCounts {
  return { cumple: 0, riesgo: 0, incumple: 0, sin_datos: 0 }
}

/**
 * Cumplimiento de un sitio en el pilar Seguridad dentro del rango. `pct` sale
 * de `cumplidos / evaluados` — los indicadores sin medición en el rango NO
 * entran al denominador (misma convención que el % de pilar del dashboard
 * general), porque "no midió" no es lo mismo que "no cumplió". Por eso
 * `sinDatos` viaja aparte: es lo que le pone una advertencia al porcentaje.
 */
export interface SiteSafetyScore {
  siteId: string
  cumplidos: number
  /** Indicadores de seguridad con estado evaluable (cumple/riesgo/incumple). */
  evaluados: number
  sinDatos: number
  pct: number | null
}

export interface OrgResults {
  counts: Record<string, SiteStatusCounts>
  /** Sitios de mejor a peor cumplimiento en Seguridad. Los que no tienen
   * ninguna medición en el rango (`pct` nulo) quedan al final: sin datos no
   * se puede reclamar el primer puesto. */
  safetyRanking: SiteSafetyScore[]
}

/** Empate a %: gana quien lo sostiene sobre más indicadores — 3/3 y 12/12 son
 * ambos 100%, pero no cuestan lo mismo. */
function compareSafety(a: SiteSafetyScore, b: SiteSafetyScore): number {
  if (a.pct === null || b.pct === null) {
    if (a.pct === b.pct) return 0
    return a.pct === null ? 1 : -1
  }
  if (a.pct !== b.pct) return b.pct - a.pct
  return b.evaluados - a.evaluados
}

/**
 * Estado (semáforo) de los indicadores activos de la organización dentro del
 * rango, agrupados por sitio, más el ranking de cumplimiento del pilar
 * Seguridad. Ambas cosas salen de la MISMA consulta de estados — el ranking
 * no cuesta un viaje extra.
 *
 * Los indicadores corporativos (site_id nulo) quedan fuera de las dos: no
 * pertenecen a ningún sitio, así que no pueden sumarle ni restarle a uno.
 */
export async function fetchOrgResults(
  organizationId: string,
  range: { from: string; to: string },
): Promise<OrgResults> {
  const [statuses, axes] = await Promise.all([
    fetchIndicatorStatusesInRange(organizationId, range),
    fetchAllAxesCatalog(),
  ])
  const safetyAxisId = axes.find((axis) => axis.code === SAFETY_AXIS_CODE)?.id ?? null

  const counts: Record<string, SiteStatusCounts> = {}
  const safetyBySite = new Map<string, SiteSafetyScore>()

  for (const status of statuses) {
    if (!status.site_id) continue
    const estado = calcularSemaforo(status.latest_value, status.target_value, status.improvement_direction)
    const bucket = counts[status.site_id] ?? emptyCounts()
    bucket[estado] += 1
    counts[status.site_id] = bucket

    if (!safetyAxisId || status.axis_id !== safetyAxisId) continue
    const score = safetyBySite.get(status.site_id) ?? {
      siteId: status.site_id,
      cumplidos: 0,
      evaluados: 0,
      sinDatos: 0,
      pct: null,
    }
    if (estado === 'sin_datos') {
      score.sinDatos += 1
    } else {
      score.evaluados += 1
      if (estado === 'cumple') score.cumplidos += 1
    }
    safetyBySite.set(status.site_id, score)
  }

  const safetyRanking = [...safetyBySite.values()]
    .map((score) => ({
      ...score,
      pct: score.evaluados > 0 ? Math.round((score.cumplidos / score.evaluados) * 100) : null,
    }))
    .sort(compareSafety)

  return { counts, safetyRanking }
}

export function sumCounts(a: SiteStatusCounts, b: SiteStatusCounts): SiteStatusCounts {
  return {
    cumple: a.cumple + b.cumple,
    riesgo: a.riesgo + b.riesgo,
    incumple: a.incumple + b.incumple,
    sin_datos: a.sin_datos + b.sin_datos,
  }
}
