-- Uniforma el borrado de registros a admin_consultora en toda la app.
-- No toca: action_plan_evidence, quick_win_evidence, measurement_edit_
-- authorizations (registros de calidad/auditoría, deliberadamente
-- inmutables) ni measurements (se corrigen vía autorización, no se borran).

-- ============================================================
-- organizations: no existía NINGUNA política de borrado — el botón
-- "Eliminar organización" en la UI (ya restringido a admin_consultora)
-- no hacía nada realmente.
-- ============================================================
create policy organizations_delete on public.organizations
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- causal_analyses: antes admin_consultora O admin_cliente/gerente del
-- cliente — se angosta a solo admin_consultora.
-- ============================================================
drop policy causal_analyses_delete on public.causal_analyses;
create policy causal_analyses_delete on public.causal_analyses
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- indicator_causes (árbol de causas): mismo angostamiento.
-- ============================================================
drop policy indicator_causes_delete on public.indicator_causes;
create policy indicator_causes_delete on public.indicator_causes
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- safety_events: antes el creador del evento O admin_consultora/
-- admin_cliente/gerente — se angosta a solo admin_consultora. Quien
-- reporta un evento ya no puede autoborrarlo si se equivocó; debe
-- pedirlo a LeanProLogistic.
-- ============================================================
drop policy safety_events_delete on public.safety_events;
create policy safety_events_delete on public.safety_events
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- action_plans: antes admin_consultora O admin_cliente/gerente — se
-- angosta a solo admin_consultora. OJO: causal_analyses -> action_plans
-- es ON DELETE CASCADE — borrar un análisis causal ya borraba (y sigue
-- borrando) los planes de acción que dependían de él; esto no cambia
-- ese comportamiento, solo restringe quién puede iniciarlo.
-- ============================================================
drop policy action_plans_delete on public.action_plans;
create policy action_plans_delete on public.action_plans
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- quick_win_boards: la política "ALL" existente se separa en
-- insert/update (mismo criterio de antes) + delete (solo admin_consultora).
-- ============================================================
drop policy quick_win_boards_write on public.quick_win_boards;

create policy quick_win_boards_insert on public.quick_win_boards
for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id()
    and (current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]) or user_has_site(site_id))
  )
);

create policy quick_win_boards_update on public.quick_win_boards
for update using (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id()
    and (current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]) or user_has_site(site_id))
  )
);

create policy quick_win_boards_delete on public.quick_win_boards
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- quick_win_candidates: mismo patrón de separación.
-- ============================================================
drop policy quick_win_candidates_write on public.quick_win_candidates;

create policy quick_win_candidates_insert on public.quick_win_candidates
for insert with check (
  exists (
    select 1 from public.quick_win_boards b
    where b.id = quick_win_candidates.board_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          b.organization_id = current_org_id()
          and (current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]) or user_has_site(b.site_id))
        )
      )
  )
);

create policy quick_win_candidates_update on public.quick_win_candidates
for update using (
  exists (
    select 1 from public.quick_win_boards b
    where b.id = quick_win_candidates.board_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          b.organization_id = current_org_id()
          and (current_role_name() = any (array['admin_cliente', 'gerente']::user_role[]) or user_has_site(b.site_id))
        )
      )
  )
);

create policy quick_win_candidates_delete on public.quick_win_candidates
for delete using (current_role_name() = 'admin_consultora');

-- ============================================================
-- targets: la política "ALL" existente (admin_consultora / admin_cliente /
-- gerente de nivel 2-3 / administrativo de nivel 1-2 en su sitio) se
-- separa en insert/update (mismo criterio) + delete (solo admin_consultora).
-- ============================================================
drop policy targets_write on public.targets;

create policy targets_insert on public.targets
for insert with check (
  exists (
    select 1 from public.indicators i
    where i.id = targets.indicator_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          i.organization_id = current_org_id()
          and (
            current_role_name() = 'admin_cliente'
            or (current_role_name() = 'gerente' and i.level = any (array[2, 3]))
            or (current_role_name() = 'administrativo' and i.level = any (array[1, 2]) and user_has_site(i.site_id))
          )
        )
      )
  )
);

create policy targets_update on public.targets
for update using (
  exists (
    select 1 from public.indicators i
    where i.id = targets.indicator_id
      and (
        current_role_name() = 'admin_consultora'
        or (
          i.organization_id = current_org_id()
          and (
            current_role_name() = 'admin_cliente'
            or (current_role_name() = 'gerente' and i.level = any (array[2, 3]))
            or (current_role_name() = 'administrativo' and i.level = any (array[1, 2]) and user_has_site(i.site_id))
          )
        )
      )
  )
);

create policy targets_delete on public.targets
for delete using (current_role_name() = 'admin_consultora');
