import { useEffect, useState } from 'react'
import { createUnit, fetchUnits } from './unitsApi'
import type { Unit } from '../../lib/types'

const OTHER_VALUE = '__other__'

interface UnitPickerProps {
  organizationId: string
  createdBy: string
  value: string
  onChange: (value: string) => void
}

/**
 * Desplegable de unidades de medida por organización, en vez de texto
 * libre: reduce inconsistencias entre indicadores (ej. "accidentes" vs
 * "Accidentes" vs "accidente"). Si la unidad que se necesita no está en
 * la lista, "Otra, especificar" permite escribirla y queda guardada en
 * el catálogo de la organización para la próxima vez.
 */
export function UnitPicker({ organizationId, createdBy, value, onChange }: UnitPickerProps) {
  const [units, setUnits] = useState<Unit[]>([])
  const [customValue, setCustomValue] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastCheckedValue, setLastCheckedValue] = useState<string | null>(null)

  useEffect(() => {
    fetchUnits(organizationId).then(setUnits)
  }, [organizationId])

  // Si el valor actual (ej. una unidad histórica al editar un indicador)
  // todavía no está en el catálogo cargado, mostramos el campo de texto
  // directamente — ajuste de estado durante el render, no en un efecto.
  if (value && value !== lastCheckedValue && units.length > 0 && !units.some((u) => u.name === value)) {
    setLastCheckedValue(value)
    setShowCustom(true)
    setCustomValue(value)
  }

  function handleSelectChange(next: string) {
    if (next === OTHER_VALUE) {
      setShowCustom(true)
      setCustomValue('')
      onChange('')
      return
    }
    setShowCustom(false)
    onChange(next)
  }

  async function handleCustomBlur() {
    const trimmed = customValue.trim()
    if (!trimmed) return
    onChange(trimmed)
    if (units.some((u) => u.name === trimmed)) return
    setSaving(true)
    try {
      const created = await createUnit({ organizationId, name: trimmed, createdBy })
      setUnits((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
    } finally {
      setSaving(false)
    }
  }

  if (showCustom) {
    return (
      <div className="unit-picker">
        <input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={handleCustomBlur}
          placeholder="Escribe la unidad…"
          required
          autoFocus
        />
        <div className="unit-picker__row">
          {units.length > 0 && (
            <button
              type="button"
              className="unit-picker__back"
              onClick={() => {
                setShowCustom(false)
                onChange('')
              }}
            >
              ← Elegir de la lista
            </button>
          )}
          {saving && <span className="unit-picker__saving">Guardando en el catálogo…</span>}
        </div>
      </div>
    )
  }

  return (
    <select value={value} onChange={(e) => handleSelectChange(e.target.value)} required>
      <option value="" disabled>
        Selecciona una unidad
      </option>
      {units.map((u) => (
        <option key={u.id} value={u.name}>
          {u.name}
        </option>
      ))}
      <option value={OTHER_VALUE}>Otra, especificar…</option>
    </select>
  )
}
