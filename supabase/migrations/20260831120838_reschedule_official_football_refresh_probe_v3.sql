do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'djm-official-football-refresh-probe' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;

  perform cron.schedule(
    'djm-official-football-refresh-probe',
    '10 12 * * *',
    $cmd$
      select net.http_post(
        url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/refresh-official-football-data',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-djm-cron',(
            select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1
          )
        ),
        body := jsonb_build_object('mode','refresh_all','source','official-football-cron-probe-v3'),
        timeout_milliseconds := 60000
      );
    $cmd$
  );
end $$;