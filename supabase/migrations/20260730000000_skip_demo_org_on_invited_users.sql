-- invite-user crea el usuario con admin.createUser() (sin invited_at) y
-- LUEGO inserta su perfil en una llamada separada — entre esas dos llamadas,
-- el trigger on_auth_user_created ya se disparó y, como todavía no existe
-- perfil para ese id, tomaba la misma rama que el auto-registro público:
-- crear una organización "Demo — {nombre}" + perfil admin_cliente. El
-- INSERT de invite-user chocaba después con ese perfil ya creado (mismo id)
-- y fallaba. Nunca se notó porque invite-user aún no se había usado para
-- un cliente real hasta ahora. Se agrega una bandera en user_metadata que
-- invite-user setea al crear el usuario, para que el trigger la reconozca
-- y no cree el entorno Demo en ese caso.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_full_name text;
begin
  if new.invited_at is not null then
    return new;
  end if;

  if (new.raw_user_meta_data->>'skip_demo_org') = 'true' then
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
$function$;
