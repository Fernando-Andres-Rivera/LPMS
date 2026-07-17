import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Semaforo } from '../../components/ui/Semaforo'
import { RangePicker } from '../../components/ui/RangePicker'
import { calcularSemaforo } from '../../lib/semaforo'
import { defaultRange } from '../../lib/dateRange'
import { fetchIndicatorStatusesInRange, type IndicatorStatus } from './dashboardApi'
import { formatIndicatorValue, type SemaforoEstado } from '../../lib/types'
import './dashboard.css'

interface ExceptionRow {
  status: IndicatorStatus
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
  const [range, setRange] = useState(defaultRange())
  const [rows, setRows] = useState<ExceptionRow[]>([])
  const [sinDatosCount, setSinDatosCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const statuses = await fetchIndicatorStatusesInRange(orgId, range)
      if (cancelled) return

      const evaluated = statuses.map((status) => ({
        status,
        estado: calcularSemaforo(status.latest_value, status.target_value, status.improvement_direction),
      }))

      setRows(
        evaluated
          .filter((row) => row.estado === 'incumple' || row.estado === 'riesgo')
          .sort((a, b) => ESTADO_ORDEN[a.estado] - ESTADO_ORDEN[b.estado]),
      )
      setSinDatosCount(evaluated.filter((row) => row.estado === 'sin_datos').length)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, range])

  return (
    <div>
      <h1>Panorama global — indicadores en excepción</h1>
      <p className="page-subtitle">
        Indicadores que no cumplieron su objetivo dentro del período elegido, en todos los ejes y sitios de la
        organización. Úsalo para dirigir la atención del despliegue hacia dónde está el problema.
      </p>

      <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />

      {loading ? (
        <p>Cargando panorama global…</p>
      ) : rows.length === 0 ? (
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
            {rows.map(({ status, estado }) => (
              <tr key={status.id}>
                <td>
                  <Semaforo estado={estado} showLabel={false} />
                </td>
                <td>
                  <span className="axis-chip" style={{ backgroundColor: status.axis_color ?? undefined }}>
                    {status.axis_name}
                  </span>
                </td>
                <td>{status.site_name ?? 'Corporativo'}</td>
                <td>{status.level}</td>
                <td>
                  <Link to={`/tablero/${status.id}`}>{status.name}</Link>
                </td>
                <td>{formatIndicatorValue(status.latest_value, status.value_type, status.unit)}</td>
                <td>
                  {status.value_type === 'binario'
                    ? 'Sí'
                    : status.value_type === 'razon'
                      ? '100%'
                      : `${status.target_value ?? '—'} ${status.unit}`}
                </td>
                <td>{status.responsible_name ?? 'Sin asignar'}</td>
                <td>
                  <Link to={`/analisis-causal/${status.id}`}>Analizar causa</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {sinDatosCount > 0 && (
        <p className="exceptions-footnote">
          Además, hay {sinDatosCount} indicador{sinDatosCount === 1 ? '' : 'es'} sin mediciones dentro de este
          período.
        </p>
      )}
    </div>
  )
}
