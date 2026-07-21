-- Permite un horario de reunión por sitio (ademas del general por
-- organización/nivel). site_id nulo = horario general (fallback); site_id
-- con valor = anula el general solo para ese sitio.
alter table public.level_capture_cutoffs
  add column site_id uuid references public.sites(id) on delete cascade;

alter table public.level_capture_cutoffs
  drop constraint level_capture_cutoffs_organization_id_level_key;

-- Un solo horario general por organización/nivel (site_id nulo)...
create unique index level_capture_cutoffs_org_level_default_key
  on public.level_capture_cutoffs (organization_id, level)
  where site_id is null;

-- ...y como mucho un horario específico por sitio/nivel.
create unique index level_capture_cutoffs_org_level_site_key
  on public.level_capture_cutoffs (organization_id, level, site_id)
  where site_id is not null;

-- Ahora resuelve el horario aplicable por (organización, nivel, sitio del
-- indicador), con fallback al horario general (site_id nulo) cuando el
-- sitio del indicador no tiene uno propio configurado.
create or replace function public.enforce_measurement_capture_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_level smallint;
  v_site_id uuid;
  v_cutoff level_capture_cutoffs%rowtype;
  v_closed_date date;
  v_auth_id uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select i.organization_id, i.level, i.site_id into v_org_id, v_level, v_site_id
  from indicators i where i.id = new.indicator_id;

  select * into v_cutoff from level_capture_cutoffs
  where organization_id = v_org_id and level = v_level
    and site_id is not distinct from v_site_id;

  if not found and v_site_id is not null then
    select * into v_cutoff from level_capture_cutoffs
    where organization_id = v_org_id and level = v_level and site_id is null;
  end if;

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
$function$;
