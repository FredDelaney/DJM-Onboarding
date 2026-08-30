-- DJM player provider snapshot contract V1
-- Aligns the stored provider allowlist with the deployed refresh functions.

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
      'manual'
    )
  );

comment on constraint player_provider_stat_snapshots_provider_check
  on djm_os.player_provider_stat_snapshots is
  'Allows only provider identifiers implemented by DJM server-side refresh and reviewed manual evidence paths.';

commit;
