// Tipos que reflejan el esquema de Supabase (supabase/migrations).
// Se mantienen manualmente en la Fase 1; en una fase posterior se pueden
// generar automáticamente con `supabase gen types typescript`.

export type UserRole =
  | 'admin_consultora'
  | 'admin_cliente'
  | 'gerente'
  | 'administrativo'
  | 'operativo'

export type IndicatorFrequency = 'diaria' | 'semanal' | 'quincenal' | 'mensual'
export type ImprovementDirection = 'mayor_mejor' | 'menor_mejor'
export type PdcaStatus = 'planificar' | 'hacer' | 'verificar' | 'actuar' | 'cerrado'
export type CausalMethodology = '5_porques' | 'ishikawa' | 'causas_estandar'

/** 'numerico' = valor contra un umbral (lo de siempre). 'binario' = KPI de
 * ejecución tipo "¿se hizo?" — se captura Sí/No, se guarda como 1/0, y el
 * objetivo siempre es "Sí" (no se define un número). */
export type IndicatorValueType = 'numerico' | 'binario'

export const INDICATOR_VALUE_TYPE_LABEL: Record<IndicatorValueType, string> = {
  numerico: 'Numérico (contra un objetivo)',
  binario: 'Cumplimiento (Sí / No)',
}

/** Formatea el último valor de un indicador para mostrarlo — "Sí"/"No" para
 * indicadores binarios, número + unidad para el resto. */
export function formatIndicatorValue(
  value: number | null,
  valueType: IndicatorValueType,
  unit: string,
): string {
  if (value === null) return '—'
  if (valueType === 'binario') return value >= 1 ? 'Sí' : 'No'
  return unit ? `${value} ${unit}` : String(value)
}

export const CAUSAL_METHODOLOGY_LABEL: Record<CausalMethodology, string> = {
  ishikawa: 'Ishikawa',
  '5_porques': '5 Porqués',
  causas_estandar: 'Causas posibles',
}

/** Cómo combinar varias mediciones dentro de un mismo período al revisar resultados. */
export type AggregationMethod = 'suma' | 'promedio' | 'ultimo' | 'maximo' | 'minimo'

export const AGGREGATION_METHOD_LABEL: Record<AggregationMethod, string> = {
  suma: 'Suma del período',
  promedio: 'Promedio del período',
  ultimo: 'Último valor capturado',
  maximo: 'Máximo del período',
  minimo: 'Mínimo del período',
}

export const AGGREGATION_METHOD_HELP: Record<AggregationMethod, string> = {
  suma: 'Ej. accidentes, defectos, paradas — cuentas que se acumulan en el período.',
  promedio: 'Ej. % de cumplimiento, calificaciones — tasas que se promedian.',
  ultimo: 'Ej. nivel de inventario — se queda con la medición más reciente del período.',
  maximo: 'Ej. pico de una variable durante el período.',
  minimo: 'Ej. el peor valor alcanzado durante el período.',
}

/** Ventana de tiempo usada para revisar resultados agregados en los tableros. */
export type PeriodType = 'dia' | 'semana' | 'quincena' | 'mes' | 'trimestre'

export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  dia: 'Día',
  semana: 'Semana',
  quincena: 'Quincena',
  mes: 'Mes',
  trimestre: 'Trimestre',
}

export interface Organization {
  id: string
  name: string
  industry: string | null
  logo_url: string | null
  active: boolean
  created_at: string
}

export interface Site {
  id: string
  organization_id: string
  name: string
  address: string | null
  active: boolean
  org_unit_id: string | null
  operation_start_date: string | null
}

/** Nivel 2 (Unidad de Negocio) o Nivel 3 (Región) de la estructura organizacional. */
export interface OrgUnit {
  id: string
  organization_id: string
  parent_id: string | null
  level: 2 | 3
  name: string
  active: boolean
}

/** Horario de la reunión de un nivel: hora de inicio + qué día evalúa esa
 * reunión (0 = hoy, -1 = ayer, -2 = antier…) — no toda reunión evalúa el
 * dato del mismo día en que ocurre. */
