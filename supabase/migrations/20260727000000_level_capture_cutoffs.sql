-- ============================================================
-- Horario de reuniones por nivel — cada nivel de la organización
-- (Operativo, Administrativo, Gerencial) tiene su propia hora de inicio
-- de reunión, ajustada a su cascada real. Después de esa hora, ya no se
-- puede capturar el dato del DÍA QUE ESA REUNIÓN EVALÚA para un
-- indicador de ese nivel — que no siempre es hoy: una reunión gerencial
-- de las 10am de hoy puede estar evaluando los datos de AYER
-- (evaluated_day_offset = -1), no los de hoy (fechas más antiguas que
-- la evaluada siguen permitidas, para poder ponerse al día).
--
-- El bloqueo se aplica en el cliente (MeasurementCapturePage), no con
-- una restricción de base de datos: es una regla de disciplina de
-- proceso (llega a la reunión con el dato ya puesto), no un límite de
-- seguridad — igual que el resto de validaciones "suaves" de este
-- sistema (fetchCapturableIndicators, etc.).
--
-- Escrita para ser segura de re-ejecutar sin importar si ya habías
-- corrido una versión anterior de esta tabla (antes sin el desfase de
-- días).
-- ============================================================

create table if not exists level_capture_cutoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  level smallint not null check (level in (1, 2, 3)),
  cutoff_time time not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, level)
);

create index if not exists idx_level_capture_cutoffs_org on level_capture_cutoffs(organization_id);

do $$
begin
  if not exists (
    select 1 from information_schema.triggers
    where event_object_table = 'level_capture_cutoffs' and trigger_name = 'trg_level_capture_cutoffs_updated_at'
  ) then
    create trigger trg_level_capture_cutoffs_updated_at before update on level_capture_cutoffs
      for each row execute function set_updated_at();
  end if;
end $$;

-- 0 = la reunión evalúa el dato de HOY; -1 = el de AYER; -2 = antier; etc.
alter table level_capture_cutoffs add column if not exists evaluated_day_offset smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'level_capture_cutoffs_offset_check') then
    alter table level_capture_cutoffs
      add constraint level_capture_cutoffs_offset_check check (evaluated_day_offset <= 0);
  end if;
end $$;

-- ============================================================
-- RLS: mismo patrón que org_units — lectura todo el tenant, escritura
-- solo gestión (lo define quien organiza la cascada de reuniones, no el
-- piso). drop+create para que sea seguro re-ejecutar la migración.
-- ============================================================
alter table level_capture_cutoffs enable row level security;

drop policy if exists level_capture_cutoffs_select on level_capture_cutoffs;
create policy level_capture_cutoffs_select on level_capture_cutoffs for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

drop policy if exists level_capture_cutoffs_write on level_capture_cutoffs;
create policy level_capture_cutoffs_write on level_capture_cutoffs for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);
