import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { fetchIndicators, setIndicatorActive, type IndicatorWithRelations } from './indicatorsApi'
import './indicators.css'

export function IndicatorsListPage() {
  const { organizationId } = useAuth()
  const [indicators, setIndicators] = useState<IndicatorWithRelations[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <p>Cargando indicadores…</p>

  return (
    <div>
      <div className="indicators-header">
        <h1>Indicadores</h1>
        <Link to="/indicadores/nuevo" className="button-primary">
          + Nuevo indicador
        </Link>
      </div>

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
          {indicators.map((indicator) => (
            <tr key={indicator.id} className={!indicator.active ? 'row-inactive' : ''}>
              <td>{indicator.level}</td>
              <td>{indicator.name}</td>
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
              </td>
            </tr>
          ))}
          {indicators.length === 0 && (
            <tr>
              <td colSpan={7}>No hay indicadores creados todavía.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
