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
import { RangePicker } from '../../components/ui/RangePicker'
import { defaultRange } from '../../lib/dateRange'
import { fetchActiveAxes } from '../dashboard/dashboardApi'
import { fetchIndicators, fetchSites } from '../indicators/indicatorsApi'
import { fetchOrgUnits, fetchSiteLocationsForSites } from '../org-structure/orgStructureApi'
import { computeParetoForParent, fetchCauseCategories, fetchTaggedCauses, type TaggedCause } from './causeTaxonomyApi'
import { LocationPicker } from './LocationPicker'
import { WHOLE_ORG_SCOPE, type LocationScope } from './locationScope'
import type { Axis, CauseCategory, Indicator, OrgUnit, Site, SiteLocation } from '../../lib/types'
import './pareto.css'

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

  const [categories, setCategories] = useState<CauseCategory[]>([])
  const [tagged, setTagged] = useState<TaggedCause[]>([])
  const [path, setPath] = useState<CauseCategory[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    if (!organizationId) return
    const orgId = organizationId
    let cancelled = false

    async function load() {
      setLoading(true)
      const [categoriesData, taggedData] = await Promise.all([
        fetchCauseCategories(orgId),
        fetchTaggedCauses({
          organizationId: orgId,
          range,
          axisId,
          indicatorId,
          siteIds: locationScope.siteIds,
          locationIds: locationScope.locationIds,
        }),
      ])
      if (cancelled) return
      setCategories(categoriesData)
      setTagged(taggedData)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [organizationId, range, axisId, locationScope, indicatorId])

  const currentParentId = path.length ? path[path.length - 1].id : null
  const { rows, generalCount } = useMemo(
    () => computeParetoForParent(categories, tagged, currentParentId),
    [categories, tagged, currentParentId],
  )

  const totalCount = rows.reduce((sum, r) => sum + r.count, 0) + generalCount
  const chartData = rows.map((row, index) => {
    const cumulativeCount = rows.slice(0, index + 1).reduce((sum, r) => sum + r.count, 0)
    return {
      name: row.category.name,
      count: row.count,
      cumulativePercent: totalCount ? Math.round((cumulativeCount / totalCount) * 1000) / 10 : 0,
      categoryId: row.category.id,
    }
  })

  const filteredIndicators = indicators.filter(
    (i) =>
      (!axisId || i.axis_id === axisId) &&
      (!locationScope.siteIds || (i.site_id && locationScope.siteIds.includes(i.site_id))),
  )

  function handleAxisChange(value: string) {
    const next = value || null
    setAxisId(next)
    setIndicatorId(null)
    setPath([])
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
    const params = new URLSearchParams(searchParams)
    params.delete('indicator')
    setSearchParams(params)
  }

  function handleIndicatorChange(value: string) {
    const next = value || null
    setIndicatorId(next)
    setPath([])
    const params = new URLSearchParams(searchParams)
    if (next) params.set('indicator', next)
    else params.delete('indicator')
    setSearchParams(params)
  }

  function handleRangeChange(from: string, to: string) {
    setRange({ from, to })
    setPath([])
  }

  function drillInto(categoryId: string) {
    const node = categories.find((c) => c.id === categoryId)
    if (node) setPath((p) => [...p, node])
  }

  return (
    <div>
      <h1>Pareto evolutivo de causas</h1>
      <p className="page-subtitle">
        Elige el rango de fechas y ve de dónde vienen los incumplimientos — luego entra a la categoría con más peso
        para desglosarla por sus sub-causas.
      </p>

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
        <button type="button" onClick={() => setPath([])} disabled={path.length === 0}>
          Raíz
        </button>
        {path.map((node, i) => (
          <span key={node.id}>
            {' › '}
            <button type="button" onClick={() => setPath((p) => p.slice(0, i + 1))} disabled={i === path.length - 1}>
              {node.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : totalCount === 0 ? (
        <p>No hay causas etiquetadas para este período y filtro.</p>
      ) : (
        <>
          <div className="pareto-chart">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={chartData}
                onClick={(state) => {
                  const payload = (state as { activePayload?: { payload: { categoryId: string } }[] })?.activePayload
                  if (payload?.[0]) drillInto(payload[0].payload.categoryId)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="count" fill="var(--color-primary)" name="Casos" cursor="pointer" />
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
                <th>Causa</th>
                <th>Casos</th>
                <th>%</th>
                <th>% acumulado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.categoryId}>
                  <td>{row.name}</td>
                  <td>{row.count}</td>
                  <td>{totalCount ? Math.round((row.count / totalCount) * 1000) / 10 : 0}%</td>
                  <td>{row.cumulativePercent}%</td>
                  <td>
                    <button type="button" onClick={() => drillInto(row.categoryId)}>
                      Desglosar →
                    </button>
                  </td>
                </tr>
              ))}
              {generalCount > 0 && (
                <tr>
                  <td>General (sin desglosar)</td>
                  <td>{generalCount}</td>
                  <td>{totalCount ? Math.round((generalCount / totalCount) * 1000) / 10 : 0}%</td>
                  <td>100%</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          {rows.length > 0 && rows.every((r) => !categories.some((c) => c.parent_id === r.category.id)) && (
            <p className="pareto-leaf-note">
              Ninguna de estas causas tiene sub-causas registradas todavía — este es el nivel más específico
              alcanzado hasta ahora.
            </p>
          )}
        </>
      )}
    </div>
  )
}
