import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { createProfileForUser, fetchOrganizationsList, fetchSitesForOrganization } from './onboardingApi'
import type { Organization, Site, UserRole } from '../../lib/types'
import './onboarding.css'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin_cliente', label: 'Admin Cliente' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'operativo', label: 'Operativo' },
]

export function LinkUserPage() {
  const { profile, organizationId } = useAuth()
  const isConsultora = profile?.role === 'admin_consultora'

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [sites, setSites] = useState<Site[]>([])

  const [userId, setUserId] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('gerente')
  const [selectedOrgId, setSelectedOrgId] = useState(organizationId ?? '')
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
    if (!userId.trim() || !fullName.trim() || !email.trim() || !selectedOrgId) {
      setError('Completa el UID, nombre, correo y organización.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createProfileForUser({
        userId: userId.trim(),
        organizationId: selectedOrgId,
        role,
        fullName: fullName.trim(),
        email: email.trim(),
        siteIds: requiresSite ? selectedSiteIds : [],
      })
      setSuccess(true)
      setUserId('')
      setFullName('')
      setEmail('')
      setSelectedSiteIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular el usuario.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding-page">
      <h1>Vincular usuario</h1>
      <p className="page-subtitle">
        Primero crea el usuario en Supabase (Authentication → Users → Add user, marcado como confirmado) y copia su
        UID. Aquí solo se vincula ese UID a un perfil de la app.
      </p>

      <form className="onboarding-card onboarding-form" onSubmit={handleSubmit}>
        <label>
          UID del usuario (de Supabase Auth)
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-…" required />
        </label>

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
              {ROLE_OPTIONS.map((r) => (
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
        {success && <p className="onboarding-success-text">Usuario vinculado correctamente.</p>}

        <div className="onboarding-form__actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Vinculando…' : 'Vincular usuario'}
          </button>
        </div>
      </form>
    </div>
  )
}
