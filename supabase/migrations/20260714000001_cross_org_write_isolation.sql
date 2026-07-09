-- ============================================================
-- Cerrar la brecha de escritura cruzada entre organizaciones.
--
-- Las políticas de UPDATE/DELETE de measurements y causal_analyses
-- (de las migraciones más viejas) solo validaban el ROL de quien
-- actúa — no que la fila perteneciera a su misma organización. Eso
-- permitía, con una llamada directa a la API (saltándose la interfaz),
-- que un admin_cliente o gerente modificara o borrara mediciones y
-- análisis de causa de OTRO cliente si conocía el id de la fila. La
-- lectura ya estaba aislada; esto alinea la escritura con el mismo
-- criterio que ya aplican action_plans y el resto del sistema:
-- admin_consultora ve todo, cualquier otro rol queda encerrado en
-- organization_id = current_org_id().
--
-- Sin cambio de comportamiento para el uso legítimo: cada quien
-- sigue pudiendo editar exactamente lo mismo que antes DENTRO de su
-- organización; lo único que se bloquea es tocar filas de otra.
-- ============================================================

-- ------------------------------------------------------------
-- measurements: no tiene organization_id directo, se resuelve
-- vía indicator_id -> indicators.organization_id.
-- ------------------------------------------------------------
drop policy if exists measurements_update on measurements;

create policy measurements_update on measurements for update using (
  current_role_name() = 'admin_consultora'
  or (
    exists (
      select 1 from indicators i
      where i.id = measurements.indicator_id and i.organization_id = current_org_id()
    )
    and (captured_by = auth.uid() or current_role_name() in ('admin_cliente', 'gerente'))
  )
);

drop policy if exists measurements_delete on measurements;

create policy measurements_delete on measurements for delete using (
  current_role_name() = 'admin_consultora'
  or (
    exists (
      select 1 from indicators i
      where i.id = measurements.indicator_id and i.organization_id = current_org_id()
    )
    and current_role_name() in ('admin_cliente', 'gerente')
  )
);

-- ------------------------------------------------------------
-- causal_analyses: tiene organization_id directo.
-- ------------------------------------------------------------
drop policy if exists causal_analyses_update on causal_analyses;

create policy causal_analyses_update on causal_analyses for update using (
  current_role_name() = 'admin_consultora'
  or (
    organization_id = current_org_id()
    and (created_by = auth.uid() or current_role_name() in ('admin_cliente', 'gerente'))
  )
);

drop policy if exists causal_analyses_delete on causal_analyses;

create policy causal_analyses_delete on causal_analyses for delete using (
  current_role_name() = 'admin_consultora'
  or (organization_id = current_org_id() and current_role_name() in ('admin_cliente', 'gerente'))
);
