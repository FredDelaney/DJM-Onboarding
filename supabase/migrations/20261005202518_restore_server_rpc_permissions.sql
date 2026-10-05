-- Restore the existing server-only boundary. No function bodies or data change.
revoke all on function public.platform_server_player_portal_review(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.platform_server_save_deal_closeout(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.platform_server_player_portal_review(uuid,uuid,integer) to service_role;
grant execute on function public.platform_server_save_deal_closeout(uuid,uuid,uuid,jsonb) to service_role;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('platform_server_player_portal_review','platform_server_save_deal_closeout')
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))
  ) then
    raise exception 'server_rpc_client_access_still_enabled';
  end if;
end;
$$;

notify pgrst, 'reload schema';
