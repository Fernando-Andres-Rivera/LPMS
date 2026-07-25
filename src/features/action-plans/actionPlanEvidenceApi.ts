import { supabase } from '../../lib/supabase'

const BUCKET = 'plan-accion-evidencia'
// Suficiente para que quien abre la lista alcance a ver/descargar la
// evidencia sin que la URL quede indefinidamente válida (bucket privado).
const SIGNED_URL_TTL_SECONDS = 60 * 60

export interface ActionPlanEvidence {
  id: string
  action_plan_id: string
  file_path: string
  file_name: string
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface ActionPlanEvidenceWithUrl extends ActionPlanEvidence {
  uploaderName: string | null
  url: string | null
}

interface RawRow extends ActionPlanEvidence {
  uploader: { full_name: string } | null
}

/** Evidencia activa de un plan, con una URL firmada temporal para ver o
 * descargar cada archivo — el bucket es privado, así que no hay una URL
 * pública fija que se pueda compartir fuera de la aplicación. */
export async function fetchActionPlanEvidence(actionPlanId: string): Promise<ActionPlanEvidenceWithUrl[]> {
  const { data, error } = await supabase
    .from('action_plan_evidence')
    .select('*, uploader:profiles!action_plan_evidence_uploaded_by_fkey(full_name)')
    .eq('action_plan_id', actionPlanId)
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

/**
 * Sube un archivo de evidencia al plan de acción y registra el metadato
 * (quién, cuándo, nombre/tipo/tamaño). La ruta arranca con el id de la
 * organización — el RLS de storage.objects lo exige para aislar la
 * evidencia entre clientes, igual que el bucket gemba-evidencia.
 */
export async function uploadActionPlanEvidence(params: {
  organizationId: string
  actionPlanId: string
  file: File
  uploadedBy: string
}): Promise<ActionPlanEvidence> {
  const safeName = params.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${params.organizationId}/${params.actionPlanId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.file, {
    contentType: params.file.type || undefined,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('action_plan_evidence')
    .insert({
      action_plan_id: params.actionPlanId,
      file_path: path,
      file_name: params.file.name,
      file_type: params.file.type || null,
      file_size: params.file.size,
      uploaded_by: params.uploadedBy,
    })
    .select('*')
    .single()

  if (error) {
    // El archivo ya se subió pero el metadato falló (ej. RLS por un cambio
    // de rol a mitad de sesión) — no dejar un archivo huérfano sin registro.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data
}

/** Oculta la evidencia sin borrar el archivo ni la fila — un registro de
 * calidad no debe poder desaparecer sin dejar rastro para una auditoría. */
export async function deactivateActionPlanEvidence(id: string): Promise<void> {
  const { error } = await supabase.from('action_plan_evidence').update({ active: false }).eq('id', id)
  if (error) throw error
}
