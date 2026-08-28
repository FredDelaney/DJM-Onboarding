create or replace function public.djm_automation_health()
returns jsonb
language sql
stable
set search_path=''
as $function$
select jsonb_build_object(
 'open_incidents',(select count(*) from djm_os.automation_incidents where status='open'),
 'incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.detected_at desc) from (select id,incident_type,severity,title,detail,entity_type,entity_id,detected_at from djm_os.automation_incidents where status='open' order by detected_at desc limit 30)x),'[]'::jsonb),
 'captures',jsonb_build_object(
   'queued',(select count(*) from djm_os.captures where status='queued'),
   'processing',(select count(*) from djm_os.captures where status='processing'),
   'needs_review',(select count(*) from djm_os.captures where status='needs_review')
 ),
 'messages',jsonb_build_object(
   'stored',(select count(*) from djm_os.messages where processing_status='stored'),
   'needs_review',(select count(*) from djm_os.messages where processing_status='needs_review')
 ),
 'freshness',jsonb_build_object(
   'due',(select count(*) from djm_os.freshness_queue where status in ('queued','due','pending','failed') and coalesce(next_check_at,now())<=now()),
   'locked',(select count(*) from djm_os.freshness_queue where locked_at is not null and status not in ('completed','failed'))
 ),
 'last_snapshot',(select max(created_at) from djm_os.system_snapshots where snapshot_type='operational'),
 'cron_jobs',coalesce((select jsonb_agg(jsonb_build_object('jobname',j.jobname,'schedule',j.schedule,'active',j.active) order by j.jobname) from djm_os.scheduler_status j),'[]'::jsonb)
);
$function$;
