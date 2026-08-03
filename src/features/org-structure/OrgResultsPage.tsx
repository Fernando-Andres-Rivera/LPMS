import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { RangePicker } from '../../components/ui/RangePicker'
import { defaultRange } from '../../lib/dateRange'
import { fetchOrgUnits, fetchSitesWithOrgUnit } from './orgStructureApi'
import { fetchOrgResults, sumCounts, type SiteSafetyScore, type SiteStatusCounts } from './orgResultsApi'
import { cumplimientoPctColor } from '../../lib/semaforo'
import type { OrgUnit, Site } from '../../lib/types'
import { PageHeader } from '../../components/ui/PageHeader'
import { NumberTicker } from '../../components/ui/NumberTicker'
import './org-structure.css'

function emptyCounts(): SiteStatusCounts {
  return { cumple: 0, riesgo: 0, incumple: 0, sin_datos: 0 }
}

function StatusBadges({ counts }: { counts: SiteStatusCounts }) {
  return (
    <span className="org-results-badges">
      <span className="org-results-badge org-results-badge--cumple">{counts.cumple}</span>
      <span className="org-results-badge org-results-badge--riesgo">{counts.riesgo}</span>
      <span className="org-results-badge org-results-badge--incumple">{counts.incumple}</span>
      <span className="org-results-badge org-results-badge--sin_datos">{counts.sin_datos}</span>
    </span>
  )
}

/**
 * Ranking de seguridad: el sitio más seguro es el que cumplió mejor sus
 * indicadores del pilar Seguridad en el período, no el que reportó menos
 * accidentes. Se muestra siempre `cumplidos/evaluados` junto al %, porque
 * 100% sobre 2 indicadores y 92% sobre 12 no se leen igual.
 */
function SafetyRanking({ scores, siteName }: { scores: SiteSafetyScore[]; siteName: (id: string) => string }) {
  if (scores.length === 0) {
    return (
      <p className="org-safety-ranking__empty">
        Ningún sitio tiene indicadores del pilar Seguridad en este período. Los indicadores corporativos (sin sitio) no
        entran al ranking.
      </p>
    )
  }

  const ranked = scores.filter((s) => s.pct !== null)
  const sinMedicion = scores.filter((s) => s.pct === null)

  return (
    <>
      <ol className="org-safety-ranking">
        {ranked.map((score, i) => (
          <li key={score.siteId} className={`org-safety-rank${i === 0 ? ' org-safety-rank--top' : ''}`}>
            <span className="org-safety-rank__pos">{i + 1}</span>
            <span className="org-safety-rank__name">{siteName(score.siteId)}</span>
            <span className="org-safety-rank__meta">
              <strong className="org-safety-rank__pct">
                {/* ranked ya filtró pct === null; el ?? 0 es solo para el tipo */}
                <NumberTicker value={score.pct ?? 0} />%
              </strong>
              <span className="org-safety-rank__detail">
                {score.cumplidos}/{score.evaluados} cumplen
              </span>
              {score.sinDatos > 0 && (
                <span
                  className="org-safety-rank__warn"
                  title="Indicadores de seguridad sin ninguna medición en el período — no cuentan en el porcentaje."
                >
                  {score.sinDatos} sin datos
                </span>
              )}
            </span>
            <span className="org-safety-rank__bar">
              <i style={{ width: `${score.pct}%`, background: cumplimientoPctColor(score.pct) }} />
            </span>
          </li>
        ))}
      </ol>

      {sinMedicion.length > 0 && (
        <p className="org-safety-ranking__empty">
          Sin mediciones de seguridad en el período, fuera del ranking:{' '}
          {sinMedicion.map((s) => siteName(s.siteId)).join(', ')}.
        </p>
      )}
    </>
  )
}

