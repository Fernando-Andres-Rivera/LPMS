import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Semaforo } from '../../components/ui/Semaforo'
import { calcularSemaforo } from '../../lib/semaforo'
import { fetchAllIndicatorsWithContext, fetchCurrentTarget, fetchIndicatorTrend, type IndicatorWithContext } from './dashboardApi'
import type { SemaforoEstado } from '../../lib/types'
import './dashboard.css'

interface ExceptionRow {
  indicator: IndicatorWithContext
  latestValue: number | null
  targetValue: number | null
  estado: SemaforoEstado
}

const ESTADO_ORDEN: Record<SemaforoEstado, number> = {
  incumple: 0,
  riesgo: 1,
  cumple: 2,
  sin_datos: 3,
}

export function GlobalExceptionsPage() {
  const { organizationId } = useAuth()
  const [rows, setRows] = useState<ExceptionRow[]>([])
  const [sinDatosCount, setSinDatosCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const indicators = await fetchAllIndicatorsWithContext(orgId)
      if (cancelled) return

      const now = new Date()
      const allRows = await Promise.all(
        indicators.map(async (indicator) => {
          const [trend, target] = await Promise.all([
            fetchIndicatorTrend(indicator.id),
            fetchCurrentTarget(indicator.id, now.getFullYear(), now.getMonth() + 1),
          ])
          const latestValue = trend.length ? trend[trend.length - 1].value : null
          const targetValue = target?.target_value ?? null
          const estado = calcularSemaforo(latestValue, targetValue, indicator.improvement_direction)
          return { indicator, latestValue, targetValue, estado }
        }),
      )
      if (cancelled) return

      const exceptions = allRows
        .filter((row) => row.estado === 'incumple' || row.estado === 'riesgo')
        .sort((a, b) => ESTADO_ORDEN[a.estado] - ESTADO_ORDEN[b.estado])

      setRows(exceptions)
      setSinDatosCount(allRows.filter((row) => row.estado === 'sin_datos').length)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  if (loading) return <p>Cargando panorama global…</p>

  return (
    <div>
      <h1>Panorama global — indicadores en excepción</h1>
      <p className="page-subtitle">
        Indicadores que no están cumpliendo su objetivo, en todos los ejes y sitios de la organización.
        Úsalo para dirigir la atención del despliegue hacia dónde está el problema.
      </p>

      {rows.length === 0 ? (
        <p>No hay indicadores en riesgo o incumplimiento en este momento.</p>
      ) : (
        <div className="table-scroll">
        <table className="exceptions-table">
          <thead>
            <tr>
              <th></th>
              <th>Eje</th>
              <th>Sitio</th>
              <th>Nivel</th>
              <th>Indicador</th>
              <th>Valor</th>
              <th>Objetivo</th>
              <th>Responsable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ indicator, latestValue, targetValue, estado }) => (
              <tr key={indicator.id}>
                <td>
                  <Semaforo estado={estado} showLabel={false} />
                </td>
                <td>
                  <span className="axis-chip" style={{ backgroundColor: indicator.axes?.color }}>
                    {indicator.axes?.name}
                  </span>
                </td>
                <td>{indicator.sites?.name ?? 'Corporativo'}</td>
                <td>{indicator.level}</td>
                <td>
                  <Link to={`/tablero/${indicator.id}`}>{indicator.name}</Link>
                </td>
                <td>
                  {latestValue ?? '—'} {indicator.unit}
                </td>
                <td>
                  {targetValue ?? '—'} {indicator.unit}
                </td>
                <td>{indicator.profiles?.full_name ?? 'Sin asignar'}</td>
                <td>
                  <Link to={`/analisis-causal/${indicator.id}`}>Analizar causa</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {sinDatosCount > 0 && (
        <p className="exceptions-footnote">
          Además, hay {sinDatosCount} indicador{sinDatosCount === 1 ? '' : 'es'} sin mediciones capturadas todavía.
        </p>
      )}
    </div>
  )
}
