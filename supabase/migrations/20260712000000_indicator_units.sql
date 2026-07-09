-- ============================================================
-- Catálogo de unidades de medida por organización
--
-- Reemplaza el campo de texto libre "Unidad de medida" en el
-- formulario de indicadores por un desplegable respaldado por un
-- catálogo propio de cada organización (mismo patrón que
-- cause_categories para el Pareto). Cada cliente puede ampliar su
-- lista desde la app cuando escribe una unidad nueva ("Otro,
-- especificar"), y esa unidad queda disponible para el resto del
-- equipo la próxima vez.
-- ============================================================

create table units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index idx_units_org on units(organization_id);

-- ============================================================
-- RLS: units
-- Lectura: todo el tenant. Creación: los mismos roles que pueden
-- crear indicadores (así el desplegable nunca bloquea a quien está
-- dando de alta un indicador). Renombrar/desactivar: solo roles de
-- gestión, para no descuadrar un catálogo que ya se está usando.
-- ============================================================
alter table units enable row level security;

create policy units_select on units for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy units_insert on units for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id()
    and current_role_name() in ('admin_cliente', 'gerente', 'administrativo')
  )
);

create policy units_update on units for update using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);

create policy units_delete on units for delete using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);

-- ============================================================
-- Backfill: conserva cualquier unidad que ya esté en uso hoy en
-- indicators.unit (texto libre histórico), para que ningún indicador
-- existente "pierda" su unidad al pasar al catálogo.
-- ============================================================
insert into units (organization_id, name)
select distinct organization_id, trim(unit)
from indicators
where unit is not null and trim(unit) <> ''
on conflict (organization_id, name) do nothing;

-- ============================================================
-- Semilla: lista inicial de unidades comunes en gestión Lean, para
-- que ninguna organización arranque con el desplegable vacío.
-- ============================================================
insert into units (organization_id, name)
select o.id, u.name
from organizations o
cross join (values
  ('%'), ('unidades'), ('horas'), ('horas-hombre'), ('días'), ('turnos'),
  ('accidentes'), ('defectos'), ('unidades no conformes'), ('paradas'),
  ('minutos'), ('kg'), ('litros'), ('$'), ('ppm'), ('piezas'), ('puntos')
) as u(name)
on conflict (organization_id, name) do nothing;
