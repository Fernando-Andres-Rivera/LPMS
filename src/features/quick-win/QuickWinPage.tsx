import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { fetchIndicators, fetchProfiles, fetchSites } from '../indicators/indicatorsApi'
import type { IndicatorWithRelations } from '../indicators/indicatorsApi'
import { fetchActiveAxes, fetchIndicatorStatusesInRange } from '../dashboard/dashboardApi'
import { calcularSemaforo } from '../../lib/semaforo'
import { today, daysAgo } from '../../lib/dateRange'
import {
  createQuickWinBoard,
  createQuickWinCandidate,
  deleteQuickWinCandidate,
  escalateQuickWin,
  fetchQuickWinBoard,
  fetchQuickWinCandidates,
  setQuickWinEscalation,
  setQuickWinSelected,
  updateProblemaAxis,
  updateProblemaDelDia,
  type QuickWinBoard,
  type QuickWinCandidateWithNames,
} from './quickWinApi'
import { QuickWinCandidateCard } from './QuickWinCandidateCard'
import { AxisIcon } from '../../components/ui/AxisIcon'
import { PageHeader } from '../../components/ui/PageHeader'
import type { Axis, Profile, Site } from '../../lib/types'
import './quick-win.css'

type PillarStatus = 'ok' | 'fail' | 'sin_datos'

