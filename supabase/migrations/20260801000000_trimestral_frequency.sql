-- ============================================================
-- Amplía la frecuencia de captura con "trimestral": a diferencia del
-- trimestre fijo de calendario (T1 ene-mar, T2 abr-jun…) que ya usan los
-- tableros para AGRUPAR mediciones existentes, un indicador trimestral se
-- CAPTURA contra una ventana de 3 meses consecutivos que se desliza mes a
-- mes — ene-feb-mar, feb-mar-abr, mar-abr-may… La captura sigue guardando
-- una fecha exacta (el día 1 del mes de inicio de esa ventana), igual que
-- el resto de frecuencias — no cambia measurements.period_date.
-- ============================================================

alter type indicator_frequency add value if not exists 'trimestral';
