# LPMS como Sistema de Gestión de la Calidad certificable — validación contra ISO 9001:2015

Análisis basado exclusivamente en evidencia extraída del código y la documentación
del repositorio (`README.md`, `DEPLOYMENT.md`, `supabase/migrations/*.sql`, `src/`).
No se asume ninguna funcionalidad planeada, documentada fuera del repo, o "obvia
por el diseño". El repositorio está en **Fase 1** según `README.md:3`.

## 0. Qué es LPMS hoy (inventario funcional real)

LPMS es una aplicación multi-tenant (Vite + React + Supabase/Postgres) que
implementa la cascada de gestión Lean SMQDCEP (Seguridad, Mantenimiento, Calidad,
Disponibilidad/Entrega, Costos, Estándar, Personas) en 3 niveles organizacionales
(Operativo N1 → Administrativo N2 → Gerencial N3). Funcionalidades confirmadas:

| Módulo | Evidencia |
|---|---|
| Multi-tenant + 5 roles fijos (`admin_consultora`, `admin_cliente`, `gerente`, `administrativo`, `operativo`) con aislamiento por RLS en Postgres | [initial_schema.sql:10-16](supabase/migrations/20260706000000_initial_schema.sql:10), [rls_policies.sql](supabase/migrations/20260706000001_rls_policies.sql) |
| Catálogo de indicadores en cascada (N1/N2/N3), vínculos padre-hijo, definición/fórmula/unidad/frecuencia/dirección de mejora, responsable | [initial_schema.sql:104-139](supabase/migrations/20260706000000_initial_schema.sql:104) |
| Objetivos (`targets`) por indicador y periodo | [initial_schema.sql:144-156](supabase/migrations/20260706000000_initial_schema.sql:144) |
| Captura de mediciones con semáforo de cumplimiento vs. objetivo | [measurementsApi.ts](src/features/measurements/measurementsApi.ts), [semaforo.ts](src/lib/semaforo.ts) |
| Bloqueo de captura tardía **a nivel de base de datos** (trigger) con autorización obligatoria de `admin_consultora`, causal de catálogo, y consumo de un solo uso | [measurement_capture_lock.sql:147-202](supabase/migrations/20260806000000_measurement_capture_lock.sql:147) |
| Reporte de auditoría de esas autorizaciones (quién, cuándo, por qué) | [captureAuthorizationsApi.ts](src/features/reports/captureAuthorizationsApi.ts), [CaptureAuthorizationsReportPage.tsx](src/features/reports/CaptureAuthorizationsReportPage.tsx) |
| Análisis causal (5 Porqués / Ishikawa), taxonomía de causas estándar, escalamiento por 3 incumplimientos consecutivos | [causalAnalysisApi.ts:154-176](src/features/causal-analysis/causalAnalysisApi.ts:154), [cause_taxonomy.sql](supabase/migrations/20260708000000_cause_taxonomy.sql) |
| Planes de acción con ciclo PDCA (`planificar→hacer→verificar→actuar→cerrado`, etiquetado "Eficaz"), responsable, fechas, evidencia adjunta (foto/PDF) | [actionPlansApi.ts](src/features/action-plans/actionPlansApi.ts), [types.ts:635-643](src/lib/types.ts:635), [ActionPlanEvidence.tsx](src/components/ui/ActionPlanEvidence.tsx) |
| Quick wins con escalamiento entre niveles | [quickWinEvidenceApi.ts](src/features/quick-win/quickWinEvidenceApi.ts), [EscalatedQuickWins.tsx](src/features/quick-win/EscalatedQuickWins.tsx) |
| Responsables por sitio × pilar (`pillar_responsibles`) | [pillar_responsibles.sql](supabase/migrations/20260729000000_pillar_responsibles.sql) |
| Cascada de reuniones: horario de corte por nivel, calendario de exposición, vista de árbol de indicadores | [level_capture_cutoffs.sql](supabase/migrations/20260727000000_level_capture_cutoffs.sql), [exposureScheduleApi.ts](src/features/dashboard/exposureScheduleApi.ts), [CascadeViewPage.tsx](src/features/cascade/CascadeViewPage.tsx) |
| Tableros de desempeño, Pareto de causas, ranking de sitios | [GeneralDashboardPage.tsx](src/features/dashboard/GeneralDashboardPage.tsx), [ParetoPage.tsx](src/features/pareto/ParetoPage.tsx), [OrgResultsPage.tsx](src/features/org-structure/OrgResultsPage.tsx) |
| Autenticación (email/password + MFA), guards de ruta por rol | [useAuth.ts](src/hooks/useAuth.ts), [MfaChallenge.tsx](src/features/auth/MfaChallenge.tsx), [RequireRole.tsx](src/features/auth/RequireRole.tsx) |

