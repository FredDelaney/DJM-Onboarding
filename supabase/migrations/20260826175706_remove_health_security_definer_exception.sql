create table if not exists djm_os.scheduler_status (
  jobname text primary key,
  schedule text not null,
  active boolean not null,
  refreshed_at timestamptz not null default now()
);
alter table djm_os.scheduler_status enable row level security;
grant select on djm_os.scheduler_status to authenticated;
create policy djm_team_select on djm_os.scheduler_status for select to authenticated using ((select djm_os.is_team_member()));

create or replace function djm_os.refresh_scheduler_status()
returns integer language plpgsql security definer set search_path=''
as $$ declare v integer; begin
 delete from djm_os.scheduler_status;
 insert into djm_os.scheduler_status(jobname,schedule,active,refreshed_at) select j.jobname,j.schedule,j.active,now() from cron.job j where j.jobname like 'djm-os-%';
 get diagnostics v=row_count; return v;
end; $$;
revoke all on function djm_os.refresh_scheduler_status() from public,anon,authenticated;

create or replace function public.djm_automation_health()
returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object(
 'open_incidents',(select count(*) from djm_os.automation_incidents where status='open'),
 'incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.detected_at desc) from (select id,incident_type,severity,title,detail,entity_type,entity_id,detected_at from djm_os.automation_incidents where status='open' order by detected_at desc limit 30)x),'[]'::jsonb),
 'captures',jsonb_build_object('queued',(select count(*) from djm_os.captures where status='queued'),'processing',(select count(*) from djm_os.captures where status='processing'),'needs_review',(select count(*) from djm_os.captures where status='needs_review')),
 'messages',jsonb_build_object('stored',(select count(*) from djm_os.messages where processing_status='stored'),'needs_review',(select count(*) from djm_os.messages where processing_status='needs_review')),
 'freshness',jsonb_build_object('due',(select count(*) from djm_os.freshness_queue where status='queued' and next_check_at<=now()),'locked',(select count(*) from djm_os.freshness_queue where locked_at is not null and status not in ('completed','failed'))),
 'last_snapshot',(select max(created_at) from djm_os.system_snapshots where snapshot_type='operational'),
 'cron_jobs',coalesce((select jsonb_agg(jsonb_build_object('jobname',j.jobname,'schedule',j.schedule,'active',j.active) order by j.jobname) from djm_os.scheduler_status j),'[]'::jsonb)
 ); $$;
revoke all on function public.djm_automation_health() from public,anon;
grant execute on function public.djm_automation_health() to authenticated;
select djm_os.refresh_scheduler_status();
select cron.unschedule(jobid) from cron.job where jobname='djm-os-scheduler-cache' limit 1;
select cron.schedule('djm-os-scheduler-cache','5 * * * *','select djm_os.refresh_scheduler_status();');
select djm_os.refresh_scheduler_status();
notify pgrst,'reload schema';
