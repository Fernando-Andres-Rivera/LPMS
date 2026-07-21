-- Cubre la FK level_capture_cutoffs_site_id_fkey (recién agregada) con un
-- índice, ya que esta columna se filtra en cada guardado/consulta de
-- horario por sitio.
create index idx_level_capture_cutoffs_site_id on public.level_capture_cutoffs (site_id);
