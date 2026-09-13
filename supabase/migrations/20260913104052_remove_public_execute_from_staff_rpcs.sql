-- Remove inherited PUBLIC execute and explicitly allow signed-in users only.
revoke all on function public.djm_assign_player(uuid,uuid) from public;
revoke all on function public.djm_assign_player_request(uuid,uuid) from public;
revoke all on function public.djm_recruitment_assign_owner(uuid,uuid) from public;
revoke all on function public.djm_task_assign_owner(uuid,uuid) from public;
revoke all on function public.djm_player_voice_settings() from public;
revoke all on function public.djm_active_team_members() from public;

grant execute on function public.djm_assign_player(uuid,uuid) to authenticated,service_role;
grant execute on function public.djm_assign_player_request(uuid,uuid) to authenticated,service_role;
grant execute on function public.djm_recruitment_assign_owner(uuid,uuid) to authenticated,service_role;
grant execute on function public.djm_task_assign_owner(uuid,uuid) to authenticated,service_role;
grant execute on function public.djm_player_voice_settings() to authenticated,service_role;
grant execute on function public.djm_active_team_members() to authenticated,service_role;;
