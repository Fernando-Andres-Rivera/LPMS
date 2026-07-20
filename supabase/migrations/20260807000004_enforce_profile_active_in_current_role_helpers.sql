-- Un perfil desactivado (active = false) debe perder acceso a TODO de
-- inmediato. current_role_name()/current_org_id() alimentan toda la RLS, así
-- que se filtran por `active` — un usuario inactivo deja de resolver su rol y
-- su organización, por lo que ninguna política le concede lectura ni escritura.
create or replace function public.current_org_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select organization_id from profiles where id = auth.uid() and active;
$$;

create or replace function public.current_role_name()
returns user_role
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when (select role from profiles where id = auth.uid() and active) = 'admin_consultora'
      and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
    then null
    else (select role from profiles where id = auth.uid() and active)
  end;
$$;
