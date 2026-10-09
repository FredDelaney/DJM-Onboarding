-- Public links read a visibility-filtered DTO through service-only endpoints.
-- Raw snapshots remain available only to their player and authorised staff.
revoke select on public.player_public_profiles from public, anon;
drop policy if exists "public profiles published anon" on public.player_public_profiles;
alter policy "public profiles authenticated read" on public.player_public_profiles
  using (private.can_view_player(player_id));
