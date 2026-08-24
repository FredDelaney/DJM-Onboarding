alter table public.career_entries
add column if not exists source_name text;

alter table public.career_entries
add column if not exists source_url text;

alter table public.career_entries
add column if not exists source_reviewed_at timestamptz;

alter table public.player_public_profiles
add column if not exists stats_url text;

create or replace function private.player_career_timeline(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'club_name', club_name,
          'country', country,
          'league', league,
          'season_label', season_label,
          'start_date', start_date,
          'end_date', end_date,
          'appearances', appearances,
          'starts', starts,
          'minutes', minutes,
          'goals', goals,
          'assists', assists,
          'is_international', is_international,
          'source_name', source_name,
          'source_url', source_url,
          'source_reviewed_at', source_reviewed_at
        )
      )
      order by sort_order asc, start_date desc nulls last, created_at asc
    ),
    '[]'::jsonb
  )
  from public.career_entries
  where player_id = p_player_id;
$$;
