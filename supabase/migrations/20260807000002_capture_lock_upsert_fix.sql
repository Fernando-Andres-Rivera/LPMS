-- ============================================================
-- Bug real encontrado al probar en vivo: measurements.saveMeasurement usa
-- `insert ... on conflict (indicator_id, period_date) do update` — y
-- Postgres, cuando SÍ hay conflicto, dispara el trigger BEFORE ROW dos
-- veces: una para el intento de INSERT (antes de saber que va a chocar) y
-- otra para el UPDATE real de resolución del conflicto. Como
-- enforce_measurement_capture_lock() buscaba una autorización con
-- used_at is null y la marcaba usada de inmediato, el primer disparo la
-- consumía y el segundo (el que realmente aplica) ya no la encontraba —
-- rechazando una corrección recién autorizada.
--
-- Arreglo: en vez de exigir used_at is null, se acepta cualquier
-- autorización de ese indicador+fecha creada en los últimos 2 minutos
-- (used_at igual se registra, solo que ya no es la condición de
-- búsqueda) — como authorize_and_save_measurement crea la autorización
-- e inmediatamente escribe la medición dentro de la misma transacción,
-- 2 minutos es margen de sobra sin abrir la puerta a reutilizar una
-- autorización vieja indefinidamente.
-- ============================================================

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
    and authorized_at >= now() - interval '2 minutes'
  order by authorized_at desc
  limit 1;

  if v_auth_id is null then
    raise exception 'Esta fecha ya cerró (pasó la reunión que la evalúa) y no se puede editar sin autorización de LeanProLogistic.';
  end if;

  update measurement_edit_authorizations set used_at = coalesce(used_at, now()) where id = v_auth_id;

  return new;
end;
$$;
