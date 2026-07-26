import { useEffect, useState } from 'react'
import {
  deleteQuickWinCandidate,
  escalateQuickWin,
  fetchEscalatedQuickWins,
  setQuickWinEscalation,
  type EscalatedQuickWin,
} from './quickWinApi'
import { QuickWinCandidateCard } from './QuickWinCandidateCard'
import './quick-win.css'

interface EscalatedQuickWinsProps {
  organizationId: string
  level: 2 | 3
  siteId: string | null
  uploadedBy: string
  canRemoveEvidence: boolean
  canDeleteRecords: boolean
}

/**
 * Wins que llegaron escalados desde el nivel anterior — se muestran en la
 * Reunión por nivel de Nivel 2 y 3 para que el equipo soporte se ponga de
 * acuerdo en el win, su(s) responsable(s) y la hora de entrega, igual que
 * ya se decidió en la reunión de origen.
 */
export function EscalatedQuickWins({
  organizationId,
  level,
  siteId,
  uploadedBy,
  canRemoveEvidence,
  canDeleteRecords,
}: EscalatedQuickWinsProps) {
  const [wins, setWins] = useState<EscalatedQuickWin[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    const data = await fetchEscalatedQuickWins(organizationId, level, siteId)
    setWins(data)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchEscalatedQuickWins(organizationId, level, siteId)
      .then((data) => {
        if (!cancelled) setWins(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [organizationId, level, siteId])

  async function handleToggleEscalation(id: string, current: boolean) {
    await setQuickWinEscalation(id, !current)
    await reload()
  }

  async function handleEscalate(id: string, nextLevel: 2 | 3) {
    await escalateQuickWin(id, nextLevel)
    await reload()
  }

  async function handleDelete(win: EscalatedQuickWin) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente el win "${win.description}"? Se borra también su evidencia adjunta. Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    await deleteQuickWinCandidate(win.id)
    await reload()
  }

  if (loading || wins.length === 0) return null

  return (
    <section className="quick-win-escalated">
      <h2>Wins escalados a este nivel</h2>
      <p className="quick-win-escalated__subtitle">
        Llegaron de la reunión de Nivel {level - 1} — defínanse aquí el win, su responsable y la hora de entrega.
      </p>
      <div className="quick-win-candidates">
        {wins.map((win) => (
          <QuickWinCandidateCard
            key={win.id}
            candidate={win}
            organizationId={organizationId}
            uploadedBy={uploadedBy}
            canRemoveEvidence={canRemoveEvidence}
            siteName={win.siteName}
            onToggleEscalation={() => handleToggleEscalation(win.id, win.needs_escalation)}
            onEscalate={level < 3 ? () => handleEscalate(win.id, (level + 1) as 2 | 3) : undefined}
            canDeleteRecords={canDeleteRecords}
            onDelete={() => handleDelete(win)}
          />
        ))}
      </div>
    </section>
  )
}
