create or replace function djm_os.refresh_scheduler_status()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare v integer;
begin
 delete from djm_os.scheduler_status;
 insert into djm_os.scheduler_status(jobname,schedule,active,refreshed_at)
 select j.jobname,j.schedule,j.active,now()
 from cron.job j
 where j.jobname like 'djm-%';
 get diagnostics v=row_count;
 return v;
end;
$function$;

select djm_os.refresh_scheduler_status();
