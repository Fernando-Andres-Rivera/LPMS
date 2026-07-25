import { supabase } from '../../lib/supabase'

const BUCKET = 'quick-win-evidencia'
const SIGNED_URL_TTL_SECONDS = 60 * 60

export interface QuickWinEvidence {
  id: string
  candidate_id: string
  file_path: string
  file_name: string
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface QuickWinEvidenceWithUrl extends QuickWinEvidence {
  uploaderName: string | null
  url: string | null
}

interface RawRow extends QuickWinEvidence {
  uploader: { full_name: string } | null
}

/** Evidencia activa de un win, con URL firmada temporal (bucket privado). */
export async function fetchQuickWinEvidence(candidateId: string): Promise<QuickWinEvidenceWithUrl[]> {
  const { data, error } = await supabase
    .from('quick_win_evidence')
    .select('*, uploader:profiles!quick_win_evidence_uploaded_by_fkey(full_name)')
    .eq('candidate_id', candidateId)
    .eq('active', true)
    .order('uploaded_at', { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as unknown as RawRow[]
  if (rows.length === 0) return []

  const { data: signedUrls, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      rows.map((r) => r.file_path),
      SIGNED_URL_TTL_SECONDS,
    )
  if (signError) throw signError
  const urlByPath = new Map((signedUrls ?? []).map((u) => [u.path, u.signedUrl]))

  return rows.map((row) => ({
    ...row,
    uploaderName: row.uploader?.full_name ?? null,
    url: urlByPath.get(row.file_path) ?? null,
  }))
}

export async function uploadQuickWinEvidence(params: {
  organizationId: string
  candidateId: string
  file: File
  uploadedBy: string
}): Promise<QuickWinEvidence> {
  const safeName = params.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${params.organizationId}/${params.candidateId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.file, {
    contentType: params.file.type || undefined,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('quick_win_evidence')
    .insert({
      candidate_id: params.candidateId,
      file_path: path,
      file_name: params.file.name,
      file_type: params.file.type || null,
      file_size: params.file.size,
      uploaded_by: params.uploadedBy,
    })
    .select('*')
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data
}

export async function deactivateQuickWinEvidence(id: string): Promise<void> {
  const { error } = await supabase.from('quick_win_evidence').update({ active: false }).eq('id', id)
  if (error) throw error
}
