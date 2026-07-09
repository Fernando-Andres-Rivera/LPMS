import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { fetchCascadeData } from './cascadeApi'
import type { Indicator, IndicatorLink } from '../../lib/types'
import './cascade.css'

interface TreeNode {
  indicator: Indicator
  children: TreeNode[]
}

function buildDescendantTree(id: string, indicatorsById: Map<string, Indicator>, links: IndicatorLink[]): TreeNode {
  const childLinks = links.filter((l) => l.parent_indicator_id === id)
  return {
    indicator: indicatorsById.get(id)!,
    children: childLinks
      .map((l) => indicatorsById.get(l.child_indicator_id))
      .filter((i): i is Indicator => Boolean(i))
      .map((child) => buildDescendantTree(child.id, indicatorsById, links)),
  }
}

function collectAncestors(id: string, indicatorsById: Map<string, Indicator>, links: IndicatorLink[]): Indicator[][] {
  const parentLinks = links.filter((l) => l.child_indicator_id === id)
  const directParents = parentLinks
    .map((l) => indicatorsById.get(l.parent_indicator_id))
    .filter((i): i is Indicator => Boolean(i))

  if (directParents.length === 0) return []

  const higher = directParents.flatMap((parent) => collectAncestors(parent.id, indicatorsById, links))
  return [...higher, directParents]
}

function TreeNodeView({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div className="cascade-node" style={{ marginLeft: depth * 24 }}>
      <IndicatorPill indicator={node.indicator} />
      {node.children.map((child) => (
        <TreeNodeView key={child.indicator.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

function IndicatorPill({ indicator, highlight }: { indicator: Indicator; highlight?: boolean }) {
  return (
    <Link to={`/cascada/${indicator.id}`} className={`cascade-pill ${highlight ? 'cascade-pill--focus' : ''}`}>
      <span className="cascade-pill__level">N{indicator.level}</span>
      <span>{indicator.name}</span>
    </Link>
  )
}

export function CascadeViewPage() {
  const { indicatorId } = useParams<{ indicatorId: string }>()
  const { organizationId } = useAuth()
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [links, setLinks] = useState<IndicatorLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    fetchCascadeData(organizationId).then(({ indicators, links }) => {
      setIndicators(indicators)
      setLinks(links)
      setLoading(false)
    })
  }, [organizationId])

  const indicatorsById = useMemo(() => new Map(indicators.map((i) => [i.id, i])), [indicators])

  if (loading) return <p>Cargando cascada…</p>
  if (!indicatorId || !indicatorsById.has(indicatorId)) return <p>Indicador no encontrado.</p>

  const ancestorLevels = collectAncestors(indicatorId, indicatorsById, links)
  const descendantTree = buildDescendantTree(indicatorId, indicatorsById, links)
  const focusIndicator = indicatorsById.get(indicatorId)!

  return (
    <div className="cascade-page">
      <h1>Cascada de trazabilidad</h1>
      <p className="page-subtitle">
        Desde el objetivo corporativo hasta el dato operativo diario que lo precursa.
      </p>

      {ancestorLevels.length > 0 && (
        <div className="cascade-section">
          <h3>Objetivos superiores</h3>
          {ancestorLevels.map((level, i) => (
            <div className="cascade-level" key={i}>
              {level.map((indicator) => (
                <IndicatorPill key={indicator.id} indicator={indicator} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="cascade-section">
        <h3>Indicador seleccionado</h3>
        <IndicatorPill indicator={focusIndicator} highlight />
        <div>
          <Link to={`/tablero/${focusIndicator.id}`} className="cascade-causal-link">
            Ver tablero
          </Link>
          {' · '}
          <Link to={`/analisis-causal/${focusIndicator.id}`} className="cascade-causal-link">
            Ver / registrar análisis de causa
          </Link>
        </div>
      </div>

      {descendantTree.children.length > 0 && (
        <div className="cascade-section">
          <h3>Precursores</h3>
          {descendantTree.children.map((child) => (
            <TreeNodeView key={child.indicator.id} node={child} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}
