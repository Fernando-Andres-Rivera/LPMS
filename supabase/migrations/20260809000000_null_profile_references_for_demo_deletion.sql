-- Antes de poder borrar un perfil (vía borrar su usuario de Auth, que
-- cascada a profiles), hay que limpiar toda referencia "creado por" que
-- otras tablas tengan hacia ese perfil (created_by, captured_by,
-- responsible_id, etc.) — esas columnas NO tienen cascada (a propósito,
-- para no perder el rastro de auditoría cuando alguien deja la empresa).
-- Para un registro Demo de prueba sí queremos limpiarlas por completo, ya
-- que toda esa data desaparece de todos modos al borrar la organización.
--
-- Se recorre information_schema en vez de listar las columnas a mano, para
-- que siga funcionando aunque en el futuro se agreguen más tablas con una
-- referencia a profiles(id).
create or replace function public.null_profile_references(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'profiles'
      and tc.table_name <> 'profiles'
      and rc.delete_rule <> 'CASCADE'
  loop
    execute format('update %I set %I = null where %I = $1', r.table_name, r.column_name, r.column_name)
      using p_user_id;
  end loop;
end;
$$;

-- Solo la service role (Edge Function delete-demo-signup, que ya revalida
-- admin_consultora antes de llegar aquí) debe poder llamar esto.
revoke execute on function public.null_profile_references(uuid) from public, anon, authenticated;
