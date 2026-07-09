-- ============================================================
-- Etapa 3: Tablero SMQDC — planes de acción con formato estándar
--
-- Agrega las dos fechas que pedía el formato físico: cuándo ocurrió
-- el evento/problema, y cuándo se cerró realmente la acción (distinto
-- del plazo comprometido). Ambas nullable, sin afectar filas existentes.
-- ============================================================

alter table action_plans add column event_date date;
alter table action_plans add column closed_at timestamptz;

-- ============================================================
-- RLS: permitir que operativo también registre planes de acción
-- (el que detecta la novedad en piso debe poder lanzar la acción),
-- con la misma restricción de nivel/sitio que ya aplica a mediciones
-- y análisis causal.
-- ============================================================
drop policy if exists action_plans_write on action_plans;

create policy action_plans_insert on action_plans for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() in ('admin_cliente', 'gerente')
      or exists (
        select 1 from indicators i
        where i.id = action_plans.indicator_id
          and (
            (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
            or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
          )
      )
    )
  )
);

create policy action_plans_update on action_plans for update using (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() in ('admin_cliente', 'gerente')
      or created_by = auth.uid()
      or exists (
        select 1 from indicators i
        where i.id = action_plans.indicator_id
          and (
            (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
            or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
          )
      )
    )
  )
);

create policy action_plans_delete on action_plans for delete using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);
