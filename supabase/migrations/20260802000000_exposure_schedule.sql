-- ============================================================
-- Periodicidad de exposición/reporte del Dashboard — una sola cadencia por
-- organización (no por pilar) que define cuándo toca presentar/revisar el
-- Dashboard en la reunión de gestión: semanal (un día de la semana),
-- quincenal (cada 14 días desde una fecha ancla) o mensual (un día del
-- mes). La define quien organiza la exposición — gerente o admin_cliente
-- (el "expositor" o "el cliente") — igual criterio de permisos que
-- level_capture_cutoffs (horario de reuniones).
--
-- weekday sigue la convención de JS Date.getDay(): 0=domingo … 6=sábado.
-- Un único calendario calculado en el cliente a partir de estos campos —
-- no se guardan fechas individuales.
-- ============================================================

create table if not exists exposure_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  frequency text not null check (frequency in ('semanal', 'quincenal', 'mensual')),
  weekday smallint check (weekday between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 31),
  start_date date not null,
  exposure_time time,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create index if not exists idx_exposure_schedules_org on exposure_schedules(organization_id);

do $$
begin
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'exposure_schedules' and trigger_name = 'trg_exposure_schedules_updated_at'
  ) then
    create trigger trg_exposure_schedules_updated_at before update on exposure_schedules
      for each row execute function set_updated_at();
  end if;
end $$;

alter table exposure_schedules enable row level security;

drop policy if exists exposure_schedules_select on exposure_schedules;
create policy exposure_schedules_select on exposure_schedules for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

drop policy if exists exposure_schedules_write on exposure_schedules;
create policy exposure_schedules_write on exposure_schedules for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);
