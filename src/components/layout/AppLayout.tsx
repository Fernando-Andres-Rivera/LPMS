import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './AppLayout.css'

const ROLE_LABEL: Record<string, string> = {
  admin_consultora: 'Admin Consultora',
  admin_cliente: 'Admin Cliente',
  gerente: 'Gerente',
  administrativo: 'Administrativo',
  operativo: 'Operativo',
}

export function AppLayout() {
  const { profile, signOut, organizations, organizationId, setOrganizationId } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [lastPathname, setLastPathname] = useState(location.pathname)

  const canManageIndicators =
    profile && ['admin_consultora', 'admin_cliente', 'gerente', 'administrativo'].includes(profile.role)
  const isManagement = profile && ['admin_consultora', 'admin_cliente', 'gerente'].includes(profile.role)
  const isConsultora = profile?.role === 'admin_consultora'
  const canOnboardUsers = profile && ['admin_consultora', 'admin_cliente'].includes(profile.role)

  // Cierra el menú móvil cada vez que se navega a otra pantalla (ajuste de
  // estado durante el render, no en un efecto — así lo recomienda React
  // para "resetear" estado cuando cambia algo derivado de las props/ruta).
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setMenuOpen(false)
  }

  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

  return (
    <div className="app-layout">
      {menuOpen && <div className="app-sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`app-sidebar ${menuOpen ? 'app-sidebar--open' : ''}`}>
        <div className="app-sidebar__brand">LPMS</div>
        <nav className="app-sidebar__nav">
          <span className="app-sidebar__section">Diario</span>
          <NavLink to="/" end className={linkClass}>
            Ejes
          </NavLink>
          <NavLink to="/niveles/1" className={linkClass}>
            Reunión por nivel
          </NavLink>
          <NavLink to="/captura" className={linkClass}>
            Captura de mediciones
          </NavLink>
          <NavLink to="/seguridad" className={linkClass}>
            Seguridad y Salud en el Trabajo
          </NavLink>

          {(isManagement || canManageIndicators) && <span className="app-sidebar__section">Gestión</span>}
          {isManagement && (
            <NavLink to="/panorama-global" className={linkClass}>
              Panorama global
            </NavLink>
          )}
          {isManagement && (
            <NavLink to="/resultados-organizacion" className={linkClass}>
              Resultados por organización
            </NavLink>
          )}
          {canManageIndicators && (
            <NavLink to="/indicadores" className={linkClass}>
              Indicadores
            </NavLink>
          )}
          {canManageIndicators && (
            <NavLink to="/cumplimiento-captura" className={linkClass}>
              Cumplimiento de captura
            </NavLink>
          )}
          {canManageIndicators && (
            <NavLink to="/pareto" className={linkClass}>
              Pareto de causas
            </NavLink>
          )}

          {(isManagement || isConsultora || canOnboardUsers) && (
            <span className="app-sidebar__section">Configuración</span>
          )}
          {isManagement && (
            <NavLink to="/estructura-organizacional" className={linkClass}>
              Estructura organizacional
            </NavLink>
          )}
          {isConsultora && (
            <NavLink to="/clientes" className={linkClass}>
              Clientes
            </NavLink>
          )}
          {isConsultora && (
            <NavLink to="/nuevo-cliente" className={linkClass}>
              + Nuevo cliente
            </NavLink>
          )}
          {canOnboardUsers && (
            <NavLink to="/vincular-usuario" className={linkClass}>
              Vincular usuario
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__left">
            <button
              type="button"
              className="app-topbar__menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div className="app-topbar__user">
              <strong>{profile?.full_name}</strong>
              {profile && <span className="app-topbar__role">{ROLE_LABEL[profile.role]}</span>}
            </div>
          </div>
          <div className="app-topbar__actions">
            {profile?.role === 'admin_consultora' && organizations.length > 0 && (
              <select
                className="app-topbar__org-switcher"
                value={organizationId ?? ''}
                onChange={(e) => setOrganizationId(e.target.value)}
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
            <button className="app-topbar__logout" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
