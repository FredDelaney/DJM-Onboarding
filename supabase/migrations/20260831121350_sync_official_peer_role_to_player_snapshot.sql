create or replace function djm_os.sync_official_peer_role_to_player_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'official_league'
     and nullif(trim(coalesce(new.provider_position, '')), '') is not null then
    update djm_os.player_provider_stat_snapshots s
    set metrics = jsonb_set(
                    jsonb_set(coalesce(s.metrics, '{}'::jsonb), '{role}', to_jsonb(new.provider_position), true),
                    '{current_season,role}',
                    to_jsonb(new.provider_position),
                    true
                  ),
        updated_at = now()
    where s.provider = 'official_league'
      and s.provider_competition_id = new.provider_competition_id
      and s.provider_season_id = new.provider_season_id
      and s.provider_player_id = new.provider_player_id
      and (
        nullif(s.metrics ->> 'role', '') is null
        or nullif(s.metrics #>> '{current_season,role}', '') is null
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_official_peer_role_to_player_snapshot on djm_os.provider_peer_stat_snapshots;
create trigger trg_sync_official_peer_role_to_player_snapshot
after insert or update of provider_position on djm_os.provider_peer_stat_snapshots
for each row execute function djm_os.sync_official_peer_role_to_player_snapshot();

update djm_os.player_provider_stat_snapshots s
set metrics = jsonb_set(
                jsonb_set(coalesce(s.metrics, '{}'::jsonb), '{role}', to_jsonb(p.provider_position), true),
                '{current_season,role}',
                to_jsonb(p.provider_position),
                true
              ),
    updated_at = now()
from djm_os.provider_peer_stat_snapshots p
where s.provider = 'official_league'
  and p.provider = 'official_league'
  and s.provider_competition_id = p.provider_competition_id
  and s.provider_season_id = p.provider_season_id
  and s.provider_player_id = p.provider_player_id
  and nullif(trim(coalesce(p.provider_position, '')), '') is not null
  and (
    nullif(s.metrics ->> 'role', '') is null
    or nullif(s.metrics #>> '{current_season,role}', '') is null
  );

revoke all on function djm_os.sync_official_peer_role_to_player_snapshot() from public, anon, authenticated;