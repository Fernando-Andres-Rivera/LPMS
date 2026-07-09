-- ============================================================
-- Ubicación específica del evento en cada medición.
--
-- El indicador ya tiene un sitio/instalación "por defecto" (site_id,
-- site_location_id), pero cada medición individual (cada accidente,
-- cada evento capturado) debe poder precisar dónde ocurrió esa vez
-- en particular dentro de la estructura organizacional, sin quedar
-- pegado solo al indicador en general.
-- ============================================================

alter table measurements add column site_location_id uuid references site_locations(id);
