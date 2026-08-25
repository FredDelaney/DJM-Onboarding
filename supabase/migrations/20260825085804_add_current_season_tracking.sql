alter table public.players
  add column if not exists current_season_label text,
  add column if not exists current_season_start date;

comment on column public.players.current_season_label is
  'DJM-defined label for the player current tracked football season, e.g. 2026/27 or 2026.';

comment on column public.players.current_season_start is
  'Start date used to bound player weekly season tracking.';
