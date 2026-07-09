import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  assignSiteToOrgUnit,
  createOrgUnit,
  createSite,
  createSiteLocation,
  fetchOrgUnits,
  fetchSiteLocationsForSites,
  fetchSitesWithOrgUnit,
} from './orgStructureApi'
import type { OrgUnit, Site, SiteLocation } from '../../lib/types'
import './org-structure.css'

function buildOrgUnitOptions(orgUnits: OrgUnit[]): { id: string; label: string }[] {
  const businessUnits = orgUnits.filter((u) => u.level === 2)
  const options: { id: string; label: string }[] = []
  for (const bu of businessUnits) {
    options.push({ id: bu.id, label: bu.name })
    for (const region of orgUnits.filter((u) => u.parent_id === bu.id)) {
      options.push({ id: region.id, label: `${bu.name} › ${region.name}` })
    }
  }
  return options
}

export function OrgStructurePage() {
  const { profile, organizationId } = useAuth()
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [locationsBySite, setLocationsBySite] = useState<Record<string, SiteLocation[]>>({})
  const [loading, setLoading] = useState(true)

  const [newBusinessUnit, setNewBusinessUnit] = useState('')
  const [newRegionName, setNewRegionName] = useState<Record<string, string>>({})
  const [newLocationName, setNewLocationName] = useState<Record<string, string>>({})

  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteAddress, setNewSiteAddress] = useState('')
  const [newSiteOrgUnitId, setNewSiteOrgUnitId] = useState('')
  const [savingSite, setSavingSite] = useState(false)

  async function loadAll() {
    if (!organizationId) return
    setLoading(true)
    const [orgUnitsData, sitesData] = await Promise.all([
      fetchOrgUnits(organizationId),
      fetchSitesWithOrgUnit(organizationId),
    ])
    setOrgUnits(orgUnitsData)
    setSites(sitesData)

    const locations = await fetchSiteLocationsForSites(sitesData.map((s) => s.id))
    const grouped: Record<string, SiteLocation[]> = {}
    for (const loc of locations) {
      grouped[loc.site_id] = [...(grouped[loc.site_id] ?? []), loc]
    }
    setLocationsBySite(grouped)
    setLoading(false)
  }

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false

    Promise.all([fetchOrgUnits(organizationId), fetchSitesWithOrgUnit(organizationId)]).then(
      async ([orgUnitsData, sitesData]) => {
        if (cancelled) return
        setOrgUnits(orgUnitsData)
        setSites(sitesData)

        const locations = await fetchSiteLocationsForSites(sitesData.map((s) => s.id))
        if (cancelled) return
        const grouped: Record<string, SiteLocation[]> = {}
        for (const loc of locations) {
          grouped[loc.site_id] = [...(grouped[loc.site_id] ?? []), loc]
        }
        setLocationsBySite(grouped)
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [organizationId])

  async function handleAddBusinessUnit() {
    if (!profile || !organizationId || !newBusinessUnit.trim()) return
    await createOrgUnit({
      organizationId,
      parentId: null,
      level: 2,
      name: newBusinessUnit.trim(),
      createdBy: profile.id,
    })
    setNewBusinessUnit('')
    await loadAll()
  }

  async function handleAddRegion(businessUnitId: string) {
    if (!profile || !organizationId) return
    const name = newRegionName[businessUnitId]?.trim()
    if (!name) return
    await createOrgUnit({
      organizationId,
      parentId: businessUnitId,
      level: 3,
      name,
      createdBy: profile.id,
    })
    setNewRegionName((n) => ({ ...n, [businessUnitId]: '' }))
    await loadAll()
  }

  async function handleAssignSite(siteId: string, orgUnitId: string) {
    await assignSiteToOrgUnit(siteId, orgUnitId || null)
    await loadAll()
  }

  async function handleAddSite() {
    if (!organizationId || !newSiteName.trim()) return
    setSavingSite(true)
    try {
      await createSite({
        organizationId,
        name: newSiteName.trim(),
        address: newSiteAddress.trim() || null,
        orgUnitId: newSiteOrgUnitId || null,
      })
      setNewSiteName('')
      setNewSiteAddress('')
      setNewSiteOrgUnitId('')
      await loadAll()
    } finally {
      setSavingSite(false)
    }
  }

  async function handleAddLocation(siteId: string) {
    if (!profile) return
    const name = newLocationName[siteId]?.trim()
    if (!name) return
    await createSiteLocation({ siteId, parentId: null, level: 5, name, createdBy: profile.id })
    setNewLocationName((n) => ({ ...n, [siteId]: '' }))
    await loadAll()
  }

  const orgUnitOptions = buildOrgUnitOptions(orgUnits)
  const businessUnits = orgUnits.filter((u) => u.level === 2)

  if (loading) return <p>Cargando estructura organizacional…</p>

  return (
    <div className="org-structure-page">
      <h1>Estructura organizacional</h1>
      <p className="page-subtitle">
        El orden importa: Unidad de Negocio → Región → Sitio → Instalación. Un sitio (una planta, bodega u
        oficina) tiene que existir antes de poder colgarle instalaciones — por eso "Sitios" tiene su propio
        formulario de alta abajo, no solo la lista. A medida que el servicio de la consultora crece dentro de un
        cliente, aquí es donde se abre cada unidad de negocio, sitio o instalación nueva.
      </p>

      <section className="org-structure-card">
        <h2>1. Unidades de Negocio y Regiones</h2>

        <div className="org-structure-tree">
          {businessUnits.map((bu) => (
            <div key={bu.id} className="org-structure-bu">
              <strong>{bu.name}</strong>
              <ul>
                {orgUnits
                  .filter((u) => u.parent_id === bu.id)
                  .map((region) => (
                    <li key={region.id}>{region.name}</li>
                  ))}
              </ul>
              <div className="org-structure-add-row">
                <input
                  placeholder="Nueva región…"
                  value={newRegionName[bu.id] ?? ''}
                  onChange={(e) => setNewRegionName((n) => ({ ...n, [bu.id]: e.target.value }))}
                />
                <button type="button" onClick={() => handleAddRegion(bu.id)}>
                  + Agregar región
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="org-structure-add-row org-structure-add-row--top">
          <input
            placeholder="Nueva unidad de negocio…"
            value={newBusinessUnit}
            onChange={(e) => setNewBusinessUnit(e.target.value)}
          />
          <button type="button" className="button-primary" onClick={handleAddBusinessUnit}>
            + Agregar unidad de negocio
          </button>
        </div>
      </section>

      <section className="org-structure-card">
        <h2>2. Sitios</h2>
        <p className="org-structure-card__subtitle">
          Crea primero el sitio; una vez aparezca en la tabla, podrás agregarle instalaciones (paso 3) en su
          propia fila.
        </p>

        <div className="org-structure-add-row org-structure-add-row--site">
          <input
            placeholder="Nombre del sitio (ej. Planta Medellín)…"
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
          />
          <input
            placeholder="Dirección (opcional)…"
            value={newSiteAddress}
            onChange={(e) => setNewSiteAddress(e.target.value)}
          />
          <select value={newSiteOrgUnitId} onChange={(e) => setNewSiteOrgUnitId(e.target.value)}>
            <option value="">Unidad de Negocio / Región (opcional)</option>
            {orgUnitOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button-primary"
            onClick={handleAddSite}
            disabled={savingSite || !newSiteName.trim()}
          >
            {savingSite ? 'Creando…' : '+ Agregar sitio'}
          </button>
        </div>

        <div className="table-scroll">
        <table className="org-structure-sites-table">
          <thead>
            <tr>
              <th>Sitio</th>
              <th>Unidad de Negocio / Región</th>
              <th>3. Instalaciones</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id}>
                <td>{site.name}</td>
                <td>
                  <select
                    value={site.org_unit_id ?? ''}
                    onChange={(e) => handleAssignSite(site.id, e.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {orgUnitOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="org-structure-locations">
                    {(locationsBySite[site.id] ?? []).map((loc) => (
                      <span key={loc.id} className="org-structure-location-chip">
                        {loc.name}
                      </span>
                    ))}
                  </div>
                  <div className="org-structure-add-row">
                    <input
                      placeholder="Nueva instalación…"
                      value={newLocationName[site.id] ?? ''}
                      onChange={(e) => setNewLocationName((n) => ({ ...n, [site.id]: e.target.value }))}
                    />
                    <button type="button" onClick={() => handleAddLocation(site.id)}>
                      + Agregar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}
