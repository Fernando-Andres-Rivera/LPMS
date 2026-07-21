import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { USER_ROLE_LABEL } from '../../lib/types'
import { NavIcon, type NavIconName } from '../ui/NavIcon'
import './AppLayout.css'

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

  const linkClass = ({ isActive }: { isActive: boolean }) => `app-sidebar__link${isActive ? ' active' : ''}`

  const item = (to: string, icon: NavIconName, label: string, end = false) => (
    <NavLink to={to} end={end} className={linkClass}>
      <span className="app-sidebar__ico">
        <NavIcon name={icon} />
      </span>
      <span className="app-sidebar__label">{label}</span>
    </NavLink>
  )

  return (
    <div className="app-layout">
      {menuOpen && <div className="app-sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`app-sidebar ${menuOpen ? 'app-sidebar--open' : ''}`}>
        <div className="app-sidebar__brand">
          <span className="app-sidebar__brand-mark" aria-hidden="true">
            <span className="app-sidebar__brand-bar" />
            <span className="app-sidebar__brand-bar" />
            <span className="app-sidebar__brand-bar" />
            <span className="app-sidebar__brand-bar" />
          </span>
          <span className="app-sidebar__brand-text">LPMS</span>
        </div>
        <nav className="app-sidebar__nav">
          <span className="app-sidebar__section">Mi cuenta</span>
          {item('/seguridad-cuenta', 'account', 'Seguridad de la cuenta')}

          <span className="app-sidebar__section">Diario</span>
          {item('/', 'axes', 'Ejes', true)}
          {item('/niveles/1', 'levels', 'Reunión por nivel')}
          {item('/captura', 'capture', 'Captura de mediciones')}
          {item('/seguridad', 'safety', 'Seguridad y Salud en el Trabajo')}

          {(isManagement || canManageIndicators) && <span className="app-sidebar__section">Gestión</span>}
          {isManagement && item('/panorama-global', 'panorama', 'Panorama global')}
          {isManagement && item('/resultados-organizacion', 'org-results', 'Resultados por organización')}
          {canManageIndicators && item('/indicadores', 'indicators', 'Indicadores')}
          {canManageIndicators && item('/cumplimiento-captura', 'compliance', 'Cumplimiento de captura')}
          {canManageIndicators && item('/pareto', 'pareto', 'Pareto de causas')}
          {canManageIndicators && item('/dashboard', 'dashboard', 'Dashboard')}

          {(isManagement || isConsultora || canOnboardUsers) && (
            <span className="app-sidebar__section">Configuración</span>
          )}
          {isManagement && item('/estructura-organizacional', 'structure', 'Estructura organizacional')}
          {isManagement && item('/horario-reuniones', 'schedule', 'Horario de reuniones')}
          {isConsultora && item('/clientes', 'clients', 'Clientes')}
          {isConsultora && item('/nuevo-cliente', 'new-client', 'Nuevo cliente')}
          {isConsultora && item('/autorizaciones-captura', 'authorizations', 'Autorizaciones de captura')}
          {isConsultora && item('/registros', 'signups', 'Registros Demo')}
          {canOnboardUsers && item('/usuarios', 'users', 'Usuarios')}
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
              {profile && <span className="app-topbar__role">{USER_ROLE_LABEL[profile.role]}</span>}
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
