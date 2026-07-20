import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { createOrganizationWithSite, fetchAllAxesCatalog } from './onboardingApi'
import { INDUSTRY_OPTIONS, OTHER_INDUSTRY } from './industries'
import type { Axis } from '../../lib/types'
import './onboarding.css'

export function NewOrganizationPage() {
  const { profile, refreshOrganizations } = useAuth()
  const navigate = useNavigate()

  const [axes, setAxes] = useState<Axis[]>([])
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [showCustomIndustry, setShowCustomIndustry] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [selectedAxisIds, setSelectedAxisIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

  useEffect(() => {
    fetchAllAxesCatalog().then((data) => {
      setAxes(data)
      setSelectedAxisIds(data.map((a) => a.id))
    })
  }, [])

  function toggleAxis(id: string) {
    setSelectedAxisIds((current) => (current.includes(id) ? current.filter((a) => a !== id) : [...current, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !siteName.trim()) {
      setError('El nombre de la organización y del primer sitio son obligatorios.')
      return
    }
    if (!profile) return
    setSaving(true)
    setError(null)
    try {
      const orgId = await createOrganizationWithSite({
        name: name.trim(),
        industry: industry.trim() || null,
        siteName: siteName.trim(),
        siteAddress: siteAddress.trim() || null,
        axisIds: selectedAxisIds,
        createdBy: profile.id,
      })
      await refreshOrganizations(orgId)
      setCreatedOrgId(orgId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la organización.')
    } finally {
      setSaving(false)
    }
  }

  if (createdOrgId) {
    return (
      <div className="onboarding-page">
        <h1>Nuevo cliente</h1>
        <div className="onboarding-card onboarding-success">
          <p>
            <strong>{name}</strong> quedó creada, con el sitio "{siteName}" y {selectedAxisIds.length} eje(s)
            habilitado(s). Ya está seleccionada en el switcher de organización.
          </p>
          <div className="onboarding-success__actions">
            <Link to="/usuarios" className="button-primary">
              Invitar el primer usuario →
            </Link>
            <button type="button" onClick={() => navigate('/')}>
              Ir a la app
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding-page">
      <h1>Nuevo cliente</h1>
      <p className="page-subtitle">Crea la organización, su primer sitio, y los ejes que va a pilotar.</p>

      <form className="onboarding-card onboarding-form" onSubmit={handleSubmit}>
        <label>
          Nombre de la organización
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>

        <label>
          Industria (opcional)
          {showCustomIndustry ? (
            <div className="industry-picker">
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Escribe la industria…"
                autoFocus
              />
              <button
                type="button"
                className="industry-picker__back"
                onClick={() => {
                  setShowCustomIndustry(false)
                  setIndustry('')
                }}
              >
                ← Elegir de la lista
              </button>
            </div>
          ) : (
            <select
              value={industry}
              onChange={(e) => {
                if (e.target.value === OTHER_INDUSTRY) {
                  setShowCustomIndustry(true)
                  setIndustry('')
                } else {
                  setIndustry(e.target.value)
                }
              }}
            >
              <option value="">Sin especificar</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value={OTHER_INDUSTRY}>Otra, especificar…</option>
            </select>
          )}
        </label>

        <div className="onboarding-form__row">
          <label>
            Nombre del primer sitio
            <input value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
          </label>
          <label>
            Dirección (opcional)
            <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
          </label>
        </div>

        <fieldset className="onboarding-axes">
          <legend>Ejes a habilitar</legend>
          {axes.map((axis) => (
            <label key={axis.id} className="onboarding-axis-option">
              <input
                type="checkbox"
                checked={selectedAxisIds.includes(axis.id)}
                onChange={() => toggleAxis(axis.id)}
              />
              <span style={{ color: axis.color }}>●</span> {axis.name}
            </label>
          ))}
        </fieldset>

        {error && <p className="onboarding-error">{error}</p>}

        <div className="onboarding-form__actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Creando…' : 'Crear organización'}
          </button>
        </div>
      </form>
    </div>
  )
}
