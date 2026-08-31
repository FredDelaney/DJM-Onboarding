begin;

alter table djm_os.player_provider_stat_snapshots
  drop constraint if exists player_provider_stat_snapshots_provider_check;

alter table djm_os.player_provider_stat_snapshots
  add constraint player_provider_stat_snapshots_provider_check
  check (
    provider in (
      'api_football',
      'pitchapi',
      'thesportsdb',
      'wyscout',
      'sportmonks',
      'manual',
      'json_import',
      'official_league'
    )
  );

update djm_os.competitions
set provider_ids = coalesce(provider_ids, '{}'::jsonb) || jsonb_build_object('official_league', 'veikkausliiga'),
    updated_at = now()
where lower(display_name) = 'veikkausliiga'
  and lower(coalesce(country, '')) = 'finland';

comment on constraint player_provider_stat_snapshots_provider_check
  on djm_os.player_provider_stat_snapshots is
  'Allows only provider identifiers implemented by DJM server-side refresh, official league evidence, and reviewed import paths.';

commit;