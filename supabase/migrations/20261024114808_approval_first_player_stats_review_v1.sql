-- Stage sourced statistics in the existing refresh ledger. Canonical figures,
-- verification and public snapshots change only after an operator's decision.
create index if not exists player_source_refreshes_stats_proposal_idx
 on public.player_source_refreshes(player_id,requested_at desc) where provider='agency_stats_proposal_v1';

create or replace function private.guard_player_stats_proposal()
returns trigger language plpgsql set search_path='' as $function$
begin
 if tg_op='TRUNCATE' then
  if current_setting('role') not in ('service_role','postgres','none') then raise exception 'player_stats_proposal_server_only'; end if;
  return null;
 end if;
 if (case when tg_op='INSERT' then new.provider='agency_stats_proposal_v1'
          when tg_op='DELETE' then old.provider='agency_stats_proposal_v1'
          else old.provider='agency_stats_proposal_v1' or new.provider='agency_stats_proposal_v1' end)
    and current_setting('role') not in ('service_role','postgres','none') then
  raise exception 'player_stats_proposal_server_only';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$;
revoke all on function private.guard_player_stats_proposal() from public,anon,authenticated;
create trigger guard_player_stats_proposal before insert or update or delete on public.player_source_refreshes
 for each row execute function private.guard_player_stats_proposal();
create trigger guard_player_stats_proposal_truncate before truncate on public.player_source_refreshes
 for each statement execute function private.guard_player_stats_proposal();

-- Legacy admin policies remain intact for older refreshes. New review records
-- additionally require canonical tenancy and an active operator membership.
create policy player_stats_proposal_tenant_boundary on public.player_source_refreshes
 as restrictive for all to authenticated
 using (provider<>'agency_stats_proposal_v1' or exists(
  select 1 from public.players p join platform.tenant_memberships m on m.tenant_id=p.tenant_id
   join platform.tenants t on t.id=p.tenant_id and t.status='active'
  where p.id=player_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','agent','operations')
 ))
 with check (provider<>'agency_stats_proposal_v1');

create or replace function private.player_stats_review_values(p_values jsonb)
returns jsonb language plpgsql immutable set search_path='' as $function$
declare v_key text; v_text text; v_result jsonb:='{}';
begin
 foreach v_key in array array['appearances','starts','minutes','goals','assists'] loop
  v_text:=nullif(trim(p_values->>v_key),'');
  if v_text is not null and (v_text !~ '^[0-9]+$' or length(v_text)>10) then raise exception 'invalid_player_stats'; end if;
  if v_text is not null and v_text::numeric>2147483647 then raise exception 'invalid_player_stats'; end if;
  v_result:=v_result||jsonb_build_object(v_key,v_text::integer);
 end loop;
 if not exists(select 1 from jsonb_each(v_result) e where e.value<>'null'::jsonb) then raise exception 'recorded_stat_required'; end if;
 if (v_result->>'starts')::integer>(v_result->>'appearances')::integer then raise exception 'starts_exceed_appearances'; end if;
 return v_result;
end;
$function$;
revoke all on function private.player_stats_review_values(jsonb) from public,anon,authenticated;

