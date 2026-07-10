-- ============================================================
-- Mantenimiento de la estructura organizacional: permitir borrar
-- unidades de negocio / regiones mal creadas sin quedar bloqueado.
--
-- Hoy sites.org_unit_id no define comportamiento on delete, así que
-- borrar una unidad de negocio o región con sitios asignados falla
-- con error de llave foránea. Como la asignación de un sitio a una
-- unidad es opcional y re-asignable en la UI, lo correcto es que al
-- borrar la unidad los sitios simplemente queden "sin asignar"
-- (org_unit_id = null), no bloquear el borrado.
--
-- Las demás protecciones se quedan como están A PROPÓSITO:
--   - indicators.site_location_id y measurements.site_location_id
--     NO tienen cascada ni set null: borrar una instalación con
--     indicadores o mediciones históricas sigue bloqueado por la
--     base de datos. La UI traduce ese bloqueo a un mensaje claro
--     y ofrece desactivarla en su lugar.
--   - indicators.site_id igual: un sitio con indicadores no se
--     puede borrar, solo desactivar.
--
-- Los permisos de UPDATE/DELETE sobre org_units, site_locations y
-- sites ya existen desde 20260710000000 (políticas "for all" para
-- admin_consultora, admin_cliente y gerente) — no se tocan aquí.
-- ============================================================

alter table sites drop constraint sites_org_unit_id_fkey;
alter table sites add constraint sites_org_unit_id_fkey
  foreign key (org_unit_id) references org_units(id) on delete set null;
