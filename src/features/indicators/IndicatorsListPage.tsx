import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  deleteIndicatorPermanently,
  fetchIndicators,
  setIndicatorActive,
  type IndicatorWithRelations,
} from './indicatorsApi'
import { PageHeader } from '../../components/ui/PageHeader'
import './indicators.css'

export function IndicatorsListPage() {
  const { organizationId, profile } = useAuth()
  const [indicators, setIndicators] = useState<IndicatorWithRelations[]>([])
  const [siteFilterId, setSiteFilterId] = useState('')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canHardDelete = profile?.role === 'admin_consultora'

  // Sitios en orden de aparición entre los indicadores ya cargados — no hace
  // falta una consulta aparte, y de paso solo aparecen sitios que sí tienen
  // al menos un indicador.
  const sites = Array.from(new Map(indicators.filter((i) => i.sites).map((i) => [i.sites!.id, i.sites!])).values())
  const visibleIndicators = siteFilterId ? indicators.filter((i) => i.site_id === siteFilterId) : indicators

  async function reload() {
    if (!organizationId) return
    setLoading(true)
    const data = await fetchIndicators(organizationId)
    setIndicators(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!organizationId) return
    fetchIndicators(organizationId).then((data) => {
      setIndicators(data)
      setLoading(false)
    })
  }, [organizationId])

  async function toggleActive(indicator: IndicatorWithRelations) {
    await setIndicatorActive(indicator.id, !indicator.active)
    reload()
  }

  async function handleDelete(indicator: IndicatorWithRelations) {
    setBusyId(indicator.id)
    setError(null)
    try {
      await deleteIndicatorPermanently(indicator.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el indicador.')
    } finally {
      setBusyId(null)
      setDeletingId(null)
    }
  }

  if (loading) return <p>Cargando indicadores…</p>

  return (
    <div>
      <PageHeader
        eyebrow="Gestión · Catálogo"
        title="Indicadores"
        subtitle="El catálogo de indicadores de la organización, con su eje SMQDCEP, nivel y objetivo."
        actions={
          <Link to="/indicadores/nuevo" className="button-primary">
            + Nuevo indicador
          </Link>
        }
      />

      {sites.length > 0 && (
        <label className="indicators-site-filter">
          Sitio
          <select value={siteFilterId} onChange={(e) => setSiteFilterId(e.target.value)}>
            <option value="">Todos los sitios</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="indicators-error">{error}</p>}

      <div className="table-scroll">
      <table className="indicators-table">
        <thead>
          <tr>
            <th>Nivel</th>
            <th>Nombre</th>
            <th>Eje</th>
            <th>Sitio</th>
            <th>Frecuencia</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleIndicators.map((indicator) => (
            <tr
              key={indicator.id}
              className={[!indicator.active ? 'row-inactive' : '', indicator.is_focus ? 'row-focus' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <td>{indicator.level}</td>
              <td>
                {indicator.is_focus && (
                  <span className="focus-badge" title="Indicador foco">
                    ★
                  </span>
                )}
                {indicator.name}
              </td>
              <td>
                <span className="axis-chip" style={{ backgroundColor: indicator.axes?.color }}>
                  {indicator.axes?.name}
                </span>
              </td>
              <td>{indicator.sites?.name ?? 'Corporativo'}</td>
              <td>{indicator.frequency}</td>
              <td>{indicator.active ? 'Activo' : 'Inactivo'}</td>
              <td className="indicators-table__actions">
                <Link to={`/indicadores/${indicator.id}/editar`}>Editar</Link>
                <button onClick={() => toggleActive(indicator)}>
                  {indicator.active ? 'Desactivar' : 'Activar'}
                </button>
                {canHardDelete && !indicator.active && (
                  deletingId === indicator.id ? (
                    <span className="indicators-delete-confirm">
                      ¿Eliminar definitivamente?
                      <button
                        type="button"
                        className="indicators-delete"
                        onClick={() => handleDelete(indicator)}
                        disabled={busyId === indicator.id}
                      >
                        {busyId === indicator.id ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                      <button type="button" onClick={() => setDeletingId(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="indicators-delete-trigger"
                      onClick={() => setDeletingId(indicator.id)}
                    >
                      Eliminar
                    </button>
                  )
                )}
              </td>
            </tr>
          ))}
          {visibleIndicators.length === 0 && (
            <tr>
              <td colSpan={7}>
                {indicators.length === 0
                  ? 'No hay indicadores creados todavía.'
                  : 'Ningún indicador para el sitio elegido.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
