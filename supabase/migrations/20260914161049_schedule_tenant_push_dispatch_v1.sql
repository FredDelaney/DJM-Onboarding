begin;

alter table private.push_scheduler_config
  add column if not exists edge_functions_base_url text;

comment on column private.push_scheduler_config.edge_functions_base_url
  is 'Environment-specific Supabase Edge Functions base URL. Configure per environment; never infer or hardcode another environment.';

alter table private.push_scheduler_config
  drop constraint if exists push_scheduler_config_edge_functions_base_url_check;

alter table private.push_scheduler_config
  add constraint push_scheduler_config_edge_functions_base_url_check
  check (
    edge_functions_base_url is null
    or edge_functions_base_url ~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/?$'
  );

create or replace function private.dispatch_push_outbox()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
  v_request_id bigint;
begin
  select
    nullif(pg_catalog.btrim(c.edge_functions_base_url), ''),
    nullif(pg_catalog.btrim(c.secret), '')
  into v_base_url, v_secret
  from private.push_scheduler_config c
  where c.singleton = true
  limit 1;

  if v_base_url is null or v_secret is null then
    return null;
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_base_url, '/') || '/dispatch-player-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-djm-cron', v_secret
    ),
    body := jsonb_build_object('source', 'platform-push-dispatch'),
    timeout_milliseconds := 10000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.dispatch_push_outbox()
  from public, anon, authenticated, service_role;

DO $$
declare
  v_job_id bigint;
begin
  select j.jobid
    into v_job_id
  from cron.job j
  where j.jobname = 'platform-push-dispatch-minute'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'platform-push-dispatch-minute',
    '* * * * *',
    'select private.dispatch_push_outbox();'
  );
end;
$$;

commit;