Confirmado por búsqueda exhaustiva en `src/` que **no existen** (cero coincidencias
o coincidencias falsas positivas descartadas manualmente): módulo de documentos
controlados/versionados con aprobación, registro de riesgos y oportunidades
(6.1), matriz de competencias/capacitación, auditoría interna, revisión por la
dirección como registro estructurado, evaluación de proveedores externos,
satisfacción del cliente/quejas, y control de salidas no conformes de
producto/servicio (distinto de "incumplimiento de KPI").

---

## 1. Mapeo cláusula por cláusula

Leyenda: 🟢 Cubierta · 🟡 Parcialmente cubierta · 🔴 No cubierta

| Cláusula | Estado | Evidencia | Brecha |
|---|---|---|---|
| **4.1** Comprensión de la organización y su contexto | 🔴 | Campo libre `industry` al crear organización — [NewOrganizationPage.tsx:16](src/features/onboarding/NewOrganizationPage.tsx:16) | No existe análisis de contexto interno/externo (FODA, PESTEL). El campo es metadato descriptivo, no un proceso. |
| **4.2** Necesidades y expectativas de partes interesadas | 🔴 | Ninguna | No hay registro de partes interesadas ni de sus requisitos. |
| **4.3** Alcance del SGC | 🟡 | Activación/desactivación de pilares SMQDCEP por tenant, `organization_axes` — [initial_schema.sql:93-99](supabase/migrations/20260706000000_initial_schema.sql:93), [NewOrganizationPage.tsx:14-34](src/features/onboarding/NewOrganizationPage.tsx:14) | Esto delimita qué pilares Lean se monitorean, no un alcance documentado del SGC (productos/servicios cubiertos, exclusiones justificadas, sitios). |
| **4.4** SGC y sus procesos | 🔴 | La app codifica implícitamente un solo proceso (cascada de KPI + PDCA) | No hay determinación documentada de procesos, secuencia/interacción, criterios y métodos, recursos, responsabilidades, riesgos/oportunidades por proceso (4.4.1 a-h). |
| **5.1** Liderazgo y compromiso | 🔴 | Ninguna | Ningún artefacto evidencia compromiso documentado de alta dirección; los roles `gerente`/`admin_cliente` son permisos de acceso, no evidencia de liderazgo del SGC. |
| **5.2** Política de calidad | 🔴 | Ninguna | No existe entidad, campo ni pantalla de política de calidad. |
| **5.3** Roles, responsabilidades y autoridades | 🟡 | `user_role` enum + RLS que impone autoridades reales en BD ([rls_policies.sql](supabase/migrations/20260706000001_rls_policies.sql)); `pillar_responsibles` asigna responsable por sitio×pilar ([pillar_responsibles.sql:6-15](supabase/migrations/20260729000000_pillar_responsibles.sql:6)); `indicators.responsible_id` | Son 5 roles genéricos de sistema, no una matriz de responsabilidades específica del SGC (p. ej. quién autoriza liberar un no conforme, quién aprueba documentos). |
| **6.1** Riesgos y oportunidades | 🔴 | La palabra "riesgo" solo aparece como el estado ámbar del semáforo de cumplimiento de KPI ([semaforo.ts](src/lib/semaforo.ts), [GlobalExceptionsPage.tsx:19-24](src/features/dashboard/GlobalExceptionsPage.tsx:19)) | No hay metodología de riesgo (probabilidad/impacto/tratamiento). El "riesgo" del semáforo es una categoría de desempeño de KPI, no gestión de riesgo. |
| **6.2** Objetivos de calidad y su planificación | 🟢 (para objetivos numéricos) | `targets` por indicador/periodo ([initial_schema.sql:144-156](supabase/migrations/20260706000000_initial_schema.sql:144)); definición/fórmula/unidad en `indicators`; cascada N1↔N2↔N3 vía `indicator_links`; comparación real vs. objetivo en tableros | Objetivos medibles, monitoreados y desplegados en cascada — cumple gran parte de 6.2.1. Falta: trazabilidad explícita a una política de calidad (que no existe) y planificación documentada de recursos más allá de responsable/fecha. |
| **6.3** Planificación de los cambios | 🔴 | Ninguna | No hay flujo de gestión de cambios del propio SGC (los horarios de corte son operación, no cambios del sistema de gestión). |
| **7.1** Recursos | 🔴 | `DEPLOYMENT.md` cubre infraestructura de *la app* (hosting, RLS, backups vía Supabase), no recursos operativos del cliente | 7.1.2 (personas), 7.1.3 (infraestructura), 7.1.4 (ambiente) del negocio del cliente no son rastreados por la app. |
| **7.2** Competencia | 🔴 | Ninguna | No hay matriz de competencias, capacitación ni certificaciones ligadas a roles. |
| **7.3** Toma de conciencia | 🔴 | Ninguna | — |
| **7.4** Comunicación | 🟡 | Cascada de reuniones con horario por nivel, calendario de exposición y responsables por pilar ([level_capture_cutoffs.sql](supabase/migrations/20260727000000_level_capture_cutoffs.sql), [exposureScheduleApi.ts](src/features/dashboard/exposureScheduleApi.ts)) | Opera la cadencia de comunicación interna de desempeño, pero no es un plan de comunicación documentado (qué/cuándo/con quién/cómo) exigido por 7.4. |
| **7.5** Información documentada — creación/actualización | 🟡 | Indicadores llevan `definition`/`calculation_formula`; `created_by`/`updated_at` con trigger genérico `set_updated_at()` ([initial_schema.sql:216-235](supabase/migrations/20260706000000_initial_schema.sql:216)) | Hay metadatos de autoría/fecha, pero no una plantilla de control documental (título, formato, revisor, fecha de vigencia). |
| **7.5** Información documentada — control de cambios/registros | 🟡 | Bloqueo de edición tardía **impuesto por trigger de BD**, no solo en cliente: una fecha cerrada solo se puede reeditar con autorización previa de `admin_consultora`, causal obligatoria del catálogo, y la autorización se consume una sola vez ([measurement_capture_lock.sql:147-202](supabase/migrations/20260806000000_measurement_capture_lock.sql:147)); reporte de auditoría de esas autorizaciones ([CaptureAuthorizationsReportPage.tsx](src/features/reports/CaptureAuthorizationsReportPage.tsx)) | Es control de cambios real y auditable de **quién autorizó y por qué**, pero el `UPDATE ... ON CONFLICT` sobrescribe el valor anterior de la medición ([authorize_and_save_measurement.sql:52-58](supabase/migrations/20260807000000_authorize_and_save_measurement.sql:52)) — no queda el valor previo, solo el hecho de que hubo una corrección autorizada. Sin historial versión-a-versión del dato. |
| **7.5** Información documentada — documentos controlados (procedimientos, políticas) | 🔴 | `ActionPlanEvidence.tsx` almacena fotos/PDF como **evidencia de ejecución de una acción**, no documentos normativos | No existe repositorio de documentos controlados con numeración, versión, aprobación, distribución y retención. |
| **8.1** Planificación y control operacional | 🟡 | Frecuencia de captura por indicador (`diaria/semanal/mensual/trimestral`), corte por nivel con función `compute_last_closed_date()` y bloqueo duro en BD ([measurement_capture_lock.sql:95-138](supabase/migrations/20260806000000_measurement_capture_lock.sql:95)) | Controla el *proceso de reporte de KPI*, no la operación/entrega del producto o servicio real del cliente (que la app no modela). |
| **8.2** Requisitos para productos y servicios | 🔴 | Ninguna | — |
| **8.3** Diseño y desarrollo | 🔴 / N/A | Ninguna | No aplicable al alcance actual de la app; tampoco está cubierto como exclusión documentada. |
| **8.4** Control de procesos, productos y servicios suministrados externamente | 🔴 | Ninguna | No hay tabla ni flujo de evaluación de proveedores. |
| **8.5** Producción y provisión del servicio | 🔴 | Ninguna | — |
| **8.6** Liberación de productos y servicios | 🔴 | Ninguna | — |
| **8.7** Control de salidas no conformes | 🔴 | `GlobalExceptionsPage.tsx` lista KPIs en estado "incumple" | Es incumplimiento de meta de indicador, no un flujo de disposición de producto/servicio no conforme (identificación, contención, concesión, reproceso, registro). Distinción importante: no son lo mismo. |
| **9.1.1** Seguimiento y medición | 🟢 | Núcleo de la app: `measurements`, tableros por eje/nivel/sitio, semáforo, tendencias, Pareto — [GeneralDashboardPage.tsx](src/features/dashboard/GeneralDashboardPage.tsx), [ParetoPage.tsx](src/features/pareto/ParetoPage.tsx), [OrgResultsPage.tsx](src/features/org-structure/OrgResultsPage.tsx) | Cobertura real y fuerte para indicadores operativos Lean. |
| **9.1.2** Satisfacción del cliente | 🔴 | Búsqueda exhaustiva sin resultados (`satisfacción`, `encuesta`, `queja`, `reclamo`, `customer`) | No existe ningún mecanismo de captura de voz del cliente externo. |
| **9.1.3** Análisis y evaluación | 🟡 | Dashboards, Pareto y ranking de sitios agregan y analizan datos de KPI | Analiza desempeño operativo Lean, no el conjunto de entradas que exige 9.1.3 (conformidad de producto/servicio, satisfacción del cliente, desempeño de proveedores, resultados de auditoría), porque esas fuentes no existen en el sistema. |
| **9.2** Auditoría interna | 🔴 | Ninguna | No hay programa de auditoría, checklist, hallazgos ni seguimiento de cierre. |
| **9.3** Revisión por la dirección | 🔴 | Cascada de reuniones con cadencia, horario y responsables (`exposure_schedules`, `level_capture_cutoffs`, `pillar_responsibles`) | **No se equipara con revisión por la dirección** (regla explícita de este análisis): no hay entradas documentadas (9.3.2 a-f: resultados de auditorías, satisfacción del cliente, desempeño de proveedores, riesgos/oportunidades, adecuación de recursos — ninguna existe en el sistema) ni salidas registradas (decisiones sobre oportunidades de mejora, necesidades de cambio, necesidades de recursos). Es un ritual de tablero en vivo, no un registro estructurado de revisión. |
| **10.1** Generalidades (mejora) | 🟡 | PDCA de planes de acción, análisis causal, quick wins, Pareto priorizado | Mejora de desempeño operativo Lean; no está encuadrado explícitamente como mejora del SGC (productos/servicios/proceso normativo). |
| **10.2** No conformidad y acción correctiva | 🟡 | `causal_analyses` (5 Porqués/Ishikawa) + `action_plans` (PDCA completo: planificar→hacer→verificar→actuar→cerrado) + evidencia adjunta + escalamiento automático a las 3 mediciones consecutivas incumplidas — [causalAnalysisApi.ts:154-176](src/features/causal-analysis/causalAnalysisApi.ts:154) | Estructura muy similar a 10.2.1 a-g, pero: (1) el disparador es solo incumplimiento de KPI, no cualquier no conformidad (queja de cliente, hallazgo de auditoría, producto no conforme — canales inexistentes); (2) "Eficaz" es un cambio de estado autodeclarado por el usuario, no un evento de verificación con criterio de aceptación registrado; (3) no hay actualización trazable de riesgos ni de documentación del SGC al cerrar, porque ninguno de los dos existe. |
| **10.3** Mejora continua | 🟡 | Mismos artefactos que 10.1/10.2, más tendencias y ranking | Motor de mejora basado en datos real, pero sin el lazo con 9.3 (revisión por la dirección) que la norma espera para demostrar mejora continua del SGC como sistema. |

