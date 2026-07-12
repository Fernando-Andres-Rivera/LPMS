-- ============================================================
-- Indicadores calculados: en vez de capturarse a mano, un indicador
-- Nivel 2/3 puede sumar o promediar automáticamente lo que ya
-- capturaron sus indicadores hijo (el vínculo padre-hijo de
-- indicator_links, que hoy solo se usaba para trazabilidad en la
-- cascada, pasa también a alimentar el cálculo).
--
-- Reutiliza aggregation_method (ya existente) para el indicador
-- calculado: en vez de significar "cómo combinar varias mediciones
-- propias en un período", pasa a significar "cómo combinar los
-- valores de los indicadores hijo en ese período" — mismo campo,
-- mismo desplegable, la UI solo cambia la etiqueta según el caso.
-- ============================================================

alter table indicators add column is_calculated boolean not null default false;
