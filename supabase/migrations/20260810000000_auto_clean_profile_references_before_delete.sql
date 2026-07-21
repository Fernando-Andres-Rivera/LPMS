-- Hasta ahora, borrar un perfil (desde el dashboard de Supabase, o cualquier
-- flujo futuro) fallaba con un error crudo de Postgres ("violates foreign key
-- constraint units_created_by_fkey...") si otras tablas todavía lo
-- referenciaban como "creado por" — solo la función delete-demo-signup sabía
-- limpiar eso primero. Este trigger lo hace automático para CUALQUIER
-- borrado de perfil, sin depender de que cada flujo se acuerde de llamarlo.
create or replace function public.null_references_before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.null_profile_references(old.id);
  return old;
end;
$$;

drop trigger if exists trg_null_references_before_profile_delete on public.profiles;
create trigger trg_null_references_before_profile_delete
before delete on public.profiles
for each row execute function public.null_references_before_profile_delete();
