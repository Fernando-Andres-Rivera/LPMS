-- Responsables de cada pilar SMQDCEP, por sitio — puede haber varios por
-- combinación sitio/pilar (principal + suplentes). Asignar sigue el mismo
-- criterio que org_units/sites (admin_consultora, o admin_cliente/gerente
-- de la organización); quitar un responsable ya asignado, en cambio, sigue
-- el mismo criterio de borrado uniforme de toda la app: solo admin_consultora.
create table public.pillar_responsibles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  axis_id uuid not null references public.axes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (site_id, axis_id, profile_id)
);

create index idx_pillar_responsibles_org on public.pillar_responsibles (organization_id);
create index idx_pillar_responsibles_site on public.pillar_responsibles (site_id);

alter table public.pillar_responsibles enable row level security;

create policy pillar_responsibles_select on public.pillar_responsibles
for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy pillar_responsibles_insert on public.pillar_responsibles
for insert with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]))
);

create policy pillar_responsibles_delete on public.pillar_responsibles
for delete using (current_role_name() = 'admin_consultora');
