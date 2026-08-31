create or replace function public.djm_service_global_peer_cache_status(p_provider text,p_provider_competition_id text,p_provider_season_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_count integer; v_latest timestamptz;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 select count(*),max(synced_at) into v_count,v_latest from djm_os.provider_peer_stat_snapshots where provider=p_provider and provider_competition_id=p_provider_competition_id and provider_season_id=p_provider_season_id;
 return jsonb_build_object('count',coalesce(v_count,0),'latest',v_latest,'fresh',coalesce(v_count,0)>=20 and v_latest>now()-interval '24 hours');
end; $$;
revoke all on function public.djm_service_global_peer_cache_status(text,text,text) from public,anon,authenticated;
grant execute on function public.djm_service_global_peer_cache_status(text,text,text) to service_role;