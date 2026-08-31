create or replace function public.djm_service_upsert_global_subject_evidence(p_subject_id uuid,p_provider text,p_snapshot jsonb,p_peers jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  v_provider_player_id text:=nullif(btrim(p_snapshot->>'provider_player_id'),'');
  v_provider_team_id text:=coalesce(nullif(btrim(p_snapshot->>'provider_team_id'),''),'');
  v_provider_competition_id text:=coalesce(nullif(btrim(p_snapshot->>'provider_competition_id'),''),'');
  v_provider_season_id text:=nullif(btrim(p_snapshot->>'provider_season_id'),'');
  v_count integer:=0;
  v_ids jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  if nullif(btrim(coalesce(p_provider,'')),'') is null then raise exception 'Provider required'; end if;
  if v_provider_player_id is null or v_provider_season_id is null then raise exception 'Provider player and season required'; end if;
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then raise exception 'Football intelligence subject not found'; end if;

  insert into djm_os.football_subject_provider_snapshots(subject_id,provider,provider_player_id,provider_team_id,provider_competition_id,provider_season_id,season_label,club_name,competition_name,metrics,metric_schema_version,data_depth,confidence,provenance,observed_at,synced_at,updated_at)
  values(p_subject_id,p_provider,v_provider_player_id,v_provider_team_id,v_provider_competition_id,v_provider_season_id,nullif(p_snapshot->>'season_label',''),nullif(p_snapshot->>'club_name',''),nullif(p_snapshot->>'competition_name',''),coalesce(p_snapshot->'metrics','{}'::jsonb),coalesce(nullif(p_snapshot->>'metric_schema_version',''),'djm_global_basic_v1'),coalesce(nullif(p_snapshot->>'data_depth',''),'basic_global'),coalesce(nullif(p_snapshot->>'confidence','')::numeric,.9),coalesce(p_snapshot->'provenance','{}'::jsonb),coalesce(nullif(p_snapshot->>'observed_at','')::timestamptz,now()),now(),now())
  on conflict(subject_id,provider,provider_season_id,provider_competition_id,provider_team_id) do update set provider_player_id=excluded.provider_player_id,season_label=excluded.season_label,club_name=excluded.club_name,competition_name=excluded.competition_name,metrics=excluded.metrics,metric_schema_version=excluded.metric_schema_version,data_depth=excluded.data_depth,confidence=excluded.confidence,provenance=excluded.provenance,observed_at=excluded.observed_at,synced_at=now(),updated_at=now();

  if jsonb_typeof(p_peers)='array' and jsonb_array_length(p_peers)>=6 and v_provider_competition_id<>'' then
    delete from djm_os.provider_peer_stat_snapshots where provider=p_provider and provider_competition_id=v_provider_competition_id and provider_season_id=v_provider_season_id;
    insert into djm_os.provider_peer_stat_snapshots(provider,provider_competition_id,provider_season_id,provider_player_id,provider_team_id,player_name,team_name,provider_position,minutes,metrics,metric_schema_version,data_depth,confidence,request_metadata,observed_at,synced_at,updated_at)
    select p_provider,v_provider_competition_id,v_provider_season_id,r.provider_player_id,coalesce(r.provider_team_id,''),r.player_name,r.team_name,r.provider_position,r.minutes,coalesce(r.metrics,'{}'::jsonb),coalesce(r.metric_schema_version,'djm_global_basic_v1'),coalesce(r.data_depth,'basic_global'),coalesce(r.confidence,.9),coalesce(r.request_metadata,'{}'::jsonb),coalesce(r.observed_at,now()),now(),now()
    from jsonb_to_recordset(p_peers) as r(provider_player_id text,provider_team_id text,player_name text,team_name text,provider_position text,minutes integer,metrics jsonb,metric_schema_version text,data_depth text,confidence numeric,request_metadata jsonb,observed_at timestamptz)
    where nullif(btrim(coalesce(r.provider_player_id,'')),'') is not null
    on conflict(provider,provider_competition_id,provider_season_id,provider_player_id,provider_team_id) do update set player_name=excluded.player_name,team_name=excluded.team_name,provider_position=excluded.provider_position,minutes=excluded.minutes,metrics=excluded.metrics,metric_schema_version=excluded.metric_schema_version,data_depth=excluded.data_depth,confidence=excluded.confidence,request_metadata=excluded.request_metadata,observed_at=excluded.observed_at,synced_at=now(),updated_at=now();
    get diagnostics v_count=row_count;
  end if;

  v_ids:=coalesce(s.football_provider_ids,'{}'::jsonb)||jsonb_build_object(p_provider,v_provider_player_id);
  update djm_os.football_intelligence_subjects set football_provider_ids=v_ids,current_club=coalesce(nullif(p_snapshot->>'club_name',''),current_club),current_league=coalesce(nullif(p_snapshot->>'competition_name',''),current_league),current_country=coalesce(nullif(p_snapshot->>'country',''),current_country),current_season_label=coalesce(nullif(p_snapshot->>'season_label',''),current_season_label),external_data_status='ready',external_data_checked_at=now(),external_data_error=null,updated_at=now() where id=p_subject_id;

  perform djm_os.refresh_football_subject_scorecard(p_subject_id);
  return jsonb_build_object('ok',true,'subject_id',p_subject_id,'provider',p_provider,'provider_player_id',v_provider_player_id,'peer_rows',v_count);
end; $$;
revoke all on function public.djm_service_upsert_global_subject_evidence(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.djm_service_upsert_global_subject_evidence(uuid,text,jsonb,jsonb) to service_role;