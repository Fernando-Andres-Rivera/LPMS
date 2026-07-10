import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  deleteOrganizationPermanently,
  fetchAllOrganizations,
  setOrganizationActive,
  updateOrganization,
} from './onboardingApi'
import { INDUSTRY_OPTIONS, OTHER_INDUSTRY } from './industries'
import type { Organization } from '../../lib/types'
import './clients.css'

export function ClientsPage() {
  const { organizationId, setOrganizationId, refreshOrganizations } = useAuth()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIndustry, setEditIndustry] = useState('')
  const [editCustomIndustry, setEditCustomIndustry] = useState(false)

  async function loadOrgs(): Promise<Organization[]> {
    const data = await fetchAllOrganizations()
    setOrgs(data)
    return data
  }

  useEffect(() => {
    let cancelled = false
    fetchAllOrganizations().then((data) => {
      if (cancelled) return
      setOrgs(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleToggle(org: Organization, nextActive: boolean) {
    setBusyId(org.id)
    setError(null)
    try {
      await setOrganizationActive(org.id, nextActive)
      const fresh = await loadOrgs()
      // Mantén el switcher del admin sincronizado con la lista de activas.
      await refreshOrganizations()
      // Si desactivamos la organización que estaba seleccionada, mueve la
      // selección a la primera que siga activa para no dejar el tablero apuntando
      // a una organización oculta.
      if (!nextActive && organizationId === org.id) {
        const firstActive = fresh.find((o) => o.active)
        if (firstActive) setOrganizationId(firstActive.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el cliente.')
    } finally {
      setBusyId(null)
      setConfirmingId(null)
      setConfirmText('')
    }
  }

  async function handleDelete(org: Organization) {
    setBusyId(org.id)
    setError(null)
    try {
      await deleteOrganizationPermanently(org.id)
      await loadOrgs()
      await refreshOrganizations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la organización.')
    } finally {
      setBusyId(null)
      setDeletingId(null)
      setDeleteConfirmText('')
    }
  }

  function startEditing(org: Organization) {
    setEditingId(org.id)
    setEditName(org.name)
    const industry = org.industry ?? ''
    setEditIndustry(industry)
    setEditCustomIndustry(industry !== '' && !INDUSTRY_OPTIONS.includes(industry))
  }

  async function handleSaveEdit(org: Organization) {
    if (!editName.trim()) return
    setBusyId(org.id)
    setError(null)
    try {
      await updateOrganization(org.id, {
        name: editName.trim(),
        industry: editIndustry.trim() || null,
      })
      await loadOrgs()
      // El switcher del topbar muestra el nombre — refrescarlo para que el
      // cambio de razón social se vea de inmediato.
      await refreshOrganizations()
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el cliente.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p>Cargando clientes…</p>

  const activeCount = orgs.filter((o) => o.active).length

  return (
    <div className="clients-page">
      <div className="clients-header">
        <div>
          <h1>Clientes</h1>
          <p className="page-subtitle">
            {activeCount} activo{activeCount === 1 ? '' : 's'} de {orgs.length}. Desactivar un cliente lo oculta del
            switcher y de toda la aplicación, pero <strong>conserva todos sus datos</strong> — se puede reactivar
            cuando quieras. No borra nada. Eliminar permanentemente sí borra todo (sitios, indicadores, mediciones,
            usuarios) y solo está disponible para clientes ya desactivados — úsalo solo para limpiar datos de prueba.
          </p>
        </div>
        <Link to="/nuevo-cliente" className="button-primary">
          + Nuevo cliente
        </Link>
      </div>

      {error && <p className="clients-error">{error}</p>}

      <div className="table-scroll">
        <table className="clients-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Industria</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className={org.active ? '' : 'clients-row--inactive'}>
                <td>
                  {editingId === org.id ? (
                    <input
                      className="clients-edit-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Razón social"
                      autoFocus
                    />
                  ) : (
                    <>
                      <strong>{org.name}</strong>
                      {organizationId === org.id && org.active && (
                        <span className="clients-current-tag">seleccionada</span>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {editingId === org.id ? (
                    editCustomIndustry ? (
                      <div className="clients-edit-industry">
                        <input
                          className="clients-edit-input"
                          value={editIndustry}
                          onChange={(e) => setEditIndustry(e.target.value)}
                          placeholder="Escribe la industria…"
                        />
                        <button
                          type="button"
                          className="clients-edit-industry__back"
                          onClick={() => {
                            setEditCustomIndustry(false)
                            setEditIndustry('')
                          }}
                        >
                          ← volver a la lista
                        </button>
                      </div>
                    ) : (
                      <select
                        className="clients-edit-input"
                        value={editIndustry}
                        onChange={(e) => {
                          if (e.target.value === OTHER_INDUSTRY) {
                            setEditCustomIndustry(true)
                            setEditIndustry('')
                          } else {
                            setEditIndustry(e.target.value)
                          }
                        }}
                      >
                        <option value="">Sin industria</option>
                        {INDUSTRY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        <option value={OTHER_INDUSTRY}>Otra, especificar…</option>
                      </select>
                    )
                  ) : (
                    (org.industry ?? '—')
                  )}
                </td>
                <td>
                  <span className={`clients-status clients-status--${org.active ? 'active' : 'inactive'}`}>
                    {org.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="clients-action-cell">
                  {editingId === org.id ? (
                    <div className="clients-confirm__actions">
                      <button
                        type="button"
                        className="clients-reactivate"
                        onClick={() => handleSaveEdit(org)}
                        disabled={!editName.trim() || busyId === org.id}
                      >
                        {busyId === org.id ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button type="button" className="clients-cancel" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : !org.active && deletingId === org.id ? (
                    <div className="clients-confirm clients-confirm--danger">
                      <span className="clients-confirm__prompt">
                        Esto elimina PERMANENTEMENTE <strong>{org.name}</strong> y todos sus datos (sitios,
                        indicadores, mediciones, análisis, usuarios). Escribe <strong>{org.name}</strong> para
                        confirmar:
                      </span>
                      <input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder={org.name}
                        autoFocus
                      />
                      <div className="clients-confirm__actions">
                        <button
                          type="button"
                          className="clients-delete"
                          onClick={() => handleDelete(org)}
                          disabled={deleteConfirmText.trim() !== org.name || busyId === org.id}
                        >
                          {busyId === org.id ? 'Eliminando…' : 'Eliminar definitivamente'}
                        </button>
                        <button
                          type="button"
                          className="clients-cancel"
                          onClick={() => {
                            setDeletingId(null)
                            setDeleteConfirmText('')
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : !org.active ? (
                    <div className="clients-inactive-actions">
                      <button
                        type="button"
                        className="clients-reactivate"
                        onClick={() => handleToggle(org, true)}
                        disabled={busyId === org.id}
                      >
                        {busyId === org.id ? 'Reactivando…' : 'Reactivar'}
                      </button>
                      <button
                        type="button"
                        className="clients-edit-trigger"
                        onClick={() => startEditing(org)}
                        disabled={busyId === org.id}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="clients-delete-trigger"
                        onClick={() => {
                          setDeletingId(org.id)
                          setDeleteConfirmText('')
                        }}
                        disabled={busyId === org.id}
                      >
                        Eliminar permanentemente
                      </button>
                    </div>
                  ) : confirmingId === org.id ? (
                    <div className="clients-confirm">
                      <span className="clients-confirm__prompt">
                        Escribe <strong>{org.name}</strong> para confirmar:
                      </span>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={org.name}
                        autoFocus
                      />
                      <div className="clients-confirm__actions">
                        <button
                          type="button"
                          className="clients-deactivate"
                          onClick={() => handleToggle(org, false)}
                          disabled={confirmText.trim() !== org.name || busyId === org.id}
                        >
                          {busyId === org.id ? 'Desactivando…' : 'Confirmar desactivación'}
                        </button>
                        <button
                          type="button"
                          className="clients-cancel"
                          onClick={() => {
                            setConfirmingId(null)
                            setConfirmText('')
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="clients-confirm__actions">
                      <button
                        type="button"
                        className="clients-edit-trigger"
                        onClick={() => startEditing(org)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="clients-deactivate-trigger"
                        onClick={() => {
                          setConfirmingId(org.id)
                          setConfirmText('')
                        }}
                      >
                        Desactivar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
