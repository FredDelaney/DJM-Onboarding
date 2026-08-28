-- DJM Intelligence foundation
-- Additive and rollback-safe by design. Review in staging before production.

alter table djm_os.claims
  add column if not exists truth_state text not null default 'unknown'
    check (truth_state in ('verified', 'direct', 'sourced', 'inferred', 'unknown', 'contested', 'stale')),
  add column if not exists visibility text not null default 'djm_internal'
    check (visibility in ('player_private', 'djm_internal', 'club_shareable', 'explicit_collaboration')),
  add column if not exists source_kind text,
  add column if not exists source_date date,
  add column if not exists captured_at timestamptz not null default now(),
  add column if not exists review_after timestamptz,
  add column if not exists contested_reason text,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz;

comment on column djm_os.claims.truth_state is 'Epistemic state; never inferred from confidence alone.';
comment on column djm_os.claims.visibility is 'Explicit policy boundary independent of truth state.';

alter table djm_os.events
  add column if not exists visibility text not null default 'djm_internal'
    check (visibility in ('player_private', 'djm_internal', 'club_shareable', 'explicit_collaboration')),
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists before_state jsonb,
  add column if not exists after_state jsonb,
  add column if not exists correlation_id uuid,
  add column if not exists causation_event_id uuid references djm_os.events(id);

comment on table djm_os.events is 'Operational event ledger. New writers should append; corrections are represented as new events.';

alter table djm_os.suggestions
  add column if not exists consequence_level text not null default 'low'
    check (consequence_level in ('low', 'medium', 'high')),
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists recommended_action text,
  add column if not exists approval_state text not null default 'pending'
    check (approval_state in ('pending', 'approved', 'rejected', 'expired', 'not_required')),
  add column if not exists decided_by uuid references auth.users(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists outcome jsonb;

-- The player administration surface authorises staff through public.profiles,
-- while DJM operational RPCs authorise through djm_os.team_members. Keep the
-- two boundaries aligned transactionally so an authorised admin cannot land in
-- a half-connected state.
create or replace function private.sync_djm_team_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.role in ('admin', 'scout') then
    insert into djm_os.team_members (
      user_id,
      display_name,
      role_title,
      is_active,
      updated_at
    ) values (
      new.id,
      coalesce(nullif(trim(new.display_name), ''), nullif(split_part(new.email, '@', 1), ''), 'DJM Team'),
      case when new.role = 'admin' then 'Administrator' else 'Scout' end,
      true,
      now()
    )
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      role_title = excluded.role_title,
      is_active = true,
      updated_at = now();
  else
    update djm_os.team_members
      set is_active = false, updated_at = now()
    where user_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_djm_team_membership() from public, anon, authenticated;

drop trigger if exists sync_djm_team_membership_after_profile_change on public.profiles;
create trigger sync_djm_team_membership_after_profile_change
  after insert or update of role, display_name, email on public.profiles
  for each row execute function private.sync_djm_team_membership();

insert into djm_os.team_members (user_id, display_name, role_title, is_active, updated_at)
select
  profile.id,
  coalesce(nullif(trim(profile.display_name), ''), nullif(split_part(profile.email, '@', 1), ''), 'DJM Team'),
  case when profile.role = 'admin' then 'Administrator' else 'Scout' end,
  true,
  now()
from public.profiles profile
where profile.role in ('admin', 'scout')
on conflict (user_id) do update set
  display_name = excluded.display_name,
  role_title = excluded.role_title,
  is_active = true,
  updated_at = now();

create table if not exists public.player_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  lane text not null check (lane in ('week', 'development', 'season', 'evidence', 'career', 'decisions', 'vault')),
  title text not null check (length(trim(title)) between 2 and 180),
  detail text,
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'cancelled')),
  visibility text not null default 'player_private'
    check (visibility in ('player_private', 'explicit_collaboration')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.player_goals is 'Player-first goals across the seven private career lanes.';

create index if not exists player_goals_player_status_idx
  on public.player_goals(player_id, status, target_date);

alter table public.player_goals enable row level security;

create policy "players read own career goals"
  on public.player_goals for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_goals.player_id and p.user_id = auth.uid()
    )
    or djm_os.is_team_member()
  );

create policy "players create own career goals"
  on public.player_goals for insert to authenticated
  with check (
    exists (
      select 1 from public.players p
      where p.id = player_goals.player_id and p.user_id = auth.uid()
    )
    or djm_os.is_team_member()
  );

