-- ============================================================
-- prevent_role_escalation() solo debe dispararse como trigger — Postgres
-- no exige privilegio EXECUTE para que un trigger lo haga, solo para
-- invocarlo directo (ej. /rest/v1/rpc/prevent_role_escalation). Este
-- proyecto otorga EXECUTE explícitamente por rol (anon/authenticated) a
-- las funciones nuevas del schema public, no vía PUBLIC — por eso el
-- primer intento de revocar "from public" no bastó; hay que revocar de
-- los roles reales.
-- ============================================================

revoke execute on function public.prevent_role_escalation() from anon, authenticated;
