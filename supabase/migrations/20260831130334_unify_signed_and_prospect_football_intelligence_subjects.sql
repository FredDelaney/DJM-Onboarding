alter table djm_os.scouting_prospects
  add column if not exists current_league text,
  add column if not exists current_competition_id uuid,
  add column if not exists current_season_label text,
  add column if not exists current_season_start date,
  add column if not exists football_provider_ids jsonb not null default '{}'::jsonb,
  add column if not exists stats_url text,
  add column if not exists external_data_status text not null default 'never',
  add column if not exists external_data_checked_at timestamptz,
  add column if not exists external_data_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scouting_prospects_current_competition_id_fkey'
      and conrelid = 'djm_os.scouting_prospects'::regclass
  ) then
    alter table djm_os.scouting_prospects
      add constraint scouting_prospects_current_competition_id_fkey
      foreign key (current_competition_id)
      references djm_os.competitions(id)
      on delete set null;
  end if;
end $$;

create table if not exists djm_os.football_intelligence_subjects (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete cascade,
  prospect_id uuid references djm_os.scouting_prospects(id) on delete cascade,
  representation_status text not null default 'prospect'
    check (representation_status in ('prospect','signed')),
  full_name text not null,
  date_of_birth date,
  nationality text,
  primary_position text,
  current_club text,
  current_league text,
  current_country text,
  current_competition_id uuid references djm_os.competitions(id) on delete set null,
  current_season_label text,
  current_season_start date,
  football_provider_ids jsonb not null default '{}'::jsonb,
  stats_url text,
  transfermarkt_url text,
  wyscout_url text,
  canonical_key text,
  external_data_status text not null default 'never',
  external_data_checked_at timestamptz,
  external_data_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint football_intelligence_subject_has_source
    check (player_id is not null or prospect_id is not null)
);

create unique index if not exists football_intelligence_subjects_player_unique
  on djm_os.football_intelligence_subjects(player_id)
  where player_id is not null;
create unique index if not exists football_intelligence_subjects_prospect_unique
  on djm_os.football_intelligence_subjects(prospect_id)
  where prospect_id is not null;
create index if not exists football_intelligence_subjects_competition_idx
  on djm_os.football_intelligence_subjects(current_competition_id);
create index if not exists football_intelligence_subjects_status_idx
  on djm_os.football_intelligence_subjects(representation_status, updated_at desc);

create table if not exists djm_os.football_subject_provider_snapshots (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references djm_os.football_intelligence_subjects(id) on delete cascade,
  provider text not null,
  provider_player_id text not null,
  provider_team_id text not null default '',
  provider_competition_id text not null default '',
  provider_season_id text not null,
  season_label text,
  club_name text,
  competition_name text,
  metrics jsonb not null default '{}'::jsonb,
  metric_schema_version text not null default 'djm_metrics_v1',
  data_depth text not null default 'unknown',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (subject_id, provider, provider_season_id, provider_competition_id, provider_team_id)
);

create index if not exists football_subject_provider_subject_idx
  on djm_os.football_subject_provider_snapshots(subject_id, synced_at desc);
create index if not exists football_subject_provider_competition_idx
  on djm_os.football_subject_provider_snapshots(provider, provider_competition_id, provider_season_id);

create table if not exists djm_os.football_subject_match_snapshots (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references djm_os.football_intelligence_subjects(id) on delete cascade,
  provider text not null,
  provider_player_id text not null,
  provider_match_id text not null,
  provider_team_id text,
  provider_opponent_id text,
  provider_competition_id text,
  provider_season_id text,
  competition_id uuid references djm_os.competitions(id) on delete set null,
  season_label text,
  match_date date not null,
  team_name text,
  opponent_name text,
  home_away text check (home_away is null or home_away in ('home','away','neutral')),
  position_group text,
  provider_position text,
  started boolean,
  minutes integer check (minutes is null or (minutes >= 0 and minutes <= 180)),
  metrics jsonb not null default '{}'::jsonb,
  metric_schema_version text not null default 'djm_match_metrics_v1',
  data_depth text not null default 'unknown',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, provider, provider_match_id, provider_player_id)
);

create index if not exists football_subject_match_subject_idx
  on djm_os.football_subject_match_snapshots(subject_id, match_date desc);
create index if not exists football_subject_match_competition_idx
  on djm_os.football_subject_match_snapshots(provider, provider_competition_id, provider_season_id, match_date desc);

create or replace function djm_os.sync_football_subject_from_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_subject_id uuid;
  v_prospect_id uuid;
