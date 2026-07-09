-- ============================================================
-- Evaluación de resultados por período (día/semana/quincena/mes/trimestre)
--
-- No cambia cómo se captura (measurements.period_date sigue siendo un
-- valor por fecha exacta). Lo que agrega es la capacidad de REVISAR esas
-- mediciones agrupadas en distintos períodos desde los tableros — la
-- agregación ocurre en el cliente sobre las mediciones ya capturadas.
--
-- Cada indicador declara explícitamente cómo se deben combinar varias
-- mediciones dentro de un mismo período, porque no es la misma regla
-- para todos: "accidentes" se suman, "% cumplimiento de auditoría" se
-- promedia, un indicador de nivel de inventario se queda con el último
-- valor capturado en la ventana, etc.
-- ============================================================

-- Amplía la frecuencia de captura con quincenal (el valor debe confirmarse
-- fuera de esta transacción antes de poder usarse en un insert/filtro).
alter type indicator_frequency add value 'quincenal';

create type aggregation_method as enum ('suma', 'promedio', 'ultimo', 'maximo', 'minimo');

-- 'ultimo' como default preserva el comportamiento actual (mostrar la
-- medición más reciente) para todos los indicadores existentes.
alter table indicators add column aggregation_method aggregation_method not null default 'ultimo';
