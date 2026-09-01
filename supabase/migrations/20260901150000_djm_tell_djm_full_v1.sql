-- DJM Tell DJM V1
-- Universal staff capture with durable processing, verified actions, ambiguity handling and cost controls.

alter table djm_os.captures
  add column if not exists client_capture_id uuid,
  add column if not exists player_id uuid references public.players(id) on delete set null,
  add column if not exists context_json jsonb not null default '{}'::jsonb,
  add column if not exists transcript_text text,
  add column if not exists summary text,
  add column if not exists usage_json jsonb not null default '{}'::jsonb,
  add column if not exists processing_version text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists completed_at timestamptz,
  add column if not exists parent_capture_id uuid references djm_os.captures(id) on delete set null,
  add column if not exists audio_duration_seconds numeric,
  add column if not exists keep_audio boolean not null default false,
  add column if not exists audio_delete_after timestamptz,
  add column if not exists receipt_json jsonb not null default '{}'::jsonb,
  add column if not exists last_error_code text;

create unique index if not exists captures_submitter_client_capture_uidx
  on djm_os.captures(submitted_by, client_capture_id)
  where client_capture_id is not null;

create index if not exists captures_tell_queue_idx
  on djm_os.captures(status, next_attempt_at, created_at)
  where status in ('queued', 'retry');

create table if not exists djm_os.tell_djm_permissions (
  user_id uuid primary key references djm_os.team_members(user_id) on delete cascade,
  permission_scope text not null default 'scout'
    check (permission_scope in ('full', 'scout', 'read_only')),
  is_enabled boolean not null default true,
  monthly_capture_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into djm_os.tell_djm_permissions(user_id, permission_scope, is_enabled)
select
  tm.user_id,
  case when lower(coalesce(tm.role_title, '')) like '%admin%' then 'full' else 'scout' end,
  tm.is_active
from djm_os.team_members tm
on conflict (user_id) do nothing;

create or replace function djm_os.seed_tell_djm_permission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into djm_os.tell_djm_permissions(user_id, permission_scope, is_enabled)
  values (
    new.user_id,
    case when lower(coalesce(new.role_title, '')) like '%admin%' then 'full' else 'scout' end,
    new.is_active
  )
  on conflict (user_id) do update
  set permission_scope = excluded.permission_scope,
      is_enabled = excluded.is_enabled,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tell_djm_permission on djm_os.team_members;
create trigger trg_tell_djm_permission
after insert or update of is_active, role_title on djm_os.team_members
for each row execute function djm_os.seed_tell_djm_permission();

create table if not exists djm_os.tell_djm_settings (
  id smallint primary key default 1 check (id = 1),
  is_live boolean not null default false,
  monthly_ai_budget_usd numeric(10,2) not null default 5.00,
  transcription_model text not null default 'gpt-transcribe',
  interpreter_model text not null default 'gpt-5.6-terra',
  transcription_usd_per_minute numeric(12,6) not null default 0.0045,
  interpreter_input_usd_per_million numeric(12,4) not null default 2.00,
  interpreter_output_usd_per_million numeric(12,4) not null default 12.00,
  audio_retention_days integer not null default 7 check (audio_retention_days between 1 and 90),
  max_audio_seconds integer not null default 240 check (max_audio_seconds between 30 and 900),
  updated_at timestamptz not null default now()
);

insert into djm_os.tell_djm_settings(id) values (1)
on conflict (id) do nothing;

create table if not exists djm_os.tell_djm_actions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references djm_os.captures(id) on delete cascade,
  action_hash text not null,
  action_index integer not null,
  action_type text not null,
  status text not null default 'pending'
    check (status in ('pending','applied','needs_review','failed','undone','superseded')),
  confidence numeric(5,4),
  evidence text,
  proposed_payload jsonb not null default '{}'::jsonb,
  resolved_payload jsonb not null default '{}'::jsonb,
  target_type text,
  target_id uuid,
  before_json jsonb,
  after_json jsonb,
  verification_json jsonb not null default '{}'::jsonb,
  undo_supported boolean not null default false,
  error_message text,
  applied_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(capture_id, action_hash)
);

create index if not exists tell_djm_actions_capture_idx
  on djm_os.tell_djm_actions(capture_id, created_at);

create table if not exists djm_os.tell_djm_questions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references djm_os.captures(id) on delete cascade,
  field_key text not null,
  prompt text not null,
  reason text,
  candidates jsonb not null default '[]'::jsonb,
  context_json jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open','resolved','dismissed','superseded')),
  selected_value jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists tell_djm_questions_capture_idx
  on djm_os.tell_djm_questions(capture_id, status, created_at);

create table if not exists djm_os.tell_djm_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('club','contact','player','prospect')),
  entity_id uuid not null,
  alias_text text not null,
  normalised_alias text not null,
  owner_user_id uuid references djm_os.team_members(user_id) on delete cascade,
  source_capture_id uuid references djm_os.captures(id) on delete set null,
  confirmed_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type, entity_id, normalised_alias, owner_user_id)
);

alter table djm_os.tell_djm_permissions enable row level security;
alter table djm_os.tell_djm_settings enable row level security;
alter table djm_os.tell_djm_actions enable row level security;
alter table djm_os.tell_djm_questions enable row level security;
alter table djm_os.tell_djm_aliases enable row level security;

