-- ============================================================
-- Exige verificación en dos pasos (aal2) para que una sesión admin_consultora
-- conserve sus privilegios elevados. Se centraliza en current_role_name()
-- porque es la función que TODAS las políticas RLS usan para reconocer ese
-- rol — así no hay que tocar cada política una por una.
--
-- Si la cuenta es admin_consultora pero la sesión actual no completó el
-- segundo factor (aal2), esta función deja de reportar 'admin_consultora':
-- pierde el bypass entre organizaciones y queda, como máximo, viendo solo
-- la organización de su propio perfil (igual que un usuario normal) — o
-- sin ningún acceso si esa comparación tampoco aplica. Es un respaldo a
-- nivel de base de datos por si algo llegara a saltarse la pantalla de
-- verificación de la app (RequireAuth.tsx).
--
-- Requiere que la cuenta admin_consultora ya tenga un factor TOTP
-- verificado (src/features/account/AccountSecurityPage.tsx) — confirmado
-- antes de aplicar esta migración.
-- ============================================================

create or replace function public.current_role_name()
returns user_role
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when (select role from profiles where id = auth.uid()) = 'admin_consultora'
      and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
    then null
    else (select role from profiles where id = auth.uid())
  end;
$$;
