-- ============================================================
-- Etapa 2: Taxonomía de causas + Pareto evolutivo
--
-- cause_categories: árbol de causas por organización (ej. Máquina ->
-- Extrusora 3 -> Motor -> Rodamiento). Se construye de abajo hacia
-- arriba: cualquiera que registre un análisis causal puede agregar un
-- nodo nuevo si la causa específica todavía no existe en el árbol.
--
-- causal_analysis_causes: etiqueta uno o varios nodos del árbol sobre
-- un análisis causal ya registrado, para poder contar/agregar por
-- período y construir el Pareto evolutivo (drill-down mes a mes).
-- ============================================================

create table cause_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references cause_categories(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_cause_categories_org on cause_categories(organization_id);
create index idx_cause_categories_parent on cause_categories(parent_id);

create table causal_analysis_causes (
  id uuid primary key default gen_random_uuid(),
  causal_analysis_id uuid not null references causal_analyses(id) on delete cascade,
  cause_category_id uuid not null references cause_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(causal_analysis_id, cause_category_id)
);

create index idx_causal_analysis_causes_analysis on causal_analysis_causes(causal_analysis_id);
create index idx_causal_analysis_causes_category on causal_analysis_causes(cause_category_id);

-- ============================================================
-- RLS: cause_categories
-- Lectura: todo el tenant. Creación de nodos nuevos: cualquier rol que
-- pueda registrar un análisis causal (así el piso puede añadir causas
-- sobre la marcha). Renombrar/desactivar: solo roles de gestión, para
-- no descuadrar el árbol que ya se está usando para contar.
-- ============================================================
alter table cause_categories enable row level security;

create policy cause_categories_select on cause_categories for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy cause_categories_insert on cause_categories for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id()
    and current_role_name() in ('admin_cliente', 'gerente', 'administrativo', 'operativo')
  )
);

create policy cause_categories_update on cause_categories for update using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);

create policy cause_categories_delete on cause_categories for delete using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);

-- ============================================================
-- RLS: causal_analysis_causes
-- Sigue el mismo permiso que causal_analyses: si puedes ver/crear el
-- análisis, puedes etiquetarlo.
-- ============================================================
alter table causal_analysis_causes enable row level security;

create policy causal_analysis_causes_select on causal_analysis_causes for select using (
  exists (
    select 1 from causal_analyses ca
    where ca.id = causal_analysis_causes.causal_analysis_id
      and (current_role_name() = 'admin_consultora' or ca.organization_id = current_org_id())
  )
);

create policy causal_analysis_causes_insert on causal_analysis_causes for insert with check (
  exists (
    select 1 from causal_analyses ca
    where ca.id = causal_analysis_causes.causal_analysis_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          ca.organization_id = current_org_id()
          and current_role_name() in ('admin_cliente', 'gerente', 'administrativo', 'operativo')
        )
      )
  )
);

create policy causal_analysis_causes_delete on causal_analysis_causes for delete using (
  exists (
    select 1 from causal_analyses ca
    where ca.id = causal_analysis_causes.causal_analysis_id
      and (
        current_role_name() = 'admin_consultora'
        or (ca.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
      )
  )
);