begin
  v_name := coalesce(nullif(trim(new.preferred_name), ''), nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), 'Unnamed player');

  select sp.id into v_prospect_id
  from djm_os.scouting_prospects sp
  where sp.signed_player_id = new.id or sp.linked_player_id = new.id
  order by sp.updated_at desc
  limit 1;

  if v_prospect_id is not null then
    select s.id into v_subject_id
    from djm_os.football_intelligence_subjects s
    where s.prospect_id = v_prospect_id
    limit 1;
  end if;

  if v_subject_id is null then
    select s.id into v_subject_id
    from djm_os.football_intelligence_subjects s
    where s.player_id = new.id
    limit 1;
  end if;

  if v_subject_id is null then
    insert into djm_os.football_intelligence_subjects(
      player_id, prospect_id, representation_status, full_name, date_of_birth, nationality,
      primary_position, current_club, current_league, current_country, current_competition_id,
      current_season_label, current_season_start, football_provider_ids, stats_url,
      transfermarkt_url, wyscout_url, canonical_key, updated_at
    ) values (
      new.id, v_prospect_id, 'signed', v_name, new.date_of_birth,
      nullif(array_to_string(new.nationalities, ', '), ''), new.primary_position, new.current_club,
      new.current_league, new.current_country, new.current_competition_id, new.current_season_label,
      new.current_season_start, coalesce(new.football_provider_ids, '{}'::jsonb), new.stats_url,
      new.transfermarkt_url, new.wyscout_url,
      coalesce(nullif(new.football_provider_ids->>'canonical', ''), lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'))),
      now()
    );
  else
    update djm_os.football_intelligence_subjects
    set player_id = new.id,
        prospect_id = coalesce(prospect_id, v_prospect_id),
        representation_status = 'signed',
        full_name = v_name,
        date_of_birth = coalesce(new.date_of_birth, date_of_birth),
        nationality = coalesce(nullif(array_to_string(new.nationalities, ', '), ''), nationality),
        primary_position = coalesce(new.primary_position, primary_position),
        current_club = coalesce(new.current_club, current_club),
        current_league = coalesce(new.current_league, current_league),
        current_country = coalesce(new.current_country, current_country),
        current_competition_id = coalesce(new.current_competition_id, current_competition_id),
        current_season_label = coalesce(new.current_season_label, current_season_label),
        current_season_start = coalesce(new.current_season_start, current_season_start),
        football_provider_ids = coalesce(football_provider_ids, '{}'::jsonb) || coalesce(new.football_provider_ids, '{}'::jsonb),
        stats_url = coalesce(new.stats_url, stats_url),
        transfermarkt_url = coalesce(new.transfermarkt_url, transfermarkt_url),
        wyscout_url = coalesce(new.wyscout_url, wyscout_url),
        updated_at = now()
    where id = v_subject_id;
  end if;

  return new;
end;
$$;

create or replace function djm_os.sync_football_subject_from_prospect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
  v_player_id uuid;
begin
  v_player_id := coalesce(new.signed_player_id, new.linked_player_id);

  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.prospect_id = new.id
  limit 1;

  if v_subject_id is null and v_player_id is not null then
    select s.id into v_subject_id
    from djm_os.football_intelligence_subjects s
    where s.player_id = v_player_id
    limit 1;
  end if;

  if v_subject_id is null then
    insert into djm_os.football_intelligence_subjects(
      player_id, prospect_id, representation_status, full_name, date_of_birth, nationality,
      primary_position, current_club, current_league, current_country, current_competition_id,
      current_season_label, current_season_start, football_provider_ids, stats_url,
      transfermarkt_url, wyscout_url, canonical_key, external_data_status,
      external_data_checked_at, external_data_error, updated_at
    ) values (
      v_player_id, new.id, case when v_player_id is null then 'prospect' else 'signed' end,
      new.full_name, new.date_of_birth, new.nationality, new.primary_position, new.current_club,
      new.current_league, new.current_country, new.current_competition_id, new.current_season_label,
      new.current_season_start, coalesce(new.football_provider_ids, '{}'::jsonb), new.stats_url,
      new.transfermarkt_url, new.wyscout_url,
      coalesce(new.canonical_key, lower(regexp_replace(new.full_name, '[^a-zA-Z0-9]+', '-', 'g'))),
      new.external_data_status, new.external_data_checked_at, new.external_data_error, now()
    );
  else
    update djm_os.football_intelligence_subjects
    set player_id = coalesce(v_player_id, player_id),
        prospect_id = new.id,
        representation_status = case when coalesce(v_player_id, player_id) is null then 'prospect' else 'signed' end,
        full_name = new.full_name,
        date_of_birth = coalesce(new.date_of_birth, date_of_birth),
        nationality = coalesce(new.nationality, nationality),
        primary_position = coalesce(new.primary_position, primary_position),
        current_club = coalesce(new.current_club, current_club),
        current_league = coalesce(new.current_league, current_league),
        current_country = coalesce(new.current_country, current_country),
        current_competition_id = coalesce(new.current_competition_id, current_competition_id),
        current_season_label = coalesce(new.current_season_label, current_season_label),
        current_season_start = coalesce(new.current_season_start, current_season_start),
        football_provider_ids = coalesce(football_provider_ids, '{}'::jsonb) || coalesce(new.football_provider_ids, '{}'::jsonb),
        stats_url = coalesce(new.stats_url, stats_url),
        transfermarkt_url = coalesce(new.transfermarkt_url, transfermarkt_url),
        wyscout_url = coalesce(new.wyscout_url, wyscout_url),
        canonical_key = coalesce(new.canonical_key, canonical_key),
        external_data_status = new.external_data_status,
        external_data_checked_at = new.external_data_checked_at,
        external_data_error = new.external_data_error,
        updated_at = now()
    where id = v_subject_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_football_subject_from_player_trg on public.players;
create trigger sync_football_subject_from_player_trg
after insert or update of preferred_name, first_name, last_name, date_of_birth, nationalities,
  primary_position, current_club, current_league, current_country, current_competition_id,
  current_season_label, current_season_start, football_provider_ids, stats_url, transfermarkt_url, wyscout_url
on public.players
for each row execute function djm_os.sync_football_subject_from_player();

drop trigger if exists sync_football_subject_from_prospect_trg on djm_os.scouting_prospects;
create trigger sync_football_subject_from_prospect_trg
after insert or update of full_name, date_of_birth, nationality, primary_position, current_club,
  current_league, current_country, current_competition_id, current_season_label, current_season_start,
  football_provider_ids, stats_url, transfermarkt_url, wyscout_url, canonical_key,
  external_data_status, external_data_checked_at, external_data_error, signed_player_id, linked_player_id
on djm_os.scouting_prospects
for each row execute function djm_os.sync_football_subject_from_prospect();

insert into djm_os.football_intelligence_subjects(
  player_id, representation_status, full_name, date_of_birth, nationality, primary_position,
  current_club, current_league, current_country, current_competition_id, current_season_label,
  current_season_start, football_provider_ids, stats_url, transfermarkt_url, wyscout_url, canonical_key
)
select p.id, 'signed',
       coalesce(nullif(trim(p.preferred_name), ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Unnamed player'),
       p.date_of_birth, nullif(array_to_string(p.nationalities, ', '), ''), p.primary_position,
       p.current_club, p.current_league, p.current_country, p.current_competition_id,
       p.current_season_label, p.current_season_start, coalesce(p.football_provider_ids, '{}'::jsonb),
       p.stats_url, p.transfermarkt_url, p.wyscout_url,
       coalesce(nullif(p.football_provider_ids->>'canonical', ''), lower(regexp_replace(coalesce(p.preferred_name, concat_ws(' ', p.first_name, p.last_name)), '[^a-zA-Z0-9]+', '-', 'g')))
from public.players p
where not exists (select 1 from djm_os.football_intelligence_subjects s where s.player_id = p.id);

insert into djm_os.football_intelligence_subjects(
  player_id, prospect_id, representation_status, full_name, date_of_birth, nationality, primary_position,
  current_club, current_league, current_country, current_competition_id, current_season_label,
  current_season_start, football_provider_ids, stats_url, transfermarkt_url, wyscout_url, canonical_key,
  external_data_status, external_data_checked_at, external_data_error
)
select coalesce(sp.signed_player_id, sp.linked_player_id), sp.id,
       case when coalesce(sp.signed_player_id, sp.linked_player_id) is null then 'prospect' else 'signed' end,
       sp.full_name, sp.date_of_birth, sp.nationality, sp.primary_position, sp.current_club,
       sp.current_league, sp.current_country, sp.current_competition_id, sp.current_season_label,
       sp.current_season_start, coalesce(sp.football_provider_ids, '{}'::jsonb), sp.stats_url,
       sp.transfermarkt_url, sp.wyscout_url,
       coalesce(sp.canonical_key, lower(regexp_replace(sp.full_name, '[^a-zA-Z0-9]+', '-', 'g'))),
       sp.external_data_status, sp.external_data_checked_at, sp.external_data_error
from djm_os.scouting_prospects sp
where not exists (select 1 from djm_os.football_intelligence_subjects s where s.prospect_id = sp.id)
  and not exists (
    select 1 from djm_os.football_intelligence_subjects s
    where s.player_id = coalesce(sp.signed_player_id, sp.linked_player_id)
      and coalesce(sp.signed_player_id, sp.linked_player_id) is not null
  );

revoke all on djm_os.football_intelligence_subjects from anon, authenticated;
revoke all on djm_os.football_subject_provider_snapshots from anon, authenticated;
revoke all on djm_os.football_subject_match_snapshots from anon, authenticated;
grant all on djm_os.football_intelligence_subjects to service_role;
grant all on djm_os.football_subject_provider_snapshots to service_role;
grant all on djm_os.football_subject_match_snapshots to service_role;