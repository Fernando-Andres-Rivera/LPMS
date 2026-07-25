-- Quick Win: la "WIN CARD" física de la cascada Gemba Walk → reunión de
-- nivel 1, ahora en la aplicación. Un tablero por sitio y día; dentro,
-- varios "wins" candidatos (uno por pilar, propuestos por quien hizo el
-- gemba walk de esa área); el equipo elige uno como definitivo y lo marca
-- verde (se resuelve en este nivel) o rojo (escala a nivel 2).

create table public.quick_win_boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  board_date date not null,
  problema_del_dia text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, board_date)
);

create index idx_quick_win_boards_org on public.quick_win_boards (organization_id);
create index idx_quick_win_boards_site_date on public.quick_win_boards (site_id, board_date);

create table public.quick_win_candidates (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.quick_win_boards(id) on delete cascade,
  axis_id uuid not null references public.axes(id),
  description text not null,
  responsible_id uuid references public.profiles(id),
  execution_time time,
  proposed_by uuid references public.profiles(id),
  -- El equipo elige UN candidato como "el win" definitivo de la reunión;
  -- needs_escalation es el toggle verde/rojo (solo tiene sentido una vez
  -- elegido): false = se resuelve en este nivel, true = escala a nivel 2.
  is_selected boolean not null default false,
  needs_escalation boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_quick_win_candidates_board on public.quick_win_candidates (board_id);
create index idx_quick_win_candidates_axis on public.quick_win_candidates (axis_id);

-- Evidencia del win elegido — mismo patrón de control de registros de
-- calidad que action_plan_evidence: soft-delete, nunca se borra de verdad.
create table public.quick_win_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.quick_win_candidates(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  active boolean not null default true
);

create index idx_quick_win_evidence_candidate on public.quick_win_evidence (candidate_id);

alter table public.quick_win_boards enable row level security;
alter table public.quick_win_candidates enable row level security;
alter table public.quick_win_evidence enable row level security;

-- quick_win_boards: mismo criterio de visibilidad que el resto de la app
-- (admin_consultora ve todo, el resto solo su organización); de escritura,
-- el mismo patrón "sitio propio" que ya usan las tablas Gemba (site-scoped
-- roles con user_has_site, o managers/admin_consultora sin restricción de
-- sitio).
create policy quick_win_boards_select on public.quick_win_boards
for select using (
  current_role_name() = 'admin_consultora' or organization_id = current_org_id()
);

create policy quick_win_boards_write on public.quick_win_boards
for all using (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id()
    and (
      current_role_name() = any (array['admin_cliente', 'gerente']::user_role[])
      or user_has_site(site_id)
    )
  )
);

create policy quick_win_candidates_select on public.quick_win_candidates
for select using (
  exists (
    select 1 from public.quick_win_boards b
    where b.id = quick_win_candidates.board_id
      and (current_role_name() = 'admin_consultora' or b.organization_id = current_org_id())
  )
);

create policy quick_win_candidates_write on public.quick_win_candidates
for all using (
  exists (
    select 1 from public.quick_win_boards b
    where b.id = quick_win_candidates.board_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          b.organization_id = current_org_id()
          and (
            current_role_name() = any (array['admin_cliente', 'gerente']::user_role[])
            or user_has_site(b.site_id)
          )
        )
      )
  )
);

create policy quick_win_evidence_select on public.quick_win_evidence
for select using (
  exists (
    select 1 from public.quick_win_candidates c
    join public.quick_win_boards b on b.id = c.board_id
    where c.id = quick_win_evidence.candidate_id
      and (current_role_name() = 'admin_consultora' or b.organization_id = current_org_id())
  )
);

create policy quick_win_evidence_insert on public.quick_win_evidence
for insert with check (
  exists (
    select 1 from public.quick_win_candidates c
    join public.quick_win_boards b on b.id = c.board_id
    where c.id = quick_win_evidence.candidate_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          b.organization_id = current_org_id()
          and (
            current_role_name() = any (array['admin_cliente', 'gerente']::user_role[])
            or user_has_site(b.site_id)
          )
        )
      )
  )
);

-- Solo managers/admin_consultora pueden ocultar evidencia ya subida — mismo
-- criterio que action_plan_evidence.
create policy quick_win_evidence_update on public.quick_win_evidence
for update using (
  exists (
    select 1 from public.quick_win_candidates c
    join public.quick_win_boards b on b.id = c.board_id
    where c.id = quick_win_evidence.candidate_id
      and (
        current_role_name() = 'admin_consultora'
        or (b.organization_id = current_org_id() and current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]))
      )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quick-win-evidencia',
  'quick-win-evidencia',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
);

create policy quick_win_evidencia_leer on storage.objects
for select using (
  bucket_id = 'quick-win-evidencia'
  and (current_role_name() = 'admin_consultora' or (split_part(name, '/', 1))::uuid = current_org_id())
);

create policy quick_win_evidencia_subir on storage.objects
for insert with check (
  bucket_id = 'quick-win-evidencia'
  and (split_part(name, '/', 1))::uuid = current_org_id()
);
