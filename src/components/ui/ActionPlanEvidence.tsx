import { useEffect, useState, type ChangeEvent } from 'react'
import {
  deactivateActionPlanEvidence,
  fetchActionPlanEvidence,
  uploadActionPlanEvidence,
  type ActionPlanEvidenceWithUrl,
} from '../../features/action-plans/actionPlanEvidenceApi'
import './ActionPlanEvidence.css'

interface ActionPlanEvidenceProps {
  actionPlanId: string
  organizationId: string
  uploadedBy: string
  /** Solo admin_consultora / admin_cliente / gerente pueden quitar
   * evidencia ya subida — mismo criterio que el RLS de la tabla. */
  canRemove: boolean
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(fileType: string | null): boolean {
  return !!fileType && fileType.startsWith('image/')
}

/**
 * Evidencia (fotos, PDF) adjunta a un plan de acción — control de registros
 * de calidad para auditorías. Reutilizable donde sea que se muestre un
 * plan de acción (Tablero del indicador, reunión por nivel), ya que todo
 * plan debe poder llevar evidencia sin importar desde dónde se gestione.
 */
export function ActionPlanEvidence({ actionPlanId, organizationId, uploadedBy, canRemove }: ActionPlanEvidenceProps) {
  const [items, setItems] = useState<ActionPlanEvidenceWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const data = await fetchActionPlanEvidence(actionPlanId)
    setItems(data)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchActionPlanEvidence(actionPlanId)
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar la evidencia.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionPlanId])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadActionPlanEvidence({ organizationId, actionPlanId, file, uploadedBy })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la evidencia.')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(id: string) {
    if (
      !window.confirm(
        '¿Quitar esta evidencia de la lista? El archivo queda guardado para auditoría, pero deja de mostrarse aquí.',
      )
    ) {
      return
    }
    setError(null)
    try {
      await deactivateActionPlanEvidence(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar la evidencia.')
    }
  }

  return (
    <div className="plan-evidence">
      <div className="plan-evidence__header">
        <span className="plan-evidence__title">Evidencia</span>
        <label className={`plan-evidence__upload${uploading ? ' plan-evidence__upload--busy' : ''}`}>
          {uploading ? 'Subiendo…' : '+ Subir evidencia'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {error && <p className="plan-evidence__error">{error}</p>}

      {!loading && items.length === 0 && <p className="plan-evidence__empty">Sin evidencia adjunta todavía.</p>}

      {items.length > 0 && (
        <ul className="plan-evidence__list">
          {items.map((item) => (
            <li key={item.id} className="plan-evidence__item">
              {isImage(item.file_type) && item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="plan-evidence__thumb">
                  <img src={item.url} alt={item.file_name} />
                </a>
              ) : (
                <a
                  href={item.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="plan-evidence__file-icon"
                  aria-label={item.file_name}
                >
                  📄
                </a>
              )}
              <div className="plan-evidence__item-body">
                <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="plan-evidence__file-name">
                  {item.file_name}
                </a>
                <span className="plan-evidence__meta">
                  {formatFileSize(item.file_size)} · {item.uploaderName ?? '—'} ·{' '}
                  {item.uploaded_at.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
              {canRemove && (
                <button
                  type="button"
                  className="plan-evidence__remove"
                  onClick={() => handleRemove(item.id)}
                  title="Quitar evidencia"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