grant select on djm_os.tell_djm_permissions, djm_os.tell_djm_settings to authenticated;
grant select, update on djm_os.tell_djm_actions, djm_os.tell_djm_questions to authenticated;
grant select, insert, update on djm_os.tell_djm_aliases to authenticated;

grant usage on schema djm_os to service_role;
grant select on public.players to service_role;
grant select, insert, update, delete on
  djm_os.tell_djm_permissions,
  djm_os.tell_djm_settings,
  djm_os.tell_djm_actions,
  djm_os.tell_djm_questions,
  djm_os.tell_djm_aliases,
  djm_os.captures,
  djm_os.interactions,
  djm_os.claims,
  djm_os.tasks,
  djm_os.club_needs,
  djm_os.player_matches,
  djm_os.events,
  djm_os.review_items,
  djm_os.notifications,
  djm_os.people,
  djm_os.organisations,
  djm_os.employments,
  djm_os.relationships,
  djm_os.scouting_prospects,
  djm_os.scouting_reports,
  djm_os.team_members
to service_role;

grant select on djm_os.deal_rooms to service_role;
grant select, insert on public.notification_outbox to service_role;

drop policy if exists tell_djm_permissions_select on djm_os.tell_djm_permissions;
create policy tell_djm_permissions_select on djm_os.tell_djm_permissions
for select to authenticated using ((select djm_os.is_team_member()));

drop policy if exists tell_djm_settings_select on djm_os.tell_djm_settings;
create policy tell_djm_settings_select on djm_os.tell_djm_settings
for select to authenticated using ((select djm_os.is_team_member()));

drop policy if exists tell_djm_actions_select on djm_os.tell_djm_actions;
create policy tell_djm_actions_select on djm_os.tell_djm_actions
for select to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id=tell_djm_actions.capture_id
      and c.submitted_by=(select auth.uid())
  )
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

drop policy if exists tell_djm_actions_update on djm_os.tell_djm_actions;
create policy tell_djm_actions_update on djm_os.tell_djm_actions
for update to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id=tell_djm_actions.capture_id
      and c.submitted_by=(select auth.uid())
  )
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
)
with check (
  exists (
    select 1 from djm_os.captures c
    where c.id=tell_djm_actions.capture_id
      and c.submitted_by=(select auth.uid())
  )
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

drop policy if exists tell_djm_questions_select on djm_os.tell_djm_questions;
create policy tell_djm_questions_select on djm_os.tell_djm_questions
for select to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id=tell_djm_questions.capture_id
      and c.submitted_by=(select auth.uid())
  )
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

