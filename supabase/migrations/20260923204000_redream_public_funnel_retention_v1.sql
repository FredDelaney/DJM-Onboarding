create or replace function public.platform_server_cleanup_public_funnel_events(
  p_retention_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_deleted integer;
begin
  v_days := greatest(30, least(coalesce(p_retention_days, 90), 365));

  delete from platform.public_funnel_events
  where created_at < now() - make_interval(days => v_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.platform_server_cleanup_public_funnel_events(integer)
  from public, anon, authenticated;
grant execute on function public.platform_server_cleanup_public_funnel_events(integer)
  to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'redream-public-funnel-retention-v1';

select cron.schedule(
  'redream-public-funnel-retention-v1',
  '37 3 * * *',
  $cron$select public.platform_server_cleanup_public_funnel_events(90);$cron$
);

comment on function public.platform_server_cleanup_public_funnel_events(integer) is
  'Deletes privacy-minimal public ReDream funnel events after the configured retention window.';

comment on table platform.public_funnel_events is
  'Privacy-minimal first-party ReDream sales-site funnel events. No raw scenario text is stored here. Anonymous events are retained for 90 days.';
