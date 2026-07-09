-- ============================================================
-- Endurecer el aislamiento entre organizaciones a nivel de rol.
--
-- Toda la RLS del sistema ya bloquea el acceso a datos de otras
-- organizaciones para cualquier rol que no sea admin_consultora. Pero
-- las políticas de escritura sobre profiles (profiles_insert,
-- profiles_update) solo validan que QUIEN actúa esté en su propia
-- organización — no validan qué rol se le está asignando a la fila.
--
-- Eso deja abierta una ruta: un admin_cliente (o un usuario editando
-- su propio perfil vía la rama id = auth.uid()) podría, con una
-- llamada directa a la API, asignarse el rol admin_consultora —
-- precisamente el único rol que salta el aislamiento por
-- organización. Este trigger lo bloquea a nivel de base de datos,
-- sin importar qué política de RLS haya dejado pasar el insert/update.
-- ============================================================

create or replace function prevent_admin_consultora_self_grant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.role = 'admin_consultora' and current_role_name() is distinct from 'admin_consultora' then
    raise exception 'Solo un usuario admin_consultora puede asignar el rol admin_consultora.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_prevent_escalation on profiles;
create trigger profiles_prevent_escalation
before insert or update on profiles
for each row execute function prevent_admin_consultora_self_grant();

-- ============================================================
-- Endurecimiento menor: profile_sites ya valida que el perfil
-- pertenezca a la organización de quien actúa, pero no validaba que
-- el SITIO asignado también perteneciera a esa misma organización.
-- En la práctica no exponía datos de otro cliente (todo lo demás en
-- el sistema exige además organization_id = current_org_id() sobre
-- el propio indicador/medición), pero cierra el vínculo cruzado.
-- ============================================================
drop policy if exists profile_sites_write on profile_sites;

create policy profile_sites_write on profile_sites for all using (
  current_role_name() = 'admin_consultora'
  or exists (
    select 1 from profiles p
    where p.id = profile_sites.profile_id
      and p.organization_id = current_org_id()
      and current_role_name() = 'admin_cliente'
  )
) with check (
  current_role_name() = 'admin_consultora'
  or (
    exists (
      select 1 from profiles p
      where p.id = profile_sites.profile_id
        and p.organization_id = current_org_id()
        and current_role_name() = 'admin_cliente'
    )
    and exists (
      select 1 from sites s
      where s.id = profile_sites.site_id and s.organization_id = current_org_id()
    )
  )
);
