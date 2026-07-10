-- ============================================================
-- Eliminación permanente de organizaciones, restringida a
-- admin_consultora — para limpiar clientes/datos de prueba mientras
-- se valida el sistema. Complementa (no reemplaza) el flujo de
-- desactivar/reactivar: ese sigue siendo el camino normal para un
-- cliente real; esto es un borrado físico e irreversible.
--
-- indicators ya tenía una política de DELETE (indicators_delete,
-- migración 20260706000001) que ya permite a admin_consultora
-- eliminar cualquier indicador — no hace falta tocarla aquí.
-- ============================================================

-- organizations no tenía ninguna política de DELETE: sin esto, RLS
-- bloquea el borrado incluso para admin_consultora.
create policy organizations_delete on organizations for delete using (
  current_role_name() = 'admin_consultora'
);

-- profiles.organization_id no tenía "on delete cascade": al día de
-- hoy, borrar una organización con usuarios vinculados falla con un
-- error de llave foránea. Para que el borrado de una organización de
-- prueba limpie también sus usuarios de prueba, se agrega cascada.
alter table profiles drop constraint profiles_organization_id_fkey;
alter table profiles add constraint profiles_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete cascade;