drop policy if exists tell_djm_questions_update on djm_os.tell_djm_questions;
create policy tell_djm_questions_update on djm_os.tell_djm_questions
for update to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id=tell_djm_questions.capture_id
      and c.submitted_by=(select auth.uid())
  )
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
)
with check (
  exists (
    select 1 from djm_os.captures c
    where c.id=tell_djm_questions.capture_id
      and c.submitted_by=(select auth.uid())
  )
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

drop policy if exists tell_djm_aliases_select on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_select on djm_os.tell_djm_aliases
for select to authenticated
using (
  owner_user_id=(select auth.uid())
  or owner_user_id is null
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

drop policy if exists tell_djm_aliases_insert on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_insert on djm_os.tell_djm_aliases
for insert to authenticated
with check (
  owner_user_id=(select auth.uid())
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

drop policy if exists tell_djm_aliases_update on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_update on djm_os.tell_djm_aliases
for update to authenticated
using (
  owner_user_id=(select auth.uid())
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
)
with check (
  owner_user_id=(select auth.uid())
  or exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=(select auth.uid())
      and p.permission_scope='full'
      and p.is_enabled=true
  )
);

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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select p.permission_scope,p.is_enabled
  into v_scope,v_enabled
  from djm_os.tell_djm_permissions p
  where p.user_id=auth.uid();

  select s.is_live,s.max_audio_seconds
  into v_system_live,v_limit
  from djm_os.tell_djm_settings s
  where s.id=1;

  return jsonb_build_object(
    'enabled',coalesce(v_enabled,false) and coalesce(v_system_live,false),
    'system_live',coalesce(v_system_live,false),
    'permission_scope',coalesce(v_scope,'read_only'),
    'max_audio_seconds',coalesce(v_limit,240)
  );
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
    join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by
    join djm_os.team_members tm on tm.user_id=c.submitted_by
    where c.id=p_capture_id
      and c.submitted_by=p_user_id
      and p.is_enabled=true
      and tm.is_active=true
  );
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
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_days integer;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if p_client_capture_id is null then
    raise exception 'Client capture ID is required';
  end if;
  if p_capture_type not in ('audio','text') then
    raise exception 'Tell DJM currently supports audio and text captures';
  end if;
  if coalesce(length(trim(p_raw_text)),0)=0 and p_source_uri is null then
    raise exception 'Capture content is required';
  end if;
  if not exists (
    select 1
    from djm_os.tell_djm_permissions p
    cross join djm_os.tell_djm_settings s
    where p.user_id=auth.uid()
      and p.is_enabled=true
      and s.id=1
      and s.is_live=true
  ) then
    raise exception 'Tell DJM is not enabled for this account';
  end if;

  select * into v_capture
  from djm_os.captures
  where submitted_by=auth.uid() and client_capture_id=p_client_capture_id
  limit 1;

  if found then
    return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',true);
  end if;

  select audio_retention_days into v_days from djm_os.tell_djm_settings where id=1;

  insert into djm_os.captures(
    submitted_by,channel,capture_type,raw_text,source_uri,person_id,organisation_id,player_id,
    status,confidence,client_capture_id,context_json,parent_capture_id,audio_duration_seconds,
    audio_delete_after,next_attempt_at,processing_version
  )
  values (
    auth.uid(),coalesce(nullif(trim(p_channel),''),'voice_debrief'),p_capture_type,
    nullif(trim(coalesce(p_raw_text,'')),''),p_source_uri,p_person_id,p_organisation_id,p_player_id,
    'queued',null,p_client_capture_id,coalesce(p_context_json,'{}'::jsonb),p_parent_capture_id,
    p_duration_seconds,
    case when p_capture_type='audio' then now()+make_interval(days=>coalesce(v_days,7)) else null end,
    now(),'tell_djm_v1'
  )
  returning * into v_capture;

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at
  )
  values (
    'TELL_DJM_CAPTURE_QUEUED',auth.uid(),p_person_id,p_organisation_id,p_player_id,
    jsonb_build_object('capture_id',v_capture.id,'capture_type',p_capture_type,'client_capture_id',p_client_capture_id),
    'tell_djm',1,now()
  );

  return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',false);
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if not exists (
    select 1 from djm_os.captures c
    where c.id=p_capture_id
      and c.submitted_by=auth.uid()
  ) and not exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=auth.uid()
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  select monthly_ai_budget_usd into v_budget from djm_os.tell_djm_settings where id=1;
  select coalesce(sum(coalesce((usage_json->>'estimated_cost_usd')::numeric,0)),0)
  into v_spend
  from djm_os.captures
  where created_at>=date_trunc('month',now()) and processing_version='tell_djm_v1';
  return jsonb_build_object('budget_usd',v_budget,'estimated_spend_usd',v_spend);
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_action
  from djm_os.tell_djm_actions
  where id=p_action_id
    and status='applied'
    and undo_supported=true;

  if not found then
    raise exception 'This action cannot be undone';
  end if;

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
       where p.user_id=auth.uid()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can undo this';
  end if;

  if v_action.action_type='create_task' then
    delete from djm_os.tasks
    where id=v_action.target_id
      and source='tell_djm:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_interaction' then
    delete from djm_os.interactions
    where id=v_action.target_id
      and source_type='tell_djm';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='add_claim' then
    delete from djm_os.claims
    where id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash;
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_scout_observation' then
    delete from djm_os.scouting_reports
    where id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='upsert_club_need'
        and coalesce((v_action.before_json->>'created')::boolean,false)=true then
    delete from djm_os.club_needs
    where id=v_action.target_id
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

  insert into djm_os.events(
    event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (
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

create or replace function public.djm_tell_worker_claim(
  p_capture_id uuid default null,
  p_worker text default 'tell-djm-worker'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_payload jsonb;
begin
  with candidate as (
    select c.id
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and (
        (c.status in ('queued','retry') and c.next_attempt_at<=now())
        or (c.status='processing' and c.locked_at<now()-interval '5 minutes')
      )
      and (p_capture_id is null or c.id=p_capture_id)
      and exists (
        select 1
        from djm_os.tell_djm_permissions p
        where p.user_id=c.submitted_by
          and p.is_enabled=true
      )
    order by case when c.id=p_capture_id then 0 else 1 end,c.created_at
    for update skip locked
    limit 1
  )
  update djm_os.captures c
  set status='processing',
      attempt_count=c.attempt_count+1,
      locked_at=now(),
      locked_by=p_worker,
      error_message=null
  from candidate
  where c.id=candidate.id
  returning c.id into v_id;

  if v_id is null then
    return null;
  end if;

  update djm_os.tell_djm_actions
  set status='superseded',updated_at=now()
  where capture_id=v_id
    and status in ('pending','failed');

  update djm_os.tell_djm_questions
  set status='superseded'
  where capture_id=v_id
    and status='open';

  select jsonb_build_object(
    'capture_id',c.id,
    'submitted_by',c.submitted_by,
    'capture_type',c.capture_type,
    'raw_text',c.raw_text,
    'source_uri',c.source_uri,
    'transcript_text',c.transcript_text,
    'extracted_json',c.extracted_json,
    'usage_json',c.usage_json,
    'person_id',c.person_id,
    'organisation_id',c.organisation_id,
    'player_id',c.player_id,
    'context_json',c.context_json,
    'created_at',c.created_at,
    'duration_seconds',c.audio_duration_seconds,
    'attempt_count',c.attempt_count,
    'timezone',coalesce(tm.timezone,'Europe/Rome'),
    'permission_scope',coalesce(p.permission_scope,'read_only'),
    'settings',to_jsonb(s),
    'estimated_month_spend',coalesce((
      select sum(coalesce((x.usage_json->>'estimated_cost_usd')::numeric,0))
      from djm_os.captures x
      where x.created_at>=date_trunc('month',now())
        and x.processing_version='tell_djm_v1'
    ),0)
  )
  into v_payload
  from djm_os.captures c
  join djm_os.team_members tm on tm.user_id=c.submitted_by
  left join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by
  cross join djm_os.tell_djm_settings s
  where c.id=v_id and s.id=1;

  return v_payload;
end;
$$;

create or replace function public.djm_tell_resolve_entity(
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
  where a.entity_type=p_entity_type
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
      where o.id=v_alias_id
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
        where employment.person_id=p.id
          and employment.is_current=true
        order by employment.updated_at desc
        limit 1
      ) e on true
      left join djm_os.organisations o on o.id=e.organisation_id
      where p.id=v_alias_id
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
      where p.id=v_alias_id;

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
      where sp.id=v_alias_id;
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
            similarity(lower(o.name),lower(p_name)),
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
        where o.organisation_type='club'
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
              similarity(lower(p.full_name),lower(p_name)),
              case
                when lower(trim(regexp_replace(p.full_name,'[^[:alnum:]]+',' ','g')))=v_query
                  then 1
                when split_part(lower(p.full_name),' ',1)=lower(trim(p_name))
                     and v_org_query<>''
                     and similarity(lower(coalesce(o.name,'')),lower(p_organisation_name))>=0.60
                  then 0.94
                else 0
              end
            )
            + case
                when v_org_query<>''
                 and similarity(lower(coalesce(o.name,'')),lower(p_organisation_name))>=0.60
                then 0.12 else 0
              end
          ) as score
        from djm_os.people p
        left join lateral (
          select employment.organisation_id,employment.role_title,employment.updated_at
          from djm_os.employments employment
          where employment.person_id=p.id
            and employment.is_current=true
          order by employment.updated_at desc
          limit 1
        ) e on true
        left join djm_os.organisations o on o.id=e.organisation_id
        where coalesce(p.person_type,'contact')<>'player'
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
            similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(p_name)),
            similarity(lower(coalesce(p.preferred_name,'')),lower(p_name)),
            case
              when lower(trim(concat_ws(' ',p.first_name,p.last_name)))=v_query then 1
              when lower(trim(coalesce(p.preferred_name,'')))=v_query then 1
              else 0
            end
          ) as score
        from public.players p
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
              similarity(lower(sp.full_name),lower(p_name)),
              case
                when lower(trim(regexp_replace(sp.full_name,'[^[:alnum:]]+',' ','g')))=v_query then 1
                else 0
              end
            )
            + case
                when v_org_query<>''
                 and similarity(lower(coalesce(sp.current_club,'')),lower(p_organisation_name))>=0.60
                then 0.08 else 0
              end
          ) as score
        from djm_os.scouting_prospects sp
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

