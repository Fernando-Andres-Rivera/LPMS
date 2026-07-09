import { useState } from 'react'
import { createCauseCategory } from '../pareto/causeTaxonomyApi'
import type { CauseCategory } from '../../lib/types'
import './cause-taxonomy-picker.css'

interface CauseTaxonomyPickerProps {
  organizationId: string
  createdBy: string
  categories: CauseCategory[]
  onCategoriesChange: (categories: CauseCategory[]) => void
  selected: CauseCategory[]
  onSelectedChange: (selected: CauseCategory[]) => void
}

/**
 * Selector jerárquico para clasificar un análisis causal dentro del árbol
 * de causas de la organización (ej. Máquina -> Extrusora 3 -> Motor).
 * Permite navegar el árbol existente o crear un nodo nuevo sobre la marcha
 * cuando la causa específica todavía no está registrada — así el Pareto
 * se va enriqueciendo con el uso, en vez de exigir un catálogo completo
 * desde el día uno.
 */
export function CauseTaxonomyPicker({
  organizationId,
  createdBy,
  categories,
  onCategoriesChange,
  selected,
  onSelectedChange,
}: CauseTaxonomyPickerProps) {
  const [path, setPath] = useState<CauseCategory[]>([])
  const [newNodeName, setNewNodeName] = useState('')
  const [creating, setCreating] = useState(false)

  const currentParentId = path.length ? path[path.length - 1].id : null
  const children = categories.filter((c) => c.parent_id === currentParentId)

  function descend(category: CauseCategory) {
    setPath((p) => [...p, category])
  }

  function goToDepth(depth: number) {
    setPath((p) => p.slice(0, depth))
  }

  function getAncestorIds(category: CauseCategory): Set<string> {
    const ids = new Set<string>()
    let current = category
    while (current.parent_id) {
      ids.add(current.parent_id)
      const parent = categories.find((c) => c.id === current.parent_id)
      if (!parent) break
      current = parent
    }
    return ids
  }

  function addTag(category: CauseCategory) {
    // Una causa más específica reemplaza a su ancestro genérico ya
    // seleccionado, para no contar el mismo análisis en ambos niveles.
    const ancestorIds = getAncestorIds(category)
    const withoutAncestors = selected.filter((s) => !ancestorIds.has(s.id))
    if (!withoutAncestors.some((s) => s.id === category.id)) {
      onSelectedChange([...withoutAncestors, category])
    } else {
      onSelectedChange(withoutAncestors)
    }
  }

  function removeTag(id: string) {
    onSelectedChange(selected.filter((s) => s.id !== id))
  }

  async function handleCreate() {
    if (!newNodeName.trim()) return
    setCreating(true)
    try {
      const created = await createCauseCategory({
        organizationId,
        parentId: currentParentId,
        name: newNodeName.trim(),
        createdBy,
      })
      onCategoriesChange([...categories, created])
      setNewNodeName('')
      addTag(created)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="taxonomy-picker">
      <div className="taxonomy-breadcrumb">
        <button type="button" onClick={() => goToDepth(0)} disabled={path.length === 0}>
          Raíz
        </button>
        {path.map((node, i) => (
          <span key={node.id}>
            {' › '}
            <button type="button" onClick={() => goToDepth(i + 1)}>
              {node.name}
            </button>
          </span>
        ))}
      </div>

      {path.length > 0 && (
        <button type="button" className="taxonomy-use-current" onClick={() => addTag(path[path.length - 1])}>
          + Usar "{path[path.length - 1].name}" como causa
        </button>
      )}

      {children.length > 0 && (
        <ul className="taxonomy-children">
          {children.map((child) => (
            <li key={child.id}>
              <button type="button" onClick={() => descend(child)}>
                {child.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="taxonomy-new">
        <input
          value={newNodeName}
          onChange={(e) => setNewNodeName(e.target.value)}
          placeholder={path.length === 0 ? 'Nueva categoría raíz (ej. Máquina)…' : 'Nueva sub-causa…'}
        />
        <button type="button" onClick={handleCreate} disabled={creating || !newNodeName.trim()}>
          Agregar
        </button>
      </div>

      {selected.length > 0 && (
        <div className="taxonomy-selected">
          {selected.map((tag) => (
            <span key={tag.id} className="taxonomy-tag">
              {tag.name}
              <button type="button" onClick={() => removeTag(tag.id)} aria-label={`Quitar ${tag.name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
