export interface LocationScope {
  label: string
  /** Sitios en alcance; null = toda la organización, sin restricción. */
  siteIds: string[] | null
  /** Instalaciones/ubicaciones en alcance (nodo elegido + descendientes); null = cualquier ubicación dentro de los sitios en alcance. */
  locationIds: Set<string> | null
}

export const WHOLE_ORG_SCOPE: LocationScope = { label: 'Toda la organización', siteIds: null, locationIds: null }
