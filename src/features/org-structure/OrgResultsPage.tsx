import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { fetchOrgUnits, fetchSitesWithOrgUnit } from './orgStructureApi'
import { fetchIndicatorStatusBySite, sumCounts, type SiteStatusCounts } from './orgResultsApi'
import type { OrgUnit, Site } from '../../lib/types'
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

export function OrgResultsPage() {
  const { organizationId } = useAuth()
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteCounts, setSiteCounts] = useState<Record<string, SiteStatusCounts>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false

    Promise.all([
      fetchOrgUnits(organizationId),
      fetchSitesWithOrgUnit(organizationId),
      fetchIndicatorStatusBySite(organizationId),
    ]).then(([orgUnitsData, sitesData, counts]) => {
      if (cancelled) return
      setOrgUnits(orgUnitsData)
      setSites(sitesData)
      setSiteCounts(counts)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [organizationId])

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

  const businessUnits = orgUnits.filter((u) => u.level === 2)
  const unassignedSites = sites.filter((s) => !s.org_unit_id)

  if (loading) return <p>Cargando resultados…</p>

  return (
    <div className="org-structure-page">
      <h1>Resultados por organización</h1>
      <p className="page-subtitle">
        Indicadores por Unidad de Negocio → Región → Sitio.{' '}
        <span className="org-results-legend">
          <span className="org-results-badge org-results-badge--cumple">0</span> cumple ·{' '}
          <span className="org-results-badge org-results-badge--riesgo">0</span> riesgo ·{' '}
          <span className="org-results-badge org-results-badge--incumple">0</span> incumple ·{' '}
          <span className="org-results-badge org-results-badge--sin_datos">0</span> sin datos
        </span>
      </p>

      {businessUnits.length === 0 && unassignedSites.length === 0 && (
        <p>Todavía no hay unidades de negocio ni sitios configurados.</p>
      )}

      {businessUnits.map((bu) => (
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

      {unassignedSites.length > 0 && (
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
