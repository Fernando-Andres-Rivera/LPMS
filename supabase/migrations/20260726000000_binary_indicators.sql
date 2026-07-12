-- ============================================================
-- Indicadores de cumplimiento (Sí/No) — ej. "¿Se realizó el recorrido de
-- seguridad?", "¿Se hizo la auditoría?". Hoy todo indicador es numérico
-- contra un umbral; esto no sirve para un KPI de ejecución binaria.
--
-- Se guarda en measurements.value como siempre (1 = Sí, 0 = No) — no hace
-- falta una tabla nueva. Lo que cambia es la INTERPRETACIÓN: la app oculta
-- el objetivo numérico y fuerza target_value=1 / improvement_direction=
-- 'mayor_mejor' (transparente para el usuario), así calcularSemaforo()
-- sigue funcionando sin ningún cambio — value=1 cumple, value=0 incumple.
-- ============================================================

-- create type no admite "if not exists" en Postgres — se envuelve en un
-- chequeo manual para poder re-ejecutar esta migración sin error si ya
-- corrió parcialmente antes.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'indicator_value_type') then
    create type indicator_value_type as enum ('numerico', 'binario');
  end if;
end $$;

alter table indicators add column if not exists value_type indicator_value_type not null default 'numerico';

-- La vista indicator_status necesita el campo para que los tableros de
-- resumen (Ejes, Panorama global) también muestren "Sí"/"No" en vez del
-- 1/0 crudo. create or replace view solo permite AGREGAR columnas al
-- final del select, nunca insertarlas en medio de las existentes.
create or replace view indicator_status
with (security_invoker = on) as
select
  i.id,
  i.organization_id,
  i.site_id,
  i.site_location_id,
  i.axis_id,
  i.level,
  i.name,
  i.unit,
  i.frequency,
  i.improvement_direction,
  i.aggregation_method,
  i.responsible_id,
  i.active,
  ax.name       as axis_name,
  ax.color      as axis_color,
  s.name        as site_name,
  p.full_name   as responsible_name,
  lm.value      as latest_value,
  lm.period_date as latest_period_date,
  t.target_value,
  i.value_type
from indicators i
left join axes ax on ax.id = i.axis_id
left join sites s on s.id = i.site_id
left join profiles p on p.id = i.responsible_id
left join lateral (
  select m.value, m.period_date
  from measurements m
  where m.indicator_id = i.id
  order by m.period_date desc
  limit 1
) lm on true
left join lateral (
  select tg.target_value
  from targets tg
  where tg.indicator_id = i.id
    and tg.period_year = extract(year from now())::int
    and (tg.period_month = extract(month from now())::int or tg.period_month is null)
  order by tg.period_month desc nulls last
  limit 1
) t on true;

grant select on indicator_status to authenticated;
