import { supabase } from '../../lib/supabase'

export interface QuickWinBoard {
  id: string
  organization_id: string
  site_id: string
  board_date: string
  problema_del_dia: string | null
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
  created_at: string
}

export interface QuickWinCandidateWithNames extends QuickWinCandidate {
  axisName: string
  axisColor: string
  responsibleName: string | null
  proposedByName: string | null
}

interface RawCandidateRow extends QuickWinCandidate {
  axes: { name: string; color: string } | null
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

export async function fetchQuickWinCandidates(boardId: string): Promise<QuickWinCandidateWithNames[]> {
  const { data, error } = await supabase
    .from('quick_win_candidates')
    .select(
      '*, axes(name, color), responsible:profiles!quick_win_candidates_responsible_id_fkey(full_name), proposer:profiles!quick_win_candidates_proposed_by_fkey(full_name)',
    )
    .eq('board_id', boardId)
    .order('created_at')
  if (error) throw error
  return ((data ?? []) as unknown as RawCandidateRow[]).map((row) => ({
    ...row,
    axisName: row.axes?.name ?? '—',
    axisColor: row.axes?.color ?? 'var(--color-border)',
    responsibleName: row.responsible?.full_name ?? null,
    proposedByName: row.proposer?.full_name ?? null,
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

/** Marca (o desmarca) un candidato como "el win" que el equipo eligió —
 * no es excluyente entre sí: si la reunión decide sacar adelante más de un
 * win ese día, cada uno se marca por su cuenta. */
export async function setQuickWinSelected(id: string, isSelected: boolean): Promise<void> {
  const { error } = await supabase.from('quick_win_candidates').update({ is_selected: isSelected }).eq('id', id)
  if (error) throw error
}

/** El toggle de un clic verde/rojo: false = se resuelve en este nivel,
 * true = escala a la reunión de nivel 2. */
export async function setQuickWinEscalation(id: string, needsEscalation: boolean): Promise<void> {
  const { error } = await supabase.from('quick_win_candidates').update({ needs_escalation: needsEscalation }).eq('id', id)
  if (error) throw error
}
