-- ============================================================
-- La pantalla de Captura hacía "autorizar" y "guardar" como dos llamadas
-- HTTP separadas y secuenciales — verificado en producción: la segunda
-- llamada a veces no encontraba la autorización recién insertada por la
-- primera (carrera entre dos transacciones/conexiones distintas del
-- pooler), y el guardado quedaba rechazado aunque la autorización sí
-- existiera. La solución correcta no es un retraso artificial del lado
-- del cliente, sino una función que hace ambas cosas en UNA sola
-- transacción atómica.
--
-- SECURITY DEFINER + verificación manual del rol adentro: como esta
-- función bypassea RLS, ella misma tiene que exigir admin_consultora, o
-- cualquier usuario autenticado podría autorizarse a sí mismo.
-- ============================================================

create or replace function public.authorize_and_save_measurement(
  p_indicator_id uuid,
  p_period_date date,
  p_reason_id uuid,
  p_auth_comment text,
  p_value numeric,
  p_measurement_comment text,
  p_site_location_id uuid,
  p_planned_value numeric,
  p_real_value numeric
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
begin
  if current_role_name() <> 'admin_consultora' then
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

revoke execute on function public.authorize_and_save_measurement(
  uuid, date, uuid, text, numeric, text, uuid, numeric, numeric
) from public;
grant execute on function public.authorize_and_save_measurement(
  uuid, date, uuid, text, numeric, text, uuid, numeric, numeric
) to authenticated;
