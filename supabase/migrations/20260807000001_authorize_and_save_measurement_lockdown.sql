-- ============================================================
-- Mismo hallazgo que con prevent_role_escalation y
-- enforce_measurement_capture_lock: esta función nueva quedó con EXECUTE
-- otorgado a anon/authenticated automáticamente al crearla (privilegios
-- por defecto del esquema), y hay que revocarlo explícito por rol — un
-- "revoke ... from public" solo no alcanza. Solo authenticated puede
-- invocarla (la función misma exige además current_role_name() =
-- 'admin_consultora' adentro).
-- ============================================================

revoke execute on function public.authorize_and_save_measurement(
  uuid, date, uuid, text, numeric, text, uuid, numeric, numeric
) from public, anon;

grant execute on function public.authorize_and_save_measurement(
  uuid, date, uuid, text, numeric, text, uuid, numeric, numeric
) to authenticated;
