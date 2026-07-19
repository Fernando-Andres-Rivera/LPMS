-- ============================================================
-- Endurecimiento de seguridad: la app siempre exige login (no hay flujo
-- anónimo), así que el rol `anon` de PostgREST no necesita poder invocar
-- los ayudantes internos de RLS directo vía /rest/v1/rpc/*. `authenticated`
-- conserva el permiso porque las políticas RLS los ejecutan en su nombre.
--
-- prevent_admin_consultora_self_grant y fn_gemba_generar_plan son
-- funciones de TRIGGER — nunca deben invocarse directo por API; Postgres
-- las ejecuta desde el trigger sin necesitar permiso de ejecución directo
-- del rol que dispara el evento, así que se les retira a ambos roles.
-- ============================================================

revoke execute on function public.current_org_id() from anon;
revoke execute on function public.current_role_name() from anon;
revoke execute on function public.user_has_site(uuid) from anon;
revoke execute on function public.gemba_user_has_location_site(uuid) from anon;

revoke execute on function public.prevent_admin_consultora_self_grant() from anon, authenticated;
revoke execute on function public.fn_gemba_generar_plan() from anon, authenticated;
