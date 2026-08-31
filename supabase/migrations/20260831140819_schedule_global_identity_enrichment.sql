do $$
begin
  if exists(select 1 from cron.job where jobname='djm-global-football-identity-enrichment') then
    perform cron.unschedule('djm-global-football-identity-enrichment');
  end if;
end$$;
select cron.schedule(
  'djm-global-football-identity-enrichment',
  '*/30 * * * *',
  $$select net.http_post(
    url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/refresh-global-football-identity',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)
    ),
    body := jsonb_build_object('source','global_identity_enrichment'),
    timeout_milliseconds := 60000
  );$$
);