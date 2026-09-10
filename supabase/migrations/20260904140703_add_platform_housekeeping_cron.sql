alter default privileges in schema platform revoke execute on functions from public;

create extension if not exists pg_cron;

create or replace function platform.run_housekeeping()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_idempotency integer := 0;
  v_health integer := 0;
begin
  delete from platform.idempotency_keys
  where expires_at < now()
    and (status <> 'pending' or locked_at is null or locked_at < now() - interval '1 hour');
  get diagnostics v_idempotency = row_count;

  delete from platform.service_health_events
  where observed_at < now() - interval '90 days';
  get diagnostics v_health = row_count;

  return jsonb_build_object(
    'expired_idempotency_deleted', v_idempotency,
    'old_health_events_deleted', v_health,
    'ran_at', now()
  );
end;
$$;
revoke all on function platform.run_housekeeping() from public, anon, authenticated;

select cron.schedule(
  'platform-housekeeping-hourly',
  '17 * * * *',
  $$select platform.run_housekeeping();$$
);
