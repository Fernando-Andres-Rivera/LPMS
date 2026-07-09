-- ============================================================
-- Ampliar RLS de causal_analyses: el rol operativo debe poder
-- registrar el análisis causal (Ishikawa / 5 Porqués) de los
-- indicadores Nivel 1 de su(s) sitio(s), igual que ya puede
-- capturar sus mediciones. administrativo mantiene Nivel 1 y 2.
-- ============================================================

drop policy if exists causal_analyses_write on causal_analyses;

create policy causal_analyses_insert on causal_analyses for insert with check (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id() and (
      current_role_name() in ('admin_cliente', 'gerente')
      or exists (
        select 1 from indicators i
        where i.id = causal_analyses.indicator_id
          and (
            (current_role_name() = 'administrativo' and i.level in (1, 2) and user_has_site(i.site_id))
            or (current_role_name() = 'operativo' and i.level = 1 and user_has_site(i.site_id))
          )
      )
    )
  )
);

create policy causal_analyses_update on causal_analyses for update using (
  created_by = auth.uid()
  or current_role_name() in ('admin_consultora', 'admin_cliente', 'gerente')
);

create policy causal_analyses_delete on causal_analyses for delete using (
  current_role_name() in ('admin_consultora', 'admin_cliente', 'gerente')
);