export function OrgResultsPage() {
  const { organizationId } = useAuth()
  const [range, setRange] = useState(defaultRange())
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteCounts, setSiteCounts] = useState<Record<string, SiteStatusCounts>>({})
  const [safetyRanking, setSafetyRanking] = useState<SiteSafetyScore[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const [orgUnitsData, sitesData, results] = await Promise.all([
        fetchOrgUnits(orgId),
        fetchSitesWithOrgUnit(orgId),
        fetchOrgResults(orgId, range),
      ])
      if (cancelled) return
      setOrgUnits(orgUnitsData)
      setSites(sitesData)
      setSiteCounts(results.counts)
      setSafetyRanking(results.safetyRanking)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [organizationId, range])

  function countsForSite(siteId: string): SiteStatusCounts {
    return siteCounts[siteId] ?? emptyCounts()
  }

  function countsForOrgUnit(orgUnitId: string): SiteStatusCounts {
    const childRegions = orgUnits.filter((u) => u.parent_id === orgUnitId)
    let total = emptyCounts()
    for (const region of childRegions) {
      total = sumCounts(total, countsForOrgUnit(region.id))
    }
    for (const site of sites.filter((s) => s.org_unit_id === orgUnitId)) {
      total = sumCounts(total, countsForSite(site.id))
    }
    return total
  }

  function siteName(siteId: string): string {
    return sites.find((s) => s.id === siteId)?.name ?? 'Sitio sin nombre'
  }

  const businessUnits = orgUnits.filter((u) => u.level === 2)
  const unassignedSites = sites.filter((s) => !s.org_unit_id)

  return (
    <div className="org-structure-page">
      <PageHeader
        eyebrow="Gestión · Resultados"
        title="Resultados por organización"
        subtitle={
          <>
            Indicadores por Unidad de Negocio → Región → Sitio, dentro del período elegido.{' '}
            <span className="org-results-legend">
              <span className="org-results-badge org-results-badge--cumple">0</span> cumple ·{' '}
              <span className="org-results-badge org-results-badge--riesgo">0</span> riesgo ·{' '}
              <span className="org-results-badge org-results-badge--incumple">0</span> incumple ·{' '}
              <span className="org-results-badge org-results-badge--sin_datos">0</span> sin datos
            </span>
          </>
        }
      />

      <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />

      {loading && <p>Cargando resultados…</p>}

      {!loading && (
        <section className="org-structure-card">
          <div className="org-results-row org-results-row--bu">
            <strong>Sitio más seguro</strong>
            <span className="org-results-legend">
              % de indicadores del pilar Seguridad que cumplieron su objetivo
            </span>
          </div>
          <SafetyRanking scores={safetyRanking} siteName={siteName} />
        </section>
      )}

      {!loading && businessUnits.length === 0 && unassignedSites.length === 0 && (
        <p>Todavía no hay unidades de negocio ni sitios configurados.</p>
      )}

      {!loading && businessUnits.map((bu) => (
        <section className="org-structure-card" key={bu.id}>
          <div className="org-results-row org-results-row--bu">
            <strong>{bu.name}</strong>
            <StatusBadges counts={countsForOrgUnit(bu.id)} />
          </div>

          {orgUnits
            .filter((u) => u.parent_id === bu.id)
            .map((region) => (
              <div key={region.id} className="org-results-region">
                <div className="org-results-row">
                  <span>{region.name}</span>
                  <StatusBadges counts={countsForOrgUnit(region.id)} />
                </div>
                <ul className="org-results-sites">
                  {sites
                    .filter((s) => s.org_unit_id === region.id)
                    .map((site) => (
                      <li key={site.id} className="org-results-row">
                        <span>{site.name}</span>
                        <StatusBadges counts={countsForSite(site.id)} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}

          <ul className="org-results-sites">
            {sites
              .filter((s) => s.org_unit_id === bu.id)
              .map((site) => (
                <li key={site.id} className="org-results-row">
                  <span>{site.name}</span>
                  <StatusBadges counts={countsForSite(site.id)} />
                </li>
              ))}
          </ul>
        </section>
      ))}

      {!loading && unassignedSites.length > 0 && (
        <section className="org-structure-card">
          <div className="org-results-row org-results-row--bu">
            <strong>Sitios sin asignar</strong>
          </div>
          <ul className="org-results-sites">
            {unassignedSites.map((site) => (
              <li key={site.id} className="org-results-row">
                <span>{site.name}</span>
                <StatusBadges counts={countsForSite(site.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
