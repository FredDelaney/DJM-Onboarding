select pgmq.create('platform_dead_letter');

create or replace function public.platform_server_enqueue_job(
  p_tenant_id uuid,
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_delay_seconds integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg_id bigint; v_corr text;
begin
  if p_delay_seconds < 0 or p_delay_seconds > 604800 then raise exception 'invalid_delay'; end if;
  if nullif(trim(p_job_type),'') is null then raise exception 'invalid_job_type'; end if;
  if not exists (select 1 from platform.tenants where id = p_tenant_id and status = 'active') then raise exception 'tenant_not_active'; end if;
  v_corr := coalesce(nullif(trim(p_correlation_id),''), gen_random_uuid()::text);
  select send into v_msg_id from pgmq.send('platform_jobs', jsonb_build_object(
    'schema_version', 1,
    'tenant_id', p_tenant_id,
    'job_type', trim(p_job_type),
    'payload', coalesce(p_payload,'{}'::jsonb),
    'correlation_id', v_corr,
    'enqueued_at', now()
  ), p_delay_seconds);
  return v_msg_id;
end;
$$;

create or replace function public.platform_server_enqueue_event(
  p_tenant_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_delay_seconds integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg_id bigint; v_corr text;
begin
  if p_delay_seconds < 0 or p_delay_seconds > 604800 then raise exception 'invalid_delay'; end if;
  if nullif(trim(p_event_type),'') is null then raise exception 'invalid_event_type'; end if;
  if not exists (select 1 from platform.tenants where id = p_tenant_id and status = 'active') then raise exception 'tenant_not_active'; end if;
  v_corr := coalesce(nullif(trim(p_correlation_id),''), gen_random_uuid()::text);
  select send into v_msg_id from pgmq.send('platform_events', jsonb_build_object(
    'schema_version', 1,
    'tenant_id', p_tenant_id,
    'event_type', trim(p_event_type),
    'payload', coalesce(p_payload,'{}'::jsonb),
    'correlation_id', v_corr,
    'enqueued_at', now()
  ), p_delay_seconds);
  return v_msg_id;
end;
$$;

create or replace function public.platform_server_claim_jobs(p_visibility_seconds integer default 90, p_qty integer default 10)
returns table(msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visibility_seconds < 10 or p_visibility_seconds > 3600 then raise exception 'invalid_visibility_timeout'; end if;
  if p_qty < 1 or p_qty > 50 then raise exception 'invalid_batch_size'; end if;
  return query select q.msg_id, q.read_ct::integer, q.enqueued_at, q.vt, q.message from pgmq.read('platform_jobs', p_visibility_seconds, p_qty) q;
end;
$$;

create or replace function public.platform_server_archive_job(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$ select pgmq.archive('platform_jobs', p_msg_id); $$;

create or replace function public.platform_server_dead_letter_job(p_msg_id bigint, p_reason text, p_message jsonb, p_read_ct integer default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_dead_id bigint;
begin
  select send into v_dead_id from pgmq.send('platform_dead_letter', jsonb_build_object(
    'schema_version',1,
    'source_queue','platform_jobs',
    'source_msg_id',p_msg_id,
    'reason',left(coalesce(p_reason,'worker_failure'),500),
    'read_ct',p_read_ct,
    'message',coalesce(p_message,'{}'::jsonb),
    'dead_lettered_at',now()
  ));
  perform pgmq.archive('platform_jobs', p_msg_id);
  return v_dead_id;
end;
$$;

revoke all on function public.platform_server_enqueue_job(uuid,text,jsonb,text,integer) from public, anon, authenticated;
revoke all on function public.platform_server_enqueue_event(uuid,text,jsonb,text,integer) from public, anon, authenticated;
revoke all on function public.platform_server_claim_jobs(integer,integer) from public, anon, authenticated;
revoke all on function public.platform_server_archive_job(bigint) from public, anon, authenticated;
revoke all on function public.platform_server_dead_letter_job(bigint,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.platform_server_enqueue_job(uuid,text,jsonb,text,integer) to service_role;
grant execute on function public.platform_server_enqueue_event(uuid,text,jsonb,text,integer) to service_role;
grant execute on function public.platform_server_claim_jobs(integer,integer) to service_role;
grant execute on function public.platform_server_archive_job(bigint) to service_role;
grant execute on function public.platform_server_dead_letter_job(bigint,text,jsonb,integer) to service_role;
