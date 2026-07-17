-- ============================================================
-- Catálogo de "causa raíz identificada" por indicador — mismo patrón
-- que el catálogo de unidades de medida (units): en vez de texto libre
-- sin control, un desplegable respaldado por las frases que ya se han
-- registrado antes para ESE indicador, con "Otra, especificar" para
-- agregar una nueva. Objetivo: que "frecuencia de cambio de EPP" y
-- "cambio de EPP muy espaciado" no queden como dos causas distintas
-- cuando en realidad son la misma — el usuario elige de la lista en
-- vez de escribir a su propio criterio cada vez.
--
-- Único por (indicador, texto) SIN distinguir mayúsculas/minúsculas
-- (índice sobre lower(text)) — así "Frecuencia de cambio" y
-- "frecuencia de cambio" no se guardan como dos entradas separadas.
-- ============================================================

create table indicator_root_causes (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id) on delete cascade,
  text text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create unique index idx_indicator_root_causes_unique on indicator_root_causes (indicator_id, lower(text));
create index idx_indicator_root_causes_indicator on indicator_root_causes(indicator_id);

-- ============================================================
-- RLS: mismo criterio que indicator_causes — lectura todo el tenant
-- (vía el indicador), creación para quien pueda registrar un análisis
-- causal de ese indicador (así el piso amplía el catálogo sobre la
-- marcha, no solo gestión).
-- ============================================================
alter table indicator_root_causes enable row level security;

create policy indicator_root_causes_select on indicator_root_causes for select using (
  exists (
    select 1 from indicators i where i.id = indicator_root_causes.indicator_id
    and (current_role_name() = 'admin_consultora' or i.organization_id = current_org_id())
  )
);

create policy indicator_root_causes_insert on indicator_root_causes for insert with check (
  exists (
    select 1 from indicators i where i.id = indicator_root_causes.indicator_id
    and (current_role_name() = 'admin_consultora' or (i.organization_id = current_org_id() and (
      current_role_name() in ('admin_cliente', 'gerente')
      or (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
      or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
    )))
  )
);
