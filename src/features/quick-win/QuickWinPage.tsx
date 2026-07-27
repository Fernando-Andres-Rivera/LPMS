import { useEffect, useState, type CSSProperties } from 'react'
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
  updateQuickWinCandidate,
  type QuickWinBoard,
  type QuickWinCandidateWithNames,
} from './quickWinApi'
import { WinCardRow, type WinRowValues } from './WinCardRow'
import { QuickWinEvidence } from './QuickWinEvidence'
import { PageHeader } from '../../components/ui/PageHeader'
import type { Axis, Profile, Site } from '../../lib/types'
import './quick-win.css'
import './win-card.css'

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

  /**
   * Los focos de la zona "Puntos a ser remontados sistemáticos": los
   * indicadores marcados como foco (is_focus) que aplican a este sitio —
   * propios o corporativos —, agrupados por pilar. Son de solo lectura aquí:
   * el foco se define en la ficha del indicador, esta tarjeta solo lo
   * recuerda en la reunión.
   */
  const focosByAxis = new Map<string, string[]>()
  for (const indicator of allIndicators) {
    if (!indicator.is_focus) continue
    if (indicator.site_id !== selectedSite && indicator.site_id !== null) continue
    focosByAxis.set(indicator.axis_id, [...(focosByAxis.get(indicator.axis_id) ?? []), indicator.name])
  }

  // La tarjeta física tiene exactamente 3 renglones de win. Si un tablero
  // viejo trae más, se muestran todos igual en vez de esconder datos.
  const WIN_SLOTS = 3
  const slotCount = Math.max(WIN_SLOTS, candidates.length)
  const siteName = sites.find((s) => s.id === selectedSite)?.name ?? 'Sitio'
  const chosen = candidates.find((c) => c.is_selected) ?? null

  // El marco entero de la tarjeta toma el color de la decisión: verde si el
  // win elegido se resuelve en este nivel, rojo si tiene que escalar.
  const frameModifier = chosen
    ? chosen.needs_escalation
      ? ' win-card--red'
      : ' win-card--green'
    : ''

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

  /** Una fila de la tarjeta se guarda sola: si estaba vacía crea el win, y si
   * ya existía actualiza solo lo que cambió. */
  async function handleSaveRow(candidate: QuickWinCandidateWithNames | null, values: WinRowValues) {
    if (!profile) return
    setError(null)
    try {
      const currentBoard = await ensureBoard()
      if (candidate) {
        await updateQuickWinCandidate(candidate.id, {
          axis_id: values.axisId,
          description: values.description.trim(),
          responsible_id: values.responsibleId,
          execution_time: values.executionTime,
        })
      } else {
        await createQuickWinCandidate({
          boardId: currentBoard.id,
          axisId: values.axisId,
          description: values.description.trim(),
          responsibleId: values.responsibleId,
          executionTime: values.executionTime,
          proposedBy: profile.id,
        })
      }
      setCandidates(await fetchQuickWinCandidates(currentBoard.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el win.')
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
        <section className={`win-card${frameModifier}`}>
          <header className="win-card__head">
            <h2 className="win-card__title">WIN CARD</h2>
            <span className="win-card__head-meta">
              {siteName} · {boardDate}
            </span>
            {chosen && (
              <div className="win-card__decision">
                <button
                  type="button"
                  className={`win-card__decision-toggle win-card__decision-toggle--${chosen.needs_escalation ? 'red' : 'green'}`}
                  onClick={() => handleToggleEscalation(chosen)}
                >
                  {chosen.needs_escalation ? '● Necesita escalar' : '● Se resuelve aquí'}
                </button>
                {chosen.needs_escalation && chosen.level < 3 && (
                  <button type="button" className="win-card__escalate" onClick={() => handleEscalate(chosen)}>
                    Escalar a Nivel {chosen.level + 1} →
                  </button>
                )}
              </div>
            )}
          </header>

          {error && <p className="quick-win-error">{error}</p>}

          {/* N1 RESULTADOS — una casilla por pilar que este sitio gestiona,
              pintada con el mismo semáforo de los indicadores: cumplió ayer,
              no cumplió, o todavía sin datos. */}
          <div className="table-scroll">
            <div className="win-card__matrix" style={{ '--wc-pillars': sitePillars.length } as CSSProperties}>
              <div className="win-card__rowlabel">N1 Resultados</div>
              {sitePillars.map((axis) => {
                const status = pillarStatus.get(axis.id) ?? 'sin_datos'
                return (
                  <div
                    key={axis.id}
                    className={`win-card__pillar win-card__pillar--${status}`}
                    title={
                      status === 'ok'
                        ? 'Cumplió ayer'
                        : status === 'fail'
                          ? 'No cumplió ayer'
                          : 'Sin mediciones de ayer todavía'
                    }
                  >
                    {axis.name}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Problema del día — en el mismo lugar que en la tarjeta física:
              justo debajo de los resultados y arriba de los wins. */}
          <div className="win-card__problema">
            <div className="win-card__rowlabel">Problema del día</div>
            <div className="win-card__problema-body">
              <select
                className="win-card__problema-axis"
                value={problemaAxisId}
                onChange={(e) => handleChangeProblemaAxis(e.target.value)}
                aria-label="Pilar del problema del día"
              >
                <option value="">Pilar…</option>
                {sitePillars.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    {axis.name}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                value={problemaDelDia}
                onChange={(e) => setProblemaDelDia(e.target.value)}
                onBlur={handleSaveProblema}
                placeholder="¿Cuál fue el problema principal detectado en los recorridos de hoy?"
              />
              {(savingProblema || savingProblemaAxis) && <span className="win-card__saving">Guardando…</span>}
            </div>
          </div>

          {/* Los 3 renglones de win, editables en el momento. */}
          <div className="win-card__wins">
            <div className="win-card__wins-head">
              <span />
              <span>Win propuesto</span>
              <span>Responsable</span>
              <span>Hora de bouclage</span>
              <span />
            </div>
            {Array.from({ length: slotCount }, (_, i) => {
              const candidate = candidates[i] ?? null
              const isLevel1 = !candidate || candidate.level === 1
              return (
                <WinCardRow
                  key={candidate?.id ?? `empty-${i}`}
                  position={i + 1}
                  candidate={candidate}
                  pillars={sitePillars}
                  profiles={profiles}
                  isChosen={!!candidate?.is_selected}
                  onChoose={candidate && isLevel1 ? () => handleToggleSelected(candidate) : null}
                  onSave={(values) => handleSaveRow(candidate, values)}
                  canDelete={canDeleteRecords}
                  onDelete={candidate ? () => handleDeleteCandidate(candidate) : null}
                />
              )
            })}
          </div>

          {/* La evidencia del win elegido — la tarjeta física no la tiene, pero
              la reunión ya la venía usando (fotos del antes/después), así que
              se conserva como franja del win elegido. */}
          {chosen && profile && organizationId && (
            <div className="win-card__evidence">
              <span className="win-card__evidence-label">Evidencia del win elegido</span>
              <QuickWinEvidence
                candidateId={chosen.id}
                organizationId={organizationId}
                uploadedBy={profile.id}
                canRemove={canRemoveEvidence}
              />
            </div>
          )}

          {/* Puntos a ser remontados sistemáticos — los indicadores marcados
              como foco para este sitio, por pilar. Solo lectura: el foco se
              define en la ficha del indicador. */}
          <div className="table-scroll">
            <div className="win-card__matrix win-card__matrix--focos" style={{ '--wc-pillars': sitePillars.length } as CSSProperties}>
              <div className="win-card__rowlabel win-card__rowlabel--strong">
                Puntos a ser remontados sistemáticos
              </div>
              {sitePillars.map((axis) => (
                <div key={`h-${axis.id}`} className="win-card__focos-head" style={{ color: axis.color }}>
                  {axis.name}
                </div>
              ))}
              <div className="win-card__rowlabel win-card__rowlabel--spacer" aria-hidden="true" />
              {sitePillars.map((axis) => {
                const focos = focosByAxis.get(axis.id) ?? []
                return (
                  <div key={`c-${axis.id}`} className="win-card__focos-cell">
                    {focos.length === 0 ? (
                      <span className="win-card__focos-empty">—</span>
                    ) : (
                      <ul>
                        {focos.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
