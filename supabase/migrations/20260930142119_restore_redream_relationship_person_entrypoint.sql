-- Restore the browser entry point without replacing newer relationship memory logic.
create or replace function public.redream_relationship_person(
  p_person_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  return public.platform_server_relationship_person(
    v_tenant,
    p_person_id
  );
end;
$function$;

revoke all on function public.platform_server_relationship_person(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.platform_server_relationship_person(uuid, uuid)
to postgres, service_role;

revoke all on function public.redream_relationship_person(uuid)
from public, anon;

grant execute on function public.redream_relationship_person(uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';
