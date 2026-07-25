import { supabase } from '../../lib/supabase'

export interface QuickWinBoard {
  id: string
  organization_id: string
  site_id: string
  board_date: string
  problema_del_dia: string | null
  /** Pilar SMQDCEP del problema del día — independiente del pilar de cada
   * win candidato, que puede ser de un eje distinto al del problema. */
  axis_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface QuickWinCandidate {
  id: string
  board_id: string
  axis_id: string
  description: string
  responsible_id: string | null
  execution_time: string | null // 'HH:MM:SS'
  proposed_by: string | null
  is_selected: boolean
  needs_escalation: boolean
  /** Qué reunión de nivel tiene actualmente este win en su cola de
   * decisión — arranca en 1 (Gemba Walk) y sube a 2 o 3 cuando se escala. */
  level: 1 | 2 | 3
  created_at: string
}

export interface QuickWinCandidateWithNames extends QuickWinCandidate {
  axisName: string
  axisColor: string
  axisIcon: string | null
  responsibleName: string | null
  proposedByName: string | null
}

export interface EscalatedQuickWin extends QuickWinCandidateWithNames {
  siteName: string
  boardDate: string
}

interface RawCandidateRow extends QuickWinCandidate {
  axes: { name: string; color: string; icon: string | null } | null
  responsible: { full_name: string } | null
  proposer: { full_name: string } | null
}

/** El tablero de un sitio en una fecha — null si todavía nadie lo ha
 * creado ese día (recién entonces se crea, al escribir el primer dato). */
export async function fetchQuickWinBoard(siteId: string, boardDate: string): Promise<QuickWinBoard | null> {
  const { data, error } = await supabase
    .from('quick_win_boards')
    .select('*')
    .eq('site_id', siteId)
    .eq('board_date', boardDate)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createQuickWinBoard(params: {
  organizationId: string
  siteId: string
  boardDate: string
  createdBy: string
}): Promise<QuickWinBoard> {
  const { data, error } = await supabase
    .from('quick_win_boards')
    .insert({
      organization_id: params.organizationId,
      site_id: params.siteId,
      board_date: params.boardDate,
      created_by: params.createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateProblemaDelDia(boardId: string, problemaDelDia: string): Promise<void> {
  const { error } = await supabase
    .from('quick_win_boards')
    .update({ problema_del_dia: problemaDelDia, updated_at: new Date().toISOString() })
    .eq('id', boardId)
  if (error) throw error
}

/** Pilar SMQDCEP del problema del día — separado del texto porque cambia
 * con el <select>, no al perder foco como el textarea. */
export async function updateProblemaAxis(boardId: string, axisId: string | null): Promise<void> {
  const { error } = await supabase
    .from('quick_win_boards')
    .update({ axis_id: axisId, updated_at: new Date().toISOString() })
    .eq('id', boardId)
  if (error) throw error
}

const CANDIDATE_SELECT =
  '*, axes(name, color, icon), responsible:profiles!quick_win_candidates_responsible_id_fkey(full_name), proposer:profiles!quick_win_candidates_proposed_by_fkey(full_name)'

function mapCandidateRow(row: RawCandidateRow): QuickWinCandidateWithNames {
  return {
    ...row,
    axisName: row.axes?.name ?? '—',
    axisColor: row.axes?.color ?? 'var(--color-border)',
    axisIcon: row.axes?.icon ?? null,
    responsibleName: row.responsible?.full_name ?? null,
    proposedByName: row.proposer?.full_name ?? null,
  }
}

export async function fetchQuickWinCandidates(boardId: string): Promise<QuickWinCandidateWithNames[]> {
  const { data, error } = await supabase
    .from('quick_win_candidates')
    .select(CANDIDATE_SELECT)
    .eq('board_id', boardId)
    .order('created_at')
  if (error) throw error
  return ((data ?? []) as unknown as RawCandidateRow[]).map(mapCandidateRow)
}

/**
 * Wins elegidos que están actualmente en la cola de decisión de este nivel
 * (2 o 3) — llegaron ahí porque el nivel anterior los escaló. Cruza todos
 * los sitios de la organización (opcionalmente uno solo), ya que en Nivel
 * 2/3 se reúne el equipo soporte de varios sitios a la vez.
 */
export async function fetchEscalatedQuickWins(
  organizationId: string,
  level: 2 | 3,
  siteId?: string | null,
): Promise<EscalatedQuickWin[]> {
  let query = supabase
    .from('quick_win_candidates')
    .select(
      `${CANDIDATE_SELECT}, quick_win_boards!inner(organization_id, board_date, site_id, sites(name))`,
    )
    .eq('level', level)
    .eq('is_selected', true)
    .eq('quick_win_boards.organization_id', organizationId)
    .order('created_at')

  if (siteId) query = query.eq('quick_win_boards.site_id', siteId)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as (RawCandidateRow & {
    quick_win_boards: { board_date: string; sites: { name: string } | null }
  })[]).map((row) => ({
    ...mapCandidateRow(row),
    siteName: row.quick_win_boards.sites?.name ?? '—',
    boardDate: row.quick_win_boards.board_date,
  }))
}

export async function createQuickWinCandidate(params: {
  boardId: string
  axisId: string
  description: string
  responsibleId: string | null
  executionTime: string | null
  proposedBy: string
}): Promise<void> {
  const { error } = await supabase.from('quick_win_candidates').insert({
    board_id: params.boardId,
    axis_id: params.axisId,
    description: params.description,
    responsible_id: params.responsibleId,
    execution_time: params.executionTime,
    proposed_by: params.proposedBy,
  })
  if (error) throw error
}

/**
 * Marca (o desmarca) un candidato como "el win" que el equipo eligió —
 * exclusivo dentro del tablero (un solo win elegido por sitio/día): al
 * elegir uno nuevo, cualquier otro que ya estuviera marcado en este mismo
 * tablero se desmarca primero.
 */
export async function setQuickWinSelected(boardId: string, id: string, isSelected: boolean): Promise<void> {
  if (isSelected) {
    const { error: deselectError } = await supabase
      .from('quick_win_candidates')
      .update({ is_selected: false })
      .eq('board_id', boardId)
      .neq('id', id)
    if (deselectError) throw deselectError
  }
  const { error } = await supabase.from('quick_win_candidates').update({ is_selected: isSelected }).eq('id', id)
  if (error) throw error
}

/** El toggle de un clic verde/rojo, puramente visual: false = se resuelve
 * en este nivel, true = necesita escalar (el paso de nivel en sí lo hace
 * escalateQuickWin, una acción aparte). */
export async function setQuickWinEscalation(id: string, needsEscalation: boolean): Promise<void> {
  const { error } = await supabase.from('quick_win_candidates').update({ needs_escalation: needsEscalation }).eq('id', id)
  if (error) throw error
}

/**
 * Sube el win a la reunión del siguiente nivel — deja de aparecer en la
 * cola del nivel actual y aparece en la del nuevo. needs_escalation vuelve
 * a false: el nuevo nivel decide desde cero si se resuelve ahí o sigue
 * subiendo.
 */
export async function escalateQuickWin(id: string, nextLevel: 2 | 3): Promise<void> {
  const { error } = await supabase
    .from('quick_win_candidates')
    .update({ level: nextLevel, needs_escalation: false })
    .eq('id', id)
  if (error) throw error
}
