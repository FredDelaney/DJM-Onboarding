create or replace function public.djm_complete_player_request(p_request_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select djm_os.complete_player_request_internal(p_request_id);
$function$;

revoke execute on function public.djm_complete_player_request(uuid) from public;
revoke execute on function public.djm_complete_player_request(uuid) from anon;
grant execute on function public.djm_complete_player_request(uuid) to authenticated;
