import { useState } from 'react'
import { countCauseImpact, createIndicatorCause, deleteIndicatorCause, type IndicatorCauseTag } from './standardCausesApi'
import type { IndicatorCause } from '../../lib/types'
import './indicator-cause-picker.css'

interface IndicatorCausePickerProps {
  indicatorId: string
  createdBy: string
  causes: IndicatorCause[]
  tags: IndicatorCauseTag[]
  onCausesChange: (causes: IndicatorCause[]) => void
  selected: IndicatorCause | null
  onSelectedChange: (selected: IndicatorCause | null) => void
  /** Se llama después de borrar un nodo, para que el padre recargue el árbol
   * y las etiquetas (el borrado cascada también quita etiquetas). */
  onDeleted: () => void | Promise<void>
}

/**
 * Selector jerárquico de causas posibles PROPIAS de este indicador (ej.
 * Máquina -> Extrusora 3 -> Motor), separado del árbol compartido de
 * cause_categories que usa el Pareto general. Selección única: el nodo en
 * el que te detienes al navegar es la causa elegida (no hace falta un botón
 * aparte para confirmarla).
 */
export function IndicatorCausePicker({
  indicatorId,
  createdBy,
  causes,
  tags,
  onCausesChange,
  selected,
  onSelectedChange,
  onDeleted,
}: IndicatorCausePickerProps) {
  const [path, setPath] = useState<IndicatorCause[]>([])
  const [newNodeName, setNewNodeName] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const currentParentId = path.length ? path[path.length - 1].id : null
  const children = causes.filter((c) => c.parent_id === currentParentId)

  function descend(node: IndicatorCause) {
    setPath((p) => [...p, node])
    onSelectedChange(node)
  }

  function goToDepth(depth: number) {
    setPath((p) => {
      const next = p.slice(0, depth)
      onSelectedChange(next.length ? next[next.length - 1] : null)
      return next
    })
  }

  async function handleCreate() {
    if (!newNodeName.trim()) return
    setCreating(true)
    try {
      const created = await createIndicatorCause({
        indicatorId,
        parentId: currentParentId,
        name: newNodeName.trim(),
        createdBy,
      })
      onCausesChange([...causes, created])
      setNewNodeName('')
      descend(created)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(node: IndicatorCause) {
    setDeleting(true)
    try {
      await deleteIndicatorCause(node.id)
      setConfirmingDeleteId(null)
      await onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="indicator-cause-picker">
      <div className="indicator-cause-picker__breadcrumb">
        <button type="button" onClick={() => goToDepth(0)} disabled={path.length === 0}>
          Raíz
        </button>
        {path.map((node, i) => (
          <span key={node.id}>
            {' › '}
            <button type="button" onClick={() => goToDepth(i + 1)} disabled={i === path.length - 1}>
              {node.name}
            </button>
          </span>
        ))}
      </div>

      {children.length > 0 && (
        <ul className="indicator-cause-picker__children">
          {children.map((child) => {
            if (confirmingDeleteId === child.id) {
              const impact = countCauseImpact(causes, tags, child.id)
              return (
                <li key={child.id} className="indicator-cause-picker__children-item--confirming">
                  <span className="indicator-cause-picker__confirm">
                    ¿Eliminar "{child.name}"?
                    {(impact.descendantCount > 0 || impact.taggedAnalysesCount > 0) && (
                      <span className="indicator-cause-picker__confirm-impact">
                        {impact.descendantCount > 0 &&
                          `Se borran ${impact.descendantCount} sub-causa(s) también. `}
                        {impact.taggedAnalysesCount > 0 &&
                          `${impact.taggedAnalysesCount} análisis ya registrados quedan sin esta clasificación (no se borran, solo pierden la etiqueta).`}
                      </span>
                    )}
                    <span className="indicator-cause-picker__confirm-actions">
                      <button type="button" onClick={() => handleDelete(child)} disabled={deleting}>
                        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                      <button type="button" onClick={() => setConfirmingDeleteId(null)} disabled={deleting}>
                        Cancelar
                      </button>
                    </span>
                  </span>
                </li>
              )
            }
            return (
              <li key={child.id}>
                <button type="button" onClick={() => descend(child)}>
                  {child.name}
                </button>
                <button
                  type="button"
                  className="indicator-cause-picker__delete"
                  title={`Eliminar ${child.name}`}
                  onClick={() => setConfirmingDeleteId(child.id)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="indicator-cause-picker__new">
        <input
          value={newNodeName}
          onChange={(e) => setNewNodeName(e.target.value)}
          placeholder={path.length === 0 ? 'Nueva causa raíz (ej. Máquina)…' : 'Nueva sub-causa…'}
        />
        <button type="button" onClick={handleCreate} disabled={creating || !newNodeName.trim()}>
          Agregar
        </button>
      </div>

      {selected ? (
        <p className="indicator-cause-picker__selected">
          Causa elegida: <strong>{selected.name}</strong>
        </p>
      ) : (
        <p className="indicator-cause-picker__hint">Navega hasta la causa más específica posible.</p>
      )}
    </div>
  )
}
