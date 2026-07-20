-- ============================================================
-- Cierre real de la captura (no solo en pantalla): hasta ahora
-- isCaptureBlockedByTime() solo bloqueaba, en el cliente, la fecha exacta
-- que la reunión de HOY evalúa — cualquier fecha más antigua (cuya propia
-- reunión ya pasó hace días) seguía totalmente editable llamando a la API
-- directamente, o incluso desde la propia pantalla en fechas atrasadas.
-- Eso permitía modificar hacia atrás un dato ya expuesto en su reunión.
--
-- Esta migración cierra esa fecha en la base de datos, no solo en
-- pantalla: una vez que la reunión que evalúa una fecha ya ocurrió (a la
-- hora/día configurados en level_capture_cutoffs), esa fecha queda
-- bloqueada para siempre — no solo "hoy", cualquier fecha anterior
-- también — salvo que exista una autorización vigente de admin_consultora
-- con una causal seleccionada del catálogo.
--
-- Zona horaria fija en 'America/Bogota' (los clientes de este proyecto
-- operan ahí) para que "hoy"/"la hora" del lado del servidor coincida con
-- el reloj real del usuario, sin depender de en qué huso corra Postgres.
-- ============================================================

-- ------------------------------------------------------------
-- Catálogo de causales para autorizar una edición tardía
-- ------------------------------------------------------------
create table if not exists measurement_override_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table measurement_override_reasons enable row level security;

drop policy if exists measurement_override_reasons_select on measurement_override_reasons;
create policy measurement_override_reasons_select on measurement_override_reasons for select using (
  auth.role() = 'authenticated'
);

drop policy if exists measurement_override_reasons_write on measurement_override_reasons;
create policy measurement_override_reasons_write on measurement_override_reasons for all using (
  current_role_name() = 'admin_consultora'
) with check (
  current_role_name() = 'admin_consultora'
);

insert into measurement_override_reasons (code, name, sort_order) values
  ('error_digitacion', 'Error de digitación', 1),
  ('dato_no_disponible', 'Dato no disponible a tiempo (fuerza mayor)', 2),
  ('correccion_auditoria', 'Corrección por auditoría/verificación posterior', 3),
  ('instruccion_gerencia', 'Instrucción de gerencia', 4),
  ('otro', 'Otro (especificar)', 5)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- Autorizaciones de edición tardía — una por cada corrección puntual,
-- consumida (used_at) apenas el trigger de measurements la aprovecha, para
-- que no quede como un pase abierto reutilizable.
-- ------------------------------------------------------------
create table if not exists measurement_edit_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  indicator_id uuid not null references indicators(id) on delete cascade,
  period_date date not null,
  reason_id uuid not null references measurement_override_reasons(id),
  comment text,
  authorized_by uuid not null references profiles(id),
  authorized_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists idx_measurement_edit_auth_pending
  on measurement_edit_authorizations(indicator_id, period_date)
  where used_at is null;

alter table measurement_edit_authorizations enable row level security;

drop policy if exists measurement_edit_authorizations_select on measurement_edit_authorizations;
create policy measurement_edit_authorizations_select on measurement_edit_authorizations for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

drop policy if exists measurement_edit_authorizations_insert on measurement_edit_authorizations;
create policy measurement_edit_authorizations_insert on measurement_edit_authorizations for insert with check (
  current_role_name() = 'admin_consultora'
);

-- ------------------------------------------------------------
-- Última fecha "cerrada" para un horario de nivel dado: retrocede desde
-- hoy hasta el día de reunión (de weekdays) más reciente que ya pasó su
-- hora de corte, y le resta el desfase de evaluación — esa es la fecha
-- más reciente que ya fue expuesta en su reunión. Todo lo <= a esa fecha
-- queda cerrado; lo posterior sigue abierto para capturar con normalidad.
-- ------------------------------------------------------------
create or replace function public.compute_last_closed_date(
  p_cutoff_time time,
  p_evaluated_day_offset smallint,
  p_weekdays smallint[],
  p_now timestamptz
) returns date
language plpgsql
as $$
declare
  allowed_days smallint[];
  local_now timestamp;
  check_date date;
  i int;
  found_meeting_date date := null;
begin
  local_now := p_now at time zone 'America/Bogota';
  allowed_days := case
    when p_weekdays is null or array_length(p_weekdays, 1) is null or array_length(p_weekdays, 1) = 0
      then array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    else p_weekdays
  end;

  for i in 0..7 loop
    check_date := local_now::date - i;
    if extract(dow from check_date)::smallint = any(allowed_days) then
      if i = 0 then
        if local_now::time >= p_cutoff_time then
          found_meeting_date := check_date;
          exit;
        end if;
      else
        found_meeting_date := check_date;
        exit;
      end if;
    end if;
  end loop;

  if found_meeting_date is null then
    return null;
  end if;

  return found_meeting_date + p_evaluated_day_offset;
end;
$$;

-- ------------------------------------------------------------
-- Trigger de cierre: bloquea el insert/update en measurements si la fecha
-- ya cerró, salvo que haya una autorización vigente (no usada) para ese
-- indicador+fecha — en cuyo caso la consume y deja pasar la escritura.
-- Conexiones sin JWT (migraciones, procesos propios) no se restringen,
-- igual que prevent_role_escalation.
-- ------------------------------------------------------------
create or replace function public.enforce_measurement_capture_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_level smallint;
  v_cutoff level_capture_cutoffs%rowtype;
  v_closed_date date;
  v_auth_id uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select i.organization_id, i.level into v_org_id, v_level
  from indicators i where i.id = new.indicator_id;

  select * into v_cutoff from level_capture_cutoffs
  where organization_id = v_org_id and level = v_level;

  if not found then
    return new;
  end if;

  v_closed_date := compute_last_closed_date(
    v_cutoff.cutoff_time, v_cutoff.evaluated_day_offset, v_cutoff.weekdays, now()
  );

  if v_closed_date is null or new.period_date > v_closed_date then
    return new;
  end if;

  select id into v_auth_id from measurement_edit_authorizations
  where indicator_id = new.indicator_id
    and period_date = new.period_date
    and used_at is null
  order by authorized_at desc
  limit 1;

  if v_auth_id is null then
    raise exception 'Esta fecha ya cerró (pasó la reunión que la evalúa) y no se puede editar sin autorización de LeanProLogistic.';
  end if;

  update measurement_edit_authorizations set used_at = now() where id = v_auth_id;

  return new;
end;
$$;

drop trigger if exists trg_enforce_measurement_capture_lock on measurements;
create trigger trg_enforce_measurement_capture_lock
  before insert or update on measurements
  for each row execute function enforce_measurement_capture_lock();

-- Mismo hallazgo que con prevent_role_escalation: en este proyecto el
-- EXECUTE se otorga explícito por rol, no vía PUBLIC — hay que revocarlo
-- de los roles reales para que no se pueda invocar directo por RPC.
revoke execute on function public.enforce_measurement_capture_lock() from anon, authenticated;
revoke execute on function public.compute_last_closed_date(time, smallint, smallint[], timestamptz) from anon, authenticated;
