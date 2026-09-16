begin;

revoke all on function public.get_club_share(uuid)
  from public, anon, authenticated;
grant execute on function public.get_club_share(uuid)
  to service_role;

revoke all on function public.track_club_share_view(uuid)
  from public, anon, authenticated;
grant execute on function public.track_club_share_view(uuid)
  to service_role;

revoke all on function public.validate_player_invite_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.validate_player_invite_v2(uuid)
  to service_role;

commit;
