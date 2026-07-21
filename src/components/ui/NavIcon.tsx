/**
 * Íconos de línea a medida para el menú lateral. Se dibujan con
 * `currentColor` para heredar el estado (activo/hover) sin CSS extra, y
 * comparten grosor y remates redondeados para leerse como una sola familia.
 */
export type NavIconName =
  | 'account'
  | 'axes'
  | 'levels'
  | 'capture'
  | 'safety'
  | 'panorama'
  | 'org-results'
  | 'indicators'
  | 'compliance'
  | 'pareto'
  | 'dashboard'
  | 'structure'
  | 'schedule'
  | 'clients'
  | 'new-client'
  | 'users'
  | 'authorizations'
  | 'signups'

const PATHS: Record<NavIconName, React.ReactNode> = {
  account: <path d="M9 1.5 2.5 4v4.2c0 4 2.8 6.3 6.5 7.8 3.7-1.5 6.5-3.8 6.5-7.8V4L9 1.5Z" />,
  axes: (
    <>
      <rect x="2.2" y="2.2" width="5.6" height="5.6" rx="1" />
      <rect x="10.2" y="2.2" width="5.6" height="5.6" rx="1" />
      <rect x="2.2" y="10.2" width="5.6" height="5.6" rx="1" />
      <rect x="10.2" y="10.2" width="5.6" height="5.6" rx="1" />
    </>
  ),
  levels: (
    <>
      <circle cx="6" cy="5.3" r="2.1" />
      <circle cx="12.2" cy="5.3" r="2.1" />
      <path d="M2.4 15c0-2.2 1.6-3.6 3.6-3.6s3.6 1.4 3.6 3.6M8.7 15c0-2.2 1.6-3.6 3.5-3.6 2 0 3.4 1.4 3.4 3.6" />
    </>
  ),
  capture: (
    <>
      <rect x="3.5" y="2.5" width="11" height="13" rx="1.4" />
      <path d="M6.5 2.5V1.6h5v.9M6 8.5l1.6 1.6L11 6.6" />
    </>
  ),
  safety: (
    <>
      <path d="M3 9a6 6 0 0 1 12 0" />
      <path d="M2 9h14M7 3.4a6 6 0 0 1 4 0V9H7V3.4Z" />
    </>
  ),
  panorama: (
    <>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M2.4 9h13.2M9 2.4c1.9 2 2.9 4.2 2.9 6.6S10.9 13.6 9 15.6C7.1 13.6 6.1 11.4 6.1 9S7.1 4.4 9 2.4Z" />
    </>
  ),
  'org-results': (
    <>
      <path d="M3.5 15.5V4.2L9 2l5.5 2.2v11.3" />
      <path d="M2.4 15.5h13.2M6.3 6.4h1.6M10.1 6.4h1.6M6.3 9.3h1.6M10.1 9.3h1.6M7.4 15.5v-3h3.2v3" />
    </>
  ),
  indicators: <path d="M2 11.2h2.6L6.4 6l2.4 6.2L11 4l1.6 4.6h3.4" />,
  compliance: (
    <>
      <rect x="3.5" y="3" width="11" height="12.5" rx="1.4" />
      <path d="M6 6.5h6M6 9.2h6M6 11.9h3.5" />
    </>
  ),
  pareto: (
    <>
      <path d="M2.6 15.4h12.8" />
      <rect x="3.6" y="8" width="2.4" height="7.4" rx="0.5" />
      <rect x="7.3" y="10" width="2.4" height="5.4" rx="0.5" />
      <rect x="11" y="12" width="2.4" height="3.4" rx="0.5" />
      <path d="M3.8 6.6 8 4l4.4 3" />
    </>
  ),
  dashboard: (
    <>
      <rect x="2.4" y="2.4" width="6.2" height="4" rx="1" />
      <rect x="2.4" y="8.2" width="6.2" height="7.4" rx="1" />
      <rect x="10" y="2.4" width="5.6" height="7.4" rx="1" />
      <rect x="10" y="11.6" width="5.6" height="4" rx="1" />
    </>
  ),
  structure: (
    <>
      <rect x="6.6" y="1.8" width="4.8" height="3.4" rx="0.8" />
      <rect x="1.8" y="12.8" width="4.4" height="3.4" rx="0.8" />
      <rect x="11.8" y="12.8" width="4.4" height="3.4" rx="0.8" />
      <path d="M9 5.2v3.4M4 12.8v-2.2h10v2.2M9 8.6v2" />
    </>
  ),
  schedule: (
    <>
      <circle cx="9" cy="9.4" r="6.4" />
      <path d="M9 5.6v4l2.6 1.6" />
    </>
  ),
  clients: (
    <>
      <rect x="2.2" y="5.4" width="13.6" height="9.4" rx="1.4" />
      <path d="M6.6 5.4V4c0-.8.6-1.4 1.4-1.4h2c.8 0 1.4.6 1.4 1.4v1.4M2.2 9.2h13.6" />
    </>
  ),
  'new-client': (
    <>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M9 5.8v6.4M5.8 9h6.4" />
    </>
  ),
  users: (
    <>
      <circle cx="7" cy="6" r="2.3" />
      <path d="M2.6 15c0-2.6 2-4.2 4.4-4.2s4.4 1.6 4.4 4.2" />
      <path d="M12 4.1a2.3 2.3 0 0 1 0 4.4M13 10.9c1.6.4 2.7 1.7 2.7 3.6" />
    </>
  ),
  authorizations: (
    <>
      <circle cx="6.2" cy="6.2" r="3.4" />
      <path d="M8.6 8.6l6 6M12.4 12.4l1.4-1.4M10.6 10.6l1.4-1.4" />
    </>
  ),
  signups: (
    <>
      <circle cx="6.6" cy="5.8" r="2.6" />
      <path d="M2.4 15c0-2.4 1.9-3.9 4.2-3.9 1 0 1.9.3 2.6.8" />
      <path d="M12.4 10.6v4M10.4 12.6h4" />
    </>
  ),
}

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 18 18"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
