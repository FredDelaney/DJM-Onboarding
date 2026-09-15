-- ReDream capture workspace boundary. Additive, staging-first deployment only.
-- Request headers contain untrusted slugs. Only platform membership resolves authority.
create or replace function private.tell_request_tenant()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_slug text := v_headers->>'x-redream-workspace';
  v_tenant uuid;
begin
  if auth.uid() is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if v_slug is null then
    v_tenant := private.primary_active_tenant_id(auth.uid());
  else
    if v_slug !~ '^[a-z0-9][a-z0-9-]{0,99}$'
       or v_slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Workspace access denied' using errcode='42501';
    end if;
    select id into v_tenant from platform.tenants where slug=v_slug and status='active';
  end if;
  if v_tenant is null or not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  return v_tenant;
end;
$$;
revoke all on function private.tell_request_tenant() from public,anon;
grant execute on function private.tell_request_tenant() to authenticated,service_role;

create or replace function private.tell_assert_capture(p_capture_id uuid, p_write boolean default false)
returns void language plpgsql stable security invoker set search_path='' as $$
declare
  v_tenant uuid := private.tell_request_tenant();
begin
  if not exists (
    select 1 from djm_os.captures c
    join djm_os.tell_djm_permissions p on p.tenant_id=c.tenant_id and p.user_id=auth.uid()
    where c.id=p_capture_id and c.tenant_id=v_tenant and c.processing_version='tell_djm_v1'
      and p.is_enabled and (not p_write or p.permission_scope in ('full','scout'))
      and (c.submitted_by=auth.uid() or p.permission_scope='full')
  ) then raise exception 'Capture access denied' using errcode='42501'; end if;
end;
$$;
revoke all on function private.tell_assert_capture(uuid,boolean) from public,anon;
grant execute on function private.tell_assert_capture(uuid,boolean) to authenticated,service_role;

