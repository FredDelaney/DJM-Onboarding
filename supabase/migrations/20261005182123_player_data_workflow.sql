-- Player data workflow. Server-only leases and transactional human corrections.
-- Reuses the canonical refresh ledger and career review/publication triggers.
create index if not exists player_source_refreshes_agency_stats_idx
 on public.player_source_refreshes(player_id, requested_at desc)
 where provider='agency_stats_refresh';

create or replace function public.platform_server_request_player_stats_refresh(
 p_tenant_id uuid, p_player_id uuid, p_actor_user_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_player public.players%rowtype; v_job public.player_source_refreshes%rowtype;
begin
 if not exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations'))
 then raise exception 'agency_operator_access_required'; end if;
 if p_request_id is null then raise exception 'refresh_request_id_required'; end if;
 select * into v_player from public.players where id=p_player_id and tenant_id=p_tenant_id for update;
 if not found then raise exception 'player_not_found'; end if;
 select * into v_job from public.player_source_refreshes where id=p_request_id;
 if found then
  if v_job.player_id<>p_player_id or v_job.provider<>'agency_stats_refresh' then raise exception 'refresh_request_conflict'; end if;
  return jsonb_build_object('dispatch',false,'job',jsonb_build_object('id',v_job.id,'status',v_job.status,'requested_at',v_job.requested_at,'completed_at',v_job.completed_at,'summary',v_job.summary,'context',v_job.raw_snapshot));
 end if;
 if nullif(trim(v_player.current_club),'') is null or lower(trim(v_player.current_club)) in ('soon','tbc','unknown')
  or nullif(trim(v_player.current_season_label),'') is null or nullif(trim(v_player.current_league),'') is null
 then raise exception 'current_season_context_required'; end if;
 -- A dead Edge invocation cannot leave the UI in a permanent running state.
 update public.player_source_refreshes set status='failed',completed_at=now(),updated_at=now(),
  error_text='Update did not complete within its time limit.',
  summary=jsonb_build_object('message','The update did not finish. Recorded figures are still available.','checked_at',null)
 where player_id=p_player_id and provider='agency_stats_refresh' and status in ('queued','running') and requested_at<now()-interval '2 minutes';
 select * into v_job from public.player_source_refreshes where player_id=p_player_id and provider='agency_stats_refresh'
  and status in ('queued','running') order by requested_at desc limit 1;
 if found then return jsonb_build_object('dispatch',false,'job',jsonb_build_object('id',v_job.id,'status',v_job.status,'requested_at',v_job.requested_at,'summary',v_job.summary,'context',v_job.raw_snapshot)); end if;
 insert into public.player_source_refreshes(id,player_id,source,provider,mode,capability,status,requested_by,raw_snapshot)
 values(p_request_id,p_player_id,'other','agency_stats_refresh','preview','reference_only','queued',p_actor_user_id,
  jsonb_build_object('season_label',v_player.current_season_label,'club_name',v_player.current_club,'league',v_player.current_league))
 returning * into v_job;
 return jsonb_build_object('dispatch',true,'job',jsonb_build_object('id',v_job.id,'status',v_job.status,'requested_at',v_job.requested_at,'summary',v_job.summary,'context',v_job.raw_snapshot));
end;
$function$;

create or replace function public.platform_server_player_stats_refresh_status(
 p_tenant_id uuid, p_player_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_job public.player_source_refreshes%rowtype;
begin
 if not exists(select 1 from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active'
  where p.id=p_player_id and p.tenant_id=p_tenant_id) then raise exception 'player_not_found'; end if;
 update public.player_source_refreshes set status='failed',completed_at=now(),updated_at=now(),
  error_text='Update did not complete within its time limit.',
  summary=jsonb_build_object('message','The update did not finish. Recorded figures are still available.','checked_at',null)
 where player_id=p_player_id and provider='agency_stats_refresh' and status in ('queued','running') and requested_at<now()-interval '2 minutes';
 select * into v_job from public.player_source_refreshes where player_id=p_player_id and provider='agency_stats_refresh' order by requested_at desc limit 1;
 if not found then return null; end if;
 return jsonb_build_object('id',v_job.id,'status',v_job.status,'requested_at',v_job.requested_at,'completed_at',v_job.completed_at,'summary',v_job.summary,'context',v_job.raw_snapshot);
end;
$function$;

create or replace function public.platform_server_save_current_player_stats(
 p_tenant_id uuid, p_player_id uuid, p_actor_user_id uuid,
 p_row_id uuid, p_expected_updated_at timestamptz, p_values jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_player public.players%rowtype; v_before public.career_entries%rowtype; v_after public.career_entries%rowtype;
 v_key text; v_number text; v_season text:=nullif(trim(p_values->>'season_label'),'');
 v_club text:=nullif(trim(p_values->>'club_name'),''); v_league text:=nullif(trim(p_values->>'league'),'');
 v_country text:=nullif(trim(p_values->>'country'),''); v_source text:=nullif(trim(p_values->>'source_name'),'');
 v_url text:=nullif(trim(p_values->>'source_url'),'');
begin
 if not exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations'))
 then raise exception 'agency_operator_access_required'; end if;
 select * into v_player from public.players where id=p_player_id and tenant_id=p_tenant_id for update;
 if not found then raise exception 'player_not_found'; end if;
 if exists(select 1 from public.player_source_refreshes where player_id=p_player_id and provider='agency_stats_refresh'
  and status in ('queued','running') and requested_at>=now()-interval '2 minutes')
 then raise exception 'player_stats_refresh_running'; end if;
 if v_season is null or v_club is null or v_league is null or length(v_season)>40 or length(v_club)>180 or length(v_league)>180 or length(v_country)>100
 then raise exception 'current_season_context_required'; end if;
 if v_source is null or length(v_source)>180 or v_url is null or length(v_url)>2000
  or v_url !~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$' or p_values->>'source_confirmed' is distinct from 'true'
 then raise exception 'reviewed_stats_source_required'; end if;
 foreach v_key in array array['appearances','starts','minutes','goals','assists'] loop
  v_number:=nullif(trim(p_values->>v_key),'');
  if v_number is not null and (v_number !~ '^[0-9]+$' or length(v_number)>10) then raise exception 'invalid_player_stats'; end if;
  if v_number is not null and v_number::numeric>2147483647 then raise exception 'invalid_player_stats'; end if;
 end loop;
 if coalesce(nullif(trim(p_values->>'appearances'),''),nullif(trim(p_values->>'starts'),''),nullif(trim(p_values->>'minutes'),''),nullif(trim(p_values->>'goals'),''),nullif(trim(p_values->>'assists'),'')) is null then raise exception 'recorded_stat_required'; end if;
 if nullif(trim(p_values->>'starts'),'')::integer > nullif(trim(p_values->>'appearances'),'')::integer then raise exception 'starts_exceed_appearances'; end if;
 if p_row_id is not null then
  select * into v_before from public.career_entries where id=p_row_id and player_id=p_player_id for update;
  if not found then raise exception 'player_stats_row_not_found'; end if;
  if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then raise exception 'player_stats_revision_conflict'; end if;
  -- A new context is a new season record, so earlier statistics remain history.
  if lower(replace(v_before.season_label,'/','-')) is distinct from lower(replace(v_season,'/','-'))
   or lower(trim(v_before.club_name)) is distinct from lower(v_club)
   or lower(trim(v_before.league)) is distinct from lower(v_league) then p_row_id:=null; end if;
 end if;
 if p_row_id is null then
  if exists(select 1 from public.career_entries where player_id=p_player_id
   and lower(replace(season_label,'/','-'))=lower(replace(v_season,'/','-')) and lower(trim(club_name))=lower(v_club) and lower(trim(league))=lower(v_league))
  then raise exception 'player_stats_row_exists'; end if;
 end if;
 -- Only the explicit form's season context is changed. Verification is handled
 -- by the established career-change trigger, never by this save.
 update public.players set current_season_label=v_season,current_club=v_club,current_league=v_league,current_country=v_country where id=p_player_id and tenant_id=p_tenant_id;
 if p_row_id is null then
  insert into public.career_entries(player_id,season_label,club_name,league,country,appearances,starts,minutes,goals,assists,source_name,source_url,source_provider,source_acceptance_method,source_reviewed_at,source_synced_at)
  values(p_player_id,v_season,v_club,v_league,v_country,nullif(trim(p_values->>'appearances'),'')::integer,nullif(trim(p_values->>'starts'),'')::integer,
   nullif(trim(p_values->>'minutes'),'')::integer,nullif(trim(p_values->>'goals'),'')::integer,nullif(trim(p_values->>'assists'),'')::integer,
   v_source,v_url,'manual','staff_reviewed_current_season',now(),null) returning * into v_after;
 else
  update public.career_entries set season_label=v_season,club_name=v_club,league=v_league,country=v_country,
   appearances=nullif(trim(p_values->>'appearances'),'')::integer,starts=nullif(trim(p_values->>'starts'),'')::integer,
   minutes=nullif(trim(p_values->>'minutes'),'')::integer,goals=nullif(trim(p_values->>'goals'),'')::integer,assists=nullif(trim(p_values->>'assists'),'')::integer,
   source_name=v_source,source_url=v_url,source_provider='manual',source_acceptance_method='staff_reviewed_current_season',source_reviewed_at=now(),source_synced_at=null,updated_at=now()
  where id=p_row_id and player_id=p_player_id returning * into v_after;
 end if;
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
 values(p_tenant_id,p_actor_user_id,'user','player_data.statistics_saved','player',p_player_id::text,
  coalesce(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after),jsonb_build_object('source_confirmed',true,'row_id',v_after.id));
 return jsonb_build_object('ok',true,'row',to_jsonb(v_after));
end;
$function$;

revoke all on function public.platform_server_request_player_stats_refresh(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_player_stats_refresh_status(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_save_current_player_stats(uuid,uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_request_player_stats_refresh(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_player_stats_refresh_status(uuid,uuid) to service_role;
grant execute on function public.platform_server_save_current_player_stats(uuid,uuid,uuid,uuid,timestamptz,jsonb) to service_role;
