-- ============================================================
-- Tercer tipo de valor: "Programado vs Real (%)" — para indicadores
-- donde tanto la meta como el resultado varían por período (ej.
-- efectivos programados por el cliente vs. asistieron, capacidad o
-- disponibilidad de equipos), a diferencia del tipo numérico donde el
-- objetivo es un número fijo vigente todo el mes/año.
--
-- planned_value / real_value son columnas de apoyo solo para este tipo:
-- guardan los dos números crudos capturados (para poder editarlos y
-- mostrarlos en la pantalla de captura), mientras que `value` sigue
-- guardando el % calculado (real/programado*100) — así el indicador
-- reutiliza TAL CUAL el mecanismo de semáforo/objetivo existente
-- (igual truco que los indicadores binarios: el objetivo se guarda
-- como 100 en la tabla targets, sin pedirle al usuario que lo defina).
-- ============================================================

-- value_type es un ENUM de Postgres (indicator_value_type), no texto libre
-- — sin agregar 'razon' aquí, guardar un indicador de este tipo falla en
-- la base de datos con un error genérico ("No se pudo guardar").
alter type indicator_value_type add value if not exists 'razon';

alter table measurements add column if not exists planned_value numeric;
alter table measurements add column if not exists real_value numeric;
