-- ============================================================
-- Un usuario autenticado no puede, llamando la API directamente (sin pasar
-- por la UI ni por la Edge Function de invitación), asignarse o asignarle
-- a otro perfil el rol admin_consultora, ni cambiar su propio rol u
-- organización editando su propia fila. Las políticas RLS de profiles
-- (profiles_insert/profiles_update) permiten a admin_cliente escribir
-- CUALQUIER rol dentro de su organización, y permiten a cualquier usuario
-- actualizar su propia fila sin restringir qué columnas — ninguna de las
-- dos valida el valor de `role`. Este trigger cierra esa ruta de raíz,
-- sin importar cuál rama de la política haya dejado pasar la operación.
--
-- Conexiones sin JWT (service_role: esta migración, o la Edge Function
-- invite-user) son infraestructura propia con su propia autorización — no
-- se restringen aquí a propósito.
-- ============================================================

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if current_role_name() = 'admin_consultora' then
    return new;
  end if;

  if new.role = 'admin_consultora' then
    raise exception 'Solo admin_consultora puede asignar ese rol.';
  end if;

  if tg_op = 'UPDATE' and new.id = auth.uid()
     and (new.role <> old.role or new.organization_id <> old.organization_id) then
    raise exception 'No puedes cambiar tu propio rol u organización.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on profiles;
create trigger trg_prevent_role_escalation
  before insert or update on profiles
  for each row execute function prevent_role_escalation();
