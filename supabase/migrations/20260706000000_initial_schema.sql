-- ============================================================
-- LPMS — Fase 1: Esquema de datos
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tipos enumerados
-- ------------------------------------------------------------
create type user_role as enum (
  'admin_consultora',
  'admin_cliente',
  'gerente',
  'administrativo',
  'operativo'
);

create type indicator_frequency as enum ('diaria', 'semanal', 'mensual');
create type improvement_direction as enum ('mayor_mejor', 'menor_mejor');
create type pdca_status as enum ('planificar', 'hacer', 'verificar', 'actuar', 'cerrado');
create type causal_methodology as enum ('5_porques', 'ishikawa');

-- ------------------------------------------------------------
-- organizations (tenants)
-- ------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- sites (plantas/sedes)
-- ------------------------------------------------------------
create table sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sites_org on sites(organization_id);

-- ------------------------------------------------------------
-- profiles (extiende auth.users)
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  role user_role not null,
  full_name text not null,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_org on profiles(organization_id);

-- tabla puente: un usuario (administrativo/operativo) puede cubrir varios sitios
create table profile_sites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, site_id)
);

create index idx_profile_sites_profile on profile_sites(profile_id);
create index idx_profile_sites_site on profile_sites(site_id);

-- ------------------------------------------------------------
-- axes (catálogo compartido de los 7 ejes)
-- ------------------------------------------------------------
create table axes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- seguridad, mantenimiento, calidad, disponibilidad, costos, estandar, personas
  name text not null,
  color text not null,
  icon text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

-- permite a un tenant desactivar un eje sin tocar el catálogo global
create table organization_axes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  axis_id uuid not null references axes(id) on delete cascade,
  active boolean not null default true,
  unique(organization_id, axis_id)
);

-- ------------------------------------------------------------
-- indicators
-- ------------------------------------------------------------
create table indicators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- nulo para indicadores Nivel 3 (corporativos, no atados a una sola planta)
  site_id uuid references sites(id),
  axis_id uuid not null references axes(id),
  level smallint not null check (level in (1, 2, 3)),
  name text not null,
  definition text,
  calculation_formula text,
  unit text not null,
  frequency indicator_frequency not null,
  improvement_direction improvement_direction not null,
  responsible_id uuid references profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_indicators_org on indicators(organization_id);
create index idx_indicators_site on indicators(site_id);
create index idx_indicators_axis on indicators(axis_id);
create index idx_indicators_level on indicators(level);

-- tabla puente muchos-a-muchos: un indicador hijo puede tener varios padres
create table indicator_links (
  id uuid primary key default gen_random_uuid(),
  child_indicator_id uuid not null references indicators(id) on delete cascade,
  parent_indicator_id uuid not null references indicators(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(child_indicator_id, parent_indicator_id),
  check (child_indicator_id <> parent_indicator_id)
);

create index idx_indicator_links_child on indicator_links(child_indicator_id);
create index idx_indicator_links_parent on indicator_links(parent_indicator_id);

-- ------------------------------------------------------------
-- targets (objetivo por indicador y período)
-- ------------------------------------------------------------
create table targets (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id) on delete cascade,
  period_year int not null,
  period_month smallint check (period_month between 1 and 12), -- null = objetivo anual
  target_value numeric not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- coalesce evita duplicados cuando period_month es null (objetivo anual)
create unique index idx_targets_unique_period
  on targets(indicator_id, period_year, coalesce(period_month, 0));

-- ------------------------------------------------------------
-- measurements (mediciones capturadas)
-- ------------------------------------------------------------
create table measurements (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id) on delete cascade,
  period_date date not null,
  value numeric not null,
  comment text,
  captured_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create unique index idx_measurements_unique_period on measurements(indicator_id, period_date);

-- ------------------------------------------------------------
-- causal_analyses (solo tabla, sin UI en Fase 1)
-- ------------------------------------------------------------
create table causal_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  indicator_id uuid not null references indicators(id) on delete cascade,
  measurement_id uuid references measurements(id) on delete set null,
  methodology causal_methodology not null,
  description text,
  root_cause text,
  data jsonb not null default '{}'::jsonb, -- pasos de 5 Porqués o categorías Ishikawa
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_causal_org on causal_analyses(organization_id);
create index idx_causal_indicator on causal_analyses(indicator_id);

-- ------------------------------------------------------------
-- action_plans (solo tabla, sin UI en Fase 1)
-- ------------------------------------------------------------
create table action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  causal_analysis_id uuid references causal_analyses(id) on delete cascade,
  indicator_id uuid not null references indicators(id) on delete cascade,
  description text not null,
  responsible_id uuid references profiles(id),
  due_date date,
  status pdca_status not null default 'planificar',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_action_plans_org on action_plans(organization_id);
create index idx_action_plans_indicator on action_plans(indicator_id);

-- ------------------------------------------------------------
-- trigger genérico para updated_at
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger trg_sites_updated_at before update on sites
  for each row execute function set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_indicators_updated_at before update on indicators
  for each row execute function set_updated_at();
create trigger trg_causal_analyses_updated_at before update on causal_analyses
  for each row execute function set_updated_at();
create trigger trg_action_plans_updated_at before update on action_plans
  for each row execute function set_updated_at();
