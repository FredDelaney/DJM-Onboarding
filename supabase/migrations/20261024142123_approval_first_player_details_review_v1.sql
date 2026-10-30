-- Material football facts use the existing refresh and per-field suggestion
-- ledgers. No canonical change or publication occurs during research.
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='private.protect_player_admin_fields()'::regprocedure)<>'8213b8db19de8ed3b9a5565f9902ba0c'
 or (select md5(prosrc) from pg_proc where oid='private.protect_public_profile_admin_fields()'::regprocedure)<>'892f6bbd5a84852275ca2224c2048357'
 or (select md5(prosrc) from pg_proc where oid='private.unpublish_dossier_when_verification_is_lost()'::regprocedure)<>'f315879e91167ce5139142abcdb194a9' then raise exception 'Player verification/publication contract needs review';end if;
end;$guard$;
create index player_source_refreshes_context_review_idx on public.player_source_refreshes(player_id,requested_at desc) where provider='agency_player_context_v1';

create function private.player_detail_value(p_field text,p_value jsonb)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v text;
begin
 if p_field not in ('current_club','current_league','current_country','current_season_label','primary_position','transfermarkt_url','stats_url','date_of_birth','nationalities','height_cm','preferred_foot','contract_status','contract_expiry') then raise exception 'Unsupported player detail';end if;
 if p_field='nationalities' then
  if jsonb_typeof(p_value) is distinct from 'array' or jsonb_array_length(p_value) not between 1 and 5 or exists(select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x) is distinct from 'string' or length(trim(x#>>'{}')) not between 1 and 80) then raise exception 'Add the recorded nationalities';end if;
  return (select jsonb_agg(trim(x#>>'{}') order by n) from jsonb_array_elements(p_value) with ordinality a(x,n));
 end if;
 if p_field='height_cm' then
  if jsonb_typeof(p_value) is distinct from 'number' or p_value::text !~ '^[0-9]+$' or (p_value::text)::numeric not between 140 and 230 then raise exception 'Check the recorded height';end if;return p_value;
 end if;
 if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Add the recorded player detail';end if;
 v:=trim(p_value#>>'{}');
 if length(v) not between 1 and (case when p_field like '%_url' then 600 else 160 end) then raise exception 'Check the player detail';end if;
 if p_field like '%_url' and v !~ '^https?://[^/?#@:[:space:]]+(\:[0-9]+)?([/?#][^[:space:]]*)?$' then raise exception 'Add a valid source link';end if;
 if p_field='preferred_foot' then
  if lower(v) not in ('left','right','both') then raise exception 'Choose Left, Right or Both';end if;v:=initcap(v);
 end if;
 if p_field in ('date_of_birth','contract_expiry') then
  if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Use a complete recorded date';end if;
  if to_char(v::date,'YYYY-MM-DD')<>v or v::date<'1900-01-01'::date or v::date>current_date+interval '30 years' or (p_field='date_of_birth' and v::date>=current_date) then raise exception 'Check the recorded date';end if;
 end if;
 return to_jsonb(v);
end;$function$;
revoke all on function private.player_detail_value(text,jsonb) from public,anon,authenticated,service_role;

create function private.player_details_access(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $function$
 select exists(select 1 from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active'
 join platform.tenant_memberships m on m.tenant_id=t.id and m.user_id=p_actor_user_id and m.status='active'
 where p.tenant_id=p_tenant_id and p.id=p_player_id and p.archived_at is null and coalesce(p.football_status,'active') not in ('retired','inactive')
 and (m.role in ('owner','admin') or (m.role in ('agent','operations') and exists(select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=p_actor_user_id and a.can_edit))));
$function$;
revoke all on function private.player_details_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Browser and legacy review paths cannot create, retarget or decide this
-- workflow. Only reviewed postgres-owned entrypoints set the transaction flag.
create function private.guard_player_details_review()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_ours boolean;
begin
 if tg_op='TRUNCATE' then
  if current_setting('role') not in ('postgres','none') then raise exception 'Player details review is server-only';end if;return null;
 end if;
 if tg_table_name='player_source_refreshes' then
  v_ours:=(case when tg_op='INSERT' then new.provider='agency_player_context_v1' when tg_op='DELETE' then old.provider='agency_player_context_v1' else old.provider='agency_player_context_v1' or new.provider='agency_player_context_v1' end);
 else
  v_ours:=(case when tg_op='INSERT' then new.source_evidence->>'workflow'='agency_player_context_v1' when tg_op='DELETE' then old.source_evidence->>'workflow'='agency_player_context_v1' else old.source_evidence->>'workflow'='agency_player_context_v1' or new.source_evidence->>'workflow'='agency_player_context_v1' end);
  if tg_op<>'DELETE' then v_ours:=coalesce(v_ours,false) or exists(select 1 from public.player_source_refreshes where id=new.refresh_id and provider='agency_player_context_v1');end if;
  if tg_op<>'INSERT' then v_ours:=coalesce(v_ours,false) or exists(select 1 from public.player_source_refreshes where id=old.refresh_id and provider='agency_player_context_v1');end if;
 end if;
 -- A definer lookup must see a protected parent even when caller RLS hides
 -- it. The caller's role still denies browser writes despite a forged flag.
 if v_ours and (current_setting('role') not in ('postgres','none','service_role') or coalesce(current_setting('redream.player_details_review',true),'')<>'on') then raise exception 'Player details review is server-only';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$function$;
revoke all on function private.guard_player_details_review() from public,anon,authenticated,service_role;
create trigger guard_player_details_refresh before insert or update or delete on public.player_source_refreshes for each row execute function private.guard_player_details_review();
create trigger guard_player_details_suggestion before insert or update or delete on public.player_source_suggestions for each row execute function private.guard_player_details_review();
create trigger guard_player_details_suggestion_truncate before truncate on public.player_source_suggestions for each statement execute function private.guard_player_details_review();
create trigger guard_player_details_refresh_truncate before truncate on public.player_source_refreshes for each statement execute function private.guard_player_details_review();
create policy player_details_refresh_server_only on public.player_source_refreshes as restrictive for all to authenticated using(provider is distinct from 'agency_player_context_v1') with check(provider is distinct from 'agency_player_context_v1');
create policy player_details_suggestions_server_only on public.player_source_suggestions as restrictive for all to authenticated using(source_evidence->>'workflow' is distinct from 'agency_player_context_v1') with check(source_evidence->>'workflow' is distinct from 'agency_player_context_v1');

create function public.platform_server_player_details_review_status(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_run public.player_source_refreshes%rowtype;v_fields jsonb;
begin
 if not private.player_details_access(p_tenant_id,p_player_id,p_actor_user_id) then raise exception 'Assigned player edit access required';end if;
 select * into v_run from public.player_source_refreshes where player_id=p_player_id and provider='agency_player_context_v1' order by (status='needs_review') desc,requested_at desc,id limit 1;
 if not found then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'field',s.field_name,'before',s.current_value,'suggested',s.suggested_value,'decision',s.decision,'applied_value',s.source_evidence->'applied_value','sources',s.source_evidence->'sources') order by s.field_name),'[]') into v_fields
 from public.player_source_suggestions s where s.refresh_id=v_run.id and s.player_id=p_player_id;
 return jsonb_build_object('id',v_run.id,'status',case when v_run.status='running' and v_run.started_at<now()-interval '60 seconds' then 'failed' else v_run.status end,'checked_at',v_run.completed_at,'reason',case when v_run.status='running' and v_run.started_at<now()-interval '60 seconds' then 'The source check did not finish. You can try again.' else v_run.summary->>'reason' end,'fields',v_fields);
end;$function$;
revoke all on function public.platform_server_player_details_review_status(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_details_review_status(uuid,uuid,uuid) to service_role;

create function public.platform_server_request_player_details_review(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_run public.player_source_refreshes%rowtype;v_flag text:=current_setting('redream.player_details_review',true);
begin
 if p_request_id is null or not private.player_details_access(p_tenant_id,p_player_id,p_actor_user_id) then raise exception 'Assigned player edit access required';end if;
 perform 1 from public.players where id=p_player_id and tenant_id=p_tenant_id for update;
 select * into v_run from public.player_source_refreshes where id=p_request_id;
 if found then
  if v_run.player_id is distinct from p_player_id or v_run.provider is distinct from 'agency_player_context_v1' or v_run.requested_by is distinct from p_actor_user_id then raise exception 'Player research request does not match';end if;
  return jsonb_build_object('id',v_run.id,'status',case when v_run.status='running' and v_run.started_at<now()-interval '60 seconds' then 'failed' else v_run.status end,'dispatch',false);
 end if;
 select * into v_run from public.player_source_refreshes where player_id=p_player_id and provider='agency_player_context_v1' and (status='needs_review' or (status='running' and started_at>=now()-interval '60 seconds')) order by (status='needs_review') desc,requested_at desc limit 1;
 if found then return jsonb_build_object('id',v_run.id,'status',v_run.status,'dispatch',false);end if;
 perform set_config('redream.player_details_review','on',true);
 update public.player_source_refreshes set status='failed',completed_at=now(),summary=jsonb_build_object('reason','The source check did not finish. You can try again.'),updated_at=now() where player_id=p_player_id and provider='agency_player_context_v1' and status='running';
 insert into public.player_source_refreshes(id,player_id,source,provider,mode,capability,status,requested_by,started_at,raw_snapshot,summary,facts_discovered,review_required)
 values(p_request_id,p_player_id,'other','agency_player_context_v1','preview','reference_only','running',p_actor_user_id,now(),'{}','{}',0,0);
 perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
 return jsonb_build_object('id',p_request_id,'status','running','dispatch',true);
end;$function$;
revoke all on function public.platform_server_request_player_details_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_request_player_details_review(uuid,uuid,uuid,uuid) to service_role;

create function public.platform_server_stage_player_details_review(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_expected jsonb,p_fields jsonb,p_sources jsonb,p_reason text,p_confidence numeric,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_player jsonb;v_run uuid;v_claim public.player_source_refreshes%rowtype;v_existing uuid;v_key text;v_value jsonb;v_fields jsonb:='{}';v_sources jsonb:='[]';v_field_sources jsonb;v_verified_sources jsonb:='{}';v_source jsonb;v_url text;v_hash text;v_count integer;v_flag text:=current_setting('redream.player_details_review',true);
begin
 if not private.player_details_access(p_tenant_id,p_player_id,p_actor_user_id) then raise exception 'Assigned player edit access required';end if;
 select to_jsonb(p) into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id for update;
 if p_request_id is not null then
  select * into v_claim from public.player_source_refreshes where id=p_request_id and player_id=p_player_id and provider='agency_player_context_v1' and requested_by=p_actor_user_id for update;
  if not found then raise exception 'Player research request does not match';end if;
  if v_claim.status<>'running' then return jsonb_build_object('review_id',v_claim.id,'status',v_claim.status);end if;
  if v_claim.started_at<now()-interval '60 seconds' or p_confidence is null or p_confidence<0.85 then
   perform set_config('redream.player_details_review','on',true);
   update public.player_source_refreshes set status='failed',completed_at=now(),summary=jsonb_build_object('reason','No reliable changes could be confirmed. Recorded details are unchanged.'),updated_at=now() where id=p_request_id;
   perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
   return jsonb_build_object('review_id',p_request_id,'status','failed');
  end if;
 end if;
 if p_confidence is null or p_confidence<0.85 or p_confidence>1 or jsonb_typeof(p_fields) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object' then raise exception 'Reliable player evidence required';end if;
 if jsonb_typeof(p_sources) is distinct from 'object' then raise exception 'Reliable player sources required';end if;
 if not(p_expected?'first_name') or not(p_expected?'last_name') or p_expected->'first_name' is distinct from v_player->'first_name' or p_expected->'last_name' is distinct from v_player->'last_name' or not(p_expected?'date_of_birth') or p_expected->'date_of_birth' is distinct from v_player->'date_of_birth' then raise exception 'Player identity changed. Check the record again.';end if;
 for v_key,v_value in select key,value from jsonb_each(p_fields) loop
  v_value:=private.player_detail_value(v_key,v_value);
  if jsonb_typeof(p_sources->v_key) is distinct from 'array' or jsonb_array_length(p_sources->v_key) not between 1 and 8 then raise exception 'Each detail needs a supporting source';end if;
  v_field_sources:='[]';
  for v_source in select value from jsonb_array_elements(p_sources->v_key) loop
   v_url:=trim(v_source->>'url');if v_url is null or length(v_url)>2000 or v_url !~ '^https?://[^/?#@:[:space:]]+(\:[0-9]+)?([/?#][^[:space:]]*)?$' then raise exception 'Reliable player sources required';end if;
   v_field_sources:=v_field_sources||jsonb_build_array(jsonb_build_object('url',v_url,'title',left(coalesce(nullif(trim(v_source->>'title'),''),'Source'),180)));
  end loop;
  v_verified_sources:=v_verified_sources||jsonb_build_object(v_key,v_field_sources);v_sources:=v_sources||v_field_sources;
  if not(p_expected?v_key) or p_expected->v_key is distinct from v_player->v_key then raise exception 'Player details changed. Check the record again.';end if;
  if v_value is distinct from v_player->v_key then v_fields:=v_fields||jsonb_build_object(v_key,v_value);end if;
 end loop;
 select count(*) into v_count from jsonb_each(v_fields);if v_count=0 then
  if p_request_id is not null then
   perform set_config('redream.player_details_review','on',true);
   update public.player_source_refreshes set status='applied',completed_at=now(),summary=jsonb_build_object('reason','The sources confirm the recorded details.'),updated_at=now() where id=p_request_id;
   perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
  end if;
  return jsonb_build_object('status','unchanged','review_id',p_request_id);end if;
 v_hash:=md5(jsonb_build_object('identity',jsonb_build_object('first_name',v_player->'first_name','last_name',v_player->'last_name','date_of_birth',v_player->'date_of_birth'),'fields',v_fields,'before',(select jsonb_object_agg(key,v_player->key) from jsonb_each(v_fields)),'sources',v_verified_sources)::text);
 select id into v_existing from public.player_source_refreshes where player_id=p_player_id and provider='agency_player_context_v1' and (status='needs_review' or payload_hash=v_hash) order by (status='needs_review') desc,requested_at desc limit 1;
 if found then
  if p_request_id is not null then
   perform set_config('redream.player_details_review','on',true);
   update public.player_source_refreshes set status='cancelled',completed_at=now(),summary=jsonb_build_object('reason','This suggestion has already been reviewed. Recorded details are unchanged.'),updated_at=now() where id=p_request_id;
   perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
  end if;
  return jsonb_build_object('review_id',v_existing,'status',(select status from public.player_source_refreshes where id=v_existing));end if;
 perform set_config('redream.player_details_review','on',true);
 if p_request_id is null then
 insert into public.player_source_refreshes(player_id,source,source_url,provider,mode,capability,status,requested_by,started_at,completed_at,raw_snapshot,summary,facts_discovered,review_required,payload_hash)
 values(p_player_id,'other',v_sources->0->>'url','agency_player_context_v1','preview','reference_only','needs_review',p_actor_user_id,now(),now(),jsonb_build_object('identity',jsonb_build_object('first_name',v_player->'first_name','last_name',v_player->'last_name','date_of_birth',v_player->'date_of_birth')),jsonb_build_object('reason',left(coalesce(p_reason,''),300)),v_count,v_count,v_hash) returning id into v_run;
 else
  v_run:=p_request_id;
  update public.player_source_refreshes set source_url=v_sources->0->>'url',status='needs_review',completed_at=now(),raw_snapshot=jsonb_build_object('identity',jsonb_build_object('first_name',v_player->'first_name','last_name',v_player->'last_name','date_of_birth',v_player->'date_of_birth')),summary=jsonb_build_object('reason',left(coalesce(p_reason,''),300)),facts_discovered=v_count,review_required=v_count,payload_hash=v_hash,updated_at=now() where id=v_run;
 end if;
 insert into public.player_source_suggestions(refresh_id,player_id,field_name,current_value,suggested_value,confidence,source_evidence,observed_at,truth_state)
 select v_run,p_player_id,key,v_player->key,value,p_confidence,jsonb_build_object('workflow','agency_player_context_v1','sources',v_verified_sources->key),now(),'sourced' from jsonb_each(v_fields);
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
 values(p_tenant_id,p_actor_user_id,'user','player_details.suggested','player',p_player_id::text,jsonb_build_object('review_id',v_run,'fields',v_fields,'sources',v_verified_sources));
 perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
 return jsonb_build_object('review_id',v_run,'status','needs_review');
end;$function$;
revoke all on function public.platform_server_stage_player_details_review(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_stage_player_details_review(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,numeric,uuid) to service_role;

create function public.platform_server_review_player_details(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_review_id uuid,p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_player public.players%rowtype;v_run public.player_source_refreshes%rowtype;v_s public.player_source_suggestions%rowtype;v_item jsonb;v_value jsonb;v_patch jsonb:='{}';v_before jsonb;v_after jsonb;v_kind text;v_assignments text;v_pending integer;v_accepted integer;v_rejected integer;v_processed integer:=0;v_ids uuid[]:='{}';v_flag text:=current_setting('redream.player_details_review',true);v_career_flag text:=current_setting('djm.internal_career_change',true);
begin
 if not private.player_details_access(p_tenant_id,p_player_id,p_actor_user_id) then raise exception 'Assigned player edit access required';end if;
 select * into v_player from public.players where id=p_player_id and tenant_id=p_tenant_id for update;
 select * into v_run from public.player_source_refreshes where id=p_review_id and player_id=p_player_id and provider='agency_player_context_v1' for update;
 if not found then raise exception 'Player details review not found';end if;
 if jsonb_typeof(p_decisions) is distinct from 'array' or jsonb_array_length(p_decisions) not between 1 and 13 then raise exception 'Choose the details to review';end if;
 v_before:=to_jsonb(v_player);
 if ((v_run.raw_snapshot->'identity')-'date_of_birth') is distinct from jsonb_build_object('first_name',v_player.first_name,'last_name',v_player.last_name) or ((v_run.raw_snapshot->'identity'->'date_of_birth') is distinct from to_jsonb(v_player)->'date_of_birth' and not exists(select 1 from public.player_source_suggestions s where s.refresh_id=p_review_id and s.player_id=p_player_id and s.field_name='date_of_birth' and s.decision='accepted' and s.source_evidence->'applied_value'=to_jsonb(v_player)->'date_of_birth')) then raise exception 'Player identity changed. Check the record again.';end if;
 perform set_config('redream.player_details_review','on',true);
 for v_item in select value from jsonb_array_elements(p_decisions) loop
  select * into v_s from public.player_source_suggestions where id=(v_item->>'id')::uuid and refresh_id=p_review_id and player_id=p_player_id for update;
  if not found or v_s.id=any(v_ids) then raise exception 'Choose each recorded suggestion once';end if;v_ids:=array_append(v_ids,v_s.id);
  v_kind:=v_item->>'decision';if v_kind not in ('accept','edit','reject') or v_kind is null then raise exception 'Choose accept, edit or reject';end if;
  v_value:=case when v_kind='edit' then private.player_detail_value(v_s.field_name,v_item->'value') else v_s.suggested_value end;
  if v_kind<>'reject' then v_value:=private.player_detail_value(v_s.field_name,v_value);end if;
  if v_s.decision<>'pending' then
   if v_s.decision<>(case when v_kind='reject' then 'rejected' else 'accepted' end) or (v_kind<>'reject' and v_s.source_evidence->'applied_value' is distinct from v_value) then raise exception 'This detail was already reviewed. Reload the record.';end if;continue;
  end if;
  if v_kind<>'reject' then
   if v_before->v_s.field_name is distinct from v_s.current_value and v_before->v_s.field_name is distinct from v_value then raise exception 'Player details changed. Check the record again.';end if;
   if v_before->v_s.field_name is distinct from v_value then v_patch:=v_patch||jsonb_build_object(v_s.field_name,v_value);end if;
  end if;
  v_processed:=v_processed+1;
  update public.player_source_suggestions set decision=case when v_kind='reject' then 'rejected' else 'accepted' end,reviewed_by=p_actor_user_id,reviewed_at=now(),applied_at=case when v_kind='reject' then null else now() end,
   source_evidence=source_evidence||jsonb_build_object('decision_kind',v_kind,'applied_value',case when v_kind='reject' then null else v_value end) where id=v_s.id;
 end loop;
 if v_processed=0 then
  perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
  return jsonb_build_object('ok',true,'review_id',p_review_id,'remaining',v_run.review_required,'review',public.platform_server_player_details_review_status(p_tenant_id,p_player_id,p_actor_user_id));
 end if;
 -- Only validated football fields can appear here. Parameterise values and
 -- quote the allowlisted column, preserving all existing player triggers.
 if v_patch<>'{}'::jsonb then
  select string_agg(format('%1$I=(jsonb_populate_record(null::public.players,$1)).%1$I',key),',') into v_assignments from jsonb_each(v_patch);
  execute format('update public.players set %s where id=$2 and tenant_id=$3',v_assignments) using v_patch,p_player_id,p_tenant_id;
  -- Reuse the existing guarded review-state transition; no source decision
  -- marks the player verified or republishes a snapshot.
  perform set_config('djm.internal_career_change','on',true);
  update public.players set verification_status='reviewing',verified_at=null,review_required_at=now(),review_reason='Reviewed player details changed',updated_at=now() where id=p_player_id and tenant_id=p_tenant_id;
  perform set_config('djm.internal_career_change',coalesce(v_career_flag,''),true);
 end if;
 select count(*) filter(where decision='pending'),count(*) filter(where decision='accepted'),count(*) filter(where decision='rejected') into v_pending,v_accepted,v_rejected from public.player_source_suggestions where refresh_id=p_review_id and player_id=p_player_id;
 update public.player_source_refreshes set mode=case when v_accepted>0 then 'apply_reviewed' else mode end,status=case when v_pending>0 then 'needs_review' when v_accepted>0 then 'applied' else 'rejected' end,review_required=v_pending,accepted_count=v_accepted,rejected_count=v_rejected,updated_at=now() where id=p_review_id;
 select to_jsonb(p) into v_after from public.players p where id=p_player_id;
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
 values(p_tenant_id,p_actor_user_id,'user','player_details.reviewed','player',p_player_id::text,
 (select coalesce(jsonb_object_agg(key,v_before->key),'{}') from jsonb_each(v_patch)),(select coalesce(jsonb_object_agg(key,v_after->key),'{}') from jsonb_each(v_patch)),jsonb_build_object('review_id',p_review_id,'decisions',p_decisions,'remaining',v_pending));
 perform set_config('redream.player_details_review',coalesce(v_flag,''),true);
 return jsonb_build_object('ok',true,'review_id',p_review_id,'remaining',v_pending,'review',public.platform_server_player_details_review_status(p_tenant_id,p_player_id,p_actor_user_id));
end;$function$;
revoke all on function public.platform_server_review_player_details(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_review_player_details(uuid,uuid,uuid,uuid,jsonb) to service_role;
