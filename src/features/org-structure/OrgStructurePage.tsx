import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  assignSiteToOrgUnit,
  createOrgUnit,
  createSite,
  createSiteLocation,
  deleteOrgUnit,
  deleteSite,
  deleteSiteLocation,
  fetchOrgUnits,
  fetchSiteLocationsForSites,
  fetchSitesWithOrgUnit,
  renameOrgUnit,
  renameSite,
  renameSiteLocation,
  setSiteActive,
  setSiteLocationActive,
} from './orgStructureApi'
import type { OrgUnit, Site, SiteLocation } from '../../lib/types'
import './org-structure.css'

type StructureKind = 'org_unit' | 'site' | 'location'

interface StructureRef {
  kind: StructureKind
  id: string
  name: string
}

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

  const [editing, setEditing] = useState<(StructureRef & { value: string }) | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<StructureRef | null>(null)
  // Si un borrado quedó bloqueado por datos históricos, guardamos la
  // referencia para ofrecer "Desactivar en su lugar" junto al mensaje.
  const [blocked, setBlocked] = useState<(StructureRef & { message: string }) | null>(null)

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

  async function handleSaveRename() {
    if (!editing || !editing.value.trim()) return
    const name = editing.value.trim()
    if (editing.kind === 'org_unit') await renameOrgUnit(editing.id, name)
    else if (editing.kind === 'site') await renameSite(editing.id, name)
    else await renameSiteLocation(editing.id, name)
    setEditing(null)
    await loadAll()
  }

  async function handleConfirmDelete() {
    if (!confirmingDelete) return
    const target = confirmingDelete
    setConfirmingDelete(null)
    setBlocked(null)
    try {
      if (target.kind === 'org_unit') await deleteOrgUnit(target.id, target.name)
      else if (target.kind === 'site') await deleteSite(target.id, target.name)
      else await deleteSiteLocation(target.id, target.name)
      await loadAll()
    } catch (err) {
      setBlocked({
        ...target,
        message: err instanceof Error ? err.message : 'No se pudo eliminar.',
      })
    }
  }

  /** "Desactivar en su lugar" cuando el borrado quedó bloqueado por histórico:
   * el nodo desaparece de las listas y selectores pero conserva sus datos. */
  async function handleDeactivateBlocked() {
    if (!blocked) return
    if (blocked.kind === 'site') await setSiteActive(blocked.id, false)
    else if (blocked.kind === 'location') await setSiteLocationActive(blocked.id, false)
    setBlocked(null)
    await loadAll()
  }

  function renderItemActions(ref: StructureRef) {
    if (confirmingDelete && confirmingDelete.id === ref.id) {
      return (
        <span className="org-structure-confirm">
          ¿Eliminar <strong>{ref.name}</strong>?
          <button type="button" className="org-structure-confirm__yes" onClick={handleConfirmDelete}>
            Sí, eliminar
          </button>
          <button type="button" onClick={() => setConfirmingDelete(null)}>
            Cancelar
          </button>
        </span>
      )
    }
    return (
      <span className="org-structure-item-actions">
        <button
          type="button"
          title={`Renombrar ${ref.name}`}
          onClick={() => setEditing({ ...ref, value: ref.name })}
        >
          ✎
        </button>
        <button
          type="button"
          title={`Eliminar ${ref.name}`}
          className="org-structure-item-actions__delete"
          onClick={() => {
            setBlocked(null)
            setConfirmingDelete(ref)
          }}
        >
          ×
        </button>
      </span>
    )
  }

  function renderRenameInput() {
    if (!editing) return null
    return (
      <span className="org-structure-rename">
        <input
          value={editing.value}
          onChange={(e) => setEditing((cur) => (cur ? { ...cur, value: e.target.value } : cur))}
          autoFocus
        />
        <button
          type="button"
          className="org-structure-rename__save"
          onClick={handleSaveRename}
          disabled={!editing.value.trim()}
        >
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(null)}>
          Cancelar
        </button>
      </span>
    )
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

      {blocked && (
        <div className="org-structure-blocked">
          <p>{blocked.message}</p>
          {blocked.kind !== 'org_unit' && (
            <button type="button" className="org-structure-blocked__deactivate" onClick={handleDeactivateBlocked}>
              Desactivar "{blocked.name}" conservando su histórico
            </button>
          )}
          <button type="button" className="org-structure-blocked__close" onClick={() => setBlocked(null)}>
            Cerrar
          </button>
        </div>
      )}

      <section className="org-structure-card">
        <h2>1. Unidades de Negocio y Regiones</h2>

        <div className="org-structure-tree">
          {businessUnits.map((bu) => (
            <div key={bu.id} className="org-structure-bu">
              {editing?.id === bu.id ? (
                renderRenameInput()
              ) : (
                <>
                  <strong>{bu.name}</strong>
                  {renderItemActions({ kind: 'org_unit', id: bu.id, name: bu.name })}
                </>
              )}
              <ul>
                {orgUnits
                  .filter((u) => u.parent_id === bu.id)
                  .map((region) => (
                    <li key={region.id}>
                      {editing?.id === region.id ? (
                        renderRenameInput()
                      ) : (
                        <>
                          {region.name}
                          {renderItemActions({ kind: 'org_unit', id: region.id, name: region.name })}
                        </>
                      )}
                    </li>
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
                <td>
                  {editing?.id === site.id ? (
                    renderRenameInput()
                  ) : (
                    <>
                      {site.name}
                      {renderItemActions({ kind: 'site', id: site.id, name: site.name })}
                    </>
                  )}
                </td>
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
                        {editing?.id === loc.id ? (
                          renderRenameInput()
                        ) : (
                          <>
                            {loc.name}
                            {renderItemActions({ kind: 'location', id: loc.id, name: loc.name })}
                          </>
                        )}
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
