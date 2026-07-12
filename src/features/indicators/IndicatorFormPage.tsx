import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  AGGREGATION_METHOD_HELP,
  AGGREGATION_METHOD_LABEL,
  INDICATOR_VALUE_TYPE_LABEL,
  type AggregationMethod,
  type Axis,
  type Indicator,
  type IndicatorFrequency,
  type IndicatorValueType,
  type ImprovementDirection,
  type Profile,
  type Site,
  type SiteLocation,
} from '../../lib/types'
import {
  createIndicator,
  fetchIndicatorById,
  fetchIndicatorParentIds,
  fetchOrganizationAxes,
  fetchParentCandidates,
  fetchProfiles,
  fetchSites,
  updateIndicator,
  type IndicatorFormValues,
} from './indicatorsApi'
import { fetchSiteLocations } from '../org-structure/orgStructureApi'
import { fetchAnnualTarget, saveAnnualTarget } from './targetsApi'
import { UnitPicker } from './UnitPicker'
import { Semaforo } from '../../components/ui/Semaforo'
import './indicators.css'

const CURRENT_YEAR = new Date().getFullYear()

const FRECUENCIAS: IndicatorFrequency[] = ['diaria', 'semanal', 'quincenal', 'mensual']
const DIRECCIONES: { value: ImprovementDirection; label: string }[] = [
  { value: 'mayor_mejor', label: 'Mayor es mejor' },
  { value: 'menor_mejor', label: 'Menor es mejor' },
]
const AGGREGATION_METHODS: AggregationMethod[] = ['ultimo', 'suma', 'promedio', 'maximo', 'minimo']
// Un indicador binario (Sí/No) solo admite reglas que dan un resultado 0/1
// limpio — promedio o suma darían un número intermedio que ya no se puede
// mostrar como "Sí"/"No".
const BINARY_AGGREGATION_METHODS: AggregationMethod[] = ['ultimo', 'maximo', 'minimo']
const BINARY_AGGREGATION_LABEL: Record<AggregationMethod, string> = {
  ultimo: 'El más reciente',
  maximo: 'Si se cumplió al menos una vez en el período',
  minimo: 'Solo si se cumplió todas las veces en el período',
  suma: '',
  promedio: '',
}
const BINARY_AGGREGATION_HELP: Record<AggregationMethod, string> = {
  ultimo: 'El indicador muestra Sí/No según la última vez que se registró en el período.',
  maximo: 'Basta con un "Sí" en el período para que el indicador muestre Sí — exige al menos una vez.',
  minimo: 'Si hubo un solo "No" en el período, el indicador muestra No — exige que se haya cumplido siempre.',
  suma: '',
  promedio: '',
}
const VALUE_TYPES: IndicatorValueType[] = ['numerico', 'binario']

// Cómo nombrar el objetivo según la frecuencia de captura del indicador —
// un objetivo "diario" no se lee igual que uno "mensual", aunque ambos se
// guarden como el mismo valor vigente para todo el año.
const FRECUENCIA_ADJETIVO: Record<IndicatorFrequency, string> = {
  diaria: 'diario',
  semanal: 'semanal',
  quincenal: 'quincenal',
  mensual: 'mensual',
}
const FRECUENCIA_SUSTANTIVO: Record<IndicatorFrequency, string> = {
  diaria: 'día',
  semanal: 'semana',
  quincenal: 'quincena',
  mensual: 'mes',
}

