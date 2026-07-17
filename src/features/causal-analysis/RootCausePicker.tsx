import { useEffect, useState } from 'react'
import { createIndicatorRootCause, fetchIndicatorRootCauses } from './standardCausesApi'
import type { IndicatorRootCause } from '../../lib/types'
import './indicator-cause-picker.css'

const OTHER_VALUE = '__other__'

interface RootCausePickerProps {
  indicatorId: string
  createdBy: string
  value: string
  onChange: (value: string) => void
}

function findMatch(causes: IndicatorRootCause[], text: string): IndicatorRootCause | undefined {
  const normalized = text.trim().toLowerCase()
  return causes.find((c) => c.text.toLowerCase() === normalized)
}

/**
 * Desplegable de "causa raíz identificada" por indicador, en vez de texto
 * libre: reduce que "frecuencia de cambio de EPP" y "cambio de EPP muy
 * espaciado" queden como dos causas distintas cuando en realidad son la
 * misma. "Otra, especificar" permite escribir una nueva y queda guardada en
 * el catálogo de este indicador — si lo que se escribe ya existe (sin
 * distinguir mayúsculas), se reutiliza la entrada existente en vez de crear
 * un casi-duplicado.
 */
export function RootCausePicker({ indicatorId, createdBy, value, onChange }: RootCausePickerProps) {
  const [causes, setCauses] = useState<IndicatorRootCause[]>([])
  const [customValue, setCustomValue] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastCheckedValue, setLastCheckedValue] = useState<string | null>(null)

  useEffect(() => {
    fetchIndicatorRootCauses(indicatorId).then(setCauses)
  }, [indicatorId])

  // Si el valor actual todavía no está en el catálogo cargado, muestra el
  // campo de texto directamente — ajuste de estado durante el render, no en
  // un efecto (mismo patrón que UnitPicker).
  if (value && value !== lastCheckedValue && causes.length > 0 && !findMatch(causes, value)) {
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

    const existing = findMatch(causes, trimmed)
    if (existing) {
      // Ya existe (sin distinguir mayúsculas) — se reutiliza tal cual está
      // guardada, en vez de crear una entrada casi-duplicada.
      onChange(existing.text)
      return
    }

    onChange(trimmed)
    setSaving(true)
    try {
      const created = await createIndicatorRootCause({ indicatorId, text: trimmed, createdBy })
      setCauses((current) => (findMatch(current, created.text) ? current : [...current, created]))
      onChange(created.text)
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
          placeholder="Escribe la causa raíz…"
          required
          autoFocus
        />
        <div className="unit-picker__row">
          {causes.length > 0 && (
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
        Selecciona una causa raíz
      </option>
      {causes.map((c) => (
        <option key={c.id} value={c.text}>
          {c.text}
        </option>
      ))}
      <option value={OTHER_VALUE}>Otra, especificar…</option>
    </select>
  )
}
