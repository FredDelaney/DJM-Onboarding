revoke execute on function public.djm_email_delivery_status() from public, anon, authenticated;
revoke execute on function public.djm_run_smart_reminders() from public, anon, authenticated;
grant execute on function public.djm_email_delivery_status() to service_role;
grant execute on function public.djm_run_smart_reminders() to service_role;;
