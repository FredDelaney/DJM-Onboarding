create or replace function private.set_public_profile_career_timeline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.career_timeline := private.player_career_timeline(new.player_id);

  select p.stats_url
  into new.stats_url
  from public.players p
  where p.id = new.player_id;

  return new;
end;
$$;
