-- ============================================================
-- Módulo de Seguridad y Salud en el Trabajo (SST)
--
-- No reutiliza el modelo de indicators/measurements a propósito: un
-- "indicador" en este sistema es un VALOR NUMÉRICO capturado contra
-- un umbral por período. Los datos de accidentalidad no son eso —
-- son EVENTOS puntuales con fecha (accidente, incidente, acto/condición
-- insegura), y todo lo que se muestra (días sin accidentes, cruz de
-- seguridad, pirámide de Heinrich) se DERIVA de esos eventos, no se
-- captura directamente. De ahí una tabla de eventos propia, por sitio
-- (cada operación lleva su propio conteo, según lo confirmado).
-- ============================================================

create type safety_event_type as enum ('accidente', 'incidente', 'acto_inseguro', 'condicion_insegura');
create type accident_severity as enum ('fatal', 'serio', 'leve');

-- Fecha desde la que arrancó la operación de ese sitio — punto de partida
-- para "días sin accidentes" cuando todavía no ha ocurrido ninguno.
alter table sites add column operation_start_date date;

create table safety_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  event_type safety_event_type not null,
  event_date date not null,
  -- Solo aplican cuando event_type = 'accidente'; el resto de tipos los
  -- deja en null (no se valida con un check por columna para no acoplar
  -- la migración a la forma exacta del formulario).
  severity accident_severity,
  disability_days int,
  workers_affected int,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_safety_events_org on safety_events(organization_id);
create index idx_safety_events_site on safety_events(site_id);
create index idx_safety_events_date on safety_events(event_date);

-- ============================================================
-- RLS: safety_events
-- Mismo patrón que measurements: lectura abierta al tenant (para que
-- la cruz y la pirámide se vean completas en cualquier rol), captura
-- por rol/sitio, edición/borrado para el autor o gestión.
-- ============================================================
alter table safety_events enable row level security;

create policy safety_events_select on safety_events for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy safety_events_insert on safety_events for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() in ('admin_cliente', 'gerente')
      or (current_role_name() in ('administrativo', 'operativo') and user_has_site(site_id))
    )
  )
);

create policy safety_events_update on safety_events for update using (
  created_by = auth.uid()
  or current_role_name() in ('admin_consultora', 'admin_cliente', 'gerente')
);

create policy safety_events_delete on safety_events for delete using (
  created_by = auth.uid()
  or current_role_name() in ('admin_consultora', 'admin_cliente', 'gerente')
);
