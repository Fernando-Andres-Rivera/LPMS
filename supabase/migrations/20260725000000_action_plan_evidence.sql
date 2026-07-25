-- Evidencia (fotos, PDF) adjunta a un plan de acción — control de registros
-- de calidad para auditorías: quién la subió, cuándo, y a qué plan queda
-- ligada. No se borra nunca de verdad (soft-delete vía `active`): un
-- registro de calidad no debe poder desaparecer sin dejar rastro.
create table public.action_plan_evidence (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid not null references public.action_plans(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  active boolean not null default true
);

create index idx_action_plan_evidence_plan on public.action_plan_evidence (action_plan_id);

alter table public.action_plan_evidence enable row level security;

-- Mismo criterio de visibilidad que action_plans: admin_consultora ve todo,
-- el resto solo lo de su organización.
create policy action_plan_evidence_select on public.action_plan_evidence
for select using (
  exists (
    select 1 from public.action_plans ap
    where ap.id = action_plan_evidence.action_plan_id
      and (current_role_name() = 'admin_consultora' or ap.organization_id = current_org_id())
  )
);

-- Mismo criterio que action_plans_insert/update: quien puede gestionar el
-- plan (crearlo, o el rol/sitio que le da acceso a ese indicador) puede
-- adjuntarle evidencia.
create policy action_plan_evidence_insert on public.action_plan_evidence
for insert with check (
  exists (
    select 1 from public.action_plans ap
    where ap.id = action_plan_evidence.action_plan_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          ap.organization_id = current_org_id()
          and (
            current_role_name() = any (array['admin_cliente', 'gerente']::user_role[])
            or ap.created_by = auth.uid()
            or exists (
              select 1 from public.indicators i
              where i.id = ap.indicator_id
                and (
                  (current_role_name() = 'administrativo' and i.level = any (array[1, 2]) and user_has_site(i.site_id))
                  or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
                )
            )
          )
        )
      )
  )
);

-- Solo quien puede borrar el plan (admin_consultora / admin_cliente /
-- gerente) puede desactivar evidencia ya subida — un operativo puede
-- adjuntar pero no ocultar evidencia después de subida.
create policy action_plan_evidence_update on public.action_plan_evidence
for update using (
  exists (
    select 1 from public.action_plans ap
    where ap.id = action_plan_evidence.action_plan_id
      and (
        current_role_name() = 'admin_consultora'
        or (ap.organization_id = current_org_id() and current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]))
      )
  )
);

-- Bucket privado dedicado (separado de gemba-evidencia) para que una
-- auditoría de calidad pueda acotarse claramente a "evidencia de planes de
-- acción". Ruta: {organization_id}/{action_plan_id}/{archivo} — mismo
-- patrón ya probado en gemba-evidencia para el RLS de storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plan-accion-evidencia',
  'plan-accion-evidencia',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
);

create policy plan_accion_evidencia_leer on storage.objects
for select using (
  bucket_id = 'plan-accion-evidencia'
  and (current_role_name() = 'admin_consultora' or (split_part(name, '/', 1))::uuid = current_org_id())
);

create policy plan_accion_evidencia_subir on storage.objects
for insert with check (
  bucket_id = 'plan-accion-evidencia'
  and (split_part(name, '/', 1))::uuid = current_org_id()
);
