-- ============================================================
-- Ponderación por valor en "Causas posibles": con indicadores como
-- novedades de gemba walk (15-40 hallazgos por mes), contar ocurrencias
-- no distingue una novedad crítica de una menor. Este campo numérico
-- libre (costo, horas perdidas, unidades afectadas…) permite que el
-- Pareto ordene por impacto acumulado, no solo por frecuencia.
--
-- Default 1: los análisis ya existentes (y cualquier metodología que no
-- use este campo) siguen contando como antes en el Pareto — sumar 1s
-- por causa es matemáticamente lo mismo que contarlas.
-- ============================================================

alter table causal_analyses add column if not exists impact_value numeric not null default 1;
