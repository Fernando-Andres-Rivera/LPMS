-- ============================================================
-- Causas posibles por indicador — tercera metodología de análisis
-- causal ("Causas posibles"), junto a Ishikawa y 5 Porqués.
--
-- A diferencia de cause_categories (árbol COMPARTIDO en toda la
-- organización, usado por el Pareto general), indicator_causes es un
-- árbol PROPIO de cada indicador — porque las causas posibles de
-- "daños mecánicos por máquina" (Máquina -> Extrusora 3 -> Motor) no
-- tienen nada que ver con las de "requisiciones sin legalizar"
-- (Coordinador -> falta de gestión), aunque ambos indicadores vivan
-- en la misma organización.
--
-- El Pareto de esta pestaña recorre ese árbol propio con el mismo
-- mecanismo de drill-down que el Pareto general: ve la raíz (ej. qué
-- máquina para más), entra a un nodo (esa máquina) y el Pareto cambia
-- para mostrar solo sus hijos (los componentes de esa máquina).
-- ============================================================

alter type causal_methodology add value 'causas_estandar';

create table indicator_causes (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id) on delete cascade,
  parent_id uuid references indicator_causes(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_indicator_causes_indicator on indicator_causes(indicator_id);
create index idx_indicator_causes_parent on indicator_causes(parent_id);

-- Etiqueta uno o varios nodos de ese árbol sobre un análisis causal ya
-- registrado (metodología causas_estandar), para poder contar/agregar
-- y construir el Pareto propio del indicador.
create table causal_analysis_indicator_causes (
  id uuid primary key default gen_random_uuid(),
  causal_analysis_id uuid not null references causal_analyses(id) on delete cascade,
  indicator_cause_id uuid not null references indicator_causes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(causal_analysis_id, indicator_cause_id)
);

create index idx_cai_causes_analysis on causal_analysis_indicator_causes(causal_analysis_id);
create index idx_cai_causes_cause on causal_analysis_indicator_causes(indicator_cause_id);

-- ============================================================
-- RLS: indicator_causes
-- Mismo criterio que cause_categories: lectura todo el tenant (vía el
-- indicador), creación de nodos nuevos para quien pueda registrar un
-- análisis causal de ESE indicador (así el piso puede ampliar el
-- árbol sobre la marcha), renombrar/desactivar solo gestión.
-- ============================================================
alter table indicator_causes enable row level security;

create policy indicator_causes_select on indicator_causes for select using (
  exists (
    select 1 from indicators i where i.id = indicator_causes.indicator_id
    and (current_role_name() = 'admin_consultora' or i.organization_id = current_org_id())
  )
);

create policy indicator_causes_insert on indicator_causes for insert with check (
  exists (
    select 1 from indicators i where i.id = indicator_causes.indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (
        i.organization_id = current_org_id() and (
          current_role_name() in ('admin_cliente', 'gerente')
          or (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
          or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
        )
      )
    )
  )
);

create policy indicator_causes_update on indicator_causes for update using (
  exists (
    select 1 from indicators i where i.id = indicator_causes.indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
    )
  )
);

create policy indicator_causes_delete on indicator_causes for delete using (
  exists (
    select 1 from indicators i where i.id = indicator_causes.indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
    )
  )
);

-- ============================================================
-- RLS: causal_analysis_indicator_causes
-- Sigue el mismo permiso que el análisis causal al que etiqueta.
-- ============================================================
alter table causal_analysis_indicator_causes enable row level security;

create policy causal_analysis_indicator_causes_select on causal_analysis_indicator_causes for select using (
  exists (
    select 1 from causal_analyses ca
    where ca.id = causal_analysis_indicator_causes.causal_analysis_id
      and (current_role_name() = 'admin_consultora' or ca.organization_id = current_org_id())
  )
);

create policy causal_analysis_indicator_causes_insert on causal_analysis_indicator_causes for insert with check (
  exists (
    select 1 from causal_analyses ca
    where ca.id = causal_analysis_indicator_causes.causal_analysis_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          ca.organization_id = current_org_id()
          and current_role_name() in ('admin_cliente', 'gerente', 'administrativo', 'operativo')
        )
      )
  )
);

create policy causal_analysis_indicator_causes_delete on causal_analysis_indicator_causes for delete using (
  exists (
    select 1 from causal_analyses ca
    where ca.id = causal_analysis_indicator_causes.causal_analysis_id
      and (
        current_role_name() = 'admin_consultora'
        or (ca.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
      )
  )
);
