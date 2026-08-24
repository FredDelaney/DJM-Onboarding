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
          'is_international', is_international
        )
      )
      order by sort_order asc, start_date desc nulls last, created_at asc
    ),
    '[]'::jsonb
  )
  from public.career_entries
  where player_id = p_player_id;
$$;

create or replace function private.set_public_profile_career_timeline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.career_timeline := private.player_career_timeline(new.player_id);
  return new;
end;
$$;

drop trigger if exists trg_public_profile_career_timeline
on public.player_public_profiles;

create trigger trg_public_profile_career_timeline
before insert or update
on public.player_public_profiles
for each row
execute function private.set_public_profile_career_timeline();

create or replace function private.career_change_requires_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player_id uuid := coalesce(new.player_id, old.player_id);
begin
  update public.players
  set
    verification_status = 'reviewing',
    verified_at = null,
    review_required_at = now(),
    review_reason = 'Career statistics changed'
  where id = v_player_id;

  update public.player_public_profiles
  set
    career_timeline = private.player_career_timeline(v_player_id),
    published = false
  where player_id = v_player_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_career_change_requires_review
on public.career_entries;

create trigger trg_career_change_requires_review
after insert or update or delete
on public.career_entries
for each row
execute function private.career_change_requires_review();
