-- ============================================================
-- Corrige 20260718050105_restrict_anon_rpc_access.sql: esa migración
-- revocó EXECUTE solo del rol `anon`, pero Postgres otorga EXECUTE a
-- PUBLIC (todos los roles) por defecto al crear una función — revocar de
-- un rol puntual no quita el acceso heredado vía PUBLIC. Hay que revocar
-- de PUBLIC explícitamente y re-otorgar solo a `authenticated` donde
-- corresponde (las políticas RLS lo ejecutan en su nombre).
-- ============================================================

revoke execute on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated;

revoke execute on function public.current_role_name() from public;
grant execute on function public.current_role_name() to authenticated;

revoke execute on function public.user_has_site(uuid) from public;
grant execute on function public.user_has_site(uuid) to authenticated;

revoke execute on function public.gemba_user_has_location_site(uuid) from public;
grant execute on function public.gemba_user_has_location_site(uuid) to authenticated;

-- Funciones de trigger: nadie debe poder invocarlas directo por API.
revoke execute on function public.prevent_admin_consultora_self_grant() from public;
revoke execute on function public.fn_gemba_generar_plan() from public;
