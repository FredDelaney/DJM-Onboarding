begin;

create table if not exists djm_os.provider_peer_stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_competition_id text not null,
  provider_season_id text not null,
  provider_player_id text not null,
  provider_team_id text not null default '',
  player_name text,
  team_name text,
  provider_position text,
  minutes integer check (minutes is null or minutes >= 0),
  metrics jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_competition_id, provider_season_id, provider_player_id, provider_team_id)
);

create index if not exists provider_peer_stat_snapshots_cohort_idx
  on djm_os.provider_peer_stat_snapshots(provider, provider_competition_id, provider_season_id, synced_at desc);

create index if not exists provider_peer_stat_snapshots_player_idx
  on djm_os.provider_peer_stat_snapshots(provider, provider_player_id, provider_season_id);

alter table djm_os.provider_peer_stat_snapshots enable row level security;
revoke all on djm_os.provider_peer_stat_snapshots from anon, authenticated;

create table if not exists djm_os.country_league_strength_anchors (
  country text primary key,
  iffhs_rank integer not null check (iffhs_rank > 0),
  iffhs_points numeric,
  strength_score smallint not null check (strength_score between 0 and 100),
  source_name text not null default 'IFFHS Strongest National League 2025',
  source_url text not null default 'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862',
  observed_at timestamptz not null default '2026-01-16T00:00:00Z',
  methodology text not null default 'DJM maps the published IFFHS national top-division points to a 45-100 log scale. Rank-only fallback is used only when points are unavailable.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table djm_os.country_league_strength_anchors enable row level security;
revoke all on djm_os.country_league_strength_anchors from anon, authenticated;

with anchors(country, iffhs_rank, iffhs_points) as (values
('England',1,2359::numeric),('Spain',2,2073),('Brazil',3,1999),('Italy',4,1972),('Germany',5,1880),('France',6,1502),('Portugal',7,1145),('Argentina',8,1089),('Netherlands',9,1067),('Colombia',10,1025.5),('Turkey',11,980),('Belgium',12,957.5),('Saudi Arabia',13,868.75),('Ecuador',14,817.5),('Greece',15,748.25),('Egypt',16,721.5),('Czech Republic',17,716),('Japan',18,700.75),('Paraguay',19,670),('Cyprus',20,652.5),('Uruguay',21,648.25),('Mexico',22,646.5),('Poland',23,644.5),('Scotland',24,630.5),('Denmark',25,576.25),('Romania',26,539.5),('Croatia',27,536.25),('Costa Rica',28,521.5),('Switzerland',29,502.5),('Norway',30,499.75),('Chile',31,487.75),('Serbia',32,487),('Ukraine',32,487),('Peru',34,470),('Austria',35,468.75),('Bulgaria',36,464.25),('Azerbaijan',37,454.25),('South Korea',38,438.75),('Morocco',39,432.75),('United States',40,426.75),('Hungary',41,418.5),('United Arab Emirates',42,406),('Israel',43,401.75),('Slovenia',44,394),('South Africa',45,366.5),('Algeria',46,363),('Thailand',47,361.5),('Bosnia and Herzegovina',48,355),('Bolivia',49,354.25),('Republic of Ireland',50,340),('Tunisia',51,337.5),('China',52,318),('Kosovo',53,315.5),('Tanzania',54,308.5),('Nicaragua',55,307.5),('Latvia',56,304.5),('Honduras',57,297.5),('Estonia',58,297),('Sweden',59,287),('Armenia',60,285.5),('Northern Ireland',61,284.5),('Iran',62,280.5),('Belarus',63,260),('North Macedonia',64,257),('Guatemala',65,248.25),('Finland',66,241.5),('Venezuela',67,241),('DR Congo',68,238),('Jamaica',69,236),('Qatar',70,228.25),('Albania',71,228),('Iceland',72,220.25),('Australia',73,211.25),('Kazakhstan',74,204.5),('Faroe Islands',75,200.5),('Malta',75,200.5),('Turkmenistan',77,197.5),('San Marino',78,197.25),('Moldova',79,194.5),('Georgia',80,194.25),('Mali',81,193.75),('Malaysia',82,191.75),('Iraq',83,191),('Indonesia',84,190.25),('Andorra',85,186.25),('Angola',86,183),('Ivory Coast',87,180.75),('Lithuania',88,178.75),('Slovakia',89,178),('Zambia',90,172),('Nigeria',91,171.75),('Botswana',92,171.25),('Uzbekistan',93,168.75),('Kuwait',94,168),('Montenegro',95,167.75),('Luxembourg',96,167.25),('Singapore',97,165.75),('Panama',98,162),('Wales',99,156.5),('Ghana',100,155.75)
), scored as (
 select country, iffhs_rank, iffhs_points,
   round(45 + 55 * (ln(iffhs_points) - ln(155.75::numeric)) / (ln(2359::numeric) - ln(155.75::numeric)))::smallint as strength_score
 from anchors
)
insert into djm_os.country_league_strength_anchors(country,iffhs_rank,iffhs_points,strength_score)
select country,iffhs_rank,iffhs_points,strength_score from scored
on conflict(country) do update set
  iffhs_rank=excluded.iffhs_rank,
  iffhs_points=excluded.iffhs_points,
  strength_score=excluded.strength_score,
  updated_at=now();

insert into djm_os.country_league_strength_anchors(country,iffhs_rank,iffhs_points,strength_score,methodology)
values (
  'New Zealand',
  107,
  null,
  43,
  'IFFHS identifies New Zealand as world rank 107 for 2025 but the public top-100 table does not publish its points. DJM stores a conservative rank-derived top-division anchor of 43 and marks the source basis explicitly.'
)
on conflict(country) do update set
  iffhs_rank=excluded.iffhs_rank,
  iffhs_points=excluded.iffhs_points,
  strength_score=excluded.strength_score,
  methodology=excluded.methodology,
  updated_at=now();

comment on table djm_os.provider_peer_stat_snapshots is
  'Cached external competition-season player statistics used to calculate transparent DJM peer percentiles without repeatedly consuming provider quota.';

comment on table djm_os.country_league_strength_anchors is
  'Source-backed national top-division strength anchors from IFFHS 2025. Lower-tier adjustments are derived separately and must be labelled as model-derived.';

commit;