create or replace function public.platform_server_stage_player_stats_review(
 p_player_id uuid,p_row_id uuid,p_expected_updated_at timestamptz,p_expected_context jsonb,
 p_context jsonb,p_values jsonb,p_sources jsonb,p_confidence numeric,p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_player public.players%rowtype; v_row public.career_entries%rowtype; v_job public.player_source_refreshes%rowtype;
 v_before jsonb; v_values jsonb; v_context jsonb; v_player_context jsonb; v_sources jsonb; v_source jsonb;
 v_url text; v_host text; v_hosts text[]:='{}'; v_fingerprint text; v_actor uuid; v_count integer;
begin
 select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active' where p.id=p_player_id for update of p;
 if not found then raise exception 'player_not_found'; end if;
 v_player_context:=jsonb_build_object('season_label',v_player.current_season_label,'club_name',v_player.current_club,'league',v_player.current_league);
 if p_expected_context is distinct from v_player_context then raise exception 'player_stats_context_changed'; end if;
 v_context:=jsonb_build_object('season_label',nullif(trim(p_context->>'season_label'),''),'club_name',nullif(trim(p_context->>'club_name'),''),'league',nullif(trim(p_context->>'league'),''),'country',nullif(trim(p_context->>'country'),''));
 if nullif(v_context->>'season_label','') is null or nullif(v_context->>'club_name','') is null or nullif(v_context->>'league','') is null
  or length(v_context->>'season_label')>40 or length(v_context->>'club_name')>180 or length(v_context->>'league')>180 or length(v_context->>'country')>100
 then raise exception 'current_season_context_required'; end if;
 v_values:=private.player_stats_review_values(p_values);
 if p_confidence is null or p_confidence<0.85 or p_confidence>1 then raise exception 'player_stats_evidence_required'; end if;
 if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources)<2 or jsonb_array_length(p_sources)>8 then raise exception 'player_stats_evidence_required'; end if;
 v_sources:='[]';
 for v_source in select value from jsonb_array_elements(p_sources) loop
  v_url:=trim(v_source->>'url');
  if v_url is null or length(v_url)>2000 or v_url !~ '^https?://[^/?#@:[:space:]]+(\:[0-9]+)?([/?#][^[:space:]]*)?$' then raise exception 'player_stats_evidence_required'; end if;
  v_host:=lower(regexp_replace(split_part(split_part(v_url,'://',2),'/',1),'^www\.',''));
  v_host:=split_part(split_part(split_part(v_host,':',1),'?',1),'#',1);
  if not v_host=any(v_hosts) then v_hosts:=array_append(v_hosts,v_host); end if;
  v_sources:=v_sources||jsonb_build_array(jsonb_build_object('url',v_url,'title',left(coalesce(nullif(trim(v_source->>'title'),''),v_host),180)));
 end loop;
 if cardinality(v_hosts)<2 then raise exception 'player_stats_evidence_required'; end if;
 if p_row_id is not null then
  select * into v_row from public.career_entries where id=p_row_id and player_id=p_player_id for update;
  if not found or p_expected_updated_at is null or v_row.updated_at is distinct from p_expected_updated_at then raise exception 'player_stats_revision_conflict'; end if;
  -- The worker may resolve a parent-club label to its reserve side, but cannot
  -- retarget an existing row to a different season, side or competition.
  if v_context is distinct from jsonb_build_object('season_label',v_row.season_label,'club_name',v_row.club_name,'league',v_row.league,'country',v_row.country) then raise exception 'player_stats_context_changed'; end if;
  v_before:=jsonb_build_object('appearances',v_row.appearances,'starts',v_row.starts,'minutes',v_row.minutes,'goals',v_row.goals,'assists',v_row.assists);
 else
  if exists(select 1 from public.career_entries where player_id=p_player_id and lower(trim(season_label))=lower(v_context->>'season_label') and lower(trim(club_name))=lower(v_context->>'club_name') and lower(trim(league))=lower(v_context->>'league')) then raise exception 'player_stats_row_exists'; end if;
  v_before:=jsonb_build_object('appearances',null,'starts',null,'minutes',null,'goals',null,'assists',null);
 end if;
 if v_values=v_before then return jsonb_build_object('status','unchanged','review_id',null); end if;
 v_fingerprint:=md5(jsonb_build_object('row_id',p_row_id,'revision',p_expected_updated_at,'player_context',v_player_context,'context',v_context,'before',v_before,'proposed',v_values,'sources',v_sources)::text);
 select * into v_job from public.player_source_refreshes where player_id=p_player_id and provider='agency_stats_proposal_v1' and payload_hash=v_fingerprint order by requested_at desc limit 1;
 if found then return jsonb_build_object('status',v_job.status,'review_id',v_job.id); end if;
 -- One decision at a time. A second worker must not replace an open review.
 select * into v_job from public.player_source_refreshes where player_id=p_player_id and provider='agency_stats_proposal_v1' and status='needs_review' order by requested_at desc limit 1;
 if found then return jsonb_build_object('status',v_job.status,'review_id',v_job.id); end if;
 if p_request_id is not null then
  select requested_by into v_actor from public.player_source_refreshes where id=p_request_id and player_id=p_player_id and provider='agency_stats_refresh' and status in ('queued','running');
  if not found then raise exception 'player_stats_refresh_request_invalid'; end if;
 end if;
 select count(*) into v_count from jsonb_each(v_values) e where e.value is distinct from v_before->e.key;
 insert into public.player_source_refreshes(player_id,source,source_url,provider,mode,capability,status,requested_by,started_at,completed_at,raw_snapshot,summary,facts_discovered,review_required,accepted_count,rejected_count,payload_hash)
 values(p_player_id,'other',v_sources->0->>'url','agency_stats_proposal_v1','preview','reference_only','needs_review',v_actor,now(),now(),
  jsonb_build_object('version',1,'row_id',p_row_id,'expected_updated_at',p_expected_updated_at,'player_context',v_player_context,'context',v_context,'before',v_before,'proposed',v_values,'sources',v_sources),
  jsonb_build_object('message','New figures are ready to review. Recorded statistics have not changed.','confidence',p_confidence,'checked_at',now()),v_count,v_count,0,0,v_fingerprint) returning * into v_job;
 insert into djm_os.review_items(tenant_id,owner_user_id,review_type,title,detail,player_id,confidence,payload)
 values(v_player.tenant_id,
  case when exists(select 1 from djm_os.team_members tm join platform.tenant_memberships m on m.user_id=tm.user_id and m.tenant_id=v_player.tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations') where tm.user_id=v_actor and tm.is_active) then v_actor end,
  'player_statistics','Review sourced player statistics','Compare the recorded figures with the suggested update before accepting.',p_player_id,p_confidence,jsonb_build_object('stats_review_id',v_job.id));
 return jsonb_build_object('status',v_job.status,'review_id',v_job.id);
end;
$function$;

create or replace function public.platform_server_player_stats_review_status(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_job public.player_source_refreshes%rowtype;
begin
 if not exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations')) then raise exception 'agency_operator_access_required'; end if;
 if not exists(select 1 from public.players where id=p_player_id and tenant_id=p_tenant_id) then raise exception 'player_not_found'; end if;
 select * into v_job from public.player_source_refreshes where player_id=p_player_id and provider='agency_stats_proposal_v1' order by requested_at desc,id desc limit 1;
 if not found then return null; end if;
 -- Deliberate projection: no raw career notes, internal audit or model prompt.
 return jsonb_build_object('id',v_job.id,'status',v_job.status,'checked_at',v_job.summary->'checked_at','confidence',v_job.summary->'confidence',
  'context',v_job.raw_snapshot->'context','before',v_job.raw_snapshot->'before','proposed',v_job.raw_snapshot->'proposed','sources',v_job.raw_snapshot->'sources',
  'row_id',v_job.raw_snapshot->'row_id','expected_updated_at',v_job.raw_snapshot->'expected_updated_at','decision',v_job.summary->'decision');
end;
$function$;

create or replace function public.platform_server_review_player_stats(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_review_id uuid,p_decision text,p_values jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_player public.players%rowtype; v_job public.player_source_refreshes%rowtype; v_before public.career_entries%rowtype; v_after public.career_entries%rowtype;
 v_context jsonb; v_values jsonb; v_audit_before jsonb; v_url text; v_source text; v_status text; v_row_id uuid; v_expected timestamptz;
begin
 if not exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations')) then raise exception 'agency_operator_access_required'; end if;
 if p_decision is null or p_decision not in ('accept','edit','reject') then raise exception 'player_stats_review_decision_required'; end if;
 select * into v_player from public.players where id=p_player_id and tenant_id=p_tenant_id for update;
 if not found then raise exception 'player_not_found'; end if;
 select * into v_job from public.player_source_refreshes where id=p_review_id and player_id=p_player_id and provider='agency_stats_proposal_v1' for update;
 if not found then raise exception 'player_stats_review_not_found'; end if;
 if v_job.status<>'needs_review' then
  if v_job.summary->>'decision'=p_decision and (p_decision<>'edit' or v_job.summary->>'edit_fingerprint'=md5(p_values::text)) then return jsonb_build_object('ok',true,'review_id',v_job.id,'status',v_job.status,'replayed',true); end if;
  raise exception 'player_stats_review_already_resolved';
 end if;
 v_context:=v_job.raw_snapshot->'context';
 v_audit_before:=v_job.raw_snapshot->'before';
 if p_decision='reject' then
  select * into v_before from public.career_entries where id=(v_job.raw_snapshot->>'row_id')::uuid and player_id=p_player_id;
  v_audit_before:=jsonb_build_object('appearances',v_before.appearances,'starts',v_before.starts,'minutes',v_before.minutes,'goals',v_before.goals,'assists',v_before.assists);
 end if;
 if p_decision<>'reject' then
  if jsonb_build_object('season_label',v_player.current_season_label,'club_name',v_player.current_club,'league',v_player.current_league) is distinct from v_job.raw_snapshot->'player_context' then raise exception 'player_stats_context_changed'; end if;
  v_row_id:=(v_job.raw_snapshot->>'row_id')::uuid;v_expected:=(v_job.raw_snapshot->>'expected_updated_at')::timestamptz;
  if v_row_id is not null then
   select * into v_before from public.career_entries where id=v_row_id and player_id=p_player_id for update;
   if not found or v_before.updated_at is distinct from v_expected
     or jsonb_build_object('appearances',v_before.appearances,'starts',v_before.starts,'minutes',v_before.minutes,'goals',v_before.goals,'assists',v_before.assists) is distinct from v_job.raw_snapshot->'before'
     or jsonb_build_object('season_label',v_before.season_label,'club_name',v_before.club_name,'league',v_before.league,'country',v_before.country) is distinct from v_context then raise exception 'player_stats_revision_conflict'; end if;
  elsif exists(select 1 from public.career_entries where player_id=p_player_id and lower(trim(season_label))=lower(v_context->>'season_label') and lower(trim(club_name))=lower(v_context->>'club_name') and lower(trim(league))=lower(v_context->>'league')) then raise exception 'player_stats_row_exists'; end if;
  v_values:=private.player_stats_review_values(case when p_decision='edit' then p_values else v_job.raw_snapshot->'proposed' end);
  v_url:=case when p_decision='edit' then nullif(trim(p_values->>'source_url'),'') else v_job.source_url end;
  v_source:=case when p_decision='edit' then nullif(trim(p_values->>'source_name'),'') else 'Cross-checked public football statistics' end;
  if v_source is null or length(v_source)>180 or v_url is null or length(v_url)>2000 or v_url !~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
    or (p_decision='edit' and p_values->>'source_confirmed' is distinct from 'true') then raise exception 'reviewed_stats_source_required'; end if;
  -- Keep the player's current-club identity intact, including parent/reserve labels.
  -- Established career triggers require verification and unpublish the old snapshot.
  if v_row_id is null then
   insert into public.career_entries(player_id,season_label,club_name,league,country,appearances,starts,minutes,goals,assists,source_name,source_url,source_provider,source_acceptance_method,source_reviewed_at,source_synced_at)
   values(p_player_id,v_context->>'season_label',v_context->>'club_name',v_context->>'league',v_context->>'country',(v_values->>'appearances')::integer,(v_values->>'starts')::integer,(v_values->>'minutes')::integer,(v_values->>'goals')::integer,(v_values->>'assists')::integer,
    v_source,v_url,case when p_decision='edit' then 'manual' else 'public_web_evidence' end,'staff_reviewed_sourced_proposal',now(),(v_job.summary->>'checked_at')::timestamptz) returning * into v_after;
  else
   update public.career_entries set appearances=(v_values->>'appearances')::integer,starts=(v_values->>'starts')::integer,minutes=(v_values->>'minutes')::integer,goals=(v_values->>'goals')::integer,assists=(v_values->>'assists')::integer,
    source_name=v_source,source_url=v_url,source_provider=case when p_decision='edit' then 'manual' else 'public_web_evidence' end,source_acceptance_method='staff_reviewed_sourced_proposal',source_reviewed_at=now(),source_synced_at=(v_job.summary->>'checked_at')::timestamptz,updated_at=now()
   where id=v_row_id and player_id=p_player_id returning * into v_after;
  end if;
 end if;
 v_status:=case when p_decision='reject' then 'rejected' else 'accepted' end;
 update public.player_source_refreshes set status=v_status,review_required=0,accepted_count=case when p_decision='reject' then 0 else facts_discovered end,rejected_count=case when p_decision='reject' then facts_discovered else 0 end,
  updated_at=now(),summary=summary||jsonb_build_object('decision',p_decision,'reviewed_by',p_actor_user_id,'reviewed_at',now(),'edit_fingerprint',case when p_decision='edit' then md5(p_values::text) end,'message',case when p_decision='reject' then 'Suggested update rejected. Recorded statistics are unchanged.' else 'Reviewed statistics saved. Verify the player before publishing.' end)
 where id=p_review_id;
 update djm_os.review_items set status=case when p_decision='reject' then 'rejected' else 'approved' end,resolved_at=now() where tenant_id=p_tenant_id and player_id=p_player_id and review_type='player_statistics' and payload->>'stats_review_id'=p_review_id::text and status='open';
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
 values(p_tenant_id,p_actor_user_id,'user','player_data.statistics_reviewed','player',p_player_id::text,v_audit_before,case when p_decision='reject' then v_audit_before else v_values end,
  jsonb_build_object('review_id',p_review_id,'decision',p_decision,'proposal_before',v_job.raw_snapshot->'before','proposed',v_job.raw_snapshot->'proposed','context',v_context,'sources',v_job.raw_snapshot->'sources','row_id',v_after.id,'reviewed_source',jsonb_build_object('name',v_source,'url',v_url)));
 return jsonb_build_object('ok',true,'review_id',p_review_id,'status',v_status);
end;
$function$;

revoke all on function public.platform_server_stage_player_stats_review(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_player_stats_review_status(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_review_player_stats(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_stage_player_stats_review(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,uuid) to service_role;
grant execute on function public.platform_server_player_stats_review_status(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_review_player_stats(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
