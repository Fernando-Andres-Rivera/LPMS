import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { ParetoAxisTick } from '../../components/ui/ParetoAxisTick'
import { RangePicker } from '../../components/ui/RangePicker'
import { defaultRange } from '../../lib/dateRange'
import { fetchActiveAxes } from '../dashboard/dashboardApi'
import { fetchIndicators, fetchSites } from '../indicators/indicatorsApi'
import { fetchOrgUnits, fetchSiteLocationsForSites } from '../org-structure/orgStructureApi'
import {
  computeIndicatorCauseParetoForParent,
  computeParetoByIndicator,
  fetchIndicatorCauses,
  fetchParetoTagsForIndicators,
  getIndicatorCauseEvidence,
  type CauseEvidence,
  type ParetoTag,
} from '../causal-analysis/standardCausesApi'
import { LocationPicker } from './LocationPicker'
import { WHOLE_ORG_SCOPE, type LocationScope } from './locationScope'
import type { Axis, Indicator, IndicatorCause, OrgUnit, Site, SiteLocation } from '../../lib/types'
import { PageHeader } from '../../components/ui/PageHeader'
import './pareto.css'

interface ChartRow {
  key: string
  name: string
  count: number
  impactTotal: number
  cumulativePercent: number
}

/**
 * Pareto general de "Causas posibles": mismo árbol de causas por indicador
 * que se registra en el Tablero, visto por peso acumulado en vez de por
 * indicador suelto. Sin indicador elegido, el nivel superior es "qué KPI
 * pesa más"; al entrar a uno, se ve SU árbol propio de causas — igual que
 * en la pestaña "Causas posibles", pero con los filtros de eje/ubicación de
 * esta pantalla.
 */
