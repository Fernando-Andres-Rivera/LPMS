-- ============================================================
-- Alinear permisos de escritura de sites con org_units: gerente
-- ahora también configura el alcance del piloto (asignar sitio a
-- Unidad de Negocio / Región), no solo admin_consultora/admin_cliente.
-- ============================================================
drop policy if exists sites_write on sites;

create policy sites_write on sites for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);
