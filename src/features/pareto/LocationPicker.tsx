import { useState } from 'react'
import type { OrgUnit, Site, SiteLocation } from '../../lib/types'
import { WHOLE_ORG_SCOPE, type LocationScope } from './locationScope'
import './location-picker.css'

type LocationNode =
  | { kind: 'org_unit'; id: string; name: string; data: OrgUnit }
  | { kind: 'site'; id: string; name: string; data: Site }
  | { kind: 'site_location'; id: string; name: string; data: SiteLocation }

interface LocationPickerProps {
  orgUnits: OrgUnit[]
  sites: Site[]
  siteLocations: SiteLocation[]
  onChange: (scope: LocationScope) => void
}

function collectDescendantIds<T extends { id: string; parent_id: string | null }>(items: T[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const item of items) {
      if (item.parent_id === current && !ids.has(item.id)) {
        ids.add(item.id)
        stack.push(item.id)
      }
    }
  }
  return ids
}

/**
 * Navega la estructura organizacional completa (Unidad de Negocio › Región ›
 * Sitio › Instalación › ... hasta la ubicación más específica) como un solo
 * árbol combinado, para filtrar el Pareto por cualquier nivel de precisión.
 * Se puede fijar el filtro en cualquier nodo, sin obligar a llegar a la hoja.
 */
export function LocationPicker({ orgUnits, sites, siteLocations, onChange }: LocationPickerProps) {
  const [path, setPath] = useState<LocationNode[]>([])
  const current = path.length ? path[path.length - 1] : null

  function childrenOf(node: LocationNode | null): LocationNode[] {
    if (!node) {
      const businessUnits: LocationNode[] = orgUnits
        .filter((u) => u.level === 2)
        .map((u) => ({ kind: 'org_unit', id: u.id, name: u.name, data: u }))
      const unassignedSites: LocationNode[] = sites
        .filter((s) => !s.org_unit_id)
        .map((s) => ({ kind: 'site', id: s.id, name: s.name, data: s }))
      return [...businessUnits, ...unassignedSites]
    }
    if (node.kind === 'org_unit') {
      const regions: LocationNode[] = orgUnits
        .filter((u) => u.parent_id === node.id)
        .map((u) => ({ kind: 'org_unit', id: u.id, name: u.name, data: u }))
      const childSites: LocationNode[] = sites
        .filter((s) => s.org_unit_id === node.id)
        .map((s) => ({ kind: 'site', id: s.id, name: s.name, data: s }))
      return [...regions, ...childSites]
    }
    if (node.kind === 'site') {
      return siteLocations
        .filter((l) => l.site_id === node.id && !l.parent_id)
        .map((l) => ({ kind: 'site_location', id: l.id, name: l.name, data: l }))
    }
    return siteLocations
      .filter((l) => l.parent_id === node.id)
      .map((l) => ({ kind: 'site_location', id: l.id, name: l.name, data: l }))
  }

  function scopeFor(node: LocationNode | null, nodePath: LocationNode[]): LocationScope {
    if (!node) return WHOLE_ORG_SCOPE
    const label = nodePath.map((n) => n.name).join(' › ')

    if (node.kind === 'org_unit') {
      const unitIds = collectDescendantIds(orgUnits, node.id)
      const siteIds = sites.filter((s) => s.org_unit_id && unitIds.has(s.org_unit_id)).map((s) => s.id)
      return { label, siteIds, locationIds: null }
    }
    if (node.kind === 'site') {
      return { label, siteIds: [node.id], locationIds: null }
    }
    const site = sites.find((s) => s.id === node.data.site_id)
    return {
      label,
      siteIds: site ? [site.id] : [],
      locationIds: collectDescendantIds(siteLocations, node.id),
    }
  }

  function select(node: LocationNode | null, nodePath: LocationNode[]) {
    setPath(nodePath)
    onChange(scopeFor(node, nodePath))
  }

  const children = childrenOf(current)

  return (
    <div className="location-picker">
      <div className="location-picker__breadcrumb">
        <button type="button" onClick={() => select(null, [])} disabled={path.length === 0}>
          Toda la organización
        </button>
        {path.map((node, i) => (
          <span key={node.id}>
            {' › '}
            <button type="button" onClick={() => select(node, path.slice(0, i + 1))} disabled={i === path.length - 1}>
              {node.name}
            </button>
          </span>
        ))}
      </div>

      {children.length > 0 ? (
        <ul className="location-picker__children">
          {children.map((child) => (
            <li key={child.id}>
              <button type="button" onClick={() => select(child, [...path, child])}>
                {child.name} →
              </button>
            </li>
          ))}
        </ul>
      ) : (
        current && <p className="location-picker__leaf-note">Este es el nivel más específico registrado aquí.</p>
      )}
    </div>
  )
}
