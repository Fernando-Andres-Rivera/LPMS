-- Corrige un hueco de seguridad: la comprobación de rol usaba `<>`, pero
-- current_role_name() devuelve NULL cuando un admin_consultora no completó el
-- MFA (aal2). Como `NULL <> 'x'` no es TRUE en SQL, la excepción no disparaba
-- y una sesión sin segundo factor podía reescribir mediciones ya cerradas.
-- `IS DISTINCT FROM` trata NULL como distinto y sí bloquea.
create or replace function public.authorize_and_save_measurement(
  p_indicator_id uuid, p_period_date date, p_reason_id uuid, p_auth_comment text,
  p_value numeric, p_measurement_comment text, p_site_location_id uuid,
  p_planned_value numeric, p_real_value numeric
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_org_id uuid;
begin
  if current_role_name() is distinct from 'admin_consultora' then
    raise exception 'Solo LeanProLogistic puede autorizar una corrección.';
  end if;

  select organization_id into v_org_id from indicators where id = p_indicator_id;
  if v_org_id is null then
    raise exception 'Indicador no encontrado.';
  end if;

  insert into measurement_edit_authorizations
    (organization_id, indicator_id, period_date, reason_id, comment, authorized_by)
  values
    (v_org_id, p_indicator_id, p_period_date, p_reason_id, p_auth_comment, auth.uid());

  insert into measurements
    (indicator_id, period_date, value, comment, site_location_id, captured_by, planned_value, real_value)
  values
    (p_indicator_id, p_period_date, p_value, p_measurement_comment, p_site_location_id, auth.uid(), p_planned_value, p_real_value)
  on conflict (indicator_id, period_date) do update set
    value = excluded.value,
    comment = excluded.comment,
    site_location_id = excluded.site_location_id,
    captured_by = excluded.captured_by,
    planned_value = excluded.planned_value,
    real_value = excluded.real_value;
end;
$$;
