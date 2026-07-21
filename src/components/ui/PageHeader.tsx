import type { ReactNode } from 'react'

/**
 * Encabezado consistente para todas las pantallas: un "eyebrow" de categoría
 * (dónde estás en la app), el título fuerte y un subtítulo opcional, con un
 * espacio a la derecha para acciones. Reemplaza el patrón suelto de
 * `<h1>` + `<p className="page-subtitle">` para que toda la app lea igual.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className="page-head__main">
        {eyebrow && <span className="page-head__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-head__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}
