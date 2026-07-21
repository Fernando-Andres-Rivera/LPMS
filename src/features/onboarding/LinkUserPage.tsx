import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  inviteUser,
  fetchOrganizationsList,
  fetchSitesForOrganization,
  fetchOrganizationUsers,
  updateUserRole,
  setUserActive,
  setUserSites,
  type OrgUserRow,
} from './onboardingApi'
import type { Organization, Site, UserRole } from '../../lib/types'
import { PageHeader } from '../../components/ui/PageHeader'
import './onboarding.css'

/** Un admin_cliente solo puede invitar dentro de su propia organización, y
 * nunca al rol admin_consultora (reservado al equipo de LeanProLogistic) —
 * la Edge Function revalida esto mismo del lado del servidor. */
const CONSULTORA_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin_consultora', label: 'Admin Consultora (equipo LeanProLogistic)' },
  { value: 'admin_cliente', label: 'Admin Cliente' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'operativo', label: 'Operativo' },
]
const CLIENTE_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin_cliente', label: 'Admin Cliente' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'operativo', label: 'Operativo' },
]

export function LinkUserPage() {
  const { profile, organizationId } = useAuth()
  const isConsultora = profile?.role === 'admin_consultora'
  const roleOptions = isConsultora ? CONSULTORA_ROLE_OPTIONS : CLIENTE_ROLE_OPTIONS

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [sites, setSites] = useState<Site[]>([])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('gerente')
  const [selectedOrgId, setSelectedOrgId] = useState(organizationId ?? '')
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)

  const [users, setUsers] = useState<OrgUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [userError, setUserError] = useState<string | null>(null)
  const [usersRefreshKey, setUsersRefreshKey] = useState(0)

  useEffect(() => {
    if (isConsultora) fetchOrganizationsList().then(setOrganizations)
  }, [isConsultora])

  useEffect(() => {
    let cancelled = false
    const request = selectedOrgId ? fetchSitesForOrganization(selectedOrgId) : Promise.resolve([])
    request.then((data) => {
      if (!cancelled) setSites(data)
    })
    return () => {
      cancelled = true
    }
  }, [selectedOrgId])

  useEffect(() => {
    let cancelled = false
    if (!selectedOrgId) {
      setUsers([])
      setUsersLoading(false)
      return
    }
    setUsersLoading(true)
    fetchOrganizationUsers(selectedOrgId)
      .then((data) => {
        if (!cancelled) {
          setUsers(data)
          setUserError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setUserError(err instanceof Error ? err.message : 'No se pudo cargar la lista de usuarios.')
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedOrgId, usersRefreshKey])

  async function handleRoleChange(user: OrgUserRow, nextRole: UserRole) {
    setSavingUserId(user.id)
    setUserError(null)
    try {
      await updateUserRole(user.id, nextRole)
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)))
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'No se pudo cambiar el rol.')
    } finally {
      setSavingUserId(null)
    }
  }

  async function handleToggleActive(user: OrgUserRow) {
    setSavingUserId(user.id)
    setUserError(null)
    try {
      await setUserActive(user.id, !user.active)
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, active: !u.active } : u)))
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
    } finally {
      setSavingUserId(null)
    }
  }

  async function handleToggleUserSite(user: OrgUserRow, siteId: string) {
    const nextSiteIds = user.siteIds.includes(siteId)
      ? user.siteIds.filter((id) => id !== siteId)
      : [...user.siteIds, siteId]
    setSavingUserId(user.id)
    setUserError(null)
    try {
      await setUserSites(user.id, nextSiteIds)
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, siteIds: nextSiteIds } : u)))
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'No se pudieron actualizar los sitios.')
    } finally {
      setSavingUserId(null)
    }
  }

  const requiresSite = role === 'administrativo' || role === 'operativo'

  function toggleSite(id: string) {
    setSelectedSiteIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim() || !selectedOrgId) {
      setError('Completa el nombre, correo y organización.')
      return
    }
    if (requiresSite && selectedSiteIds.length === 0) {
      setError('Este rol necesita al menos un sitio asignado.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await inviteUser({
        email: email.trim(),
        fullName: fullName.trim(),
        organizationId: selectedOrgId,
        role,
        siteIds: requiresSite ? selectedSiteIds : [],
      })
      setInvitedEmail(email.trim())
      setFullName('')
      setEmail('')
      setSelectedSiteIds([])
      setUsersRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar al usuario.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding-page users-page">
      <PageHeader
        eyebrow="Configuración · Usuarios"
        title="Usuarios"
        subtitle="Invita gente nueva por correo, y gestiona el rol, los sitios asignados y el estado de quienes ya tienen cuenta."
      />

      <h2 className="users-section-title">Invitar usuario nuevo</h2>
      <form className="onboarding-card onboarding-form" onSubmit={handleSubmit}>
        <div className="onboarding-form__row">
          <label>
            Nombre completo
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Correo
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </div>

        <div className="onboarding-form__row">
          <label>
            Organización
            {isConsultora ? (
              <select value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)} required>
                <option value="" disabled>
                  Selecciona una organización
                </option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value={organizations.find((o) => o.id === selectedOrgId)?.name ?? 'Tu organización'} disabled />
            )}
          </label>

          <label>
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {requiresSite && (
          <fieldset className="onboarding-axes">
            <legend>Sitio(s) asignado(s)</legend>
            {sites.length === 0 && <p>Esta organización no tiene sitios todavía.</p>}
            {sites.map((site) => (
              <label key={site.id} className="onboarding-axis-option">
                <input
                  type="checkbox"
                  checked={selectedSiteIds.includes(site.id)}
                  onChange={() => toggleSite(site.id)}
                />
                {site.name}
              </label>
            ))}
          </fieldset>
        )}

        {error && <p className="onboarding-error">{error}</p>}
        {invitedEmail && (
          <p className="onboarding-success-text">Invitación enviada a {invitedEmail}.</p>
        )}

        <div className="onboarding-form__actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Invitando…' : 'Invitar usuario'}
          </button>
        </div>
      </form>

      <h2 className="users-section-title">Usuarios de la organización</h2>
      <section className="onboarding-card users-card">
        {usersLoading ? (
          <p>Cargando usuarios…</p>
        ) : users.length === 0 ? (
          <p>Todavía no hay usuarios en esta organización.</p>
        ) : (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Sitio(s)</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === profile?.id
                  const userRequiresSite = user.role === 'administrativo' || user.role === 'operativo'
                  const rowDisabled = isSelf || savingUserId === user.id
                  return (
                    <tr key={user.id} className={user.active ? '' : 'users-row--inactive'}>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          disabled={rowDisabled}
                          onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                        >
                          {roleOptions.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {userRequiresSite ? (
                          <div className="users-site-list">
                            {sites.length === 0 && <span className="users-site-na">Sin sitios</span>}
                            {sites.map((site) => (
                              <label key={site.id} className="users-site-option">
                                <input
                                  type="checkbox"
                                  checked={user.siteIds.includes(site.id)}
                                  disabled={rowDisabled}
                                  onChange={() => handleToggleUserSite(user, site.id)}
                                />
                                {site.name}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="users-site-na">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`users-status-toggle${user.active ? '' : ' users-status-toggle--inactive'}`}
                          disabled={isSelf || savingUserId === user.id}
                          onClick={() => handleToggleActive(user)}
                          title={isSelf ? 'No puedes desactivar tu propio usuario.' : undefined}
                        >
                          {user.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {userError && <p className="onboarding-error">{userError}</p>}
      </section>
    </div>
  )
}