export function ParetoPage() {
  const { organizationId } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [axes, setAxes] = useState<Axis[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [siteLocations, setSiteLocations] = useState<SiteLocation[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [axisId, setAxisId] = useState<string | null>(searchParams.get('axis'))
  const [locationScope, setLocationScope] = useState<LocationScope>(WHOLE_ORG_SCOPE)
  const [indicatorId, setIndicatorId] = useState<string | null>(searchParams.get('indicator'))

  const [range, setRange] = useState(defaultRange())

  const [tags, setTags] = useState<ParetoTag[]>([])
  const [causes, setCauses] = useState<IndicatorCause[]>([])
  const [path, setPath] = useState<IndicatorCause[]>([])
  const [loading, setLoading] = useState(true)
  // Nodo (indicador en el nivel raíz, o causa dentro de un árbol) cuya
  // evidencia real se muestra bajo la tabla — se limpia al cambiar de nivel
  // para no arrastrar la de un nodo que ya no está a la vista.
  const [evidenceKey, setEvidenceKey] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    Promise.all([
      fetchActiveAxes(organizationId),
      fetchIndicators(organizationId),
      fetchSites(organizationId),
      fetchOrgUnits(organizationId),
    ]).then(async ([axesData, indicatorsData, sitesData, orgUnitsData]) => {
      setAxes(axesData)
      setIndicators(indicatorsData)
      setSites(sitesData)
      setOrgUnits(orgUnitsData)
      setSiteLocations(await fetchSiteLocationsForSites(sitesData.map((s) => s.id)))
    })
  }, [organizationId])

  const filteredIndicators = indicators.filter(
    (i) =>
      (!axisId || i.axis_id === axisId) &&
      (!locationScope.siteIds || (i.site_id && locationScope.siteIds.includes(i.site_id))),
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!organizationId || filteredIndicators.length === 0) {
        setTags([])
        setLoading(false)
        return
      }
      setLoading(true)
      const defaultLocationByIndicator = new Map(filteredIndicators.map((i) => [i.id, i.site_location_id]))
      const data = await fetchParetoTagsForIndicators({
        indicatorIds: filteredIndicators.map((i) => i.id),
        range,
        locationIds: locationScope.locationIds,
        defaultLocationByIndicator,
      })
      if (cancelled) return
      setTags(data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, range, axisId, locationScope, indicators])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!indicatorId) {
        setCauses([])
        return
      }
      const data = await fetchIndicatorCauses(indicatorId)
      if (!cancelled) setCauses(data)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [indicatorId])

  const isRoot = indicatorId === null
  const indicatorTags = useMemo(
    () => (indicatorId ? tags.filter((t) => t.indicator_id === indicatorId) : []),
    [tags, indicatorId],
  )

  const currentParentId = path.length ? path[path.length - 1].id : null
  const { rows, generalCount, generalImpact } = useMemo(
    () => computeIndicatorCauseParetoForParent(causes, indicatorTags, currentParentId),
    [causes, indicatorTags, currentParentId],
  )
  const indicatorRows = useMemo(() => computeParetoByIndicator(filteredIndicators, tags), [filteredIndicators, tags])

  const totalImpact = isRoot
    ? indicatorRows.reduce((sum, r) => sum + r.impactTotal, 0)
    : rows.reduce((sum, r) => sum + r.impactTotal, 0) + generalImpact

  const chartData: ChartRow[] = isRoot
    ? indicatorRows.map((row, index) => {
        const cumulative = indicatorRows.slice(0, index + 1).reduce((sum, r) => sum + r.impactTotal, 0)
        return {
          key: row.indicator.id,
          name: row.indicator.name,
          count: row.count,
          impactTotal: row.impactTotal,
          cumulativePercent: totalImpact ? Math.round((cumulative / totalImpact) * 1000) / 10 : 0,
        }
      })
    : rows.map((row, index) => {
        const cumulative = rows.slice(0, index + 1).reduce((sum, r) => sum + r.impactTotal, 0)
        return {
          key: row.cause.id,
          name: row.cause.name,
          count: row.count,
          impactTotal: row.impactTotal,
          cumulativePercent: totalImpact ? Math.round((cumulative / totalImpact) * 1000) / 10 : 0,
        }
      })

  const evidence: CauseEvidence[] = useMemo(() => {
    if (!evidenceKey) return []
    if (isRoot) {
      const seen = new Map<string, CauseEvidence>()
      for (const t of tags) {
        if (t.indicator_id !== evidenceKey) continue
        seen.set(t.causal_analysis_id, { causal_analysis_id: t.causal_analysis_id, root_cause: t.root_cause, impact_value: t.impact_value })
      }
      return Array.from(seen.values()).sort((a, b) => b.impact_value - a.impact_value)
    }
    return getIndicatorCauseEvidence(causes, indicatorTags, evidenceKey)
  }, [evidenceKey, isRoot, tags, causes, indicatorTags])

  const evidenceName = evidenceKey
    ? isRoot
      ? (filteredIndicators.find((i) => i.id === evidenceKey)?.name ?? null)
      : (causes.find((c) => c.id === evidenceKey)?.name ?? null)
    : null

  function selectIndicator(id: string) {
    setIndicatorId(id)
    setPath([])
    setEvidenceKey(null)
    const params = new URLSearchParams(searchParams)
    params.set('indicator', id)
    setSearchParams(params)
  }

  function backToRoot() {
    setIndicatorId(null)
    setPath([])
    setEvidenceKey(null)
    const params = new URLSearchParams(searchParams)
    params.delete('indicator')
    setSearchParams(params)
  }

  function handleAxisChange(value: string) {
    const next = value || null
    setAxisId(next)
    setIndicatorId(null)
    setPath([])
    setEvidenceKey(null)
    const params = new URLSearchParams(searchParams)
    if (next) params.set('axis', next)
    else params.delete('axis')
    params.delete('indicator')
    setSearchParams(params)
  }

  function handleLocationChange(scope: LocationScope) {
    setLocationScope(scope)
    setIndicatorId(null)
    setPath([])
    setEvidenceKey(null)
    const params = new URLSearchParams(searchParams)
    params.delete('indicator')
    setSearchParams(params)
  }

  function handleIndicatorChange(value: string) {
    if (!value) {
      backToRoot()
      return
    }
    selectIndicator(value)
  }

  function handleRangeChange(from: string, to: string) {
    setRange({ from, to })
    setEvidenceKey(null)
  }

  function drillInto(causeId: string) {
    const node = causes.find((c) => c.id === causeId)
    if (node) setPath((p) => [...p, node])
    setEvidenceKey(null)
  }

  const selectedIndicatorName = indicatorId ? (filteredIndicators.find((i) => i.id === indicatorId)?.name ?? indicators.find((i) => i.id === indicatorId)?.name ?? null) : null

  return (
    <div>
      <PageHeader
        eyebrow="Gestión · Análisis de causas"
        title="Pareto de causas"
        subtitle='Elige el rango de fechas y ve qué indicador acumula más impacto — luego entra a su árbol de "Causas posibles" para ver cuál causa específica pesa más.'
      />

      <div className="pareto-filters">
        <RangePicker from={range.from} to={range.to} onChange={handleRangeChange} />

        <select value={axisId ?? ''} onChange={(e) => handleAxisChange(e.target.value)}>
          <option value="">Todos los ejes</option>
          {axes.map((axis) => (
            <option key={axis.id} value={axis.id}>
              {axis.name}
            </option>
          ))}
        </select>

        <select value={indicatorId ?? ''} onChange={(e) => handleIndicatorChange(e.target.value)}>
          <option value="">Todos los indicadores</option>
          {filteredIndicators.map((indicator) => (
            <option key={indicator.id} value={indicator.id}>
              {indicator.name}
            </option>
          ))}
        </select>
      </div>

      <div className="pareto-location">
        <span className="pareto-location__label">Estructura organizacional:</span>
        <LocationPicker orgUnits={orgUnits} sites={sites} siteLocations={siteLocations} onChange={handleLocationChange} />
      </div>

      <div className="pareto-breadcrumb">
        <button type="button" onClick={backToRoot} disabled={isRoot}>
          Todos los indicadores
        </button>
        {!isRoot && (
          <span>
            {' › '}
            <button
              type="button"
              onClick={() => {
                setPath([])
                setEvidenceKey(null)
              }}
              disabled={path.length === 0}
            >
              {selectedIndicatorName}
            </button>
          </span>
        )}
        {path.map((node, i) => (
          <span key={node.id}>
            {' › '}
            <button
              type="button"
              onClick={() => {
                setPath((p) => p.slice(0, i + 1))
                setEvidenceKey(null)
              }}
              disabled={i === path.length - 1}
            >
              {node.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : totalImpact === 0 ? (
        <p>
          {isRoot
            ? 'No hay causas registradas en "Causas posibles" para este período y filtro.'
            : 'Todavía no hay ocurrencias registradas en este nivel del árbol.'}
        </p>
      ) : (
        <>
          <p className="page-subtitle">
            {isRoot
              ? 'Cada barra es un indicador — acumula el impacto de todas sus causas registradas, para que el KPI más ofensor quede primero.'
              : 'Las barras acumulan el valor de todas las causas que caen bajo cada nodo (incluidas sus sub-causas) — el que más pesa queda primero, aunque tenga menos casos que otro.'}{' '}
            Haz clic en una barra para ver las causas reales detrás de ese peso.
          </p>

          <div className="pareto-chart">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={chartData}
                margin={{ bottom: 12 }}
                onClick={(state) => {
                  const payload = (state as { activePayload?: { payload: ChartRow }[] })?.activePayload
                  if (payload?.[0]) setEvidenceKey(payload[0].payload.key)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={<ParetoAxisTick />} interval={0} height={50} />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="impactTotal" fill="var(--color-primary)" name="Valor" cursor="pointer" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativePercent"
                  stroke="var(--color-orange)"
                  strokeWidth={2}
                  name="% acumulado"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="table-scroll">
          <table className="pareto-table">
            <thead>
              <tr>
                <th>{isRoot ? 'Indicador' : 'Causa'}</th>
                <th>Valor</th>
                <th>Casos</th>
                <th>%</th>
                <th>% acumulado</th>
                <th></th>
                {!isRoot && <th></th>}
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.key}>
                  <td>{row.name}</td>
                  <td>{row.impactTotal}</td>
                  <td>{row.count}</td>
                  <td>{totalImpact ? Math.round((row.impactTotal / totalImpact) * 1000) / 10 : 0}%</td>
                  <td>{row.cumulativePercent}%</td>
                  <td>
                    <button type="button" onClick={() => setEvidenceKey(row.key)}>
                      Ver causas →
                    </button>
                  </td>
                  {!isRoot && (
                    <td>
                      <button type="button" onClick={() => drillInto(row.key)}>
                        Desglosar →
                      </button>
                    </td>
                  )}
                  {isRoot && (
                    <td>
                      <button type="button" onClick={() => selectIndicator(row.key)}>
                        Entrar →
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!isRoot && generalCount > 0 && (
                <tr>
                  <td>General (sin desglosar)</td>
                  <td>{generalImpact}</td>
                  <td>{generalCount}</td>
                  <td>{totalImpact ? Math.round((generalImpact / totalImpact) * 1000) / 10 : 0}%</td>
                  <td>100%</td>
                  <td>
                    {currentParentId && (
                      <button type="button" onClick={() => setEvidenceKey(currentParentId)}>
                        Ver causas →
                      </button>
                    )}
                  </td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          {!isRoot && rows.length > 0 && rows.every((r) => !causes.some((c) => c.parent_id === r.cause.id)) && (
            <p className="pareto-leaf-note">
              Ninguna de estas causas tiene sub-causas registradas todavía — este es el nivel más específico
              alcanzado hasta ahora.
            </p>
          )}

          {evidenceKey && (
            <div className="pareto-evidence">
              <h3>Causas detrás de "{evidenceName}"</h3>
              <p className="page-subtitle">
                Lo que más importa aquí es cuál causal pesa más, no cuándo ni quién la registró.
              </p>
              {evidence.length === 0 ? (
                <p>No hay causas registradas todavía bajo este nodo.</p>
              ) : (
                <ul className="pareto-evidence__list">
                  {evidence.map((e) => (
                    <li key={e.causal_analysis_id} className="pareto-evidence__item">
                      <span className="pareto-evidence__impact">{e.impact_value}</span>
                      <span className="pareto-evidence__cause">{e.root_cause}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
