create schema if not exists djm_os;

create table if not exists djm_os.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role_title text,
  timezone text not null default 'Europe/Rome',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists djm_os.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  preferred_name text,
  person_type text not null default 'contact',
  country text,
  city text,
  linkedin_url text,
  instagram_url text,
  photo_url text,
  canonical_key text,
  source_confidence numeric(5,4),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists people_canonical_key_unique on djm_os.people(canonical_key) where canonical_key is not null;
create index if not exists people_full_name_idx on djm_os.people using gin (to_tsvector('simple', full_name));

create table if not exists djm_os.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation_type text not null default 'club',
  country text,
  city text,
  website_url text,
  canonical_key text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organisations_canonical_key_unique on djm_os.organisations(canonical_key) where canonical_key is not null;
create index if not exists organisations_name_idx on djm_os.organisations using gin (to_tsvector('simple', name));

create table if not exists djm_os.employments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references djm_os.people(id) on delete cascade,
  organisation_id uuid not null references djm_os.organisations(id) on delete cascade,
  role_title text,
  department text,
  started_on date,
  ended_on date,
  is_current boolean not null default true,
  source_url text,
  confidence numeric(5,4),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index if not exists employments_person_idx on djm_os.employments(person_id, is_current);
create index if not exists employments_org_idx on djm_os.employments(organisation_id, is_current);

create table if not exists djm_os.contact_methods (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references djm_os.people(id) on delete cascade,
  channel text not null,
  value text not null,
  normalised_value text,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contact_methods_channel_value_unique on djm_os.contact_methods(channel, normalised_value) where normalised_value is not null;
create index if not exists contact_methods_person_idx on djm_os.contact_methods(person_id);

create table if not exists djm_os.relationships (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references djm_os.team_members(user_id) on delete cascade,
  person_id uuid not null references djm_os.people(id) on delete cascade,
  strength_score smallint,
  access_score smallint,
  trust_score smallint,
  last_meaningful_at timestamptz,
  first_known_at timestamptz,
  relationship_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_member_id, person_id),
  check (strength_score between 0 and 100 or strength_score is null),
  check (access_score between 0 and 100 or access_score is null),
  check (trust_score between 0 and 100 or trust_score is null)
);
create index if not exists relationships_person_idx on djm_os.relationships(person_id);

create table if not exists djm_os.interactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  channel text not null,
  direction text,
  team_member_id uuid references djm_os.team_members(user_id) on delete set null,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  source_external_id text,
  source_type text,
  source_uri text,
  raw_text text,
  summary text,
  sentiment text,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);
create index if not exists interactions_person_time_idx on djm_os.interactions(person_id, occurred_at desc);
create index if not exists interactions_org_time_idx on djm_os.interactions(organisation_id, occurred_at desc);
create index if not exists interactions_team_time_idx on djm_os.interactions(team_member_id, occurred_at desc);

create table if not exists djm_os.claims (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid references djm_os.interactions(id) on delete set null,
  person_id uuid references djm_os.people(id) on delete cascade,
  organisation_id uuid references djm_os.organisations(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  claim_type text not null,
  claim_key text,
  value_json jsonb not null,
  confidence numeric(5,4) not null default 0.5,
  valid_from timestamptz,
  valid_until timestamptz,
  last_verified_at timestamptz,
  source_uri text,
  created_at timestamptz not null default now()
);
create index if not exists claims_person_idx on djm_os.claims(person_id, claim_type);
create index if not exists claims_org_idx on djm_os.claims(organisation_id, claim_type);
create index if not exists claims_player_idx on djm_os.claims(player_id, claim_type);

create table if not exists djm_os.club_needs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references djm_os.organisations(id) on delete cascade,
  source_person_id uuid references djm_os.people(id) on delete set null,
  owner_user_id uuid references djm_os.team_members(user_id) on delete set null,
  source_interaction_id uuid references djm_os.interactions(id) on delete set null,
  title text not null,
  position text,
  preferred_foot text,
  min_age smallint,
  max_age smallint,
  transfer_type text,
  transfer_budget numeric,
  salary_budget numeric,
  currency text,
  salary_period text,
  registration_notes text,
  profile_notes text,
  status text not null default 'active',
  confidence numeric(5,4) not null default 0.5,
  confirmed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_age is null or max_age is null or max_age >= min_age)
);
create index if not exists club_needs_org_status_idx on djm_os.club_needs(organisation_id, status);
create index if not exists club_needs_owner_status_idx on djm_os.club_needs(owner_user_id, status);

create table if not exists djm_os.player_matches (
  id uuid primary key default gen_random_uuid(),
  club_need_id uuid not null references djm_os.club_needs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  overall_score numeric(5,2),
  football_score numeric(5,2),
  commercial_score numeric(5,2),
  registration_score numeric(5,2),
  career_score numeric(5,2),
  access_score numeric(5,2),
  reasoning jsonb,
  status text not null default 'suggested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(club_need_id, player_id)
);
create index if not exists player_matches_player_idx on djm_os.player_matches(player_id, overall_score desc);

create table if not exists djm_os.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  task_type text not null default 'commitment',
  owner_user_id uuid references djm_os.team_members(user_id) on delete set null,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  interaction_id uuid references djm_os.interactions(id) on delete set null,
  club_need_id uuid references djm_os.club_needs(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open',
  priority smallint not null default 3,
  source text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (priority between 1 and 5)
);
create index if not exists tasks_owner_due_idx on djm_os.tasks(owner_user_id, status, due_at);

create table if not exists djm_os.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid references djm_os.team_members(user_id) on delete set null,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  interaction_id uuid references djm_os.interactions(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  source text,
  confidence numeric(5,4),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists events_unprocessed_idx on djm_os.events(processed_at, occurred_at) where processed_at is null;

revoke all on schema djm_os from anon, authenticated;
revoke all on all tables in schema djm_os from anon, authenticated;
