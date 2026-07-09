-- ============================================================
-- Estructura organizacional universal (Niveles 1-5, extensible)
--
-- Nivel 1 (Organización) = organizations, ya existe.
-- Nivel 4 (Sitio) = sites, ya existe.
-- Nuevo:
--   org_units: árbol Nivel 2 (Unidad de Negocio) -> Nivel 3 (Región),
--     por organización. sites se cuelga opcionalmente de un org_unit.
--   site_locations: árbol Nivel 5 (Instalación) en adelante, colgado
--     de un sitio. Se deja el rango 5-12 desde ya para no requerir
--     otra migración cuando se necesiten Área/Proceso/Línea/Activo/etc.
--
-- Todo es aditivo y opcional: nada de lo ya construido (permisos por
-- sitio, RLS, capturas, tableros) cambia de comportamiento.
-- ============================================================

create table org_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references org_units(id) on delete cascade,
  level smallint not null check (level in (2, 3)), -- 2 = Unidad de Negocio, 3 = Región
  name text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_org_units_org on org_units(organization_id);
create index idx_org_units_parent on org_units(parent_id);

alter table sites add column org_unit_id uuid references org_units(id);

create table site_locations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  parent_id uuid references site_locations(id) on delete cascade,
  level smallint not null check (level between 5 and 12), -- 5 = Instalación, 6-12 reservados
  name text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_site_locations_site on site_locations(site_id);
create index idx_site_locations_parent on site_locations(parent_id);

-- Precisión opcional a nivel de indicador (ej. anclar a una Instalación
-- específica dentro del sitio), sin reemplazar site_id.
alter table indicators add column site_location_id uuid references site_locations(id);

-- ============================================================
-- RLS: org_units
-- Es configuración del alcance del piloto, la define consultoría/
-- gerencia del cliente, no el piso (a diferencia de cause_categories).
-- ============================================================
alter table org_units enable row level security;

create policy org_units_select on org_units for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy org_units_write on org_units for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);

-- ============================================================
-- RLS: site_locations
-- ============================================================
alter table site_locations enable row level security;

create policy site_locations_select on site_locations for select using (
  exists (
    select 1 from sites s
    where s.id = site_locations.site_id
      and (current_role_name() = 'admin_consultora' or s.organization_id = current_org_id())
  )
);

create policy site_locations_write on site_locations for all using (
  exists (
    select 1 from sites s
    where s.id = site_locations.site_id
      and (
        current_role_name() = 'admin_consultora'
        or (s.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
      )
  )
) with check (
  exists (
    select 1 from sites s
    where s.id = site_locations.site_id
      and (
        current_role_name() = 'admin_consultora'
        or (s.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
      )
  )
);
