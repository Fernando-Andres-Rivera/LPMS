-- ============================================================
-- Vista indicator_status: resuelve en UNA sola consulta el último
-- valor medido, su período, y el objetivo vigente de cada indicador
-- (más los nombres de eje / sitio / responsable ya unidos).
--
-- Reemplaza el patrón N+1 de las pantallas de resumen (Panorama global
-- y Ejes de desempeño), que hoy disparan 2+ consultas POR indicador.
-- Con 150 indicadores eso son cientos de round-trips por carga; con la
-- vista es una sola consulta.
--
-- CRÍTICO — security_invoker = on: sin esto, una vista corre con los
-- permisos de su DUEÑO (postgres), lo que SALTARÍA la RLS y filtraría
-- datos entre organizaciones. Con security_invoker, la vista aplica la
-- RLS del usuario que consulta — el mismo aislamiento por organización
-- que ya tienen las tablas base. Requiere Postgres 15+ (Supabase lo es).
-- ============================================================

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
  t.target_value
from indicators i
left join axes ax on ax.id = i.axis_id
left join sites s on s.id = i.site_id
left join profiles p on p.id = i.responsible_id
-- último valor capturado del indicador
left join lateral (
  select m.value, m.period_date
  from measurements m
  where m.indicator_id = i.id
  order by m.period_date desc
  limit 1
) lm on true
-- objetivo vigente: el del mes actual si existe, si no el anual
-- (period_month null). desc nulls last prioriza el mensual sobre el anual.
left join lateral (
  select tg.target_value
  from targets tg
  where tg.indicator_id = i.id
    and tg.period_year = extract(year from now())::int
    and (tg.period_month = extract(month from now())::int or tg.period_month is null)
  order by tg.period_month desc nulls last
  limit 1
) t on true;

-- El rol authenticated necesita SELECT sobre la vista; la RLS de las
-- tablas base (por security_invoker) sigue siendo la que filtra las filas.
grant select on indicator_status to authenticated;
