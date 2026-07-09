-- ============================================================
-- LPMS — Fase 1: Row Level Security
-- ============================================================

-- ============================================================
-- Funciones auxiliares (SECURITY DEFINER evita recursión al leer
-- el perfil del usuario dentro de las políticas de la propia
-- tabla profiles)
-- ============================================================
create or replace function current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from profiles where id = auth.uid();
$$;

create or replace function current_role_name()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- true si el usuario autenticado tiene asignado el sitio indicado
-- (un usuario puede cubrir varios sitios vía profile_sites)
create or replace function user_has_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profile_sites ps
    where ps.profile_id = auth.uid() and ps.site_id = p_site_id
  );
$$;

-- ============================================================
-- organizations
-- ============================================================
alter table organizations enable row level security;

create policy organizations_select on organizations for select using (
  current_role_name() = 'admin_consultora' or id = current_org_id()
);

create policy organizations_insert on organizations for insert with check (
  current_role_name() = 'admin_consultora'
);

create policy organizations_update on organizations for update using (
  current_role_name() = 'admin_consultora'
  or (id = current_org_id() and current_role_name() = 'admin_cliente')
);

-- ============================================================
-- sites
-- ============================================================
alter table sites enable row level security;

create policy sites_select on sites for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy sites_write on sites for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() = 'admin_cliente')
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() = 'admin_cliente')
);

-- ============================================================
-- profiles
-- ============================================================
alter table profiles enable row level security;

create policy profiles_select on profiles for select using (
  id = auth.uid()
  or current_role_name() = 'admin_consultora'
  or organization_id = current_org_id()
);

create policy profiles_insert on profiles for insert with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() = 'admin_cliente')
);

create policy profiles_update on profiles for update using (
  id = auth.uid()
  or current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() = 'admin_cliente')
);

-- ============================================================
-- profile_sites
-- ============================================================
alter table profile_sites enable row level security;

create policy profile_sites_select on profile_sites for select using (
  profile_id = auth.uid()
  or current_role_name() = 'admin_consultora'
  or exists (
    select 1 from profiles p
    where p.id = profile_sites.profile_id and p.organization_id = current_org_id()
  )
);

create policy profile_sites_write on profile_sites for all using (
  current_role_name() = 'admin_consultora'
  or exists (
    select 1 from profiles p
    where p.id = profile_sites.profile_id
      and p.organization_id = current_org_id()
      and current_role_name() = 'admin_cliente'
  )
) with check (
  current_role_name() = 'admin_consultora'
  or exists (
    select 1 from profiles p
    where p.id = profile_sites.profile_id
      and p.organization_id = current_org_id()
      and current_role_name() = 'admin_cliente'
  )
);

-- ============================================================
-- axes (catálogo compartido, solo lectura para todos los autenticados)
-- ============================================================
alter table axes enable row level security;

create policy axes_select on axes for select using (auth.role() = 'authenticated');

create policy axes_write on axes for all using (
  current_role_name() = 'admin_consultora'
) with check (
  current_role_name() = 'admin_consultora'
);

-- ============================================================
-- organization_axes
-- ============================================================
alter table organization_axes enable row level security;

create policy organization_axes_select on organization_axes for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy organization_axes_write on organization_axes for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);

-- ============================================================
-- indicators
-- Lectura: todo el tenant (necesario para trazabilidad de cascada)
-- Escritura: según rol + nivel + sitio
-- ============================================================
alter table indicators enable row level security;

create policy indicators_select on indicators for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy indicators_insert on indicators for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() = 'admin_cliente'
      or (current_role_name() = 'gerente' and level in (2, 3))
      or (current_role_name() = 'administrativo' and level in (1, 2) and user_has_site(site_id))
    )
  )
);

create policy indicators_update on indicators for update using (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() = 'admin_cliente'
      or (current_role_name() = 'gerente' and level in (2, 3))
      or (current_role_name() = 'administrativo' and level in (1, 2) and user_has_site(site_id))
    )
  )
) with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() = 'admin_cliente'
      or (current_role_name() = 'gerente' and level in (2, 3))
      or (current_role_name() = 'administrativo' and level in (1, 2) and user_has_site(site_id))
    )
  )
);

create policy indicators_delete on indicators for delete using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() = 'admin_cliente')
);

-- ============================================================
-- indicator_links
-- ============================================================
alter table indicator_links enable row level security;

create policy indicator_links_select on indicator_links for select using (
  exists (
    select 1 from indicators i where i.id = indicator_links.child_indicator_id
    and (current_role_name() = 'admin_consultora' or i.organization_id = current_org_id())
  )
);

create policy indicator_links_write on indicator_links for all using (
  exists (
    select 1 from indicators i where i.id = indicator_links.child_indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente', 'administrativo'))
    )
  )
) with check (
  exists (
    select 1 from indicators i where i.id = indicator_links.child_indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente', 'administrativo'))
    )
  )
);

-- ============================================================
-- targets
-- ============================================================
alter table targets enable row level security;

create policy targets_select on targets for select using (
  exists (
    select 1 from indicators i where i.id = targets.indicator_id
    and (current_role_name() = 'admin_consultora' or i.organization_id = current_org_id())
  )
);

create policy targets_write on targets for all using (
  exists (
    select 1 from indicators i where i.id = targets.indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and (
        current_role_name() = 'admin_cliente'
        or (current_role_name() = 'gerente' and i.level in (2, 3))
        or (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
      ))
    )
  )
) with check (
  exists (
    select 1 from indicators i where i.id = targets.indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and (
        current_role_name() = 'admin_cliente'
        or (current_role_name() = 'gerente' and i.level in (2, 3))
        or (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
      ))
    )
  )
);

-- ============================================================
-- measurements
-- Captura restringida por rol/nivel/sitio; lectura abierta al tenant
-- ============================================================
alter table measurements enable row level security;

create policy measurements_select on measurements for select using (
  exists (
    select 1 from indicators i where i.id = measurements.indicator_id
    and (current_role_name() = 'admin_consultora' or i.organization_id = current_org_id())
  )
);

create policy measurements_insert on measurements for insert with check (
  exists (
    select 1 from indicators i where i.id = measurements.indicator_id
    and (
      current_role_name() = 'admin_consultora'
      or (i.organization_id = current_org_id() and (
        current_role_name() in ('admin_cliente', 'gerente')
        or (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
        or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
      ))
    )
  )
);

create policy measurements_update on measurements for update using (
  captured_by = auth.uid()
  or current_role_name() in ('admin_consultora', 'admin_cliente', 'gerente')
);

create policy measurements_delete on measurements for delete using (
  current_role_name() in ('admin_consultora', 'admin_cliente', 'gerente')
);

-- ============================================================
-- causal_analyses (solo tablas en esta fase, sin UI)
-- ============================================================
alter table causal_analyses enable row level security;

create policy causal_analyses_select on causal_analyses for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy causal_analyses_write on causal_analyses for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente', 'administrativo'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente', 'administrativo'))
);

-- ============================================================
-- action_plans (solo tablas en esta fase, sin UI)
-- ============================================================
alter table action_plans enable row level security;

create policy action_plans_select on action_plans for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy action_plans_write on action_plans for all using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente', 'administrativo'))
) with check (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente', 'administrativo'))
);
