do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid
    from cron.job
    where jobname = 'djm-smart-reminders-hourly'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end;
$$;

select cron.schedule(
  'djm-smart-reminders-hourly',
  '15 * * * *',
  $cron$
    select private.djm_queue_smart_reminders();
    select net.http_post(
      url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-player-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-djm-cron', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'djm_push_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'smart-reminders-hourly'),
      timeout_milliseconds := 10000
    );
    select net.http_post(
      url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-djm-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-djm-cron', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'djm_push_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'smart-reminders-hourly'),
      timeout_milliseconds := 10000
    );
  $cron$
);