---

## 2. Matriz de brechas — lo que exige la norma y LPMS no tiene

| # | Brecha | Cláusula(s) | Bloqueante para certificación |
|---|---|---|---|
| G1 | Sin política de calidad ni evidencia de compromiso de alta dirección | 5.1, 5.2 | **Sí** |
| G2 | Sin registro de riesgos y oportunidades (metodología, tratamiento, seguimiento) | 6.1 | **Sí** |
| G3 | Sin programa de auditoría interna (planificación, checklist, hallazgos, cierre) | 9.2 | **Sí** |
| G4 | Sin revisión por la dirección como registro estructurado (entradas/salidas documentadas) | 9.3 | **Sí** |
| G5 | Sin control de documentos normativos (procedimientos/políticas): versión, aprobación, distribución, retención | 7.5.2, 7.5.3 | **Sí** |
| G6 | Sin análisis de contexto organizacional ni partes interesadas | 4.1, 4.2 | Sí |
| G7 | Sin alcance del SGC documentado (solo activación de pilares Lean, no exclusiones/justificación) | 4.3 | Sí |
| G8 | Sin determinación formal de procesos del SGC (entradas/salidas/interacción/criterios) | 4.4 | Sí |
| G9 | Sin matriz de competencias ni registros de capacitación | 7.2, 7.3 | Sí |
| G10 | Sin captura de satisfacción del cliente ni quejas | 9.1.2 | Sí |
| G11 | Sin control de proveedores externos | 8.4 | Sí |
| G12 | Sin control de salidas no conformes de producto/servicio (distinto de incumplimiento de KPI) | 8.7 | Sí |
| G13 | Historial de mediciones sin retención del valor previo al corregir (solo queda el hecho de la autorización, no el dato anterior) | 7.5.3 | No (mejora deseable) |
| G14 | Cierre de plan de acción ("Eficaz") es autodeclarado, sin criterio de verificación registrado | 10.2.1 f | No (mejora deseable) |
| G15 | Sin planificación de cambios del propio SGC | 6.3 | No |

