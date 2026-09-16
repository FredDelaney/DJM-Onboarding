-- Hosted Supabase default privileges can grant service_role EXECUTE on new
-- functions. This user-session endpoint has no server-side caller contract.
revoke all on function public.redream_ai_capture_workspace(uuid) from public, anon, authenticated, service_role;
grant execute on function public.redream_ai_capture_workspace(uuid) to authenticated;
notify pgrst, 'reload schema';
