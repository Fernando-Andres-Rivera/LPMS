-- Bandera para identificar las organizaciones Demo creadas por auto-registro
-- público, para excluirlas de las listas de clientes reales y mostrarlas solo
-- en el reporte de registros.
alter table organizations add column if not exists is_demo boolean not null default false;

-- Aprovisiona automáticamente a quien se registra por su cuenta (signUp):
-- una organización Demo PROPIA y aislada + perfil admin_cliente de esa org,
-- con lo mínimo sembrado para que el app sea usable (sitio, pilares, unidades).
-- Los usuarios invitados por un admin traen invited_at y su perfil lo crea la
-- Edge Function invite-user — a esos el trigger los ignora.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_full_name text;
begin
  if new.invited_at is not null then
    return new;
  end if;
  if exists (select 1 from profiles where id = new.id) then
    return new;
  end if;

  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), new.email);

  insert into organizations (name, industry, is_demo, active)
  values ('Demo — ' || v_full_name, 'Demo', true, true)
  returning id into v_org_id;

  insert into profiles (id, organization_id, role, full_name, email)
  values (new.id, v_org_id, 'admin_cliente', v_full_name, new.email);

  insert into sites (organization_id, name)
  values (v_org_id, 'Sitio Demo');

  insert into organization_axes (organization_id, axis_id, active)
  select v_org_id, id, true from axes;

  insert into units (organization_id, name, created_by)
  select v_org_id, u.name, new.id
  from (values ('%'),('horas'),('horas-hombre'),('días'),('turnos'),
    ('accidentes'),('defectos'),('unidades no conformes'),('paradas'),
    ('minutos'),('kg'),('litros'),('$'),('ppm'),('piezas'),('puntos')) as u(name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