---

## 3. Evaluación crítica: gestión Lean vs. gestión de calidad normativa

LPMS resuelve, de forma genuinamente sólida, la **gestión operativa Lean**:
cascada de indicadores con trazabilidad N1→N2→N3, objetivos medibles con
semáforo, disciplina de captura reforzada a nivel de base de datos (no solo de
interfaz), análisis causal estructurado, PDCA de planes de acción con evidencia,
y una cadencia de reuniones con responsables asignados por pilar y sitio. Esa es
una base de datos operativa real, no aspiracional — el nivel de detalle en
`measurement_capture_lock.sql` (bloqueo por trigger, autorización de un solo uso,
zona horaria fija, reporte de auditoría) es evidencia de un sistema maduro para
lo que sí hace.

Lo que **no** hace, y que la norma exige como columna vertebral de un SGC
certificable, es todo lo que vive fuera del ciclo de desempeño operativo:
política y compromiso de dirección (5.1-5.2), gestión formal de riesgos y
oportunidades (6.1), auditoría interna (9.2), revisión por la dirección como
proceso documentado con entradas/salidas (9.3), y control de documentos e
información normativa versionada (7.5). La cascada de reuniones es la pieza más
cercana a un proceso de revisión por la dirección, pero deliberadamente no se
clasifica como tal en este análisis: revisa *desempeño de KPI*, no las entradas
que exige 9.3.2, y no deja un registro de sus salidas.