export function QuickWinPage() {
  const { profile, organizationId, siteIds } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [siteOverride, setSiteOverride] = useState<string | null>(null)
  const [siteTouched, setSiteTouched] = useState(false)
  const selectedSite = siteTouched ? siteOverride : (siteIds[0] ?? sites[0]?.id ?? null)

  const [boardDate, setBoardDate] = useState(today())
  const [board, setBoard] = useState<QuickWinBoard | null>(null)
  const [problemaDelDia, setProblemaDelDia] = useState('')
  const [problemaAxisId, setProblemaAxisId] = useState('')
  const [savingProblemaAxis, setSavingProblemaAxis] = useState(false)
  const [candidates, setCandidates] = useState<QuickWinCandidateWithNames[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allAxes, setAllAxes] = useState<Axis[]>([])
  const [allIndicators, setAllIndicators] = useState<IndicatorWithRelations[]>([])
  const [pillarStatus, setPillarStatus] = useState<Map<string, PillarStatus>>(new Map())
  const [loading, setLoading] = useState(true)
  const [savingProblema, setSavingProblema] = useState(false)

  // Id del pilar cuyo formulario "+ Agregar win" está abierto — el marco de
  // cada pilar tiene el suyo propio, así que solo uno a la vez puede estar
  // abierto y ya sabe para qué eje es (no hace falta volver a elegirlo).
  const [addingForAxisId, setAddingForAxisId] = useState<string | null>(null)
  const [newDescription, setNewDescription] = useState('')
  const [newResponsibleId, setNewResponsibleId] = useState('')
  const [newExecutionTime, setNewExecutionTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRemoveEvidence =
    profile?.role === 'admin_consultora' || profile?.role === 'admin_cliente' || profile?.role === 'gerente'
  // Borrado físico de registros: solo admin_consultora.
  const canDeleteRecords = profile?.role === 'admin_consultora'

  useEffect(() => {
    if (!organizationId) return
    Promise.all([
      fetchSites(organizationId),
      fetchProfiles(organizationId),
      fetchActiveAxes(organizationId),
      fetchIndicators(organizationId),
    ]).then(([sitesData, profilesData, axesData, indicatorsData]) => {
      setSites(sitesData)
      setProfiles(profilesData)
      setAllAxes(axesData)
      setAllIndicators(indicatorsData)
    })
  }, [organizationId])

  // Pilares que este sitio realmente gestiona: ejes activos de la
  // organización para los que el sitio (o el corporativo) tiene al menos un
  // indicador — no hay una tabla de "ejes por sitio" aparte, así que se
  // deriva de los indicadores ya existentes.
  const sitePillars = allAxes.filter((axis) =>
    allIndicators.some((i) => i.axis_id === axis.id && (i.site_id === selectedSite || i.site_id === null)),
  )

  // Cada pilar tiene su propio marco con sus propios wins propuestos — se
  // agrupa una sola vez por render en vez de filtrar el arreglo completo
  // dentro de cada iteración.
  const candidatesByAxis = new Map<string, QuickWinCandidateWithNames[]>()
  for (const candidate of candidates) {
    candidatesByAxis.set(candidate.axis_id, [...(candidatesByAxis.get(candidate.axis_id) ?? []), candidate])
  }

  useEffect(() => {
    if (!organizationId || !selectedSite) return
    const site = selectedSite
    let cancelled = false

    async function loadBoard() {
      setLoading(true)
      const boardData = await fetchQuickWinBoard(site, boardDate)
      if (cancelled) return
      setBoard(boardData)
      setProblemaDelDia(boardData?.problema_del_dia ?? '')
      setProblemaAxisId(boardData?.axis_id ?? '')
      const candidatesData = boardData ? await fetchQuickWinCandidates(boardData.id) : []
      if (cancelled) return
      setCandidates(candidatesData)
      setLoading(false)
    }

    loadBoard()
    return () => {
      cancelled = true
    }
  }, [organizationId, selectedSite, boardDate])

  // Cumplimiento del día anterior (N-1) por pilar, para el encabezado
  // automático — verde si TODOS los indicadores de ese eje que reportaron
  // ese día cumplieron su objetivo, rojo si alguno no, gris si ninguno
  // reportó todavía.
  useEffect(() => {
    if (!organizationId || !selectedSite) return
    const orgId = organizationId
    const site = selectedSite
    const referenceDate = daysAgo(1)
    let cancelled = false

    fetchIndicatorStatusesInRange(orgId, { from: referenceDate, to: referenceDate }, site).then((statuses) => {
      if (cancelled) return
      const byAxis = new Map<string, { total: number; cumplidos: number }>()
      for (const s of statuses) {
        if (s.latest_value === null) continue
        const estado = calcularSemaforo(s.latest_value, s.target_value, s.improvement_direction)
        if (estado === 'sin_datos') continue
        const entry = byAxis.get(s.axis_id) ?? { total: 0, cumplidos: 0 }
        entry.total++
        if (estado === 'cumple') entry.cumplidos++
        byAxis.set(s.axis_id, entry)
      }
      const next = new Map<string, PillarStatus>()
      for (const [axisId, { total, cumplidos }] of byAxis) {
        next.set(axisId, total === 0 ? 'sin_datos' : cumplidos === total ? 'ok' : 'fail')
      }
      setPillarStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [organizationId, selectedSite, boardDate])

  async function ensureBoard(): Promise<QuickWinBoard> {
    if (board) return board
    if (!organizationId || !selectedSite || !profile) throw new Error('Falta información de sesión.')
    const created = await createQuickWinBoard({
      organizationId,
      siteId: selectedSite,
      boardDate,
      createdBy: profile.id,
    })
    setBoard(created)
    return created
  }

  async function handleSaveProblema() {
    setSavingProblema(true)
    setError(null)
    try {
      const currentBoard = await ensureBoard()
      await updateProblemaDelDia(currentBoard.id, problemaDelDia)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el problema del día.')
    } finally {
      setSavingProblema(false)
    }
  }

  async function handleChangeProblemaAxis(axisId: string) {
    setProblemaAxisId(axisId)
    setSavingProblemaAxis(true)
    setError(null)
    try {
      const currentBoard = await ensureBoard()
      await updateProblemaAxis(currentBoard.id, axisId || null)
      setBoard({ ...currentBoard, axis_id: axisId || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el pilar del problema.')
    } finally {
      setSavingProblemaAxis(false)
    }
  }

  async function handleAddCandidate(axisId: string) {
    if (!newDescription.trim() || !profile) {
      setError('Describe el win propuesto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const currentBoard = await ensureBoard()
      await createQuickWinCandidate({
        boardId: currentBoard.id,
        axisId,
        description: newDescription.trim(),
        responsibleId: newResponsibleId || null,
        executionTime: newExecutionTime || null,
        proposedBy: profile.id,
      })
      const refreshed = await fetchQuickWinCandidates(currentBoard.id)
      setCandidates(refreshed)
      setNewDescription('')
      setNewResponsibleId('')
      setNewExecutionTime('')
      setAddingForAxisId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el win.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleSelected(candidate: QuickWinCandidateWithNames) {
    if (!board) return
    await setQuickWinSelected(board.id, candidate.id, !candidate.is_selected)
    setCandidates(await fetchQuickWinCandidates(board.id))
  }

  async function handleToggleEscalation(candidate: QuickWinCandidateWithNames) {
    await setQuickWinEscalation(candidate.id, !candidate.needs_escalation)
    if (board) setCandidates(await fetchQuickWinCandidates(board.id))
  }

  async function handleEscalate(candidate: QuickWinCandidateWithNames) {
    if (candidate.level >= 3) return
    await escalateQuickWin(candidate.id, (candidate.level + 1) as 2 | 3)
    if (board) setCandidates(await fetchQuickWinCandidates(board.id))
  }

  async function handleDeleteCandidate(candidate: QuickWinCandidateWithNames) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente el win "${candidate.description}"? Se borra también su evidencia adjunta. Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    await deleteQuickWinCandidate(candidate.id)
    if (board) setCandidates(await fetchQuickWinCandidates(board.id))
  }

  return (
    <div className="quick-win-page">
      <PageHeader
        eyebrow="Diario · Gemba Walk → Reunión de nivel 1"
        title="Quick Win"
        subtitle="Los wins que cada responsable trae de su recorrido, por pilar — el equipo elige uno como el win del día: verde si se resuelve aquí, rojo si escala a la reunión de nivel 2."
      />

      <div className="quick-win-toolbar">
        {sites.length > 0 && (
          <select
            className="level-site-select"
            value={selectedSite ?? ''}
            onChange={(e) => {
              setSiteOverride(e.target.value || null)
              setSiteTouched(true)
            }}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        )}
        <label className="quick-win-date">
          Fecha
          <input type="date" value={boardDate} max={today()} onChange={(e) => setBoardDate(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <section className="quick-win-card">
            <h2>Problema del día</h2>
            <label className="quick-win-problema-axis">
              Pilar
              <select value={problemaAxisId} onChange={(e) => handleChangeProblemaAxis(e.target.value)}>
                <option value="">Sin pilar asignado</option>
                {sitePillars.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    {axis.name}
                  </option>
                ))}
              </select>
              {savingProblemaAxis && <span className="quick-win-saving">Guardando…</span>}
            </label>
            <textarea
              rows={2}
              value={problemaDelDia}
              onChange={(e) => setProblemaDelDia(e.target.value)}
              onBlur={handleSaveProblema}
              placeholder="¿Cuál fue el problema principal detectado en los recorridos de hoy?"
            />
            {savingProblema && <span className="quick-win-saving">Guardando…</span>}
          </section>

          {error && <p className="quick-win-error">{error}</p>}

          {/* Un marco por pilar: a la izquierda el resultado de Operaciones
              (misma lógica roja/verde de los indicadores), y a la derecha los
              wins que los responsables trajeron para ESE pilar. Elegir uno
              pinta el marco completo — la señal ya no vive solo en la
              tarjeta, sino en toda la zona. */}
          <div className="quick-win-pillar-frames">
            {sitePillars.map((axis) => {
              const axisCandidates = candidatesByAxis.get(axis.id) ?? []
              const chosen = axisCandidates.find((c) => c.is_selected)
              const status = pillarStatus.get(axis.id) ?? 'sin_datos'
              const frameModifier = chosen
                ? chosen.needs_escalation
                  ? ' quick-win-pillar-frame--chosen-red'
                  : ' quick-win-pillar-frame--chosen-green'
                : ''

              return (
                <section key={axis.id} className={`quick-win-pillar-frame${frameModifier}`}>
                  <header className="quick-win-pillar-frame__header" style={{ color: axis.color }}>
                    <AxisIcon icon={axis.icon} size={20} />
                    <h2>{axis.name}</h2>
                    {chosen && (
                      <span className="quick-win-pillar-frame__chosen-tag">
                        {chosen.needs_escalation ? '↑ Escala a Nivel 2' : '✓ Se resuelve aquí'}
                      </span>
                    )}
                  </header>

                  <div className="quick-win-pillar-frame__body">
                    <div className={`quick-win-ops-card quick-win-ops-card--${status}`}>
                      <span className="quick-win-ops-card__title">Operaciones</span>
                      <span className="quick-win-ops-card__status">
                        {status === 'ok' ? 'Cumplió ayer' : status === 'fail' ? 'No cumplió ayer' : 'Sin datos de ayer'}
                      </span>
                    </div>

                    {axisCandidates.map((candidate) =>
                      profile && organizationId ? (
                        <QuickWinCandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          organizationId={organizationId}
                          uploadedBy={profile.id}
                          canRemoveEvidence={canRemoveEvidence}
                          tone="blue"
                          // El marco ya pinta la zona entera al elegir el win
                          // — la tarjeta no repite su propio verde/rojo aquí.
                          showSelectedColor={false}
                          // Una vez escalado, ya no es decisión de Nivel 1 —
                          // la tarjeta queda de solo lectura con la nota de a
                          // qué nivel subió.
                          onToggleSelected={candidate.level === 1 ? () => handleToggleSelected(candidate) : undefined}
                          onToggleEscalation={
                            candidate.level === 1 ? () => handleToggleEscalation(candidate) : undefined
                          }
                          onEscalate={candidate.level === 1 ? () => handleEscalate(candidate) : undefined}
                          canDeleteRecords={canDeleteRecords}
                          onDelete={() => handleDeleteCandidate(candidate)}
                        />
                      ) : null,
                    )}

                    {addingForAxisId === axis.id ? (
                      <div className="quick-win-candidate-card quick-win-candidate-card--blue quick-win-candidate-card--form">
                        <label>
                          Win propuesto
                          <textarea
                            rows={2}
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            autoFocus
                          />
                        </label>
                        <label>
                          Responsable
                          <select value={newResponsibleId} onChange={(e) => setNewResponsibleId(e.target.value)}>
                            <option value="">Sin asignar</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Hora de ejecución
                          <input
                            type="time"
                            value={newExecutionTime}
                            onChange={(e) => setNewExecutionTime(e.target.value)}
                          />
                        </label>
                        <div className="quick-win-candidate-card__actions">
                          <button
                            type="button"
                            className="button-primary"
                            onClick={() => handleAddCandidate(axis.id)}
                            disabled={saving}
                          >
                            {saving ? 'Guardando…' : 'Guardar win'}
                          </button>
                          <button type="button" onClick={() => setAddingForAxisId(null)} disabled={saving}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="quick-win-add-card quick-win-add-card--compact"
                        onClick={() => setAddingForAxisId(axis.id)}
                      >
                        + Agregar win
                      </button>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
