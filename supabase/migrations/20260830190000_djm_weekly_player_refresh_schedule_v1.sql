-- DJM weekly player refresh schedule V1
-- Runs a small rotating, stale-first batch daily so every active roster player
-- receives at least weekly basic data coverage without exceeding the free provider limit.

begin;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'djm-weekly-player-data-refresh'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'djm-weekly-player-data-refresh',
  '17 3 * * *',
  $$
    select net.http_post(
      url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/weekly-player-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-djm-cron', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'djm_push_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'scheduled-player-refresh'),
      timeout_milliseconds := 60000
    );
  $$
);

commit;