En síntesis: LPMS es una herramienta de **desempeño operativo** que cubre bien
seguimiento/medición (9.1.1) y una parte real de acción correctiva (10.2), pero
carece casi por completo de la capa **documental, de auditoría y de gobierno**
que un SGC certificable bajo ISO 9001 requiere. Ambos objetivos se
complementan — LPMS podría ser el "motor de datos" que alimente evidencia real
a 9.1.3 y 9.3 — pero hoy no la sustituye.

## 4. Recomendación final

**LPMS + extensiones necesarias.** No es la base adecuada tal como está (le
faltan 5 cláusulas bloqueantes completas), pero tampoco hay que descartarla:
el módulo de indicadores/objetivos/acción correctiva ya cumple una porción no
trivial de 6.2, 9.1.1 y 10.2, y el patrón de control por RLS + triggers de BD
demuestra que el equipo sabe construir controles auditables reales, no solo
pantallas.

| Brecha | Esfuerzo estimado | Nota |
|---|---|---|
| G5 — Módulo de documentos controlados (versión/aprobación/retención) | Alto | Requiere modelo de datos nuevo (documentos, versiones, flujo de aprobación, permisos de lectura por rol/sitio) — no es una extensión trivial del esquema actual. |
| G2 — Registro de riesgos y oportunidades | Medio | Tabla + CRUD + vínculo opcional a indicadores/procesos; puede reusar patrones RLS existentes. |
| G3 — Auditoría interna | Medio-Alto | Programa de auditoría, checklists, hallazgos, seguimiento de cierre — estructura similar a `action_plans` pero con entidad propia. |
| G4 — Revisión por la dirección | Medio | Reusa la infraestructura de cascada de reuniones (`exposure_schedules`, `pillar_responsibles`) agregando una entidad de "acta" con campos de entrada/salida fijos por 9.3.2/9.3.3. |
| G1 — Política de calidad y evidencia de liderazgo | Bajo (app) / Alto (organizacional) | Trivial de modelar en el sistema; el trabajo real es organizacional (definir y comprometer), no de software. |
| G6-G8 — Contexto, partes interesadas, alcance, procesos | Bajo-Medio | Son principalmente contenido documental; el sistema solo necesita un lugar donde vivan y se versionen (depende de que G5 exista primero). |
| G9 — Competencias y capacitación | Medio | Tabla de competencias por rol/persona + registros de capacitación con evidencia (reusa el patrón de `ActionPlanEvidence`). |
| G10 — Satisfacción del cliente | Medio | Nuevo dominio (encuestas/quejas) sin precedente en el esquema actual. |
| G11 — Proveedores externos | Medio | Tabla de proveedores + evaluación periódica, patrón similar a `pillar_responsibles`. |
| G12 — Salidas no conformes | Medio | Requiere definir qué es "salida" en el negocio del cliente (LPMS hoy no modela producto/servicio, solo KPI). |
| G13 — Historial de valores de medición | Bajo | Tabla de auditoría de cambios en `measurements` (antes/después) — extensión natural del trigger ya existente en `measurement_capture_lock.sql`. |
| G14 — Verificación de eficacia con criterio registrado | Bajo | Agregar campo(s) de criterio/evidencia de verificación al cerrar un `action_plan` como "Eficaz". |

**Ruta sugerida:** cerrar primero G1, G4, G13 y G14 (esfuerzo bajo/medio,
reusan infraestructura existente y no bloquean el resto), luego G2 y G9, y dejar
G5 (documentos controlados) y G3 (auditoría interna) como el trabajo mayor —
son los dos módulos sin ningún precedente en el esquema actual y los más caros
de construir bien (control de versiones y flujos de aprobación no son
triviales). G6-G8, G10, G11 y G12 dependen en buena parte de decisiones de
negocio (qué es "producto/servicio" para el cliente de LPMS) más que de
esfuerzo técnico puro.