-- Reject foreign references even when service_role bypasses RLS. Walk nested selections too.
create or replace function private.tell_assert_entities(p_tenant uuid, p_payload jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_key text; v_value jsonb; v_type text; v_id uuid; v_actual uuid;
begin
  if p_tenant is null then raise exception 'Capture tenant required' using errcode='23514'; end if;
  if jsonb_typeof(p_payload)='array' then
    for v_value in select value from jsonb_array_elements(p_payload) loop
      perform private.tell_assert_entities(p_tenant,v_value);
    end loop;
  elsif jsonb_typeof(p_payload)='object' then
    for v_key,v_value in select key,value from jsonb_each(p_payload) loop
      v_type := case v_key
        when 'person_id' then 'person' when 'source_person_id' then 'person'
        when 'organisation_id' then 'club' when 'player_id' then 'player'
        when 'prospect_id' then 'prospect' when 'club_need_id' then 'club_need'
        when 'interaction_id' then 'interaction' when 'task_id' then 'task'
        when 'claim_id' then 'claim' when 'parent_capture_id' then 'capture'
        when 'capture_id' then 'capture' when 'player_match_id' then 'player_match'
        when 'scouting_report_id' then 'scouting_report' when 'opportunity_id' then 'deal'
        when 'entity_id' then p_payload->>'entity_type'
        else null end;
      if v_key='tenant_id' and v_value<>'null'::jsonb then
        if (v_value#>>'{}')::uuid is distinct from p_tenant then
          raise exception 'Capture reference denied' using errcode='23514';
        end if;
      elsif v_type is not null and v_value<>'null'::jsonb and v_value<>'""'::jsonb then
        v_id := (v_value#>>'{}')::uuid;
        v_actual := private.workspace_entity_tenant(v_type,v_id);
        if v_actual is distinct from p_tenant then
          raise exception 'Capture reference denied' using errcode='23514';
        end if;
      elsif v_key='entity_id' and v_value<>'null'::jsonb then
        raise exception 'Capture reference denied' using errcode='23514';
      end if;
      if jsonb_typeof(v_value) in ('array','object') then
        perform private.tell_assert_entities(p_tenant,v_value);
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function private.tell_assert_entities(uuid,jsonb) from public,anon;
grant execute on function private.tell_assert_entities(uuid,jsonb) to authenticated,service_role;

-- A user can have independent Tell permissions in each agency.
alter table djm_os.tell_djm_permissions drop constraint tell_djm_permissions_pkey;
alter table djm_os.tell_djm_permissions add primary key (tenant_id,user_id);
create index if not exists captures_tell_tenant_submitter_recent_idx
  on djm_os.captures(tenant_id,submitted_by,created_at desc) where processing_version='tell_djm_v1';


create or replace function private.assign_workspace_tenant()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_tenant uuid := new.tenant_id;
  v_candidate uuid;
  v_id uuid;
  v_user_id uuid;
  v_type text;
begin
  if tg_op='UPDATE' and old.tenant_id is distinct from new.tenant_id then
    raise exception 'Tenant ownership is immutable.' using errcode='23514';
  end if;

  if tg_table_name='tell_djm_permissions' then
    v_user_id := nullif(v_row->>'user_id','')::uuid;
    if v_tenant is null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;
    if not private.user_has_staff_tenant_access(v_tenant,v_user_id) then
      raise exception 'Permission workspace access denied' using errcode='23514';
    end if;

  elsif tg_table_name in ('tell_djm_actions','tell_djm_questions') then
    v_id := nullif(v_row->>'capture_id','')::uuid;
    select tenant_id into v_candidate from djm_os.captures where id=v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'capture');

  elsif tg_table_name='tell_djm_aliases' then
    v_id := nullif(v_row->>'source_capture_id','')::uuid;
    select tenant_id into v_candidate from djm_os.captures where id=v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'source_capture');

    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;
    if v_user_id is not null and not private.user_has_staff_tenant_access(v_tenant,v_user_id) then
      raise exception 'Alias workspace access denied' using errcode='23514';
    end if;

    v_type := nullif(v_row->>'entity_type','');
    v_id := nullif(v_row->>'entity_id','')::uuid;
    v_candidate := private.workspace_entity_tenant(v_type,v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'alias_entity');

  elsif tg_table_name='claims' then
    v_id := nullif(v_row->>'interaction_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('interaction',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'interaction');
    v_id := nullif(v_row->>'person_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('person',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'person');
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('club',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'organisation');
    v_id := nullif(v_row->>'player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'player');
    v_user_id := nullif(v_row->>'verified_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='employments' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('person',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'person');
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('club',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'organisation');

  elsif tg_table_name='events' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('person',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'person');
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('club',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'organisation');
    v_id := nullif(v_row->>'player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'player');
    v_id := nullif(v_row->>'interaction_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('interaction',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'interaction');
    v_user_id := nullif(v_row->>'actor_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='review_items' then
    foreach v_type in array array['person','club','player','club_need','capture','claim'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
        when 'capture' then nullif(v_row->>'capture_id','')::uuid
        when 'claim' then nullif(v_row->>'claim_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='notifications' then
    foreach v_type in array array['person','club','player','club_need','task'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
        when 'task' then nullif(v_row->>'task_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'user_id','')::uuid;
    if v_tenant is null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='scouting_prospects' then
    v_id := nullif(v_row->>'linked_player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'linked_player');
    v_id := nullif(v_row->>'signed_player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'signed_player');
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='recruitment_interactions' then
    v_id := nullif(v_row->>'prospect_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('prospect',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'prospect');
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='scouting_reports' then
    v_id := nullif(v_row->>'prospect_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('prospect',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'prospect');
    v_user_id := nullif(v_row->>'scout_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='scouting_watchlists' then
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_user_id is not null then v_tenant := private.merge_tenant_candidate(v_tenant,private.primary_active_tenant_id(v_user_id),'watchlist_owner'); end if;

  elsif tg_table_name='scouting_watchlist_entries' then
    v_id := nullif(v_row->>'watchlist_id','')::uuid;
    select tenant_id into v_candidate from djm_os.scouting_watchlists where id=v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'watchlist');
    v_id := nullif(v_row->>'prospect_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('prospect',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'prospect');
    v_user_id := nullif(v_row->>'added_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='deal_rooms' then
    foreach v_type in array array['club','person','player','prospect','club_need'] loop
      v_id := case v_type
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'person' then nullif(v_row->>'source_person_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'prospect' then nullif(v_row->>'prospect_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='market_signals' then
    foreach v_type in array array['club','person','player','prospect'] loop
      v_id := case v_type
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'prospect' then nullif(v_row->>'prospect_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'created_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='memories' then
    foreach v_type in array array['person','club','player','prospect','club_need'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'prospect' then nullif(v_row->>'prospect_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'created_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='suggestions' then
    foreach v_type in array array['person','club','player','club_need'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='opportunity_links' then
    v_id := nullif(v_row->>'opportunity_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('opportunity',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'opportunity');
    foreach v_type in array array['club','person','club_need'] loop
      v_id := case v_type
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'linked_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;
  end if;

  if v_tenant is null then
    v_tenant := private.primary_active_tenant_id(auth.uid());
  end if;

  if v_tenant is null then
    raise exception 'Trusted tenant context is required for %.%',tg_table_schema,tg_table_name using errcode='23514';
  end if;

  new.tenant_id := v_tenant;
  return new;
end;
$$;

create or replace function public.djm_tell_current_access()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_scope text;
  v_enabled boolean;
  v_system_live boolean;
  v_limit integer;
begin
  perform private.tell_request_tenant();

  select p.permission_scope,p.is_enabled
  into v_scope,v_enabled
  from djm_os.tell_djm_permissions p
  where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant();

  select s.is_live,s.max_audio_seconds
  into v_system_live,v_limit
  from djm_os.tell_djm_settings s
  where s.id=1;

  return jsonb_build_object(
    'tenant_id',private.tell_request_tenant(),
    'enabled',coalesce(v_enabled,false) and coalesce(v_system_live,false),
    'system_live',coalesce(v_system_live,false),
    'permission_scope',coalesce(v_scope,'read_only'),
    'max_audio_seconds',coalesce(v_limit,240)
  );
end;
$$;

create or replace function public.djm_tell_receipt(p_capture_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.tell_assert_capture(p_capture_id,false);
  perform private.tell_request_tenant();

  if not exists (
    select 1 from djm_os.captures c
    where c.id=p_capture_id
      and c.submitted_by=auth.uid()
  ) and not exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant()
      and p.permission_scope='full'
      and p.is_enabled=true
  ) then
    raise exception 'Tell DJM capture access denied';
  end if;

  select jsonb_build_object(
    'capture',jsonb_build_object(
      'id',c.id,'status',c.status,'summary',c.summary,'transcript_text',c.transcript_text,
      'created_at',c.created_at,'completed_at',c.completed_at,'error_message',c.error_message
    ),
    'actions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'action_type',a.action_type,'status',a.status,'confidence',a.confidence,
        'evidence',a.evidence,'target_type',a.target_type,'target_id',a.target_id,
        'undo_supported',a.undo_supported,'error_message',a.error_message
      ) order by a.action_index,a.created_at)
      from djm_os.tell_djm_actions a
      where a.capture_id=c.id and a.status<>'superseded'
    ),'[]'::jsonb),
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',q.id,'field_key',q.field_key,'prompt',q.prompt,'reason',q.reason,
        'candidates',q.candidates,'status',q.status
      ) order by q.created_at)
      from djm_os.tell_djm_questions q
      where q.capture_id=c.id and q.status<>'superseded'
    ),'[]'::jsonb)
  )
  into v_result
  from djm_os.captures c
  where c.id=p_capture_id;

  if v_result is null then raise exception 'Capture not found'; end if;
  return v_result;
end;
$$;

create or replace function public.djm_tell_retry_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
begin
  perform private.tell_assert_capture(p_capture_id,true);
  perform private.tell_request_tenant();

  select * into v_capture
  from djm_os.captures
  where id=p_capture_id
    and processing_version='tell_djm_v1';

  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>(select auth.uid())
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=(select auth.uid()) and p.tenant_id=private.tell_request_tenant()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can retry this';
  end if;

  if v_capture.status not in ('partial','failed') then
    raise exception 'This Tell DJM capture does not need a manual retry';
  end if;

  if coalesce(v_capture.attempt_count,0)>=8 then
    raise exception 'This capture has already retried several times. Review it instead of retrying again.';
  end if;

  update djm_os.captures
  set status='queued',
      next_attempt_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null,
      completed_at=null
  where id=p_capture_id;

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  ) values (v_capture.tenant_id,
    'TELL_DJM_RETRY_REQUESTED',
    (select auth.uid()),
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object('capture_id',p_capture_id),
    'tell_djm',1,now()
  );

  return jsonb_build_object('capture_id',p_capture_id,'status','queued');
end;
$$;

create or replace function public.djm_tell_recent_captures(p_limit integer default 8)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_result jsonb;
begin
  perform private.tell_request_tenant();

  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      c.created_at,
      jsonb_build_object(
        'id',c.id,
        'status',c.status,
        'summary',c.summary,
        'channel',c.channel,
        'created_at',c.created_at,
        'completed_at',c.completed_at,
        'action_count',(
          select count(*)
          from djm_os.tell_djm_actions a
          where a.capture_id=c.id
            and a.status not in ('superseded','undone')
        ),
        'question_count',(
          select count(*)
          from djm_os.tell_djm_questions q
          where q.capture_id=c.id
            and q.status='open'
        )
      ) item
    from djm_os.captures c
    where c.tenant_id=private.tell_request_tenant() and c.submitted_by=(select auth.uid())
      and c.processing_version='tell_djm_v1'
    order by c.created_at desc
    limit v_limit
  ) recent;

  return v_result;
end;
$$;

create or replace function public.djm_tell_undo_action(p_action_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action djm_os.tell_djm_actions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_deleted integer:=0;
begin
  perform private.tell_request_tenant();

  select * into v_action
  from djm_os.tell_djm_actions
  where id=p_action_id
    and status='applied'
    and undo_supported=true;

  if not found then
    raise exception 'This action cannot be undone';
  end if;

  perform private.tell_assert_capture(v_action.capture_id,true);

  select * into v_capture
  from djm_os.captures
  where id=v_action.capture_id;

  if not found then
    raise exception 'Capture not found';
  end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1
       from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can undo this';
  end if;

  if v_action.action_type='create_task' then
    delete from djm_os.tasks
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source='tell_djm:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_interaction' then
    delete from djm_os.interactions
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source_type='tell_djm';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='add_claim' then
    delete from djm_os.claims
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash;
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_scout_observation' then
    delete from djm_os.scouting_reports
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='upsert_club_need'
        and coalesce((v_action.before_json->>'created')::boolean,false)=true then
    delete from djm_os.club_needs
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;
  end if;

  if v_deleted<>1 then
    raise exception 'This record changed after Tell DJM created it. Review it manually instead of rolling it back.';
  end if;

  update djm_os.tell_djm_actions
  set status='undone',
      undone_at=now(),
      updated_at=now()
  where id=v_action.id;

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (v_capture.tenant_id,
    'TELL_DJM_ACTION_UNDONE',
    auth.uid(),
    jsonb_build_object(
      'capture_id',v_action.capture_id,
      'action_id',v_action.id,
      'action_type',v_action.action_type,
      'target_id',v_action.target_id
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'capture_id',v_action.capture_id,
    'action_id',v_action.id,
    'undone',true
  );
end;
$$;

create or replace function public.djm_tell_answer_question(
  p_question_id uuid,
  p_value jsonb
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_question djm_os.tell_djm_questions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_selected jsonb:=p_value;
  v_entity_type text;
  v_entity_id uuid;
  v_alias text;
  v_action_key text;
  v_actions jsonb;
  v_canonical_label text;
begin
  perform private.tell_request_tenant();

  select * into v_question
  from djm_os.tell_djm_questions
  where id=p_question_id and status='open';
  if not found then raise exception 'Question is no longer open'; end if;

  perform private.tell_assert_capture(v_question.capture_id,true);

  select * into v_capture
  from djm_os.captures
  where id=v_question.capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1
       from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can answer this';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_question.candidates,'[]'::jsonb)
    ) candidate
    where candidate=p_value
  ) then
    raise exception 'Selected answer is not one of the available choices';
  end if;

  perform private.tell_assert_entities(v_capture.tenant_id,p_value);

  if p_value->>'kind'='create_club' then
    select public.djm_tell_create_confirmed_club(
      v_capture.id,
      p_value->>'name',
      p_value->>'country'
    ) into v_selected;
  elsif p_value->>'kind'='create_contact' then
    select public.djm_tell_create_confirmed_contact(
      v_capture.id,
      p_value->>'full_name',
      nullif(p_value->>'organisation_id','')::uuid,
      p_value->>'role_title'
    ) into v_selected;
  end if;

  v_canonical_label:=coalesce(
    nullif(v_selected->>'canonical_label',''),
    nullif(split_part(coalesce(v_selected->>'label',''),' · ',1),'')
  );

  if v_question.field_key like 'entity:contact:%'
     and v_selected->>'entity_type'='player'
     and nullif(v_selected->>'entity_id','') is not null then
    v_action_key:=nullif(v_question.context_json->>'action_key','');

    if v_action_key is not null then
      select jsonb_agg(
        case
          when item->>'key'=v_action_key then
            jsonb_set(
              jsonb_set(
                item,
                '{contact_name}',
                'null'::jsonb,
                true
              ),
              '{player_name}',
              to_jsonb(v_canonical_label),
              true
            )
          else item
        end
        order by ord
      )
      into v_actions
      from jsonb_array_elements(
        coalesce(
          v_capture.extracted_json->'tell_djm_plan'->'actions',
          '[]'::jsonb
        )
      ) with ordinality as x(item,ord);

      if v_actions is not null then
        update djm_os.captures
        set extracted_json=jsonb_set(
          extracted_json,
          '{tell_djm_plan,actions}',
          v_actions,
          true
        )
        where id=v_capture.id;
      end if;
    end if;
  end if;

  update djm_os.tell_djm_questions
  set status='resolved',
      selected_value=v_selected,
      resolved_at=now()
  where id=p_question_id;

  update djm_os.captures
  set context_json=jsonb_set(
        coalesce(context_json,'{}'::jsonb),
        '{resolutions}',
        coalesce(context_json->'resolutions','[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'field_key',v_question.field_key,
            'value',v_selected
          )),
        true
      ),
      status='queued',
      next_attempt_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null
  where id=v_capture.id;

  v_entity_type:=nullif(v_selected->>'entity_type','');
  v_alias:=nullif(v_question.context_json->>'spoken_name','');

  if nullif(v_selected->>'entity_id','') is not null then
    begin
      v_entity_id:=(v_selected->>'entity_id')::uuid;
    exception when invalid_text_representation then
      v_entity_id:=null;
    end;
  end if;

  if v_entity_type in ('club','contact','player','prospect')
     and v_entity_id is not null
     and v_alias is not null then
    insert into djm_os.tell_djm_aliases(tenant_id,
      entity_type,
      entity_id,
      alias_text,
      normalised_alias,
      owner_user_id,
      source_capture_id
    )
    values (v_capture.tenant_id,
      v_entity_type,
      v_entity_id,
      v_alias,
      lower(trim(regexp_replace(v_alias,'[^[:alnum:]]+',' ','g'))),
      v_capture.submitted_by,
      v_capture.id
    )
    on conflict (
      entity_type,
      entity_id,
      normalised_alias,
      owner_user_id
    )
    do update set
      confirmed_count=djm_os.tell_djm_aliases.confirmed_count+1,
      source_capture_id=excluded.source_capture_id,
      updated_at=now();
  end if;

  insert into djm_os.events(tenant_id,
    event_type,
    actor_user_id,
    person_id,
    organisation_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (v_capture.tenant_id,
    'TELL_DJM_QUESTION_ANSWERED',
    auth.uid(),
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object(
      'capture_id',v_capture.id,
      'question_id',v_question.id,
      'field_key',v_question.field_key
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'capture_id',v_capture.id,
    'status','queued'
  );
end;
$$;

create or replace function public.djm_tell_delete_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_capture djm_os.captures%rowtype;
  v_applied_count integer := 0;
begin
  perform private.tell_assert_capture(p_capture_id,true);
  perform private.tell_request_tenant();

  select *
  into v_capture
  from djm_os.captures c
  where c.id = p_capture_id
  for update;

  if v_capture.id is null then
    raise exception 'Tell DJM update not found';
  end if;

  if v_capture.processing_version is distinct from 'tell_djm_v1' then
    raise exception 'Only Tell DJM updates can be deleted here';
  end if;

  if v_capture.status in ('queued','processing','retry') then
    raise exception 'This Tell DJM update is still processing';
  end if;

  if not (
    v_capture.submitted_by = v_uid
    or exists (
      select 1
      from djm_os.tell_djm_permissions p
      where p.user_id = v_uid and p.tenant_id=private.tell_request_tenant()
        and p.permission_scope = 'full'
        and p.is_enabled = true
    )
  ) then
    raise exception 'You do not have access to delete this Tell DJM update';
  end if;

  select count(*)
  into v_applied_count
  from djm_os.tell_djm_actions a
  where a.capture_id = p_capture_id
    and a.status = 'applied';

  if v_applied_count > 0 then
    raise exception 'This Tell DJM update has already changed DJM. Undo the applied updates before deleting it.';
  end if;

  delete from djm_os.captures
  where id = p_capture_id;

  insert into djm_os.events(tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (v_capture.tenant_id,
    'TELL_DJM_CAPTURE_DELETED',
    v_uid,
    jsonb_build_object(
      'capture_id', p_capture_id,
      'previous_status', v_capture.status,
      'capture_type', v_capture.capture_type
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'deleted', true,
    'capture_id', p_capture_id
  );
end;
$$;

create or replace function public.djm_tell_create_confirmed_club(
  p_capture_id uuid,
  p_name text,
  p_country text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_key text;
  v_id uuid;
  v_existing_type text;
begin
  perform private.tell_assert_capture(p_capture_id,true);
  perform private.tell_request_tenant();
  if length(v_name)<2 then raise exception 'Club name is required'; end if;

  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if not exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant() and p.permission_scope='full' and p.is_enabled=true
  ) then
    raise exception 'Only full-access DJM users can create a new club from Tell DJM';
  end if;

  v_key:=lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')));

  select o.id,o.organisation_type
  into v_id,v_existing_type
  from djm_os.organisations o
  where o.tenant_id=v_capture.tenant_id and lower(trim(regexp_replace(o.name,'[^[:alnum:]]+',' ','g')))=v_key
  order by o.updated_at desc
  limit 1;

  if v_id is not null and v_existing_type<>'club' then
    raise exception 'A non-club organisation with this name already exists. Review it first.';
  end if;

  if v_id is null then
    if exists (
      select 1 from djm_os.organisations o
      where o.tenant_id=v_capture.tenant_id and o.organisation_type='club'
        and extensions.similarity(lower(o.name),lower(v_name))>=0.90
    ) then
      raise exception 'A very similar club now exists. Re-open the question and choose the existing club.';
    end if;

    insert into djm_os.organisations(tenant_id,
      name,organisation_type,country,canonical_key
    ) values (v_capture.tenant_id,
      v_name,'club',nullif(trim(coalesce(p_country,'')),''),'club:'||v_capture.tenant_id::text||':'||v_key
    ) returning id into v_id;

    insert into djm_os.events(tenant_id,
      event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at
    ) values (v_capture.tenant_id,
      'TELL_DJM_CLUB_CREATED',auth.uid(),v_id,
      jsonb_build_object('capture_id',p_capture_id,'name',v_name),
      'tell_djm',1,now()
    );
  end if;

  return jsonb_build_object(
    'entity_type','club',
    'entity_id',v_id,
    'label',v_name,
    'country',nullif(trim(coalesce(p_country,'')),''),
    'score',1
  );
end;
$$;

create or replace function public.djm_tell_create_confirmed_contact(
  p_capture_id uuid,
  p_full_name text,
  p_organisation_id uuid,
  p_role_title text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_name text:=trim(coalesce(p_full_name,''));
  v_id uuid;
  v_org_name text;
  v_other_org uuid;
  v_key text;
begin
  perform private.tell_assert_capture(p_capture_id,true);
  perform private.tell_request_tenant();
  if length(v_name)<2 or p_organisation_id is null then
    raise exception 'Contact name and club are required';
  end if;

  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant() and p.permission_scope='full' and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can create this contact';
  end if;

  perform private.tell_assert_entities(v_capture.tenant_id,jsonb_build_object('organisation_id',p_organisation_id));

  select o.name into v_org_name
  from djm_os.organisations o
  where o.tenant_id=v_capture.tenant_id and o.id=p_organisation_id and o.organisation_type='club';
  if not found then raise exception 'Club not found'; end if;

  select p.id
  into v_id
  from djm_os.people p
  join djm_os.employments e on e.person_id=p.id
  where p.tenant_id=v_capture.tenant_id and lower(trim(p.full_name))=lower(v_name)
    and e.organisation_id=p_organisation_id
    and e.is_current=true
  order by e.updated_at desc
  limit 1;

  if v_id is null then
    select e.organisation_id
    into v_other_org
    from djm_os.people p
    join djm_os.employments e on e.person_id=p.id and e.is_current=true
    where p.tenant_id=v_capture.tenant_id and lower(trim(p.full_name))=lower(v_name)
      and e.organisation_id<>p_organisation_id
    limit 1;

    if v_other_org is not null then
      raise exception 'A same-name contact is already current at another organisation. Review the identity first.';
    end if;

    select p.id into v_id
    from djm_os.people p
    where p.tenant_id=v_capture.tenant_id and lower(trim(p.full_name))=lower(v_name)
      and not exists (
        select 1 from djm_os.employments e
        where e.person_id=p.id and e.is_current=true
      )
    order by p.updated_at desc
    limit 1;

    if v_id is null then
      v_key:=lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')));
      insert into djm_os.people(tenant_id,
        full_name,person_type,canonical_key,source_confidence
      ) values (v_capture.tenant_id,
        v_name,'club_contact','contact:'||v_key||':'||p_organisation_id::text,1
      ) returning id into v_id;
    end if;

    insert into djm_os.employments(tenant_id,
      person_id,organisation_id,role_title,is_current,confidence,last_verified_at
    ) values (v_capture.tenant_id,
      v_id,p_organisation_id,nullif(trim(coalesce(p_role_title,'')),''),true,1,now()
    );
  end if;

  insert into djm_os.relationships(tenant_id,
    team_member_id,person_id,last_meaningful_at,first_known_at,relationship_notes
  ) values (v_capture.tenant_id,
    v_capture.submitted_by,v_id,v_capture.created_at,v_capture.created_at,'Created or confirmed through Tell DJM.'
  )
  on conflict (team_member_id,person_id)
  do update set
    last_meaningful_at=greatest(
      coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),
      excluded.last_meaningful_at
    ),
    updated_at=now();

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,organisation_id,person_id,payload,source,confidence,occurred_at
  ) values (v_capture.tenant_id,
    'TELL_DJM_CONTACT_CREATED_OR_LINKED',auth.uid(),p_organisation_id,v_id,
    jsonb_build_object('capture_id',p_capture_id,'name',v_name,'club',v_org_name),
    'tell_djm',1,now()
  );

  return jsonb_build_object(
    'entity_type','contact',
    'entity_id',v_id,
    'label',v_name,
    'organisation_id',p_organisation_id,
    'organisation_name',v_org_name,
    'role_title',nullif(trim(coalesce(p_role_title,'')),''),
    'score',1
  );
end;
$$;

create or replace function public.djm_tell_budget_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_budget numeric;
  v_spend numeric;
begin
  perform private.tell_request_tenant();
  select monthly_ai_budget_usd into v_budget from djm_os.tell_djm_settings where id=1;
  select coalesce(sum(coalesce((usage_json->>'estimated_cost_usd')::numeric,0)),0)
  into v_spend
  from djm_os.captures
  where tenant_id=private.tell_request_tenant() and created_at>=date_trunc('month',now()) and processing_version='tell_djm_v1';
  return jsonb_build_object('budget_usd',v_budget,'estimated_spend_usd',v_spend);
end;
$$;

create or replace function public.djm_tell_context_for_route(p_route text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_path text:=split_part(coalesce(p_route,''),'?',1);
  v_match text[];
  v_id uuid;
  v_result jsonb;
begin
  perform private.tell_request_tenant();

  v_match:=regexp_match(v_path,'^/admin/players/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'player_id',p.id,
      'player_name',coalesce(
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        p.preferred_name,
        'Player'
      ),
      'label',coalesce(
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        p.preferred_name,
        'Player'
      ),
      'context_type','player'
    ) into v_result
    from public.players p
    where p.tenant_id=private.tell_request_tenant() and p.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/network/clubs/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'organisation_id',o.id,
      'organisation_name',o.name,
      'label',o.name,
      'context_type','club'
    ) into v_result
    from djm_os.organisations o
    where o.tenant_id=private.tell_request_tenant() and o.id=v_id and o.organisation_type='club';
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/network/contacts/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'person_id',p.id,
      'person_name',p.full_name,
      'organisation_id',e.organisation_id,
      'organisation_name',e.organisation_name,
      'label',p.full_name,
      'context_type','contact'
    ) into v_result
    from djm_os.people p
    left join lateral (
      select employment.organisation_id,o.name as organisation_name
      from djm_os.employments employment
      left join djm_os.organisations o on o.id=employment.organisation_id
      where employment.person_id=p.id and employment.is_current=true
      order by employment.updated_at desc
      limit 1
    ) e on true
    where p.tenant_id=private.tell_request_tenant() and p.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/recruitment/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'prospect_id',sp.id,
      'prospect_name',sp.full_name,
      'player_id',sp.linked_player_id,
      'label',sp.full_name,
      'context_type','recruitment'
    ) into v_result
    from djm_os.scouting_prospects sp
    where sp.tenant_id=private.tell_request_tenant() and sp.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/(?:opportunities|market/deals)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'opportunity_id',d.id,
      'organisation_id',d.organisation_id,
      'organisation_name',o.name,
      'person_id',d.source_person_id,
      'person_name',pe.full_name,
      'player_id',d.player_id,
      'player_name',coalesce(
        nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
        pl.preferred_name
      ),
      'prospect_id',d.prospect_id,
      'prospect_name',sp.full_name,
      'club_need_id',d.club_need_id,
      'label',concat_ws(
        ' -> ',
        coalesce(
          nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
          pl.preferred_name,
          sp.full_name,
          'Player'
        ),
        o.name
      ),
      'context_type','opportunity'
    ) into v_result
    from djm_os.deal_rooms d
    join djm_os.organisations o on o.id=d.organisation_id
    left join djm_os.people pe on pe.id=d.source_person_id
    left join public.players pl on pl.id=d.player_id
    left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
    where d.tenant_id=private.tell_request_tenant() and d.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  return jsonb_build_object('route',v_path);
end;
$$;

create or replace function public.djm_tell_enqueue_capture(
  p_client_capture_id uuid,
  p_capture_type text,
  p_source_uri text default null,
  p_raw_text text default null,
  p_channel text default 'voice_debrief',
  p_person_id uuid default null,
  p_organisation_id uuid default null,
  p_player_id uuid default null,
  p_context_json jsonb default '{}'::jsonb,
  p_duration_seconds numeric default null,
  p_parent_capture_id uuid default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_days integer;
  v_tenant uuid;
begin
  v_tenant := private.tell_request_tenant();
  if v_tenant is null or not private.user_has_staff_tenant_access(v_tenant) then
    raise exception 'Agency staff access required';
  end if;
  perform private.tell_assert_entities(v_tenant,jsonb_build_object(
    'person_id',p_person_id,'organisation_id',p_organisation_id,'player_id',p_player_id,'parent_capture_id',p_parent_capture_id));
  perform private.tell_assert_entities(v_tenant,p_context_json);
  if p_context_json ? 'resolutions' then raise exception 'Capture context denied' using errcode='23514'; end if;
  if p_parent_capture_id is not null then perform private.tell_assert_capture(p_parent_capture_id); end if;
  if p_source_uri is not null and p_source_uri not like
    'djm-network-captures/'||v_tenant::text||'/'||auth.uid()::text||'/tell/%' then
    raise exception 'Capture recording access denied' using errcode='42501';
  end if;
  if p_client_capture_id is null then raise exception 'Client capture ID is required'; end if;
  if p_capture_type not in ('audio','text') then raise exception 'Tell DJM currently supports audio and text captures'; end if;
  if coalesce(length(trim(p_raw_text)),0)=0 and p_source_uri is null then raise exception 'Capture content is required'; end if;

  if not exists (
    select 1 from djm_os.tell_djm_permissions p cross join djm_os.tell_djm_settings s
    where p.user_id=auth.uid() and p.tenant_id=v_tenant and p.is_enabled=true and s.id=1 and s.is_live=true
  ) then raise exception 'Tell DJM is not enabled for this account'; end if;

  select * into v_capture from djm_os.captures
  where tenant_id=v_tenant and submitted_by=auth.uid() and client_capture_id=p_client_capture_id limit 1;
  if found then return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',true); end if;

  select audio_retention_days into v_days from djm_os.tell_djm_settings where id=1;
  insert into djm_os.captures(
    tenant_id,submitted_by,channel,capture_type,raw_text,source_uri,person_id,organisation_id,player_id,
    status,confidence,client_capture_id,context_json,parent_capture_id,audio_duration_seconds,audio_delete_after,next_attempt_at,processing_version
  ) values (
    v_tenant,auth.uid(),coalesce(nullif(trim(p_channel),''),'voice_debrief'),p_capture_type,
    nullif(trim(coalesce(p_raw_text,'')),''),p_source_uri,p_person_id,p_organisation_id,p_player_id,
    'queued',null,p_client_capture_id,coalesce(p_context_json,'{}'::jsonb),p_parent_capture_id,p_duration_seconds,
    case when p_capture_type='audio' then now()+make_interval(days=>coalesce(v_days,7)) else null end,
    now(),'tell_djm_v1'
  ) returning * into v_capture;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values (v_tenant,'TELL_DJM_CAPTURE_QUEUED',auth.uid(),p_person_id,p_organisation_id,p_player_id,
    jsonb_build_object('capture_id',v_capture.id,'capture_type',p_capture_type,'client_capture_id',p_client_capture_id),'tell_djm',1,now());

  return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',false);
end;
$$;

create or replace function public.djm_tell_apply_action(
  p_capture_id uuid,
  p_action_hash text,
  p_action_index integer,
  p_action_type text,
  p_confidence numeric,
  p_evidence text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_permission text;
  v_action djm_os.tell_djm_actions%rowtype;
  v_target_id uuid;
  v_need_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_created boolean:=false;
  v_allowed boolean:=false;
  v_min_conf numeric:=0.80;
  v_org_id uuid;
  v_person_id uuid;
  v_player_id uuid;
  v_position text:=nullif(p_payload->>'position','');
begin
  select * into v_capture
  from djm_os.captures
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;
  if not private.user_has_staff_tenant_access(v_capture.tenant_id,v_capture.submitted_by) then
    raise exception 'Capture workspace access denied' using errcode='42501';
  end if;
  perform private.tell_assert_entities(v_capture.tenant_id,p_payload);

  begin
    v_org_id:=nullif(p_payload->>'organisation_id','')::uuid;
  exception when invalid_text_representation then
    v_org_id:=null;
  end;
  begin
    v_person_id:=nullif(p_payload->>'person_id','')::uuid;
  exception when invalid_text_representation then
    v_person_id:=null;
  end;
  begin
    v_player_id:=nullif(p_payload->>'player_id','')::uuid;
  exception when invalid_text_representation then
    v_player_id:=null;
  end;

  select permission_scope into v_permission
  from djm_os.tell_djm_permissions
  where tenant_id=v_capture.tenant_id and user_id=v_capture.submitted_by
    and is_enabled=true;

  if v_permission is null then v_permission:='read_only'; end if;

  select * into v_action
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id
    and action_hash=p_action_hash;

  if found and v_action.status in ('applied','undone','needs_review') then
    return jsonb_build_object(
      'action_id',v_action.id,
      'status',v_action.status,
      'duplicate',true,
      'target_id',v_action.target_id
    );
  end if;

  v_allowed:=
    v_permission='full'
    or (
      v_permission='scout'
      and p_action_type in (
        'log_interaction',
        'create_task',
        'add_claim',
        'suggest_player',
        'exclude_player'
      )
    );

  v_min_conf:=case p_action_type
    when 'add_claim' then 0.65
    when 'log_interaction' then 0.75
    when 'create_task' then 0.78
    when 'upsert_club_need' then 0.84
    when 'suggest_player' then 0.84
    when 'exclude_player' then 0.88
    else 1
  end;

  if not v_allowed or coalesce(p_confidence,0)<v_min_conf then
    insert into djm_os.tell_djm_actions(tenant_id,
      capture_id,action_hash,action_index,action_type,status,
      confidence,evidence,proposed_payload,resolved_payload
    )
    values (v_capture.tenant_id,
      p_capture_id,p_action_hash,p_action_index,p_action_type,'needs_review',
      p_confidence,p_evidence,p_payload,p_payload
    )
    on conflict (capture_id,action_hash)
    do update
    set status='needs_review',
        confidence=excluded.confidence,
        evidence=excluded.evidence,
        resolved_payload=excluded.resolved_payload,
        error_message=null,
        updated_at=now()
    returning * into v_action;

    insert into djm_os.review_items(tenant_id,
      owner_user_id,review_type,title,detail,person_id,
      organisation_id,player_id,capture_id,confidence,payload,status
    )
    values (v_capture.tenant_id,
      v_capture.submitted_by,
      'tell_djm_action_review',
      'Check Tell DJM updates',
      'One or more Tell DJM actions need review before they change DJM data.',
      v_person_id,
      v_org_id,
      v_player_id,
      p_capture_id,
      p_confidence,
      jsonb_build_object(
        'actions',jsonb_build_array(jsonb_build_object(
          'action_id',v_action.id,
          'action_type',p_action_type,
          'evidence',p_evidence,
          'payload',p_payload
        ))
      ),
      'open'
    )
    on conflict (capture_id,review_type)
    do update
    set confidence=greatest(
          coalesce(djm_os.review_items.confidence,0),
          coalesce(excluded.confidence,0)
        ),
        payload=jsonb_build_object(
          'actions',
          coalesce(djm_os.review_items.payload->'actions','[]'::jsonb)
          || coalesce(excluded.payload->'actions','[]'::jsonb)
        ),
        status=case
          when djm_os.review_items.status in ('approved','rejected','resolved','expired') then 'open'
          else djm_os.review_items.status
        end,
        resolved_at=null;

    return jsonb_build_object(
      'action_id',v_action.id,
      'status','needs_review',
      'duplicate',false
    );
  end if;

  if p_action_type='log_interaction' then
    select i.id,to_jsonb(i)
    into v_target_id,v_after
    from djm_os.interactions i
    where i.tenant_id=v_capture.tenant_id and i.source_external_id='tell:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.interactions(tenant_id,
        occurred_at,channel,direction,team_member_id,person_id,
        organisation_id,source_external_id,source_type,source_uri,
        raw_text,summary,confidence
      )
      values (v_capture.tenant_id,
        v_capture.created_at,
        coalesce(v_capture.channel,'voice_debrief'),
        'logged',
        v_capture.submitted_by,
        v_person_id,
        v_org_id,
        'tell:'||p_capture_id::text||':'||p_action_hash,
        'tell_djm',
        v_capture.source_uri,
        v_capture.transcript_text,
        coalesce(nullif(p_payload->>'summary',''),p_evidence),
        p_confidence
      )
      returning id into v_target_id;
      v_created:=true;

      select to_jsonb(i) into v_after
      from djm_os.interactions i where i.id=v_target_id;
    end if;

  elsif p_action_type='create_task' then
    if nullif(p_payload->>'title','') is null then
      raise exception 'Task title is required';
    end if;

    select t.id,to_jsonb(t)
    into v_target_id,v_after
    from djm_os.tasks t
    where t.tenant_id=v_capture.tenant_id and t.source='tell_djm:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.tasks(tenant_id,
        title,task_type,owner_user_id,person_id,organisation_id,
        player_id,due_at,status,priority,source
      )
      values (v_capture.tenant_id,
        p_payload->>'title',
        'tell_djm',
        v_capture.submitted_by,
        v_person_id,
        v_org_id,
        v_player_id,
        nullif(p_payload->>'due_at','')::timestamptz,
        'open',
        greatest(
          1,
          least(coalesce(nullif(p_payload->>'priority','')::integer,3),5)
        ),
        'tell_djm:'||p_capture_id::text||':'||p_action_hash
      )
      returning id into v_target_id;
      v_created:=true;

      select to_jsonb(t) into v_after
      from djm_os.tasks t where t.id=v_target_id;
    end if;

  elsif p_action_type='add_claim' then
    if v_org_id is null and v_person_id is null and v_player_id is null then
      raise exception 'Claim target is required';
    end if;
    if nullif(p_payload->>'claim_value','') is null then
      raise exception 'Claim value is required';
    end if;

    select c.id,to_jsonb(c)
    into v_target_id,v_after
    from djm_os.claims c
    where c.tenant_id=v_capture.tenant_id and c.source_key='tell:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.claims(tenant_id,
        person_id,organisation_id,player_id,claim_type,claim_key,
        value_json,confidence,valid_from,last_verified_at,
        source_uri,verification_status,source_key
      )
      values (v_capture.tenant_id,
        v_person_id,
        v_org_id,
        v_player_id,
        coalesce(nullif(p_payload->>'claim_type',''),'voice_intelligence'),
        nullif(p_payload->>'claim_key',''),
        jsonb_build_object(
          'text',p_payload->>'claim_value',
          'evidence',p_evidence,
          'source','tell_djm'
        ),
        p_confidence,
        v_capture.created_at,
        null,
        v_capture.source_uri,
        'unverified',
        'tell:'||p_capture_id::text||':'||p_action_hash
      )
      returning id into v_target_id;
      v_created:=true;

      select to_jsonb(c) into v_after
      from djm_os.claims c where c.id=v_target_id;
    end if;

  elsif p_action_type='upsert_club_need' then
    if v_org_id is null or v_position is null then
      raise exception 'Club and position are required for a club need';
    end if;

    select n.id,to_jsonb(n)
    into v_need_id,v_before
    from djm_os.club_needs n
    where n.tenant_id=v_capture.tenant_id and n.organisation_id=v_org_id
      and n.status in ('active','open')
      and djm_os.normalise_need_position(n.position)=v_position
      and n.received_at>=v_capture.created_at-interval '120 days'
    order by n.received_at desc
    limit 1;

    if v_need_id is null then
      insert into djm_os.club_needs(tenant_id,
        organisation_id,source_person_id,owner_user_id,title,
        position,secondary_position,preferred_foot,min_age,max_age,
        min_height_cm,transfer_type,transfer_budget,salary_budget,
        currency,salary_period,salary_tax_basis,registration_notes,
        profile_notes,playing_style,raw_request,source_context,
        status,confidence,confirmed_at,received_at,priority,need_type
      )
      values (v_capture.tenant_id,
        v_org_id,
        v_person_id,
        v_capture.submitted_by,
        coalesce(nullif(p_payload->>'title',''),v_position||' requirement'),
        v_position,
        nullif(p_payload->>'secondary_position',''),
        nullif(p_payload->>'preferred_foot',''),
        nullif(p_payload->>'min_age','')::smallint,
        nullif(p_payload->>'max_age','')::smallint,
        nullif(p_payload->>'min_height_cm','')::smallint,
        nullif(p_payload->>'transfer_type',''),
        nullif(p_payload->>'transfer_budget','')::numeric,
        nullif(p_payload->>'salary_budget','')::numeric,
        nullif(p_payload->>'currency',''),
        nullif(p_payload->>'salary_period',''),
        nullif(p_payload->>'salary_tax_basis',''),
        nullif(p_payload->>'registration_notes',''),
        nullif(p_payload->>'profile_notes',''),
        nullif(p_payload->>'playing_style',''),
        v_capture.transcript_text,
        'Tell DJM',
        'active',
        p_confidence,
        v_capture.created_at,
        v_capture.created_at,
        greatest(
          1,
          least(coalesce(nullif(p_payload->>'priority','')::integer,3),5)
        ),
        coalesce(nullif(p_payload->>'need_type',''),'confirmed')
      )
      returning id into v_need_id;

      v_created:=true;
      v_before:=jsonb_build_object('created',true);
    else
      update djm_os.club_needs
      set source_person_id=coalesce(v_person_id,source_person_id),
          secondary_position=coalesce(
            nullif(p_payload->>'secondary_position',''),
            secondary_position
          ),
          preferred_foot=coalesce(
            nullif(p_payload->>'preferred_foot',''),
            preferred_foot
          ),
          min_age=coalesce(nullif(p_payload->>'min_age','')::smallint,min_age),
          max_age=coalesce(nullif(p_payload->>'max_age','')::smallint,max_age),
          min_height_cm=coalesce(
            nullif(p_payload->>'min_height_cm','')::smallint,
            min_height_cm
          ),
          transfer_type=coalesce(
            nullif(p_payload->>'transfer_type',''),
            transfer_type
          ),
          transfer_budget=coalesce(
            nullif(p_payload->>'transfer_budget','')::numeric,
            transfer_budget
          ),
          salary_budget=coalesce(
            nullif(p_payload->>'salary_budget','')::numeric,
            salary_budget
          ),
          currency=coalesce(nullif(p_payload->>'currency',''),currency),
          salary_period=coalesce(
            nullif(p_payload->>'salary_period',''),
            salary_period
          ),
          salary_tax_basis=coalesce(
            nullif(p_payload->>'salary_tax_basis',''),
            salary_tax_basis
          ),
          registration_notes=coalesce(
            nullif(p_payload->>'registration_notes',''),
            registration_notes
          ),
          profile_notes=coalesce(
            nullif(p_payload->>'profile_notes',''),
            profile_notes
          ),
          playing_style=coalesce(
            nullif(p_payload->>'playing_style',''),
            playing_style
          ),
          raw_request=coalesce(raw_request||E'\n\n','')||v_capture.transcript_text,
          source_context='Tell DJM',
          confidence=greatest(confidence,p_confidence),
          updated_at=now()
      where id=v_need_id;
    end if;

    v_target_id:=v_need_id;
    select to_jsonb(n) into v_after
    from djm_os.club_needs n where n.id=v_need_id;

  elsif p_action_type in ('suggest_player','exclude_player') then
    if v_org_id is null or v_player_id is null or v_position is null then
      raise exception 'Club, player and position are required';
    end if;

    select n.id into v_need_id
    from djm_os.club_needs n
    where n.tenant_id=v_capture.tenant_id and n.organisation_id=v_org_id
      and n.status in ('active','open')
      and djm_os.normalise_need_position(n.position)=v_position
    order by n.received_at desc
    limit 1;

    if v_need_id is null then
      raise exception 'No active matching club need exists yet';
    end if;

    insert into djm_os.player_matches(tenant_id,
      club_need_id,player_id,overall_score,football_score,
      commercial_score,registration_score,career_score,access_score,
      reasoning,status
    )
    values (v_capture.tenant_id,
      v_need_id,
      v_player_id,
      null,null,null,null,null,null,
      jsonb_build_object('source','tell_djm','evidence',p_evidence),
      case when p_action_type='suggest_player' then 'suggested' else 'rejected' end
    )
    on conflict (club_need_id,player_id)
    do update
    set status=excluded.status,
        reasoning=excluded.reasoning,
        updated_at=now()
    returning id into v_target_id;

    select to_jsonb(pm) into v_after
    from djm_os.player_matches pm where pm.id=v_target_id;

  else
    raise exception 'Unsupported Tell DJM action type';
  end if;

  if v_target_id is null or v_after is null then
    raise exception 'Tell DJM write could not be verified';
  end if;

  insert into djm_os.tell_djm_actions(tenant_id,
    capture_id,action_hash,action_index,action_type,status,
    confidence,evidence,proposed_payload,resolved_payload,
    target_type,target_id,before_json,after_json,
    verification_json,undo_supported,applied_at
  )
  values (v_capture.tenant_id,
    p_capture_id,
    p_action_hash,
    p_action_index,
    p_action_type,
    'applied',
    p_confidence,
    p_evidence,
    p_payload,
    p_payload,
    case
      when p_action_type='create_task' then 'task'
      when p_action_type='log_interaction' then 'interaction'
      when p_action_type='add_claim' then 'claim'
      when p_action_type='upsert_club_need' then 'club_need'
      else 'player_match'
    end,
    v_target_id,
    coalesce(v_before,jsonb_build_object('created',v_created)),
    v_after,
    jsonb_build_object(
      'read_back',true,
      'verified_at',now(),
      'target_exists',true
    ),
    (
      p_action_type in ('create_task','log_interaction','add_claim')
      or (
        p_action_type='upsert_club_need'
        and coalesce((v_before->>'created')::boolean,false)=true
      )
    ),
    now()
  )
  on conflict (capture_id,action_hash)
  do update
  set status='applied',
      confidence=excluded.confidence,
      evidence=excluded.evidence,
      resolved_payload=excluded.resolved_payload,
      target_type=excluded.target_type,
      target_id=excluded.target_id,
      before_json=excluded.before_json,
      after_json=excluded.after_json,
      verification_json=excluded.verification_json,
      undo_supported=excluded.undo_supported,
      error_message=null,
      applied_at=excluded.applied_at,
      updated_at=now()
  returning * into v_action;

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  )
  values (v_capture.tenant_id,
    'TELL_DJM_ACTION_APPLIED',
    v_capture.submitted_by,
    v_person_id,
    v_org_id,
    v_player_id,
    jsonb_build_object(
      'capture_id',p_capture_id,
      'action_id',v_action.id,
      'action_type',p_action_type,
      'target_id',v_target_id
    ),
    'tell_djm',
    p_confidence,
    now()
  );

  return jsonb_build_object(
    'action_id',v_action.id,
    'status','applied',
    'target_id',v_target_id,
    'duplicate',false,
    'verified',true
  );

exception
  when others then
    insert into djm_os.tell_djm_actions(tenant_id,
      capture_id,action_hash,action_index,action_type,status,
      confidence,evidence,proposed_payload,resolved_payload,error_message
    )
    values (v_capture.tenant_id,
      p_capture_id,p_action_hash,p_action_index,p_action_type,'failed',
      p_confidence,p_evidence,p_payload,p_payload,left(sqlerrm,1000)
    )
    on conflict (capture_id,action_hash)
    do update
    set status='failed',
        error_message=excluded.error_message,
        updated_at=now();

    return jsonb_build_object(
      'status','failed',
      'error',sqlerrm
    );
end;
$$;

create or replace function public.djm_tell_apply_scout_observation(
  p_capture_id uuid,
  p_action_hash text,
  p_action_index integer,
  p_confidence numeric,
  p_evidence text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_permission text;
  v_action djm_os.tell_djm_actions%rowtype;
  v_prospect_id uuid;
  v_report_id uuid;
  v_player_id uuid;
  v_name text:=trim(coalesce(p_payload->>'player_name',''));
  v_source_type text:=coalesce(nullif(p_payload->>'scout_source_type',''),'conversation');
  v_recommendation text:=nullif(p_payload->>'scout_recommendation','');
  v_source_key text:='tell:'||p_capture_id::text||':'||p_action_hash;
  v_after jsonb;
  v_created_prospect boolean:=false;
  v_review jsonb;
begin
  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;
  if not private.user_has_staff_tenant_access(v_capture.tenant_id,v_capture.submitted_by) then
    raise exception 'Capture workspace access denied' using errcode='42501';
  end if;
  perform private.tell_assert_entities(v_capture.tenant_id,p_payload);

  select permission_scope into v_permission
  from djm_os.tell_djm_permissions
  where tenant_id=v_capture.tenant_id and user_id=v_capture.submitted_by and is_enabled=true;

  if coalesce(v_permission,'read_only') not in ('full','scout') or coalesce(p_confidence,0)<0.72 then
    select public.djm_tell_apply_action(
      p_capture_id,p_action_hash,p_action_index,'log_scout_observation',0,
      p_evidence,p_payload
    ) into v_review;
    return v_review;
  end if;

  select * into v_action
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and action_hash=p_action_hash;
  if found and v_action.status in ('applied','undone','needs_review') then
    return jsonb_build_object(
      'action_id',v_action.id,'status',v_action.status,'duplicate',true,
      'target_id',v_action.target_id
    );
  end if;

  if length(v_name)<2 then raise exception 'Scout observation player name is required'; end if;

  begin
    v_prospect_id:=nullif(p_payload->>'prospect_id','')::uuid;
  exception when invalid_text_representation then
    v_prospect_id:=null;
  end;

  if v_prospect_id is not null and not exists (
    select 1 from djm_os.scouting_prospects sp where sp.tenant_id=v_capture.tenant_id and sp.id=v_prospect_id
  ) then
    raise exception 'Recruitment target not found';
  end if;

  if v_prospect_id is null then
    select sp.id into v_prospect_id
    from djm_os.scouting_prospects sp
    where sp.tenant_id=v_capture.tenant_id and lower(trim(regexp_replace(sp.full_name,'[^[:alnum:]]+',' ','g')))
          =lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')))
      and (
        nullif(p_payload->>'player_current_club','') is null
        or sp.current_club is null
        or extensions.similarity(lower(sp.current_club),lower(p_payload->>'player_current_club'))>=0.65
      )
    order by sp.updated_at desc
    limit 1;
  end if;

  if v_prospect_id is null then
    select p.id into v_player_id
    from public.players p
    where p.tenant_id=v_capture.tenant_id and greatest(
      extensions.similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(v_name)),
      extensions.similarity(lower(coalesce(p.preferred_name,'')),lower(v_name))
    )>=0.94
    order by greatest(
      extensions.similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(v_name)),
      extensions.similarity(lower(coalesce(p.preferred_name,'')),lower(v_name))
    ) desc
    limit 1;

    insert into djm_os.scouting_prospects(tenant_id,
      linked_player_id,full_name,current_club,current_country,primary_position,
      availability_status,source,source_confidence,owner_user_id,canonical_key,
      recruitment_stage,recruitment_priority
    ) values (v_capture.tenant_id,
      v_player_id,
      v_name,
      nullif(p_payload->>'player_current_club',''),
      nullif(p_payload->>'player_current_country',''),
      nullif(p_payload->>'position',''),
      'monitor',
      'tell_djm',
      p_confidence,
      v_capture.submitted_by,
      'tell:'||v_capture.tenant_id::text||':'||lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g'))),
      'identified',
      greatest(1,least(coalesce(nullif(p_payload->>'priority','')::integer,3),5))
    )
    on conflict (canonical_key) where canonical_key is not null
    do update set
      current_club=coalesce(djm_os.scouting_prospects.current_club,excluded.current_club),
      current_country=coalesce(djm_os.scouting_prospects.current_country,excluded.current_country),
      primary_position=coalesce(djm_os.scouting_prospects.primary_position,excluded.primary_position),
      source_confidence=greatest(
        coalesce(djm_os.scouting_prospects.source_confidence,0),
        coalesce(excluded.source_confidence,0)
      ),
      updated_at=now()
    returning id into v_prospect_id;
    v_created_prospect:=true;
  else
    update djm_os.scouting_prospects
    set current_club=coalesce(current_club,nullif(p_payload->>'player_current_club','')),
        current_country=coalesce(current_country,nullif(p_payload->>'player_current_country','')),
        primary_position=coalesce(primary_position,nullif(p_payload->>'position','')),
        source_confidence=greatest(coalesce(source_confidence,0),coalesce(p_confidence,0)),
        updated_at=now()
    where id=v_prospect_id;
  end if;

  insert into djm_os.scouting_reports(tenant_id,
    prospect_id,scout_user_id,report_date,source_type,match_or_context,
    football_score,physical_score,tactical_score,mentality_score,personality_score,
    readiness_score,recommendation,strengths,risks,role_fit,notes,source_key
  ) values (v_capture.tenant_id,
    v_prospect_id,
    v_capture.submitted_by,
    v_capture.created_at::date,
    case when v_source_type in ('live','video','data','reference','conversation')
      then v_source_type else 'conversation' end,
    nullif(p_payload->>'summary',''),
    null,null,null,null,null,null,
    case when v_recommendation in ('strong_yes','yes','monitor','no','strong_no')
      then v_recommendation else null end,
    nullif(p_payload->>'strengths',''),
    nullif(p_payload->>'risks',''),
    nullif(p_payload->>'profile_notes',''),
    p_evidence,
    v_source_key
  )
  on conflict (source_key)
  do update set updated_at=djm_os.scouting_reports.updated_at
  returning id into v_report_id;

  select jsonb_build_object(
    'report',to_jsonb(r),
    'prospect',to_jsonb(sp),
    'prospect_was_new_at_resolution',v_created_prospect
  ) into v_after
  from djm_os.scouting_reports r
  join djm_os.scouting_prospects sp on sp.id=r.prospect_id
  where r.id=v_report_id;

  if v_after is null then raise exception 'Scout observation write could not be verified'; end if;

  insert into djm_os.tell_djm_actions(tenant_id,
    capture_id,action_hash,action_index,action_type,status,confidence,evidence,
    proposed_payload,resolved_payload,target_type,target_id,before_json,after_json,
    verification_json,undo_supported,applied_at
  ) values (v_capture.tenant_id,
    p_capture_id,p_action_hash,p_action_index,'log_scout_observation','applied',
    p_confidence,p_evidence,p_payload,p_payload,'scouting_report',v_report_id,
    jsonb_build_object('prospect_was_new_at_resolution',v_created_prospect,'prospect_id',v_prospect_id),
    v_after,
    jsonb_build_object('read_back',true,'verified_at',now(),'target_exists',true),
    true,now()
  )
  on conflict (capture_id,action_hash)
  do update set
    status='applied',target_id=excluded.target_id,after_json=excluded.after_json,
    verification_json=excluded.verification_json,error_message=null,applied_at=excluded.applied_at,
    updated_at=now()
  returning * into v_action;

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,player_id,payload,source,confidence,occurred_at
  ) values (v_capture.tenant_id,
    'TELL_DJM_SCOUT_OBSERVATION_LOGGED',v_capture.submitted_by,v_player_id,
    jsonb_build_object(
      'capture_id',p_capture_id,'action_id',v_action.id,
      'prospect_id',v_prospect_id,'report_id',v_report_id
    ),
    'tell_djm',p_confidence,now()
  );

  return jsonb_build_object(
    'action_id',v_action.id,'status','applied','target_id',v_report_id,
    'prospect_id',v_prospect_id,'verified',true,'duplicate',false
  );
exception
  when others then
    insert into djm_os.tell_djm_actions(tenant_id,
      capture_id,action_hash,action_index,action_type,status,confidence,evidence,
      proposed_payload,resolved_payload,error_message
    ) values (v_capture.tenant_id,
      p_capture_id,p_action_hash,p_action_index,'log_scout_observation','failed',
      p_confidence,p_evidence,p_payload,p_payload,left(sqlerrm,1000)
    )
    on conflict (capture_id,action_hash)
    do update set status='failed',error_message=excluded.error_message,updated_at=now();
    return jsonb_build_object('status','failed','error',sqlerrm);
end;
$$;

create or replace function public.djm_tell_notify_attention(
  p_capture_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_url text;
  v_title text;
  v_body text;
  v_fingerprint text;
  v_inserted integer := 0;
  v_has_open_work boolean := false;
begin
  select *
    into v_capture
  from djm_os.captures
  where id = p_capture_id;

  if not found then
    raise exception 'Capture not found';
  end if;

  if v_capture.status not in (
    'needs_input',
    'needs_review',
    'partial',
    'failed',
    'budget_blocked'
  ) then
    return jsonb_build_object(
      'queued', false,
      'status', v_capture.status
    );
  end if;

  select exists(
    select 1
    from djm_os.tell_djm_questions q
    where q.capture_id = v_capture.id
      and q.status not in ('answered', 'superseded', 'cancelled')
    union all
    select 1
    from djm_os.tell_djm_actions a
    where a.capture_id = v_capture.id
      and a.status in ('needs_review', 'failed')
  )
  into v_has_open_work;

  if v_capture.status = 'needs_review'
    and not v_has_open_work
  then
    return jsonb_build_object(
      'queued', false,
      'status', v_capture.status,
      'reason', 'no_action_required'
    );
  end if;

  v_title := case v_capture.status
    when 'needs_input' then 'Your update needs an answer'
    when 'needs_review' then 'Your update needs a quick check'
    when 'failed' then 'Your update could not finish'
    when 'partial' then 'Part of your update was saved'
    else 'Your update is paused'
  end;

  v_body := left(
    coalesce(
      nullif(v_capture.summary, ''),
      'Open your workspace to check this update.'
    ),
    240
  );

  select '/tell?workspace='||t.slug||'&capture='||v_capture.id::text into v_url
  from platform.tenants t where t.id=v_capture.tenant_id;

  v_fingerprint := 'tell:' || v_capture.id::text;

  insert into djm_os.notifications(
    tenant_id,
    user_id,
    notification_type,
    title,
    body,
    priority,
    person_id,
    organisation_id,
    player_id,
    payload,
    fingerprint,
    expires_at
  )
  values(
    v_capture.tenant_id,
    v_capture.submitted_by,
    'tell_djm_attention',
    v_title,
    v_body,
    case
      when v_capture.status in ('failed', 'partial', 'budget_blocked') then 92
      else 82
    end,
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object(
      'tenant_id', v_capture.tenant_id,
      'capture_id', v_capture.id,
      'status', v_capture.status,
      'url', v_url
    ),
    v_fingerprint,
    now() + interval '14 days'
  )
  on conflict(fingerprint)
  where fingerprint is not null
  do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    perform private.djm_queue_push(
      v_capture.submitted_by,
      'tell_djm_attention',
      v_title,
      v_body,
      v_url,
      jsonb_build_object(
        'tenant_id', v_capture.tenant_id,
        'capture_id', v_capture.id,
        'status', v_capture.status
      ),
      'tell:' || v_capture.id::text
    );
  end if;

  return jsonb_build_object(
    'queued', v_inserted = 1,
    'status', v_capture.status,
    'fingerprint', v_fingerprint
  );
end;
$$;

create or replace function public.djm_tell_record_question(
  p_capture_id uuid,
  p_field_key text,
  p_prompt text,
  p_reason text,
  p_candidates jsonb,
  p_context_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_id uuid;
begin
  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;
  perform private.tell_assert_entities(v_capture.tenant_id,p_candidates);
  perform private.tell_assert_entities(v_capture.tenant_id,p_context_json);
  select id into v_id
  from djm_os.tell_djm_questions
  where capture_id=p_capture_id
    and field_key=p_field_key
    and prompt=p_prompt
    and status='open'
  limit 1;

  if found then return v_id; end if;

  insert into djm_os.tell_djm_questions(tenant_id,
    capture_id,field_key,prompt,reason,candidates,context_json
  )
  values (v_capture.tenant_id,
    p_capture_id,p_field_key,p_prompt,p_reason,
    coalesce(p_candidates,'[]'::jsonb),coalesce(p_context_json,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


create or replace function public.djm_tell_user_can_process(
  p_user_id uuid,
  p_capture_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from djm_os.captures c
    join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by and p.tenant_id=c.tenant_id
    join djm_os.team_members tm on tm.user_id=c.submitted_by
    where c.id=p_capture_id
      and c.submitted_by=p_user_id
      and p.is_enabled=true
      and private.user_has_staff_tenant_access(c.tenant_id,p_user_id)
      and tm.is_active=true
  );
$$;

create or replace function private.tell_resolve_entity_typed(
  p_tenant_id uuid,
  p_user_id uuid,
  p_entity_type text,
  p_name text,
  p_organisation_name text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query text:=lower(trim(regexp_replace(coalesce(p_name,''),'[^[:alnum:]]+',' ','g')));
  v_org_query text:=lower(trim(regexp_replace(coalesce(p_organisation_name,''),'[^[:alnum:]]+',' ','g')));
  v_result jsonb:='[]'::jsonb;
  v_alias_id uuid;
  v_alias_label text;
  v_alias_candidate jsonb;
begin
  if p_entity_type not in ('club','contact','player','prospect') or v_query='' then
    return jsonb_build_object(
      'resolved_id',null,
      'resolved_label',null,
      'candidates','[]'::jsonb,
      'matched_by',null
    );
  end if;

  select a.entity_id
  into v_alias_id
  from djm_os.tell_djm_aliases a
  where a.tenant_id=p_tenant_id and a.entity_type=p_entity_type
    and a.normalised_alias=v_query
    and (a.owner_user_id=p_user_id or a.owner_user_id is null)
  order by
    case when a.owner_user_id=p_user_id then 0 else 1 end,
    a.confirmed_count desc,
    a.updated_at desc
  limit 1;

  if v_alias_id is not null then
    if p_entity_type='club' then
      select
        o.name,
        jsonb_build_object(
          'entity_type','club',
          'entity_id',o.id,
          'label',o.name,
          'country',o.country,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from djm_os.organisations o
      where o.tenant_id=p_tenant_id and o.id=v_alias_id
        and o.organisation_type='club';

    elsif p_entity_type='contact' then
      select
        p.full_name,
        jsonb_build_object(
          'entity_type','contact',
          'entity_id',p.id,
          'label',p.full_name,
          'organisation_id',e.organisation_id,
          'organisation_name',o.name,
          'role_title',e.role_title,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from djm_os.people p
      left join lateral (
        select employment.organisation_id,employment.role_title
        from djm_os.employments employment
        where employment.tenant_id=p_tenant_id and employment.person_id=p.id
          and employment.is_current=true
        order by employment.updated_at desc
        limit 1
      ) e on true
      left join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=p_tenant_id
      where p.tenant_id=p_tenant_id and p.id=v_alias_id
        and coalesce(p.person_type,'contact')<>'player';

    elsif p_entity_type='player' then
      select
        coalesce(
          nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
          p.preferred_name
        ),
        jsonb_build_object(
          'entity_type','player',
          'entity_id',p.id,
          'label',coalesce(
            nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
            p.preferred_name
          ),
          'club',p.current_club,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from public.players p
      where p.tenant_id=p_tenant_id and p.id=v_alias_id;

    elsif p_entity_type='prospect' then
      select
        sp.full_name,
        jsonb_build_object(
          'entity_type','prospect',
          'entity_id',sp.id,
          'label',sp.full_name,
          'club',sp.current_club,
          'country',sp.current_country,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from djm_os.scouting_prospects sp
      where sp.tenant_id=p_tenant_id and sp.id=v_alias_id;
    end if;

    if v_alias_label is not null then
      return jsonb_build_object(
        'resolved_id',v_alias_id,
        'resolved_label',v_alias_label,
        'candidates',jsonb_build_array(v_alias_candidate),
        'matched_by','confirmed_alias'
      );
    end if;
  end if;

  if p_entity_type='club' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','club',
          'entity_id',candidate.id,
          'label',candidate.name,
          'country',candidate.country,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          o.id,
          o.name,
          o.country,
          greatest(
            extensions.similarity(lower(o.name),lower(p_name)),
            case
              when lower(trim(regexp_replace(o.name,'[^[:alnum:]]+',' ','g')))=v_query
                then 1
              when length(v_query)>=5 and (
                lower(o.name) like lower(p_name)||'%'
                or lower(p_name) like lower(o.name)||'%'
              ) then 0.93
              else 0
            end
          ) as score
        from djm_os.organisations o
        where o.tenant_id=p_tenant_id and o.organisation_type='club'
      ) scored
      where scored.score>=0.28
      order by scored.score desc,scored.name
      limit 5
    ) candidate;

  elsif p_entity_type='contact' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','contact',
          'entity_id',candidate.id,
          'label',candidate.full_name,
          'organisation_id',candidate.organisation_id,
          'organisation_name',candidate.organisation_name,
          'role_title',candidate.role_title,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.full_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          p.id,
          p.full_name,
          e.organisation_id,
          o.name as organisation_name,
          e.role_title,
          least(
            1,
            greatest(
              extensions.similarity(lower(p.full_name),lower(p_name)),
              case
                when lower(trim(regexp_replace(p.full_name,'[^[:alnum:]]+',' ','g')))=v_query
                  then 1
                when split_part(lower(p.full_name),' ',1)=lower(trim(p_name))
                     and v_org_query<>''
                     and extensions.similarity(lower(coalesce(o.name,'')),lower(p_organisation_name))>=0.60
                  then 0.94
                else 0
              end
            )
            + case
                when v_org_query<>''
                 and extensions.similarity(lower(coalesce(o.name,'')),lower(p_organisation_name))>=0.60
                then 0.12 else 0
              end
          ) as score
        from djm_os.people p
        left join lateral (
          select employment.organisation_id,employment.role_title,employment.updated_at
          from djm_os.employments employment
          where employment.tenant_id=p_tenant_id and employment.person_id=p.id
            and employment.is_current=true
          order by employment.updated_at desc
          limit 1
        ) e on true
        left join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=p_tenant_id
        where p.tenant_id=p_tenant_id and coalesce(p.person_type,'contact')<>'player'
      ) scored
      where scored.score>=0.28
      order by scored.score desc,scored.full_name
      limit 5
    ) candidate;

  elsif p_entity_type='player' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','player',
          'entity_id',candidate.id,
          'label',candidate.player_name,
          'club',candidate.current_club,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.player_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          p.id,
          coalesce(
            nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
            p.preferred_name
          ) as player_name,
          p.current_club,
          greatest(
            extensions.similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(p_name)),
            extensions.similarity(lower(coalesce(p.preferred_name,'')),lower(p_name)),
            case
              when lower(trim(concat_ws(' ',p.first_name,p.last_name)))=v_query then 1
              when lower(trim(coalesce(p.preferred_name,'')))=v_query then 1
              else 0
            end
          ) as score
        from public.players p where p.tenant_id=p_tenant_id
      ) scored
      where scored.score>=0.28
      order by scored.score desc,scored.player_name
      limit 5
    ) candidate;
  elsif p_entity_type='prospect' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','prospect',
          'entity_id',candidate.id,
          'label',candidate.full_name,
          'club',candidate.current_club,
          'country',candidate.current_country,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.full_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          sp.id,
          sp.full_name,
          sp.current_club,
          sp.current_country,
          least(
            1,
            greatest(
              extensions.similarity(lower(sp.full_name),lower(p_name)),
              case
                when lower(trim(regexp_replace(sp.full_name,'[^[:alnum:]]+',' ','g')))=v_query then 1
                else 0
              end
            )
            + case
                when v_org_query<>''
                 and extensions.similarity(lower(coalesce(sp.current_club,'')),lower(p_organisation_name))>=0.60
                then 0.08 else 0
              end
          ) as score
        from djm_os.scouting_prospects sp where sp.tenant_id=p_tenant_id
      ) scored
      where scored.score>=0.34
      order by scored.score desc,scored.full_name
      limit 5
    ) candidate;
  end if;

  return jsonb_build_object(
    'resolved_id',
    case
      when jsonb_array_length(v_result)=0 then null
      when coalesce((v_result->0->>'score')::numeric,0)>=0.88
       and (
         jsonb_array_length(v_result)=1
         or coalesce((v_result->0->>'score')::numeric,0)
            -coalesce((v_result->1->>'score')::numeric,0)>=0.10
       )
      then v_result->0->>'entity_id'
      else null
    end,
    'resolved_label',
    case
      when jsonb_array_length(v_result)>0
       and coalesce((v_result->0->>'score')::numeric,0)>=0.88
       and (
         jsonb_array_length(v_result)=1
         or coalesce((v_result->0->>'score')::numeric,0)
            -coalesce((v_result->1->>'score')::numeric,0)>=0.10
       )
      then v_result->0->>'label'
      else null
    end,
    'candidates',v_result,
    'matched_by','fuzzy'
  );
end;
$$;

revoke all on function private.tell_resolve_entity_typed(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.tell_resolve_entity_typed(uuid,uuid,text,text,text) to service_role;

create or replace function public.djm_tell_capture_resolve_entity(
  p_capture_id uuid,
  p_entity_type text,
  p_name text,
  p_organisation_name text default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_primary jsonb;
  v_player jsonb;
  v_candidates jsonb:='[]'::jsonb;
begin
  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;
  v_primary:=private.tell_resolve_entity_typed(
    v_capture.tenant_id,v_capture.submitted_by,p_entity_type,p_name,p_organisation_name
  );

  if p_entity_type<>'contact'
     or nullif(v_primary->>'resolved_id','') is not null then
    return v_primary;
  end if;

  v_player:=private.tell_resolve_entity_typed(
    v_capture.tenant_id,v_capture.submitted_by,'player',p_name,null
  );

  select coalesce(
    jsonb_agg(
      candidate
      order by coalesce((candidate->>'score')::numeric,0) desc,
               candidate->>'label'
    ),
    '[]'::jsonb
  )
  into v_candidates
  from (
    select case
      when candidate->>'entity_type'='contact' then
        jsonb_set(
          jsonb_set(
            candidate,
            '{canonical_label}',
            to_jsonb(candidate->>'label'),
            true
          ),
          '{label}',
          to_jsonb(
            concat_ws(
              ' · ',
              candidate->>'label',
              'Contact',
              nullif(candidate->>'organisation_name','')
            )
          ),
          true
        )
      else candidate
    end as candidate
    from jsonb_array_elements(
      coalesce(v_primary->'candidates','[]'::jsonb)
    ) candidate

    union all

    select jsonb_set(
      jsonb_set(
        candidate,
        '{canonical_label}',
        to_jsonb(candidate->>'label'),
        true
      ),
      '{label}',
      to_jsonb(
        concat_ws(
          ' · ',
          candidate->>'label',
          'Player',
          nullif(candidate->>'club','')
        )
      ),
      true
    ) as candidate
    from jsonb_array_elements(
      coalesce(v_player->'candidates','[]'::jsonb)
    ) candidate
  ) merged;

  return jsonb_build_object(
    'resolved_id',null,
    'resolved_label',null,
    'candidates',v_candidates,
    'matched_by','person_candidates'
  );
end;
$$;

create or replace function public.djm_tell_capture_vocabulary(
  p_limit integer,
  p_capture_id uuid
)
returns jsonb
language sql
stable
set search_path=''
as $$
  with tenant as (select tenant_id from djm_os.captures where id=p_capture_id)
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(name) from (
      select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) name
      from public.players p, tenant t
      where p.tenant_id=t.tenant_id
        and coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) is not null
      order by p.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'prospects',coalesce((select jsonb_agg(name) from (
      select sp.full_name name from djm_os.scouting_prospects sp, tenant t
      where sp.tenant_id=t.tenant_id and sp.full_name is not null
      order by sp.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'clubs',coalesce((select jsonb_agg(name) from (
      select o.name from djm_os.organisations o, tenant t
      where o.tenant_id=t.tenant_id and o.organisation_type='club'
      order by o.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(full_name) from (
      select p.full_name from djm_os.people p, tenant t
      where p.tenant_id=t.tenant_id and coalesce(p.person_type,'contact')<>'player'
      order by p.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb)
  );
$$;

revoke all on function public.djm_tell_capture_resolve_entity(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.djm_tell_capture_resolve_entity(uuid,text,text,text) to service_role;

revoke all on function public.djm_tell_capture_vocabulary(integer,uuid) from public,anon,authenticated;
grant execute on function public.djm_tell_capture_vocabulary(integer,uuid) to service_role;

create or replace function public.djm_tell_record_ai_usage_from_capture(
  p_capture_id uuid,
  p_feature_key text,
  p_model text,
  p_status text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_estimated_cost_micros bigint default 0,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_event_suffix text default 'model',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_external_request_id text;
begin
  select c.submitted_by,c.tenant_id
  into v_user_id,v_tenant_id
  from djm_os.captures c
  where c.id = p_capture_id;

  if v_user_id is null then
    raise exception 'capture_not_found';
  end if;


  if v_tenant_id is null then
    raise exception 'active_tenant_membership_not_found';
  end if;

  if p_status not in ('succeeded','failed','cancelled','blocked','cached') then
    raise exception 'invalid_ai_usage_status';
  end if;

  v_external_request_id := 'tell-djm:' || p_capture_id::text || ':' ||
    coalesce(nullif(trim(p_event_suffix),''),'model');

  return public.platform_server_record_ai_usage(
    p_tenant_id := v_tenant_id,
    p_user_id := v_user_id,
    p_feature_key := p_feature_key,
    p_provider := 'openai',
    p_model := p_model,
    p_status := p_status,
    p_input_tokens := greatest(coalesce(p_input_tokens,0),0),
    p_cached_input_tokens := greatest(coalesce(p_cached_input_tokens,0),0),
    p_output_tokens := greatest(coalesce(p_output_tokens,0),0),
    p_estimated_cost_micros := greatest(coalesce(p_estimated_cost_micros,0),0),
    p_actual_cost_micros := null,
    p_latency_ms := case when p_latency_ms is null then null else greatest(p_latency_ms,0) end,
    p_prompt_version := p_prompt_version,
    p_source_fingerprint := p_capture_id::text,
    p_external_request_id := v_external_request_id,
    p_idempotency_key := v_external_request_id,
    p_error_code := null,
    p_metadata := jsonb_build_object(
      'capture_id', p_capture_id,
      'surface', 'tell_djm'
    ) || coalesce(p_metadata,'{}'::jsonb)
  );
end;
$function$;


-- Keep direct table access inside the requested workspace, not just RPC calls.
create policy tell_capture_workspace_boundary on djm_os.captures as restrictive
for all to authenticated
using (processing_version is distinct from 'tell_djm_v1' or (
  tenant_id=private.tell_request_tenant() and exists (
    select 1 from djm_os.tell_djm_permissions p where p.tenant_id=captures.tenant_id
      and p.user_id=auth.uid() and p.is_enabled
      and (captures.submitted_by=auth.uid() or p.permission_scope='full')
  )
))
with check (processing_version is distinct from 'tell_djm_v1' or (
  tenant_id=private.tell_request_tenant() and exists (
    select 1 from djm_os.tell_djm_permissions p where p.tenant_id=captures.tenant_id
      and p.user_id=auth.uid() and p.is_enabled
      and (captures.submitted_by=auth.uid() or p.permission_scope='full')
  )
));

do $policies$
declare v_table text;
begin
  foreach v_table in array array['tell_djm_actions','tell_djm_questions','tell_djm_aliases'] loop
    execute format('create policy tell_workspace_boundary on djm_os.%I as restrictive for all to authenticated using (tenant_id=private.tell_request_tenant()) with check (tenant_id=private.tell_request_tenant())',v_table);
  end loop;
end;
$policies$;

create or replace function public.djm_tell_worker_claim(
  p_capture_id uuid default null,
  p_worker text default 'tell-djm-worker'
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_id uuid;
  v_payload jsonb;
begin
  with candidate as (
    select c.id
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and ((c.status in ('queued','retry') and c.next_attempt_at<=now()) or (c.status='processing' and c.locked_at<now()-interval '5 minutes'))
      and (p_capture_id is null or c.id=p_capture_id)
      and exists (
        select 1 from djm_os.tell_djm_permissions p
        where p.user_id=c.submitted_by and p.tenant_id=c.tenant_id and p.is_enabled=true
          and private.user_has_staff_tenant_access(c.tenant_id,c.submitted_by)
      )
    order by case when c.id=p_capture_id then 0 else 1 end,c.created_at
    for update skip locked limit 1
  )
  update djm_os.captures c
  set status='processing',attempt_count=c.attempt_count+1,locked_at=now(),locked_by=p_worker,error_message=null
  from candidate where c.id=candidate.id returning c.id into v_id;

  if v_id is null then return null; end if;

  update djm_os.tell_djm_actions set status='superseded',updated_at=now()
  where capture_id=v_id and status in ('pending','failed');
  update djm_os.tell_djm_questions set status='superseded'
  where capture_id=v_id and status='open';

  select jsonb_build_object(
    'capture_id',c.id,'tenant_id',c.tenant_id,'submitted_by',c.submitted_by,'capture_type',c.capture_type,
    'raw_text',c.raw_text,'source_uri',c.source_uri,'transcript_text',c.transcript_text,'extracted_json',c.extracted_json,
    'usage_json',c.usage_json,'person_id',c.person_id,'organisation_id',c.organisation_id,'player_id',c.player_id,
    'context_json',c.context_json,'created_at',c.created_at,'duration_seconds',c.audio_duration_seconds,
    'attempt_count',c.attempt_count,'timezone',coalesce(tm.timezone,'Europe/Rome'),
    'permission_scope',coalesce(p.permission_scope,'read_only'),'settings',to_jsonb(s),
    'estimated_month_spend',coalesce((
      select sum(coalesce((x.usage_json->>'estimated_cost_usd')::numeric,0))
      from djm_os.captures x
      where x.tenant_id=c.tenant_id and x.created_at>=date_trunc('month',now()) and x.processing_version='tell_djm_v1'
    ),0)
  ) into v_payload
  from djm_os.captures c
  join djm_os.team_members tm on tm.user_id=c.submitted_by
  left join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by and p.tenant_id=c.tenant_id
  cross join djm_os.tell_djm_settings s
  where c.id=v_id and s.id=1;

  perform private.tell_assert_entities((v_payload->>'tenant_id')::uuid,
    jsonb_build_object('person_id',v_payload->'person_id','organisation_id',v_payload->'organisation_id',
      'player_id',v_payload->'player_id','context',v_payload->'context_json'));
  return v_payload;
end;
$$;

create or replace function private.workspace_entity_tenant(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant uuid;
begin
  if p_entity_id is null then return null; end if;

  case p_entity_type
    when 'club' then
      select tenant_id into v_tenant from djm_os.organisations where id=p_entity_id;
    when 'contact' then
      select tenant_id into v_tenant from djm_os.people where id=p_entity_id;
    when 'person' then
      select tenant_id into v_tenant from djm_os.people where id=p_entity_id;
    when 'player' then
      select tenant_id into v_tenant from public.players where id=p_entity_id;
    when 'prospect' then
      select tenant_id into v_tenant from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then
      select tenant_id into v_tenant from djm_os.club_needs where id=p_entity_id;
    when 'task' then
      select tenant_id into v_tenant from djm_os.tasks where id=p_entity_id;
    when 'interaction' then
      select tenant_id into v_tenant from djm_os.interactions where id=p_entity_id;
    when 'capture' then
      select tenant_id into v_tenant from djm_os.captures where id=p_entity_id;
    when 'claim' then
      select tenant_id into v_tenant from djm_os.claims where id=p_entity_id;
    when 'player_match' then
      select tenant_id into v_tenant from djm_os.player_matches where id=p_entity_id;
    when 'scouting_report' then
      select tenant_id into v_tenant from djm_os.scouting_reports where id=p_entity_id;
    when 'deal' then
      select tenant_id into v_tenant from djm_os.deal_rooms where id=p_entity_id;
    when 'opportunity' then
      select tenant_id into v_tenant from public.player_opportunities where id=p_entity_id;
    else
      v_tenant := null;
  end case;

  return v_tenant;
end;
$$;

revoke all on function public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb) to service_role;

revoke all on function public.djm_tell_apply_scout_observation(uuid,text,integer,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.djm_tell_apply_scout_observation(uuid,text,integer,numeric,text,jsonb) to service_role;

revoke all on function public.djm_tell_record_question(uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.djm_tell_record_question(uuid,text,text,text,jsonb,jsonb) to service_role;

revoke all on function public.djm_tell_worker_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.djm_tell_worker_claim(uuid,text) to service_role;

revoke all on function public.djm_tell_user_can_process(uuid,uuid) from public,anon,authenticated;
grant execute on function public.djm_tell_user_can_process(uuid,uuid) to service_role;

create or replace function public.djm_tell_orphan_audio_cleanup_due(p_limit integer default 50)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name)),
    '[]'::jsonb
  )
  from (
    select o.bucket_id,o.name
    from storage.objects o
    where o.bucket_id='djm-network-captures'
      and (o.name like '%/tell-djm/%' or o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/tell/[0-9]{4}-[0-9]{2}-[0-9]{2}/[^/]+$')
      and o.created_at<now()-interval '8 days'
      and not exists (
        select 1
        from djm_os.captures c
        where c.source_uri=o.bucket_id||'/'||o.name
      )
    order by o.created_at
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) orphan;
$$;

-- Read-only Tell permission must also hold for direct REST updates/deletes.
do $write_policies$
declare v_table text; v_predicate text;
begin
  foreach v_table in array array['captures','tell_djm_actions','tell_djm_questions','tell_djm_aliases'] loop
    v_predicate := format('exists (select 1 from djm_os.tell_djm_permissions p where p.tenant_id=%I.tenant_id and p.user_id=auth.uid() and p.is_enabled and p.permission_scope in (''full'',''scout''))',v_table);
    if v_table='captures' then
      v_predicate := '(processing_version is distinct from ''tell_djm_v1'' or ('||v_predicate||'))';
    end if;
    execute format('create policy tell_update_permission_boundary on djm_os.%I as restrictive for update to authenticated using (%s) with check (%s)',v_table,v_predicate,v_predicate);
    execute format('create policy tell_delete_permission_boundary on djm_os.%I as restrictive for delete to authenticated using (%s)',v_table,v_predicate);
  end loop;
end;
$write_policies$;

-- Club-need inserts fire this matcher. Scope its candidates before scoring or writing.
CREATE OR REPLACE FUNCTION djm_os.refresh_need_matches(p_need_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n djm_os.club_needs%rowtype;
  v_country text;
begin
  select * into n from djm_os.club_needs where id = p_need_id;
  if not found then return; end if;
  select country into v_country from djm_os.organisations where id = n.organisation_id;

  if n.status not in ('active', 'open', 'confirmed') then
    delete from djm_os.player_matches where tenant_id=n.tenant_id and club_need_id = p_need_id and status = 'suggested';
    return;
  end if;

  delete from djm_os.player_matches m using public.players p
  where m.tenant_id=n.tenant_id and m.club_need_id = p_need_id and m.player_id = p.id and m.status = 'suggested'
    and not (
      djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
      and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
      and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
      and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
      and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
    );

  insert into djm_os.player_matches(
    tenant_id, club_need_id, player_id, overall_score, football_score, commercial_score,
    registration_score, career_score, access_score, reasoning, status
  )
  select
    n.tenant_id, n.id, p.id,
    round((s.football_score * .45 + s.commercial_score * .10 + s.registration_score * .15 + s.career_score * .20 + s.availability_score * .10)::numeric, 1),
    s.football_score, s.commercial_score, s.registration_score, s.career_score, null::numeric,
    jsonb_build_object(
      'source', 'djm_fit_prediction_v3',
      'model', 'DJM fit model v3',
      'coverage', s.coverage,
      'components', jsonb_build_object(
        'football_fit', s.football_score,
        'commercial_fit', s.commercial_score,
        'registration_fit', s.registration_score,
        'career_fit', s.career_score,
        'availability', s.availability_score
      ),
      'strengths', to_jsonb(array_remove(array[
        'Primary or secondary position fits the requested role',
        case when n.preferred_foot is not null and p.preferred_foot is not null then 'Preferred foot matches' end,
        case when n.min_height_cm is not null and p.height_cm is not null then 'Minimum height is met' end,
        case when n.min_age is not null or n.max_age is not null then 'Recorded age is within range' end
      ], null)),
      'concerns', '[]'::jsonb,
      'hard_blockers', '[]'::jsonb,
      'missing_information', to_jsonb(array_remove(array[
        case when p.date_of_birth is null and (n.min_age is not null or n.max_age is not null) then 'Player date of birth is not recorded' end,
        case when p.preferred_foot is null and n.preferred_foot is not null then 'Player preferred foot is not recorded' end,
        case when p.height_cm is null and n.min_height_cm is not null then 'Player height is not recorded' end,
        case when nullif(trim(coalesce(f.salary_expectation, '')), '') is null and n.salary_budget is not null then 'Player salary expectation is not recorded' end,
        case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is not null and cardinality(coalesce(f.passports_held, '{}')) = 0 then 'Passport evidence is not recorded' end
      ], null)),
      'sample', jsonb_build_object('career_minutes', coalesce(c.minutes, 0), 'career_appearances', coalesce(c.appearances, 0)),
      'calculated_at', now()
    ),
    'suggested'
  from public.players p
  left join djm_os.player_market_facts f on f.player_id = p.id
  left join lateral (
    select coalesce(sum(ce.minutes), 0)::numeric as minutes, coalesce(sum(ce.appearances), 0)::numeric as appearances
    from public.career_entries ce where ce.player_id = p.id
  ) c on true
  cross join lateral (
    select
      least(100, 70
        + case when n.preferred_foot is null then 6 when p.preferred_foot is null then 3 else 10 end
        + case when n.min_age is null and n.max_age is null then 6 when p.date_of_birth is null then 3 else 8 end
        + case when n.min_height_cm is null then 5 when p.height_cm is null then 2 else 7 end)::numeric as football_score,
      case when n.salary_budget is null then 72 when nullif(trim(coalesce(f.salary_expectation, '')), '') is null then 55 else 68 end::numeric as commercial_score,
      djm_os.registration_fit_score(coalesce(n.passport_requirements, n.registration_notes), f.work_rights, f.passports_held, v_country)::numeric as registration_score,
      least(100, 45 + least(35, coalesce(c.minutes, 0) / 180) + least(20, coalesce(c.appearances, 0) / 5))::numeric as career_score,
      case when lower(coalesce(p.football_status, '')) in ('free_agent', 'free agent', 'available') then 95 when lower(coalesce(p.football_status, '')) = 'active' then 82 when lower(coalesce(p.football_status, '')) = 'injured' then 30 else 60 end::numeric as availability_score,
      round((
        1
        + case when n.preferred_foot is null or p.preferred_foot is not null then 1 else 0 end
        + case when (n.min_age is null and n.max_age is null) or p.date_of_birth is not null then 1 else 0 end
        + case when n.min_height_cm is null or p.height_cm is not null then 1 else 0 end
        + case when n.salary_budget is null or nullif(trim(coalesce(f.salary_expectation, '')), '') is not null then 1 else 0 end
        + case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is null or cardinality(coalesce(f.passports_held, '{}')) > 0 then 1 else 0 end
      )::numeric / 6 * 100)::int as coverage
  ) s
  where p.tenant_id=n.tenant_id and djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
    and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
    and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
    and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
    and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
  on conflict (club_need_id, player_id) do update set
    overall_score = excluded.overall_score,
    football_score = excluded.football_score,
    commercial_score = excluded.commercial_score,
    registration_score = excluded.registration_score,
    career_score = excluded.career_score,
    reasoning = excluded.reasoning,
    updated_at = now()
  where djm_os.player_matches.status = 'suggested';
end $function$;
