alter table public.player_cv_settings add column if not exists career_summary text;
alter table public.player_cv_settings add column if not exists key_stats jsonb not null default '[]'::jsonb;
alter table public.player_cv_settings add column if not exists notable_experience jsonb not null default '[]'::jsonb;
alter table public.player_cv_settings add column if not exists market_value_display text;
alter table public.player_cv_settings add column if not exists market_value_source_url text;
