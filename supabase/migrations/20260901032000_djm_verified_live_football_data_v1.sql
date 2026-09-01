-- DJM verified live football data V1.
-- Keeps official season totals connected to signed-player career evidence.

create or replace function djm_os.sync_official_subject_career_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_current jsonb := coalesce(new.metrics -> 'current_season', '{}'::jsonb);
  v_entry_id uuid;
  v_source_url text := coalesce(
    nullif(trim(new.metrics #>> '{source,url}'), ''),
    nullif(trim(new.provenance ->> 'source_url'), '')
  );
  v_season text := coalesce(nullif(trim(new.season_label), ''), nullif(trim(new.provider_season_id), ''));
begin
  if new.provider <> 'official_league' then
    return new;
  end if;

  select * into v_subject
  from djm_os.football_intelligence_subjects s
  where s.id = new.subject_id;

  if not found or v_subject.player_id is null then
    return new;
  end if;

  select c.id into v_entry_id
  from public.career_entries c
  where c.player_id = v_subject.player_id
    and c.source_provider = 'official_league'
    and c.source_provider_player_id = new.provider_player_id
    and coalesce(c.season_label, '') = coalesce(v_season, '')
    and lower(c.club_name) = lower(coalesce(new.club_name, v_subject.current_club, ''))
  order by c.source_synced_at desc nulls last, c.updated_at desc
  limit 1;

  if v_entry_id is null then
    insert into public.career_entries (
      player_id, club_name, country, league, season_label,
      appearances, starts, minutes, goals, assists, notes,
      is_international, sort_order, source_name, source_url,
      source_reviewed_at, source_provider, source_acceptance_method,
      source_provider_player_id, source_synced_at, competition_id,
      created_at, updated_at
    ) values (
      v_subject.player_id,
      coalesce(nullif(trim(new.club_name), ''), v_subject.current_club, 'Unknown club'),
      v_subject.current_country,
      coalesce(nullif(trim(new.competition_name), ''), v_subject.current_league),
      v_season,
      nullif(v_current ->> 'apps', '')::integer,
      nullif(v_current ->> 'starts', '')::integer,
      nullif(v_current ->> 'minutes', '')::integer,
      nullif(v_current ->> 'goals', '')::integer,
      nullif(v_current ->> 'assists', '')::integer,
      'Official season totals maintained by the automated football data refresh.',
      false,
      coalesce((select max(c.sort_order) + 1 from public.career_entries c where c.player_id = v_subject.player_id), 0),
      coalesce(nullif(trim(new.metrics #>> '{source,name}'), ''), 'Official league statistics'),
      v_source_url,
      new.observed_at,
      'official_league',
      'official_source_sync',
      new.provider_player_id,
      new.synced_at,
      v_subject.current_competition_id,
      now(),
      now()
    );
  else
    update public.career_entries
    set club_name = coalesce(nullif(trim(new.club_name), ''), club_name),
        country = coalesce(v_subject.current_country, country),
        league = coalesce(nullif(trim(new.competition_name), ''), v_subject.current_league, league),
        season_label = coalesce(v_season, season_label),
        appearances = coalesce(nullif(v_current ->> 'apps', '')::integer, appearances),
        starts = coalesce(nullif(v_current ->> 'starts', '')::integer, starts),
        minutes = coalesce(nullif(v_current ->> 'minutes', '')::integer, minutes),
        goals = coalesce(nullif(v_current ->> 'goals', '')::integer, goals),
        assists = coalesce(nullif(v_current ->> 'assists', '')::integer, assists),
        notes = 'Official season totals maintained by the automated football data refresh.',
        source_name = coalesce(nullif(trim(new.metrics #>> '{source,name}'), ''), source_name),
        source_url = coalesce(v_source_url, source_url),
        source_reviewed_at = new.observed_at,
        source_synced_at = new.synced_at,
        competition_id = coalesce(v_subject.current_competition_id, competition_id),
        updated_at = now()
    where id = v_entry_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_official_subject_career_snapshot
  on djm_os.football_subject_provider_snapshots;
create trigger trg_sync_official_subject_career_snapshot
after insert or update of metrics, season_label, club_name, competition_name, observed_at, synced_at
on djm_os.football_subject_provider_snapshots
for each row execute function djm_os.sync_official_subject_career_snapshot();

revoke all on function djm_os.sync_official_subject_career_snapshot() from public, anon, authenticated;
grant execute on function djm_os.sync_official_subject_career_snapshot() to service_role;

comment on function djm_os.sync_official_subject_career_snapshot() is
  'Copies current official league totals into the connected signed-player career record after every automated provider refresh.';

-- Reconcile exact career totals from the already-stored official snapshot.
-- This deliberately preserves the source observation and sync timestamps.
with latest as (
  select distinct on (s.player_id, ps.provider_player_id, ps.provider_season_id, ps.club_name)
    s.player_id,
    s.current_country,
    s.current_competition_id,
    ps.provider_player_id,
    ps.provider_season_id,
    ps.season_label,
    ps.club_name,
    ps.competition_name,
    ps.metrics,
    ps.provenance,
    ps.observed_at,
    ps.synced_at
  from djm_os.football_subject_provider_snapshots ps
  join djm_os.football_intelligence_subjects s on s.id = ps.subject_id
  where ps.provider = 'official_league'
    and s.player_id is not null
  order by s.player_id, ps.provider_player_id, ps.provider_season_id, ps.club_name,
           ps.observed_at desc nulls last, ps.synced_at desc nulls last
)
update public.career_entries c
set club_name = coalesce(nullif(trim(l.club_name), ''), c.club_name),
    country = coalesce(l.current_country, c.country),
    league = coalesce(nullif(trim(l.competition_name), ''), c.league),
    season_label = coalesce(nullif(trim(l.season_label), ''), nullif(trim(l.provider_season_id), ''), c.season_label),
    appearances = coalesce(nullif(l.metrics #>> '{current_season,apps}', '')::integer, c.appearances),
    starts = coalesce(nullif(l.metrics #>> '{current_season,starts}', '')::integer, c.starts),
    minutes = coalesce(nullif(l.metrics #>> '{current_season,minutes}', '')::integer, c.minutes),
    goals = coalesce(nullif(l.metrics #>> '{current_season,goals}', '')::integer, c.goals),
    assists = coalesce(nullif(l.metrics #>> '{current_season,assists}', '')::integer, c.assists),
    notes = 'Official season totals maintained by the automated football data refresh.',
    source_name = coalesce(nullif(trim(l.metrics #>> '{source,name}'), ''), c.source_name),
    source_url = coalesce(
      nullif(trim(l.metrics #>> '{source,url}'), ''),
      nullif(trim(l.provenance ->> 'source_url'), ''),
      c.source_url
    ),
    source_reviewed_at = l.observed_at,
    source_synced_at = l.synced_at,
    competition_id = coalesce(l.current_competition_id, c.competition_id),
    updated_at = now()
from latest l
where c.player_id = l.player_id
  and c.source_provider = 'official_league'
  and c.source_provider_player_id = l.provider_player_id
  and coalesce(c.season_label, '') = coalesce(nullif(trim(l.season_label), ''), nullif(trim(l.provider_season_id), ''), '');

notify pgrst, 'reload schema';