export function IndicatorFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { profile, organizationId } = useAuth()

  const [axes, setAxes] = useState<Axis[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteLocations, setSiteLocations] = useState<SiteLocation[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [parentCandidates, setParentCandidates] = useState<Indicator[]>([])
  const [selectedParents, setSelectedParents] = useState<string[]>([])
  const [targetValue, setTargetValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<IndicatorFormValues>({
    organization_id: '',
    site_id: null,
    site_location_id: null,
    axis_id: '',
    level: 1,
    name: '',
    definition: '',
    calculation_formula: '',
    unit: '',
    frequency: 'diaria',
    improvement_direction: 'mayor_mejor',
    aggregation_method: 'ultimo',
    responsible_id: null,
    is_calculated: false,
    value_type: 'numerico',
  })

  useEffect(() => {
    if (!organizationId) return

    Promise.all([fetchOrganizationAxes(organizationId), fetchSites(organizationId), fetchProfiles(organizationId)]).then(
      ([axesData, sitesData, profilesData]) => {
        setAxes(axesData)
        setSites(sitesData)
        setProfiles(profilesData)
      },
    )

    if (id) {
      fetchIndicatorById(id).then((data) => {
        if (data) {
          setForm({
            organization_id: data.organization_id,
            site_id: data.site_id,
            site_location_id: data.site_location_id,
            axis_id: data.axis_id,
            level: data.level,
            name: data.name,
            definition: data.definition,
            calculation_formula: data.calculation_formula,
            unit: data.unit,
            frequency: data.frequency,
            improvement_direction: data.improvement_direction,
            aggregation_method: data.aggregation_method,
            responsible_id: data.responsible_id,
            is_calculated: data.is_calculated,
            value_type: data.value_type,
          })
        }
      })
      fetchIndicatorParentIds(id).then(setSelectedParents)
      fetchAnnualTarget(id, CURRENT_YEAR).then((target) => setTargetValue(target ? String(target.target_value) : ''))
    }
  }, [organizationId, id])

  useEffect(() => {
    if (!organizationId) return
    fetchParentCandidates(organizationId, form.level, id).then(setParentCandidates)
  }, [organizationId, form.level, id])

  useEffect(() => {
    let cancelled = false
    const request = form.site_id ? fetchSiteLocations(form.site_id) : Promise.resolve([])
    request.then((locs) => {
      if (!cancelled) setSiteLocations(locs)
    })
    return () => {
      cancelled = true
    }
  }, [form.site_id])

  function update<K extends keyof IndicatorFormValues>(key: K, value: IndicatorFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Un indicador binario no tiene "sentido de mejora" ni unidad propios (Sí
  // siempre es mejor que No), y solo admite las reglas de agregación que dan
  // un resultado 0/1 limpio — se fuerzan aquí en vez de dejar que queden
  // configurados con algo que ya no tiene sentido para este tipo.
  function handleValueTypeChange(nextType: IndicatorValueType) {
    setForm((f) => ({
      ...f,
      value_type: nextType,
      unit: nextType === 'binario' ? 'Sí/No' : f.unit === 'Sí/No' ? '' : f.unit,
      improvement_direction: nextType === 'binario' ? 'mayor_mejor' : f.improvement_direction,
      aggregation_method:
        nextType === 'binario' && !BINARY_AGGREGATION_METHODS.includes(f.aggregation_method)
          ? 'ultimo'
          : f.aggregation_method,
    }))
    if (nextType === 'binario') setTargetValue('1')
  }

  function toggleParent(parentId: string) {
    setSelectedParents((current) =>
      current.includes(parentId) ? current.filter((p) => p !== parentId) : [...current, parentId],
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!organizationId || !profile) return
    setSaving(true)
    setError(null)
    try {
      const payload: IndicatorFormValues = { ...form, organization_id: organizationId }
      const indicatorId = isEditing && id ? id : await createIndicator(payload, selectedParents)
      if (isEditing && id) {
        await updateIndicator(id, payload, selectedParents)
      }

      // El objetivo de un indicador binario siempre es "Sí" (target_value=1) —
      // no depende de lo que el usuario haya escrito, porque ese campo ni
      // siquiera se muestra para este tipo.
      const effectiveTarget = form.value_type === 'binario' ? '1' : targetValue
      if (effectiveTarget.trim()) {
        await saveAnnualTarget({
          indicatorId,
          year: CURRENT_YEAR,
          targetValue: Number(effectiveTarget),
          createdBy: profile.id,
        })
      }

      navigate('/indicadores')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el indicador.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="indicator-form-page">
      <h1>{isEditing ? 'Editar indicador' : 'Nuevo indicador'}</h1>

      <form className="indicator-form" onSubmit={handleSubmit}>
        <label>
          Nombre
          <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
        </label>

        <label>
          Definición
          <textarea value={form.definition ?? ''} onChange={(e) => update('definition', e.target.value)} rows={2} />
        </label>

        <label>
          Fórmula de cálculo
          <input
            value={form.calculation_formula ?? ''}
            onChange={(e) => update('calculation_formula', e.target.value)}
          />
        </label>

        <div className="indicator-form__row">
          <label>
            Eje
            <select value={form.axis_id} onChange={(e) => update('axis_id', e.target.value)} required>
              <option value="" disabled>
                Selecciona un eje
              </option>
              {axes.map((axis) => (
                <option key={axis.id} value={axis.id}>
                  {axis.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nivel
            <select
              value={form.level}
              onChange={(e) => update('level', Number(e.target.value) as 1 | 2 | 3)}
            >
              <option value={1}>Nivel 1 — Operativo</option>
              <option value={2}>Nivel 2 — Administrativo</option>
              <option value={3}>Nivel 3 — Gerencial</option>
            </select>
          </label>

          <label>
            Tipo de valor
            <select
              value={form.value_type}
              onChange={(e) => handleValueTypeChange(e.target.value as IndicatorValueType)}
            >
              {VALUE_TYPES.map((vt) => (
                <option key={vt} value={vt}>
                  {INDICATOR_VALUE_TYPE_LABEL[vt]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="indicator-form__row">
          <label>
            Sitio {form.level === 3 && '(opcional para indicadores corporativos)'}
            <select
              value={form.site_id ?? ''}
              onChange={(e) => {
                update('site_id', e.target.value || null)
                update('site_location_id', null)
              }}
            >
              <option value="">Corporativo (todos los sitios)</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Instalación (opcional, precisa el lugar dentro del sitio)
            <select
              value={form.site_location_id ?? ''}
              onChange={(e) => update('site_location_id', e.target.value || null)}
              disabled={!form.site_id || siteLocations.length === 0}
            >
              <option value="">Sin precisar</option>
              {siteLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="indicator-form__row">
          {form.value_type === 'numerico' && (
            <label>
              Unidad de medida
              {organizationId && profile && (
                <UnitPicker
                  organizationId={organizationId}
                  createdBy={profile.id}
                  value={form.unit}
                  onChange={(v) => update('unit', v)}
                />
              )}
            </label>
          )}

          <label>
            Frecuencia
            <select value={form.frequency} onChange={(e) => update('frequency', e.target.value as IndicatorFrequency)}>
              {FRECUENCIAS.map((freq) => (
                <option key={freq} value={freq}>
                  {freq}
                </option>
              ))}
            </select>
          </label>

          {form.value_type === 'numerico' && (
            <label>
              Sentido de mejora
              <select
                value={form.improvement_direction}
                onChange={(e) => update('improvement_direction', e.target.value as ImprovementDirection)}
              >
                {DIRECCIONES.map((dir) => (
                  <option key={dir.value} value={dir.value}>
                    {dir.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="indicator-form__parent-option">
          <input
            type="checkbox"
            checked={form.is_calculated}
            onChange={(e) => update('is_calculated', e.target.checked)}
          />
          Este indicador se calcula automáticamente a partir de sus indicadores hijo (no se captura a mano)
        </label>

        <div className="indicator-form__target">
          <label>
            {form.is_calculated
              ? 'Cómo combinar los indicadores hijo en un período'
              : form.value_type === 'binario'
                ? 'Cómo resolver varios registros Sí/No en un período'
                : 'Cómo agregar varias mediciones en un período (semana, mes…)'}
            <select
              value={form.aggregation_method}
              onChange={(e) => update('aggregation_method', e.target.value as AggregationMethod)}
            >
              {(form.value_type === 'binario' ? BINARY_AGGREGATION_METHODS : AGGREGATION_METHODS).map((method) => (
                <option key={method} value={method}>
                  {form.value_type === 'binario' ? BINARY_AGGREGATION_LABEL[method] : AGGREGATION_METHOD_LABEL[method]}
                </option>
              ))}
            </select>
          </label>
          <p className="indicator-form__target-rule">
            {form.is_calculated
              ? 'Cada vez que se muestre este indicador, se combinan (con esta regla) los valores de ese mismo período de los indicadores que lo tengan marcado como padre — no hace falta capturar un valor propio.'
              : form.value_type === 'binario'
                ? BINARY_AGGREGATION_HELP[form.aggregation_method]
                : AGGREGATION_METHOD_HELP[form.aggregation_method]}
          </p>
        </div>

        {form.value_type === 'binario' ? (
          <div className="indicator-form__target">
            <span className="indicator-form__target-label">Objetivo</span>
            <p className="indicator-form__target-rule">
              Fijo en <strong>Sí</strong> — un indicador de cumplimiento no tiene un número que definir. Cada vez
              que se capture <Semaforo estado="cumple" size="sm" /> Sí, o <Semaforo estado="incumple" size="sm" />{' '}
              No.
            </p>
          </div>
        ) : (
          <div className="indicator-form__target">
            <label>
              Objetivo {FRECUENCIA_ADJETIVO[form.frequency]} (vigente todo {CURRENT_YEAR})
              <input
                type="number"
                step="any"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder={`Ej. 0 ${form.unit} por ${FRECUENCIA_SUSTANTIVO[form.frequency]}`.trim()}
              />
            </label>
            <p className="indicator-form__target-rule">
              Como la frecuencia de captura es <strong>{form.frequency}</strong>, este objetivo se evalúa contra
              cada valor {FRECUENCIA_ADJETIVO[form.frequency]} — no contra un total del año. Regla estándar de
              color, igual en todas las pantallas del aplicativo (tablero, cascada, panorama global): un valor{' '}
              {form.improvement_direction === 'mayor_mejor' ? '≥' : '≤'} {targetValue.trim() || '—'} se muestra{' '}
              <Semaforo estado="cumple" size="sm" />, uno claramente{' '}
              {form.improvement_direction === 'mayor_mejor' ? '<' : '>'} el objetivo se muestra{' '}
              <Semaforo estado="incumple" size="sm" />, con una banda intermedia{' '}
              <Semaforo estado="riesgo" size="sm" /> cerca del límite.
            </p>
          </div>
        )}

        <label>
          Responsable
          <select value={form.responsible_id ?? ''} onChange={(e) => update('responsible_id', e.target.value || null)}>
            <option value="">Sin asignar</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="indicator-form__parents">
          <legend>Indicadores padre (nivel superior que este indicador precursa)</legend>
          {parentCandidates.length === 0 && <p>No hay indicadores de nivel superior disponibles.</p>}
          {parentCandidates.map((candidate) => (
            <label key={candidate.id} className="indicator-form__parent-option">
              <input
                type="checkbox"
                checked={selectedParents.includes(candidate.id)}
                onChange={() => toggleParent(candidate.id)}
              />
              Nivel {candidate.level} — {candidate.name}
            </label>
          ))}
        </fieldset>

        {error && <p className="indicator-form__error">{error}</p>}

        <div className="indicator-form__actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar indicador'}
          </button>
        </div>
      </form>
    </div>
  )
}