create policy "players update own career goals"
  on public.player_goals for update to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_goals.player_id and p.user_id = auth.uid()
    )
    or djm_os.is_team_member()
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = player_goals.player_id and p.user_id = auth.uid()
    )
    or djm_os.is_team_member()
  );

create policy "players delete own career goals"
  on public.player_goals for delete to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_goals.player_id and p.user_id = auth.uid()
    )
    or djm_os.is_team_member()
  );

create table if not exists public.player_service_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  service_type text not null,
  title text not null check (length(trim(title)) between 2 and 180),
  neutral_summary text not null,
  player_impact text,
  next_step text,
  occurred_at timestamptz not null default now(),
  visibility text not null default 'player_private'
    check (visibility in ('player_private', 'explicit_collaboration')),
  source_event_id uuid references djm_os.events(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.player_service_events is 'Neutral player-visible service ledger; never exposes clubs, targets or internal judgement.';

create index if not exists player_service_events_player_time_idx
  on public.player_service_events(player_id, occurred_at desc);

alter table public.player_service_events enable row level security;

create policy "players read own service ledger"
  on public.player_service_events for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_service_events.player_id and p.user_id = auth.uid()
    )
    or djm_os.is_team_member()
  );

create policy "team writes player service ledger"
  on public.player_service_events for insert to authenticated
  with check (djm_os.is_team_member());

create policy "team corrects player service ledger"
  on public.player_service_events for update to authenticated
  using (djm_os.is_team_member())
  with check (djm_os.is_team_member());

create policy "team removes player service ledger"
  on public.player_service_events for delete to authenticated
  using (djm_os.is_team_member());

create table if not exists djm_os.player_strategies (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  thesis text,
  priorities jsonb not null default '[]'::jsonb,
  scenarios jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  player_visible_summary text,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'archived')),
  owner_user_id uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists player_strategies_one_active_idx
  on djm_os.player_strategies(player_id) where status = 'active';

alter table djm_os.player_strategies enable row level security;

create policy "team manages player strategies"
  on djm_os.player_strategies for all to authenticated
  using (djm_os.is_team_member())
  with check (djm_os.is_team_member());

