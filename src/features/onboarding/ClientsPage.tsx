import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { deleteOrganizationPermanently, fetchAllOrganizations, setOrganizationActive } from './onboardingApi'
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
                  <strong>{org.name}</strong>
                  {organizationId === org.id && org.active && (
                    <span className="clients-current-tag">seleccionada</span>
                  )}
                </td>
                <td>{org.industry ?? '—'}</td>
                <td>
                  <span className={`clients-status clients-status--${org.active ? 'active' : 'inactive'}`}>
                    {org.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="clients-action-cell">
                  {!org.active && deletingId === org.id ? (
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