export interface LevelCaptureCutoff {
  id: string
  organization_id: string
  level: 1 | 2 | 3
  cutoff_time: string // 'HH:MM:SS'
  evaluated_day_offset: number // 0, -1, -2…
  created_by: string | null
  created_at: string
}

export const DAY_OFFSET_LABEL: Record<number, string> = {
  0: 'Hoy (mismo día)',
  [-1]: 'Ayer (día anterior)',
  [-2]: 'Antier (2 días antes)',
  [-3]: 'Hace 3 días',
}

/** La fecha (YYYY-MM-DD) que la reunión de hoy evalúa, según su desfase. */
export function evaluatedDateForOffset(offset: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** true si ya pasó la hora de la reunión del nivel Y la fecha que se quiere
 * capturar es justo la que esa reunión evalúa. Nunca bloquea fechas más
 * antiguas que la evaluada (para poder ponerse al día con un dato atrasado). */
export function isCaptureBlockedByTime(
  schedule: { cutoff_time: string; evaluated_day_offset: number } | null,
  periodDate: string,
  now: Date,
): boolean {
  if (!schedule) return false
  if (periodDate !== evaluatedDateForOffset(schedule.evaluated_day_offset, now)) return false
  const [hours, minutes] = schedule.cutoff_time.split(':').map(Number)
  const meetingTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
  return now >= meetingTime
}

/** Nivel 5+ (Instalación y más abajo) de la estructura organizacional, colgado de un sitio. */
export interface SiteLocation {
  id: string
  site_id: string
  parent_id: string | null
  level: number
  name: string
  active: boolean
}

export const ORG_STRUCTURE_LEVEL_LABEL: Record<number, string> = {
  1: 'Organización',
  2: 'Unidad de Negocio',
  3: 'Región',
  4: 'Sitio',
  5: 'Instalación',
  6: 'Área Funcional',
  7: 'Proceso',
  8: 'Subproceso',
  9: 'Línea / Célula',
  10: 'Estación / Puesto',
  11: 'Activo',
  12: 'Ubicación Física',
}

export interface Profile {
  id: string
  organization_id: string
  role: UserRole
  full_name: string
  email: string
  active: boolean
}

export interface ProfileSite {
  id: string
  profile_id: string
  site_id: string
}

export interface Axis {
  id: string
  code: string
  name: string
  color: string
  icon: string | null
  sort_order: number
}

export interface OrganizationAxis {
  id: string
  organization_id: string
  axis_id: string
  active: boolean
}

export interface Indicator {
  id: string
  organization_id: string
  site_id: string | null
  site_location_id: string | null
  axis_id: string
  level: 1 | 2 | 3
  name: string
  definition: string | null
  calculation_formula: string | null
  unit: string
  frequency: IndicatorFrequency
  improvement_direction: ImprovementDirection
  aggregation_method: AggregationMethod
  responsible_id: string | null
  active: boolean
  created_at: string
  /** Si es true, el valor no se captura a mano: se calcula sumando/promediando
   * (según aggregation_method) los valores de sus indicadores hijo. */
  is_calculated: boolean
  value_type: IndicatorValueType
}

export interface Unit {
  id: string
  organization_id: string
  name: string
  created_by: string | null
  created_at: string
}

export interface IndicatorLink {
  id: string
  child_indicator_id: string
  parent_indicator_id: string
}

export interface Target {
  id: string
  indicator_id: string
  period_year: number
  period_month: number | null
  target_value: number
  created_by: string | null
}

export interface Measurement {
  id: string
  indicator_id: string
  period_date: string
  value: number
  comment: string | null
  site_location_id: string | null
  captured_by: string | null
  created_at: string
}

// ------------------------------------------------------------
// Módulo de Seguridad y Salud en el Trabajo (SST)
// ------------------------------------------------------------

export type SafetyEventType = 'accidente' | 'incidente' | 'acto_inseguro' | 'condicion_insegura'
export type AccidentSeverity = 'fatal' | 'serio' | 'leve'

export const SAFETY_EVENT_TYPE_LABEL: Record<SafetyEventType, string> = {
  accidente: 'Accidente',
  incidente: 'Incidente (sin daño)',
  acto_inseguro: 'Acto inseguro',
  condicion_insegura: 'Condición insegura',
}

export const ACCIDENT_SEVERITY_LABEL: Record<AccidentSeverity, string> = {
  fatal: 'Fatal',
  serio: 'Serio (>2 días de incapacidad)',
  leve: 'Leve (<2 días de incapacidad)',
}

export interface SafetyEvent {
  id: string
  organization_id: string
  site_id: string
  event_type: SafetyEventType
  event_date: string
  severity: AccidentSeverity | null
  disability_days: number | null
  workers_affected: number | null
  description: string | null
  created_by: string | null
  created_at: string
}

export const ISHIKAWA_CATEGORIES = [
  'mano_de_obra',
  'metodo',
  'maquina',
  'material',
  'medicion',
  'medio_ambiente',
] as const

export type IshikawaCategoryKey = (typeof ISHIKAWA_CATEGORIES)[number]

export const ISHIKAWA_CATEGORY_LABEL: Record<IshikawaCategoryKey, string> = {
  mano_de_obra: 'Mano de obra',
  metodo: 'Método',
  maquina: 'Máquina',
  material: 'Material',
  medicion: 'Medición',
  medio_ambiente: 'Medio ambiente',
}

export interface IshikawaData {
  categories: Record<IshikawaCategoryKey, string[]>
}

export interface FiveWhysData {
  whys: string[]
}

export interface CausalAnalysis {
  id: string
  organization_id: string
  indicator_id: string
  measurement_id: string | null
  methodology: CausalMethodology
  description: string | null
  root_cause: string | null
  data: Partial<IshikawaData & FiveWhysData>
  created_by: string | null
  created_at: string
}

export interface CauseCategory {
  id: string
  organization_id: string
  parent_id: string | null
  name: string
  active: boolean
  created_by: string | null
  created_at: string
}

export interface CausalAnalysisCause {
  id: string
  causal_analysis_id: string
  cause_category_id: string
}

/**
 * Nodo del árbol de causas PROPIO de un indicador (ej. Máquina -> Extrusora 3
 * -> Motor para "daños mecánicos"), a diferencia de CauseCategory que es un
 * árbol compartido por toda la organización. Alimenta la pestaña "Causas
 * posibles" del análisis causal.
 */
export interface IndicatorCause {
  id: string
  indicator_id: string
  parent_id: string | null
  name: string
  active: boolean
  created_by: string | null
  created_at: string
}

export interface CausalAnalysisIndicatorCause {
  id: string
  causal_analysis_id: string
  indicator_cause_id: string
}

export interface ActionPlan {
  id: string
  organization_id: string
  causal_analysis_id: string | null
  indicator_id: string
  description: string
  responsible_id: string | null
  due_date: string | null
  event_date: string | null
  closed_at: string | null
  status: PdcaStatus
  created_by: string | null
  created_at: string
}

/**
 * Los 4 cuartos del círculo de avance del plan de acción (formato SMQDC):
 * vacío (problema definido) -> lanzada -> en ejecución -> terminada -> eficaz.
 * `actuar` existe en la base para flexibilidad futura pero no se usa en
 * este control de 4 pasos.
 */
export const ACTION_PLAN_STEPS: { status: PdcaStatus; label: string; quarters: number }[] = [
  { status: 'planificar', label: 'Acción lanzada', quarters: 1 },
  { status: 'hacer', label: 'En ejecución', quarters: 2 },
  { status: 'verificar', label: 'Terminada', quarters: 3 },
  { status: 'cerrado', label: 'Eficaz', quarters: 4 },
]

/** Estado del semáforo de un indicador, derivado en el cliente. */
export type SemaforoEstado = 'cumple' | 'riesgo' | 'incumple' | 'sin_datos'
