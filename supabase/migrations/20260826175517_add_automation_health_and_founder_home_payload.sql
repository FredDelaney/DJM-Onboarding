create table if not exists djm_os.automation_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null default 'warning',
  title text not null,
  detail text,
  entity_type text,
  entity_id uuid,
  fingerprint text,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists automation_incidents_fingerprint_unique on djm_os.automation_incidents(fingerprint) where fingerprint is not null and status='open';
create index if not exists automation_incidents_status_idx on djm_os.automation_incidents(status,severity,detected_at desc);
alter table djm_os.automation_incidents enable row level security;
grant select,update on djm_os.automation_incidents to authenticated;
create policy djm_team_select on djm_os.automation_incidents for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.automation_incidents for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));

create or replace function djm_os.detect_automation_incidents()
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v integer:=0; x integer; begin
 insert into djm_os.automation_incidents(incident_type,severity,title,detail,entity_type,entity_id,fingerprint)
 select 'capture_stuck','warning','Capture processing is stuck','Capture has remained in processing/queued state for more than 2 hours.','capture',c.id,'capture-stuck:'||c.id::text
 from djm_os.captures c where c.status in ('queued','processing') and c.created_at<now()-interval '2 hours'
 on conflict(fingerprint) where fingerprint is not null and status='open' do nothing;
 get diagnostics x=row_count; v:=v+x;
 insert into djm_os.automation_incidents(incident_type,severity,title,detail,entity_type,entity_id,fingerprint)
 select 'message_review','info','Message requires review','A captured message could not be processed automatically.','message',m.id,'message-review:'||m.id::text
 from djm_os.messages m where m.processing_status='needs_review' and m.created_at<now()-interval '15 minutes'
 on conflict(fingerprint) where fingerprint is not null and status='open' do nothing;
 get diagnostics x=row_count; v:=v+x;
 insert into djm_os.automation_incidents(incident_type,severity,title,detail,entity_type,entity_id,fingerprint)
 select 'freshness_locked','warning','Freshness check appears stuck','A data refresh item has been locked for more than one hour.','freshness',f.id,'freshness-stuck:'||f.id::text
 from djm_os.freshness_queue f where f.locked_at is not null and f.locked_at<now()-interval '1 hour' and f.status not in ('completed','failed')
 on conflict(fingerprint) where fingerprint is not null and status='open' do nothing;
 get diagnostics x=row_count; v:=v+x;
 update djm_os.automation_incidents a set status='resolved',resolved_at=now()
 where a.status='open' and ((a.incident_type='capture_stuck' and not exists(select 1 from djm_os.captures c where c.id=a.entity_id and c.status in ('queued','processing') and c.created_at<now()-interval '2 hours')) or (a.incident_type='message_review' and not exists(select 1 from djm_os.messages m where m.id=a.entity_id and m.processing_status='needs_review')) or (a.incident_type='freshness_locked' and not exists(select 1 from djm_os.freshness_queue f where f.id=a.entity_id and f.locked_at is not null and f.locked_at<now()-interval '1 hour' and f.status not in ('completed','failed'))));
 return jsonb_build_object('new_incidents',v,'open_incidents',(select count(*) from djm_os.automation_incidents where status='open'));
end; $$;
revoke all on function djm_os.detect_automation_incidents() from public,anon,authenticated;

create or replace function public.djm_automation_health()
returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object(
 'open_incidents',(select count(*) from djm_os.automation_incidents where status='open'),
 'incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.detected_at desc) from (select id,incident_type,severity,title,detail,entity_type,entity_id,detected_at from djm_os.automation_incidents where status='open' order by detected_at desc limit 30)x),'[]'::jsonb),
 'captures',jsonb_build_object('queued',(select count(*) from djm_os.captures where status='queued'),'processing',(select count(*) from djm_os.captures where status='processing'),'needs_review',(select count(*) from djm_os.captures where status='needs_review')),
 'messages',jsonb_build_object('stored',(select count(*) from djm_os.messages where processing_status='stored'),'needs_review',(select count(*) from djm_os.messages where processing_status='needs_review')),
 'freshness',jsonb_build_object('due',(select count(*) from djm_os.freshness_queue where status='queued' and next_check_at<=now()),'locked',(select count(*) from djm_os.freshness_queue where locked_at is not null and status not in ('completed','failed'))),
 'last_snapshot',(select max(created_at) from djm_os.system_snapshots where snapshot_type='operational'),
 'cron_jobs',coalesce((select jsonb_agg(jsonb_build_object('jobname',j.jobname,'schedule',j.schedule,'active',j.active) order by j.jobname) from cron.job j where j.jobname like 'djm-os-%'),'[]'::jsonb)
 ); $$;

create or replace function public.djm_founder_home()
returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object(
 'today',public.djm_today(),
 'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.djm_notifications(12))x),'[]'::jsonb),
 'review',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.djm_review_queue(12))x),'[]'::jsonb),
 'meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select * from public.djm_network_meetings('mine',now(),now()+interval '7 days') limit 10)x),'[]'::jsonb),
 'metrics',public.djm_team_metrics(30),
 'automation',public.djm_automation_health()
 ); $$;

revoke execute on function public.djm_automation_health(),public.djm_founder_home() from public,anon;
grant execute on function public.djm_automation_health(),public.djm_founder_home() to authenticated;
select cron.unschedule(jobid) from cron.job where jobname='djm-os-healthcheck' limit 1;
select cron.schedule('djm-os-healthcheck','17 * * * *','select djm_os.detect_automation_incidents();');
notify pgrst,'reload schema';