create or replace function public.djm_tell_vocabulary(p_limit integer default 120)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'players',coalesce((
      select jsonb_agg(name)
      from (
        select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) name
        from public.players p
        where coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) is not null
        order by p.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb),
    'prospects',coalesce((
      select jsonb_agg(name)
      from (
        select sp.full_name as name
        from djm_os.scouting_prospects sp
        where sp.full_name is not null
        order by sp.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb),
    'clubs',coalesce((
      select jsonb_agg(name)
      from (
        select o.name
        from djm_os.organisations o
        where o.organisation_type='club'
        order by o.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb),
    'contacts',coalesce((
      select jsonb_agg(full_name)
      from (
        select p.full_name
        from djm_os.people p
        where coalesce(p.person_type,'contact')<>'player'
        order by p.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb)
  );
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
  v_id uuid;
begin
  select id into v_id
  from djm_os.tell_djm_questions
  where capture_id=p_capture_id
    and field_key=p_field_key
    and prompt=p_prompt
    and status='open'
  limit 1;

  if found then return v_id; end if;

  insert into djm_os.tell_djm_questions(
    capture_id,field_key,prompt,reason,candidates,context_json
  )
  values (
    p_capture_id,p_field_key,p_prompt,p_reason,
    coalesce(p_candidates,'[]'::jsonb),coalesce(p_context_json,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


create or replace function public.djm_tell_worker_store_transcript(
  p_capture_id uuid,
  p_transcript text,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(length(trim(p_transcript)),0)=0 then
    raise exception 'Transcript cannot be empty';
  end if;

  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb)
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object('capture_id',p_capture_id,'stored',true);
end;
$$;

create or replace function public.djm_tell_worker_store_plan(
  p_capture_id uuid,
  p_transcript text,
  p_plan jsonb,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      extracted_json=jsonb_set(
        coalesce(extracted_json,'{}'::jsonb),
        '{tell_djm_plan}',
        coalesce(p_plan,'{}'::jsonb),
        true
      ),
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb)
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object('capture_id',p_capture_id,'stored',true);
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
  where user_id=v_capture.submitted_by
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
    insert into djm_os.tell_djm_actions(
      capture_id,action_hash,action_index,action_type,status,
      confidence,evidence,proposed_payload,resolved_payload
    )
    values (
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

    insert into djm_os.review_items(
      owner_user_id,review_type,title,detail,person_id,
      organisation_id,player_id,capture_id,confidence,payload,status
    )
    values (
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
    where i.source_external_id='tell:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.interactions(
        occurred_at,channel,direction,team_member_id,person_id,
        organisation_id,source_external_id,source_type,source_uri,
        raw_text,summary,confidence
      )
      values (
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
    where t.source='tell_djm:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.tasks(
        title,task_type,owner_user_id,person_id,organisation_id,
        player_id,due_at,status,priority,source
      )
      values (
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
    where c.source_key='tell:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.claims(
        person_id,organisation_id,player_id,claim_type,claim_key,
        value_json,confidence,valid_from,last_verified_at,
        source_uri,verification_status,source_key
      )
      values (
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
    where n.organisation_id=v_org_id
      and n.status in ('active','open')
      and djm_os.normalise_need_position(n.position)=v_position
      and n.received_at>=v_capture.created_at-interval '120 days'
    order by n.received_at desc
    limit 1;

    if v_need_id is null then
      insert into djm_os.club_needs(
        organisation_id,source_person_id,owner_user_id,title,
        position,secondary_position,preferred_foot,min_age,max_age,
        min_height_cm,transfer_type,transfer_budget,salary_budget,
        currency,salary_period,salary_tax_basis,registration_notes,
        profile_notes,playing_style,raw_request,source_context,
        status,confidence,confirmed_at,received_at,priority,need_type
      )
      values (
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
    where n.organisation_id=v_org_id
      and n.status in ('active','open')
      and djm_os.normalise_need_position(n.position)=v_position
    order by n.received_at desc
    limit 1;

    if v_need_id is null then
      raise exception 'No active matching club need exists yet';
    end if;

    insert into djm_os.player_matches(
      club_need_id,player_id,overall_score,football_score,
      commercial_score,registration_score,career_score,access_score,
      reasoning,status
    )
    values (
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

  insert into djm_os.tell_djm_actions(
    capture_id,action_hash,action_index,action_type,status,
    confidence,evidence,proposed_payload,resolved_payload,
    target_type,target_id,before_json,after_json,
    verification_json,undo_supported,applied_at
  )
  values (
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

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  )
  values (
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
    insert into djm_os.tell_djm_actions(
      capture_id,action_hash,action_index,action_type,status,
      confidence,evidence,proposed_payload,resolved_payload,error_message
    )
    values (
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

create or replace function public.djm_tell_notify_attention(p_capture_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_title text;
  v_body text;
  v_fingerprint text;
  v_inserted integer:=0;
begin
  select * into v_capture
  from djm_os.captures
  where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.status not in ('needs_input','needs_review','partial','failed','budget_blocked') then
    return jsonb_build_object('queued',false,'status',v_capture.status);
  end if;

  v_title:=case v_capture.status
    when 'needs_input' then 'Tell DJM needs one thing'
    when 'needs_review' then 'Tell DJM needs review'
    else 'Tell DJM needs attention'
  end;
  v_body:=coalesce(nullif(v_capture.summary,''),'Open Tell DJM to check this update.');
  v_fingerprint:='tell:'||v_capture.id::text||':'||v_capture.status;

  insert into djm_os.notifications(
    user_id,notification_type,title,body,priority,
    person_id,organisation_id,player_id,payload,fingerprint,expires_at
  ) values (
    v_capture.submitted_by,
    'tell_djm_attention',
    v_title,
    v_body,
    case when v_capture.status in ('failed','partial','budget_blocked') then 92 else 82 end,
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'url','/tell?capture='||v_capture.id::text),
    v_fingerprint,
    now()+interval '14 days'
  )
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=1 then
    insert into public.notification_outbox(
      user_id,kind,title,body,url,payload,status
    ) values (
      v_capture.submitted_by,
      'tell_djm_attention',
      v_title,
      v_body,
      '/tell?capture='||v_capture.id::text,
      jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status),
      'pending'
    );
  end if;

  return jsonb_build_object(
    'queued',v_inserted=1,
    'status',v_capture.status,
    'fingerprint',v_fingerprint
  );
end;
$$;

create or replace function public.djm_tell_worker_complete(
  p_capture_id uuid,
  p_transcript text,
  p_summary text,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_open_questions integer;
  v_failed integer;
  v_review integer;
begin
  select count(*) into v_open_questions
  from djm_os.tell_djm_questions
  where capture_id=p_capture_id and status='open';

  select count(*) into v_failed
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='failed';

  select count(*) into v_review
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='needs_review';

  v_status:=case
    when v_open_questions>0 then 'needs_input'
    when v_failed>0 then 'partial'
    when v_review>0 then 'needs_review'
    else 'done'
  end;

  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      summary=p_summary,
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb),
      status=v_status,
      completed_at=now(),
      processed_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null,
      receipt_json=jsonb_build_object(
        'status',v_status,
        'open_questions',v_open_questions,
        'failed_actions',v_failed,
        'review_actions',v_review
      )
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object('capture_id',p_capture_id,'status',v_status);
end;
$$;

create or replace function public.djm_tell_worker_fail(
  p_capture_id uuid,
  p_error text,
  p_code text default 'processing_failed',
  p_retryable boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt integer;
  v_status text;
begin
  select attempt_count into v_attempt
  from djm_os.captures where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  v_status:=case
    when p_code='budget_exhausted' then 'budget_blocked'
    when p_retryable and coalesce(v_attempt,0)<5 then 'retry'
    else 'failed'
  end;

  update djm_os.captures
  set status=v_status,
      error_message=left(coalesce(p_error,'Processing failed'),1000),
      last_error_code=p_code,
      next_attempt_at=case
        when v_status='retry'
        then now()+make_interval(
          secs=>least(
            900,
            15*(2^greatest(coalesce(v_attempt,1)-1,0))::integer
          )
        )
        else next_attempt_at
      end,
      locked_at=null,
      locked_by=null
  where id=p_capture_id;

  return jsonb_build_object('capture_id',p_capture_id,'status',v_status);
end;
$$;

create or replace function public.djm_tell_audio_cleanup_due(p_limit integer default 50)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('capture_id',id,'source_uri',source_uri)),
    '[]'::jsonb
  )
  from (
    select c.id,c.source_uri
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and c.capture_type='audio'
      and c.keep_audio=false
      and c.source_uri is not null
      and c.audio_delete_after is not null
      and c.audio_delete_after<=now()
    order by c.audio_delete_after
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) due;
$$;

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
      and o.name like '%/tell-djm/%'
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

create or replace function public.djm_tell_mark_audio_deleted(p_capture_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update djm_os.captures
  set source_uri=null,
      context_json=jsonb_set(
        context_json,
        '{audio_deleted_at}',
        to_jsonb(now()),
        true
      )
  where id=p_capture_id;
$$;


-- Context-aware launcher and explicit one-tap entity creation.
alter table djm_os.scouting_reports
  add column if not exists source_key text;

create unique index if not exists scouting_reports_source_key_uidx
  on djm_os.scouting_reports(source_key);

grant select,insert,update,delete on
  djm_os.scouting_prospects,
  djm_os.scouting_reports,
  djm_os.relationships
  to service_role;

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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

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
    where p.id=v_id;
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
    where o.id=v_id and o.organisation_type='club';
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
    where p.id=v_id;
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
    where sp.id=v_id;
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
    where d.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  return jsonb_build_object('route',v_path);
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if length(v_name)<2 then raise exception 'Club name is required'; end if;

  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if not exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=auth.uid() and p.permission_scope='full' and p.is_enabled=true
  ) then
    raise exception 'Only full-access DJM users can create a new club from Tell DJM';
  end if;

  v_key:=lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')));

  select o.id,o.organisation_type
  into v_id,v_existing_type
  from djm_os.organisations o
  where lower(trim(regexp_replace(o.name,'[^[:alnum:]]+',' ','g')))=v_key
  order by o.updated_at desc
  limit 1;

  if v_id is not null and v_existing_type<>'club' then
    raise exception 'A non-club organisation with this name already exists. Review it first.';
  end if;

  if v_id is null then
    if exists (
      select 1 from djm_os.organisations o
      where o.organisation_type='club'
        and similarity(lower(o.name),lower(v_name))>=0.90
    ) then
      raise exception 'A very similar club now exists. Re-open the question and choose the existing club.';
    end if;

    insert into djm_os.organisations(
      name,organisation_type,country,canonical_key
    ) values (
      v_name,'club',nullif(trim(coalesce(p_country,'')),''),'club:'||v_key
    ) returning id into v_id;

    insert into djm_os.events(
      event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at
    ) values (
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if length(v_name)<2 or p_organisation_id is null then
    raise exception 'Contact name and club are required';
  end if;

  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.permission_scope='full' and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can create this contact';
  end if;

  select o.name into v_org_name
  from djm_os.organisations o
  where o.id=p_organisation_id and o.organisation_type='club';
  if not found then raise exception 'Club not found'; end if;

  select p.id
  into v_id
  from djm_os.people p
  join djm_os.employments e on e.person_id=p.id
  where lower(trim(p.full_name))=lower(v_name)
    and e.organisation_id=p_organisation_id
    and e.is_current=true
  order by e.updated_at desc
  limit 1;

  if v_id is null then
    select e.organisation_id
    into v_other_org
    from djm_os.people p
    join djm_os.employments e on e.person_id=p.id and e.is_current=true
    where lower(trim(p.full_name))=lower(v_name)
      and e.organisation_id<>p_organisation_id
    limit 1;

    if v_other_org is not null then
      raise exception 'A same-name contact is already current at another organisation. Review the identity first.';
    end if;

    select p.id into v_id
    from djm_os.people p
    where lower(trim(p.full_name))=lower(v_name)
      and not exists (
        select 1 from djm_os.employments e
        where e.person_id=p.id and e.is_current=true
      )
    order by p.updated_at desc
    limit 1;

    if v_id is null then
      v_key:=lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')));
      insert into djm_os.people(
        full_name,person_type,canonical_key,source_confidence
      ) values (
        v_name,'club_contact','contact:'||v_key||':'||p_organisation_id::text,1
      ) returning id into v_id;
    end if;

    insert into djm_os.employments(
      person_id,organisation_id,role_title,is_current,confidence,last_verified_at
    ) values (
      v_id,p_organisation_id,nullif(trim(coalesce(p_role_title,'')),''),true,1,now()
    );
  end if;

  insert into djm_os.relationships(
    team_member_id,person_id,last_meaningful_at,first_known_at,relationship_notes
  ) values (
    v_capture.submitted_by,v_id,v_capture.created_at,v_capture.created_at,'Created or confirmed through Tell DJM.'
  )
  on conflict (team_member_id,person_id)
  do update set
    last_meaningful_at=greatest(
      coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),
      excluded.last_meaningful_at
    ),
    updated_at=now();

  insert into djm_os.events(
    event_type,actor_user_id,organisation_id,person_id,payload,source,confidence,occurred_at
  ) values (
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

-- Override answer handling so explicit one-tap creation becomes a normal resolved entity.
create or replace function public.djm_tell_answer_question(
  p_question_id uuid,
  p_value jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question djm_os.tell_djm_questions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_selected jsonb:=p_value;
  v_entity_type text;
  v_entity_id uuid;
  v_alias text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_question
  from djm_os.tell_djm_questions
  where id=p_question_id and status='open';
  if not found then raise exception 'Question is no longer open'; end if;

  select * into v_capture from djm_os.captures where id=v_question.capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.permission_scope='full' and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can answer this';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_question.candidates,'[]'::jsonb)) candidate
    where candidate=p_value
  ) then
    raise exception 'Selected answer is not one of the available choices';
  end if;

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

  update djm_os.tell_djm_questions
  set status='resolved',selected_value=v_selected,resolved_at=now()
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
     and v_entity_id is not null and v_alias is not null then
    insert into djm_os.tell_djm_aliases(
      entity_type,entity_id,alias_text,normalised_alias,owner_user_id,source_capture_id
    ) values (
      v_entity_type,v_entity_id,v_alias,
      lower(trim(regexp_replace(v_alias,'[^[:alnum:]]+',' ','g'))),
      v_capture.submitted_by,v_capture.id
    )
    on conflict (entity_type,entity_id,normalised_alias,owner_user_id)
    do update set
      confirmed_count=djm_os.tell_djm_aliases.confirmed_count+1,
      source_capture_id=excluded.source_capture_id,
      updated_at=now();
  end if;

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  ) values (
    'TELL_DJM_QUESTION_ANSWERED',auth.uid(),v_capture.person_id,
    v_capture.organisation_id,v_capture.player_id,
    jsonb_build_object(
      'capture_id',v_capture.id,
      'question_id',v_question.id,
      'field_key',v_question.field_key
    ),
    'tell_djm',1,now()
  );

  return jsonb_build_object('capture_id',v_capture.id,'status','queued');
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

  select permission_scope into v_permission
  from djm_os.tell_djm_permissions
  where user_id=v_capture.submitted_by and is_enabled=true;

  if v_permission not in ('full','scout') or coalesce(p_confidence,0)<0.72 then
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
    select 1 from djm_os.scouting_prospects sp where sp.id=v_prospect_id
  ) then
    raise exception 'Recruitment target not found';
  end if;

  if v_prospect_id is null then
    select sp.id into v_prospect_id
    from djm_os.scouting_prospects sp
    where lower(trim(regexp_replace(sp.full_name,'[^[:alnum:]]+',' ','g')))
          =lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')))
      and (
        nullif(p_payload->>'player_current_club','') is null
        or sp.current_club is null
        or similarity(lower(sp.current_club),lower(p_payload->>'player_current_club'))>=0.65
      )
    order by sp.updated_at desc
    limit 1;
  end if;

  if v_prospect_id is null then
    select p.id into v_player_id
    from public.players p
    where greatest(
      similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(v_name)),
      similarity(lower(coalesce(p.preferred_name,'')),lower(v_name))
    )>=0.94
    order by greatest(
      similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(v_name)),
      similarity(lower(coalesce(p.preferred_name,'')),lower(v_name))
    ) desc
    limit 1;

    insert into djm_os.scouting_prospects(
      linked_player_id,full_name,current_club,current_country,primary_position,
      availability_status,source,source_confidence,owner_user_id,canonical_key,
      recruitment_stage,recruitment_priority
    ) values (
      v_player_id,
      v_name,
      nullif(p_payload->>'player_current_club',''),
      nullif(p_payload->>'player_current_country',''),
      nullif(p_payload->>'position',''),
      'monitor',
      'tell_djm',
      p_confidence,
      v_capture.submitted_by,
      'tell:'||lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g'))),
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

  insert into djm_os.scouting_reports(
    prospect_id,scout_user_id,report_date,source_type,match_or_context,
    football_score,physical_score,tactical_score,mentality_score,personality_score,
    readiness_score,recommendation,strengths,risks,role_fit,notes,source_key
  ) values (
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

  insert into djm_os.tell_djm_actions(
    capture_id,action_hash,action_index,action_type,status,confidence,evidence,
    proposed_payload,resolved_payload,target_type,target_id,before_json,after_json,
    verification_json,undo_supported,applied_at
  ) values (
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

  insert into djm_os.events(
    event_type,actor_user_id,player_id,payload,source,confidence,occurred_at
  ) values (
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
    insert into djm_os.tell_djm_actions(
      capture_id,action_hash,action_index,action_type,status,confidence,evidence,
      proposed_payload,resolved_payload,error_message
    ) values (
      p_capture_id,p_action_hash,p_action_index,'log_scout_observation','failed',
      p_confidence,p_evidence,p_payload,p_payload,left(sqlerrm,1000)
    )
    on conflict (capture_id,action_hash)
    do update set status='failed',error_message=excluded.error_message,updated_at=now();
    return jsonb_build_object('status','failed','error',sqlerrm);
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_capture
  from djm_os.captures
  where id=p_capture_id
    and processing_version='tell_djm_v1';

  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>(select auth.uid())
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=(select auth.uid())
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

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  ) values (
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
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

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
    where c.submitted_by=(select auth.uid())
      and c.processing_version='tell_djm_v1'
    order by c.created_at desc
    limit v_limit
  ) recent;

  return v_result;
end;
$$;

-- Authenticated staff RPCs.
revoke all on function public.djm_tell_current_access() from public,anon;
grant execute on function public.djm_tell_current_access() to authenticated;


revoke all on function public.djm_tell_context_for_route(text) from public,anon;
grant execute on function public.djm_tell_context_for_route(text) to authenticated;

revoke all on function public.djm_tell_create_confirmed_club(uuid,text,text) from public,anon;
grant execute on function public.djm_tell_create_confirmed_club(uuid,text,text) to authenticated;

revoke all on function public.djm_tell_create_confirmed_contact(uuid,text,uuid,text) from public,anon;
grant execute on function public.djm_tell_create_confirmed_contact(uuid,text,uuid,text) to authenticated;

revoke all on function public.djm_tell_enqueue_capture(
  uuid,text,text,text,text,uuid,uuid,uuid,jsonb,numeric,uuid
) from public,anon;
grant execute on function public.djm_tell_enqueue_capture(
  uuid,text,text,text,text,uuid,uuid,uuid,jsonb,numeric,uuid
) to authenticated;

revoke all on function public.djm_tell_receipt(uuid) from public,anon;
grant execute on function public.djm_tell_receipt(uuid) to authenticated;

revoke all on function public.djm_tell_budget_status() from public,anon;
grant execute on function public.djm_tell_budget_status() to authenticated;

revoke all on function public.djm_tell_recent_captures(integer) from public,anon;
grant execute on function public.djm_tell_recent_captures(integer) to authenticated;

revoke all on function public.djm_tell_retry_capture(uuid) from public,anon;
grant execute on function public.djm_tell_retry_capture(uuid) to authenticated;

revoke all on function public.djm_tell_answer_question(uuid,jsonb) from public,anon;
grant execute on function public.djm_tell_answer_question(uuid,jsonb) to authenticated;

revoke all on function public.djm_tell_undo_action(uuid) from public,anon;
grant execute on function public.djm_tell_undo_action(uuid) to authenticated;

-- Worker RPCs are service-role only.
revoke all on function public.djm_tell_user_can_process(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.djm_tell_user_can_process(uuid,uuid)
to service_role;

revoke all on function public.djm_tell_worker_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.djm_tell_worker_claim(uuid,text) to service_role;

revoke all on function public.djm_tell_resolve_entity(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.djm_tell_resolve_entity(uuid,text,text,text) to service_role;

revoke all on function public.djm_tell_vocabulary(integer) from public,anon,authenticated;
grant execute on function public.djm_tell_vocabulary(integer) to service_role;

revoke all on function public.djm_tell_record_question(uuid,text,text,text,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.djm_tell_record_question(uuid,text,text,text,jsonb,jsonb)
to service_role;

revoke all on function public.djm_tell_worker_store_transcript(uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.djm_tell_worker_store_transcript(uuid,text,jsonb)
to service_role;

revoke all on function public.djm_tell_worker_store_plan(uuid,text,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.djm_tell_worker_store_plan(uuid,text,jsonb,jsonb)
to service_role;

revoke all on function public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb)
from public,anon,authenticated;
grant execute on function public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb)
to service_role;


revoke all on function public.djm_tell_apply_scout_observation(uuid,text,integer,numeric,text,jsonb)
from public,anon,authenticated;
grant execute on function public.djm_tell_apply_scout_observation(uuid,text,integer,numeric,text,jsonb)
to service_role;

revoke all on function public.djm_tell_notify_attention(uuid)
from public,anon,authenticated;
grant execute on function public.djm_tell_notify_attention(uuid)
to service_role;

revoke all on function public.djm_tell_worker_complete(uuid,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.djm_tell_worker_complete(uuid,text,text,jsonb)
to service_role;

revoke all on function public.djm_tell_worker_fail(uuid,text,text,boolean)
from public,anon,authenticated;
grant execute on function public.djm_tell_worker_fail(uuid,text,text,boolean)
to service_role;

revoke all on function public.djm_tell_audio_cleanup_due(integer)
from public,anon,authenticated;
grant execute on function public.djm_tell_audio_cleanup_due(integer)
to service_role;

revoke all on function public.djm_tell_orphan_audio_cleanup_due(integer)
from public,anon,authenticated;
grant execute on function public.djm_tell_orphan_audio_cleanup_due(integer)
to service_role;

revoke all on function public.djm_tell_mark_audio_deleted(uuid)
from public,anon,authenticated;
grant execute on function public.djm_tell_mark_audio_deleted(uuid)
to service_role;

-- Closing the phone cannot cancel processing. Immediate processing is best-effort,
-- and this minute worker is the durable fallback.
do $$
begin
  if not exists (
    select 1 from cron.job where jobname='djm-tell-djm-worker'
  ) then
    perform cron.schedule(
      'djm-tell-djm-worker',
      '* * * * *',
      $job$
        select net.http_post(
          url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/djm-tell-process',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-djm-cron',(
              select decrypted_secret
              from vault.decrypted_secrets
              where name='djm_push_cron_secret'
              limit 1
            )
          ),
          body:=jsonb_build_object('mode','process','batch',5),
          timeout_milliseconds:=55000
        );
      $job$
    );
  end if;

  if not exists (
    select 1 from cron.job where jobname='djm-tell-djm-audio-cleanup'
  ) then
    perform cron.schedule(
      'djm-tell-djm-audio-cleanup',
      '37 3 * * *',
      $job$
        select net.http_post(
          url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/djm-tell-process',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-djm-cron',(
              select decrypted_secret
              from vault.decrypted_secrets
              where name='djm_push_cron_secret'
              limit 1
            )
          ),
          body:=jsonb_build_object('mode','cleanup'),
          timeout_milliseconds:=55000
        );
      $job$
    );
  end if;
end
$$;

notify pgrst,'reload schema';
