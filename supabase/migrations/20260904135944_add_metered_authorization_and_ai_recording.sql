create unique index ai_usage_events_external_request_unique_idx
on platform.ai_usage_events(tenant_id, external_request_id)
where external_request_id is not null;

create or replace function public.platform_server_authorize_metered_feature(
  p_tenant_id uuid,
  p_feature_key text,
  p_estimated_cost_micros bigint default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_source text;
  v_plan text;
  v_config jsonb;
  v_category text;
  v_metered boolean;
  v_budget bigint;
  v_hard_limit boolean;
  v_spent bigint := 0;
  v_unlimited boolean := false;
begin
  select fc.category, fc.metered, ee.enabled, ee.source, ee.plan_key, ee.configuration
    into v_category, v_metered, v_enabled, v_source, v_plan, v_config
  from platform.feature_catalog fc
  cross join lateral platform.effective_entitlement(p_tenant_id, fc.feature_key) ee
  where fc.feature_key = p_feature_key;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'unknown_feature');
  end if;
  if not coalesce(v_enabled,false) then
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled', 'source', v_source, 'plan_key', v_plan);
  end if;
  if not v_metered then
    return jsonb_build_object('allowed', true, 'reason', 'not_metered', 'source', v_source, 'plan_key', v_plan);
  end if;

  v_unlimited := coalesce((v_config->>'unlimited')::boolean, false);
  if v_unlimited then
    return jsonb_build_object('allowed', true, 'reason', 'unlimited', 'source', v_source, 'plan_key', v_plan, 'remaining_budget_micros', null);
  end if;

  if v_category in ('ai','speech') then
    select s.ai_monthly_budget_micros, s.ai_hard_limit
      into v_budget, v_hard_limit
    from platform.tenant_settings s
    where s.tenant_id = p_tenant_id;

    select coalesce(sum(coalesce(u.actual_cost_micros, u.estimated_cost_micros)),0)::bigint
      into v_spent
    from platform.usage_events u
    join platform.feature_catalog fc on fc.feature_key = u.feature_key
    where u.tenant_id = p_tenant_id
      and fc.category in ('ai','speech')
      and u.occurred_at >= date_trunc('month', now());

    if coalesce(v_hard_limit,true) and v_budget is not null and v_spent + greatest(p_estimated_cost_micros,0) > v_budget then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'monthly_budget_exceeded',
        'source', v_source,
        'plan_key', v_plan,
        'monthly_budget_micros', v_budget,
        'spent_micros', v_spent,
        'remaining_budget_micros', greatest(v_budget - v_spent, 0)
      );
    end if;

    return jsonb_build_object(
      'allowed', true,
      'reason', 'within_budget',
      'source', v_source,
      'plan_key', v_plan,
      'monthly_budget_micros', v_budget,
      'spent_micros', v_spent,
      'remaining_budget_micros', case when v_budget is null then null else greatest(v_budget - v_spent, 0) end
    );
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'enabled', 'source', v_source, 'plan_key', v_plan);
end;
$$;

create or replace function public.platform_server_record_ai_usage(
  p_tenant_id uuid,
  p_user_id uuid,
  p_feature_key text,
  p_provider text,
  p_model text,
  p_status text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_estimated_cost_micros bigint default 0,
  p_actual_cost_micros bigint default null,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_source_fingerprint text default null,
  p_external_request_id text default null,
  p_idempotency_key text default null,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
  v_ai_id uuid;
  v_idem text;
begin
  if not exists (
    select 1 from platform.feature_catalog
    where feature_key = p_feature_key and category in ('ai','speech')
  ) then raise exception 'feature_not_ai_or_speech'; end if;

  v_idem := coalesce(p_idempotency_key, p_external_request_id);
  v_usage_id := public.platform_server_record_usage(
    p_tenant_id, p_user_id, p_feature_key, 'model_call', 1, 'call',
    greatest(p_estimated_cost_micros,0), p_actual_cost_micros, 'USD',
    p_external_request_id, v_idem, coalesce(p_metadata,'{}'::jsonb)
  );

  insert into platform.ai_usage_events(
    tenant_id, usage_event_id, user_id, feature_key, provider, model, prompt_version,
    source_fingerprint, input_tokens, cached_input_tokens, output_tokens, latency_ms,
    estimated_cost_micros, actual_cost_micros, status, external_request_id, error_code, metadata
  ) values (
    p_tenant_id, v_usage_id, p_user_id, p_feature_key, p_provider, p_model, p_prompt_version,
    p_source_fingerprint, greatest(p_input_tokens,0), greatest(p_cached_input_tokens,0), greatest(p_output_tokens,0),
    p_latency_ms, greatest(p_estimated_cost_micros,0), p_actual_cost_micros, p_status,
    p_external_request_id, p_error_code, coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (tenant_id, external_request_id) where external_request_id is not null
  do update set
    usage_event_id = excluded.usage_event_id,
    status = excluded.status,
    actual_cost_micros = coalesce(excluded.actual_cost_micros, platform.ai_usage_events.actual_cost_micros),
    latency_ms = coalesce(excluded.latency_ms, platform.ai_usage_events.latency_ms),
    error_code = excluded.error_code,
    metadata = platform.ai_usage_events.metadata || excluded.metadata
  returning id into v_ai_id;
  return v_ai_id;
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
declare v_msg_id bigint;
begin
  if p_delay_seconds < 0 or p_delay_seconds > 604800 then raise exception 'invalid_delay'; end if;
  if not exists (select 1 from platform.tenants where id = p_tenant_id and status = 'active') then raise exception 'tenant_not_active'; end if;
  select send into v_msg_id from pgmq.send('platform_events', jsonb_build_object(
    'tenant_id', p_tenant_id,
    'event_type', p_event_type,
    'payload', coalesce(p_payload,'{}'::jsonb),
    'correlation_id', p_correlation_id,
    'enqueued_at', now()
  ), p_delay_seconds);
  return v_msg_id;
end;
$$;

revoke all on function public.platform_server_authorize_metered_feature(uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.platform_server_record_ai_usage(uuid,uuid,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.platform_server_enqueue_event(uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.platform_server_authorize_metered_feature(uuid,text,bigint) to service_role;
grant execute on function public.platform_server_record_ai_usage(uuid,uuid,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.platform_server_enqueue_event(uuid,text,jsonb,text,integer) to service_role;
