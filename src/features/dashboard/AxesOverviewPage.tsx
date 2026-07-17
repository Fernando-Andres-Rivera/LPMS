import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { Semaforo } from '../../components/ui/Semaforo'
import { RangePicker } from '../../components/ui/RangePicker'
import { calcularSemaforo, SEMAFORO_COLOR, SEMAFORO_LABEL } from '../../lib/semaforo'
import { defaultRange } from '../../lib/dateRange'
import { fetchActiveAxes, fetchIndicatorStatusesInRange, type IndicatorStatus } from './dashboardApi'
import type { Axis, SemaforoEstado } from '../../lib/types'
import './dashboard.css'

interface EvaluatedIndicator {
  status: IndicatorStatus
  estado: SemaforoEstado
}

// Orden de apilado: los estados que más preocupan primero, para que el ojo
// aterrice ahí tanto en la barra de composición como en la de cada eje.
const ESTADOS_APILADOS: SemaforoEstado[] = ['incumple', 'riesgo', 'sin_datos', 'cumple']

interface AxisBreakdown {
  name: string
  cumple: number
  riesgo: number
  incumple: number
  sin_datos: number
}

export function AxesOverviewPage() {
  const { organizationId } = useAuth()
  const [axes, setAxes] = useState<Axis[]>([])
  const [range, setRange] = useState(defaultRange())
  const [evaluated, setEvaluated] = useState<EvaluatedIndicator[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    // Una sola consulta a la vista indicator_status resuelve el catálogo de
    // indicadores; el estado (último valor dentro del rango + objetivo) se
    // recalcula en el cliente cada vez que cambia el rango elegido.
    async function load() {
      setLoading(true)
      const [axesData, statuses] = await Promise.all([
        fetchActiveAxes(orgId),
        fetchIndicatorStatusesInRange(orgId, range),
      ])
      if (cancelled) return
      setAxes(axesData)
      setEvaluated(
        statuses.map((status) => ({
          status,
          estado: calcularSemaforo(status.latest_value, status.target_value, status.improvement_direction),
        })),
      )
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, range])

  const statusCounts = useMemo(() => {
    const counts: Record<SemaforoEstado, number> = { cumple: 0, riesgo: 0, incumple: 0, sin_datos: 0 }
    for (const row of evaluated) counts[row.estado] += 1
    return counts
  }, [evaluated])

  const total = evaluated.length
  const cumplePercent = total ? Math.round((statusCounts.cumple / total) * 100) : 0

  // Un eje por fila, ordenado por cuántos de sus indicadores están en riesgo
  // o incumpliendo — así el eje que más está arrastrando el resultado global
  // queda arriba, sin que la gerencia tenga que buscarlo.
  const byAxis = useMemo(() => {
    const map = new Map<string, AxisBreakdown>()
    for (const row of evaluated) {
      if (!row.status.axis_id) continue
      const entry = map.get(row.status.axis_id) ?? {
        name: row.status.axis_name ?? '—',
        cumple: 0,
        riesgo: 0,
        incumple: 0,
        sin_datos: 0,
      }
      entry[row.estado] += 1
      map.set(row.status.axis_id, entry)
    }
    return [...map.values()].sort((a, b) => b.incumple + b.riesgo - (a.incumple + a.riesgo))
  }, [evaluated])

  return (
    <div>
      <h1>Ejes de desempeño</h1>
      <p className="page-subtitle">
        El estado de la organización dentro del período elegido, y qué ejes están arrastrando el resultado — luego
        elige un eje para ver sus indicadores, causas y planes de acción en detalle.
      </p>

      <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />

      {loading ? (
        <p>Cargando ejes…</p>
      ) : total > 0 ? (
        <>
          <div className="panorama-kpis">
            <div className="panorama-kpi">
              <span className="panorama-kpi__label">Indicadores evaluados</span>
              <span className="panorama-kpi__value">{total}</span>
            </div>
            <div className="panorama-kpi">
              <span className="panorama-kpi__label">
                <Semaforo estado="cumple" showLabel={false} size="sm" /> Cumpliendo objetivo
              </span>
              <span className="panorama-kpi__value panorama-kpi__value--ok">{cumplePercent}%</span>
            </div>
            <div className="panorama-kpi">
              <span className="panorama-kpi__label">
                <Semaforo estado="riesgo" showLabel={false} size="sm" /> En riesgo
              </span>
              <span className="panorama-kpi__value panorama-kpi__value--risk">{statusCounts.riesgo}</span>
            </div>
            <div className="panorama-kpi">
              <span className="panorama-kpi__label">
                <Semaforo estado="incumple" showLabel={false} size="sm" /> Incumpliendo
              </span>
              <span className="panorama-kpi__value panorama-kpi__value--fail">{statusCounts.incumple}</span>
            </div>
          </div>

          <section className="panorama-card">
            <h2>Composición del estado global</h2>
            <div className="panorama-composition">
              {ESTADOS_APILADOS.filter((estado) => statusCounts[estado] > 0).map((estado) => {
                const share = statusCounts[estado] / total
                return (
                  <div
                    key={estado}
                    className="panorama-composition__segment"
                    style={{ width: `${share * 100}%`, backgroundColor: SEMAFORO_COLOR[estado] }}
                    title={`${SEMAFORO_LABEL[estado]}: ${statusCounts[estado]} (${Math.round(share * 100)}%)`}
                  >
                    {share >= 0.08 && (
                      <span className="panorama-composition__label">
                        {statusCounts[estado]} · {Math.round(share * 100)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="panorama-composition__legend">
              {ESTADOS_APILADOS.map((estado) => (
                <span key={estado} className="panorama-composition__legend-item">
                  <span className="panorama-composition__dot" style={{ backgroundColor: SEMAFORO_COLOR[estado] }} />
                  {SEMAFORO_LABEL[estado]} ({statusCounts[estado]})
                </span>
              ))}
            </div>
          </section>

          {byAxis.length > 0 && (
            <section className="panorama-card">
              <h2>Qué está afectando el resultado, por eje</h2>
              <p className="panorama-card__subtitle">
                Ejes ordenados por número de indicadores en riesgo o incumplimiento — el que más pesa queda arriba.
              </p>
              <div style={{ width: '100%', height: Math.max(byAxis.length * 52, 120) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byAxis} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
                    <CartesianGrid horizontal={false} stroke="var(--color-border)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value, name) => [value, SEMAFORO_LABEL[name as SemaforoEstado] ?? name]} />
                    <Legend
                      formatter={(value: string) => SEMAFORO_LABEL[value as SemaforoEstado] ?? value}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    {ESTADOS_APILADOS.map((estado) => (
                      <Bar key={estado} dataKey={estado} stackId="estado" fill={SEMAFORO_COLOR[estado]} name={estado}>
                        <LabelList
                          dataKey={estado}
                          position="inside"
                          fill="#fff"
                          fontSize={11}
                          fontWeight={700}
                          formatter={(v) => (typeof v === 'number' && v > 0 ? v : '')}
                        />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      ) : (
        <p>No hay indicadores evaluados en este período.</p>
      )}

      <h2 className="panorama-section-title">Selecciona un eje</h2>
      <div className="axes-grid">
        {axes.map((axis) => (
          <Link key={axis.id} to={`/ejes/${axis.id}`} className="axis-card" style={{ borderTopColor: axis.color }}>
            <span className="axis-card__name">{axis.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
