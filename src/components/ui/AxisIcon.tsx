/**
 * Ícono de cada eje SMQDCEP según su KPI. Se elige por el código `icon` que
 * ya trae el catálogo de ejes en la base de datos (shield, wrench, …). Dibuja
 * con `currentColor` para poder pintarse del color del eje o en blanco sobre
 * una insignia de color. Cae en un ícono genérico si el código no se conoce.
 */
const PATHS: Record<string, React.ReactNode> = {
  // Seguridad — escudo
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  // Mantenimiento — llave
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  // Calidad — verificación
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="m8 12 2.7 2.7L16.2 9" />
    </>
  ),
  // Disponibilidad — pulso / actividad
  activity: <path d="M22 12h-3.5l-2.5 8-5-16-2.5 8H2" />,
  // Costos — dinero
  'dollar-sign': (
    <>
      <line x1="12" y1="2.5" x2="12" y2="21.5" />
      <path d="M17 5.5H9.5a3.4 3.4 0 0 0 0 6.8h5a3.4 3.4 0 0 1 0 6.8H6" />
    </>
  ),
  // Estándar — lista con checks
  'list-checks': (
    <>
      <path d="m3 6.5 1.6 1.6L8 4.7" />
      <path d="m3 15.5 1.6 1.6L8 13.7" />
      <path d="M12 7h9M12 16h9" />
    </>
  ),
  // Personas — equipo
  users: (
    <>
      <path d="M16 20v-1.6a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V20" />
      <circle cx="9.2" cy="7.2" r="3.6" />
      <path d="M21.5 20v-1.6a4 4 0 0 0-3-3.87M16.5 3.7a4 4 0 0 1 0 7.4" />
    </>
  ),
}

const FALLBACK = (
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </>
)

export function AxisIcon({ icon, size = 22 }: { icon: string | null; size?: number }) {
  return (
    <svg
      className="axis-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(icon && PATHS[icon]) || FALLBACK}
    </svg>
  )
}