create table if not exists djm_os.decision_rooms (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null,
  audience_organisation_id uuid references djm_os.organisations(id),
  status text not null default 'draft' check (status in ('draft', 'approved', 'shared', 'expired', 'revoked')),
  snapshot jsonb not null default '{}'::jsonb,
  source_manifest jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decision_rooms_player_status_idx
  on djm_os.decision_rooms(player_id, status, created_at desc);

alter table djm_os.decision_rooms enable row level security;

create policy "team manages decision rooms"
  on djm_os.decision_rooms for all to authenticated
  using (djm_os.is_team_member())
  with check (djm_os.is_team_member());

create table if not exists djm_os.decision_room_engagement (
  id uuid primary key default gen_random_uuid(),
  decision_room_id uuid not null references djm_os.decision_rooms(id) on delete cascade,
  event_type text not null check (event_type in ('opened', 'section_viewed', 'video_opened', 'document_requested', 'contact_clicked', 'pdf_downloaded')),
  section_key text,
  anonymous_visitor_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists decision_room_engagement_room_time_idx
  on djm_os.decision_room_engagement(decision_room_id, occurred_at desc);

alter table djm_os.decision_room_engagement enable row level security;

create policy "team reads decision room engagement"
  on djm_os.decision_room_engagement for select to authenticated
  using (djm_os.is_team_member());

-- Public/anonymous event insertion remains intentionally absent. A rate-limited
-- server boundary must validate a share token before writing engagement.

create or replace function public.djm_record_player_service(
  p_player_id uuid,
  p_service_type text,
  p_title text,
  p_neutral_summary text,
  p_player_impact text default null,
  p_next_step text default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_service_id uuid;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  insert into public.player_service_events (
    player_id,
    service_type,
    title,
    neutral_summary,
    player_impact,
    next_step,
    occurred_at,
    visibility,
    created_by
  ) values (
    p_player_id,
    trim(p_service_type),
    trim(p_title),
    trim(p_neutral_summary),
    nullif(trim(coalesce(p_player_impact, '')), ''),
    nullif(trim(coalesce(p_next_step, '')), ''),
    coalesce(p_occurred_at, now()),
    'player_private',
    auth.uid()
  ) returning id into v_service_id;

  insert into djm_os.events (
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at,
    visibility,
    entity_type,
    entity_id,
    after_state
  ) values (
    'PLAYER_SERVICE_RECORDED',
    auth.uid(),
    p_player_id,
    jsonb_build_object('service_event_id', v_service_id, 'service_type', p_service_type),
    'djm_intelligence',
    1,
    coalesce(p_occurred_at, now()),
    'player_private',
    'player_service_event',
    v_service_id,
    jsonb_build_object('title', p_title, 'next_step', p_next_step)
  );

  return v_service_id;
end;
$$;

comment on function public.djm_record_player_service(uuid, text, text, text, text, text, timestamptz)
  is 'Atomically records a neutral player-facing service entry and its internal operational event.';

create or replace function public.djm_create_decision_room_snapshot(
  p_player_id uuid,
  p_title text,
  p_audience_organisation_id uuid default null
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_room_id uuid;
  v_profile jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select to_jsonb(profile)
    into v_profile
  from public.player_public_profiles profile
  where profile.player_id = p_player_id;

  if v_profile is null then
    raise exception 'A club-facing player profile is required before creating a Decision Room';
  end if;

  v_sources := jsonb_build_array(
    jsonb_build_object('kind', 'djm_profile', 'captured_at', now()),
    case when nullif(v_profile->>'transfermarkt_url', '') is not null
      then jsonb_build_object('kind', 'transfermarkt', 'url', v_profile->>'transfermarkt_url') end,
    case when nullif(v_profile->>'wyscout_url', '') is not null
      then jsonb_build_object('kind', 'wyscout', 'url', v_profile->>'wyscout_url') end,
    case when nullif(v_profile->>'stats_url', '') is not null
      then jsonb_build_object('kind', 'statistics', 'url', v_profile->>'stats_url') end
  );

  v_missing := jsonb_build_array(
    case when nullif(v_profile->>'why_review', '') is null then 'sporting_decision_brief' end,
    case when nullif(v_profile->>'verified_at', '') is null then 'fresh_verification' end,
    case when nullif(v_profile->>'primary_video_url', '') is null then 'primary_footage' end
  );

  v_sources := jsonb_path_query_array(v_sources, '$[*] ? (@ != null)');
  v_missing := jsonb_path_query_array(v_missing, '$[*] ? (@ != null)');

  insert into djm_os.decision_rooms (
    player_id,
    title,
    audience_organisation_id,
    snapshot,
    source_manifest,
    missing_information,
    created_by
  ) values (
    p_player_id,
    trim(p_title),
    p_audience_organisation_id,
    v_profile,
    v_sources,
    v_missing,
    auth.uid()
  ) returning id into v_room_id;

  insert into djm_os.events (
    event_type,
    actor_user_id,
    player_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at,
    visibility,
    entity_type,
    entity_id,
    after_state
  ) values (
    'DECISION_ROOM_SNAPSHOT_CREATED',
    auth.uid(),
    p_player_id,
    p_audience_organisation_id,
    jsonb_build_object('decision_room_id', v_room_id),
    'djm_intelligence',
    1,
    now(),
    'djm_internal',
    'decision_room',
    v_room_id,
    jsonb_build_object('status', 'draft', 'missing_information', v_missing)
  );

  return v_room_id;
end;
$$;

comment on function public.djm_create_decision_room_snapshot(uuid, text, uuid)
  is 'Creates an immutable-in-practice club-facing snapshot and records its source/missing-data manifest.';

revoke all on public.player_goals, public.player_service_events from anon;
grant select, insert, update, delete on public.player_goals to authenticated;
grant select, insert, update, delete on public.player_service_events to authenticated;
revoke all on function public.djm_record_player_service(uuid, text, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.djm_create_decision_room_snapshot(uuid, text, uuid) from public, anon;
grant execute on function public.djm_record_player_service(uuid, text, text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.djm_create_decision_room_snapshot(uuid, text, uuid) to authenticated, service_role;

grant usage on schema djm_os to authenticated;
grant select, insert, update, delete on djm_os.player_strategies to authenticated;
grant select, insert, update, delete on djm_os.decision_rooms to authenticated;
grant select on djm_os.decision_room_engagement to authenticated;

grant all on public.player_goals, public.player_service_events to service_role;
grant all on djm_os.player_strategies, djm_os.decision_rooms, djm_os.decision_room_engagement to service_role;
