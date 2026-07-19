import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { inviteUser, fetchOrganizationsList, fetchSitesForOrganization } from './onboardingApi'
import type { Organization, Site, UserRole } from '../../lib/types'
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar al usuario.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding-page">
      <h1>Invitar usuario</h1>
      <p className="page-subtitle">
        Le llega un correo para poner su contraseña — al aceptar la invitación queda vinculado automáticamente con
        el rol y sitio(s) que definas aquí. No hace falta crear nada manualmente en Supabase.
      </p>

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
    </div>
  )
}
