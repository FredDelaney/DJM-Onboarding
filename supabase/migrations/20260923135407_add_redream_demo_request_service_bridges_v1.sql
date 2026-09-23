create or replace function public.platform_server_create_demo_request(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_request_id uuid;
  v_id uuid;
  v_created boolean := false;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Demo request payload is required';
  end if;

  begin
    v_client_request_id := nullif(p_input->>'client_request_id', '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Valid client_request_id is required';
  end;

  if v_client_request_id is null then
    raise exception 'Valid client_request_id is required';
  end if;

  insert into platform.demo_requests (
    client_request_id,
    full_name,
    email,
    agency_name,
    website_url,
    staff_size,
    player_count,
    priority,
    requested_plan,
    source_host,
    source_path,
    referrer,
    user_agent,
    consent_at
  )
  values (
    v_client_request_id,
    nullif(p_input->>'full_name', ''),
    lower(nullif(p_input->>'email', '')),
    nullif(p_input->>'agency_name', ''),
    nullif(p_input->>'website_url', ''),
    nullif(p_input->>'staff_size', ''),
    nullif(p_input->>'player_count', ''),
    nullif(p_input->>'priority', ''),
    nullif(p_input->>'requested_plan', ''),
    lower(nullif(p_input->>'source_host', '')),
    nullif(p_input->>'source_path', ''),
    nullif(p_input->>'referrer', ''),
    nullif(p_input->>'user_agent', ''),
    (p_input->>'consent_at')::timestamptz
  )
  on conflict (client_request_id) do nothing
  returning id into v_id;

  if v_id is not null then
    v_created := true;
  else
    select d.id
      into v_id
    from platform.demo_requests d
    where d.client_request_id = v_client_request_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'created', v_created
  );
end;
$$;

revoke all on function public.platform_server_create_demo_request(jsonb)
  from public, anon, authenticated;
grant execute on function public.platform_server_create_demo_request(jsonb)
  to service_role;

create or replace function public.platform_server_operator_demo_requests(
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.created_at desc),
    '[]'::jsonb
  )
  from (
    select
      d.id,
      d.full_name,
      d.email,
      d.agency_name,
      d.website_url,
      d.staff_size,
      d.player_count,
      d.priority,
      d.requested_plan,
      d.status,
      d.converted_tenant_id,
      d.contacted_at,
      d.created_at,
      d.updated_at
    from platform.demo_requests d
    order by d.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) r;
$$;

revoke all on function public.platform_server_operator_demo_requests(integer)
  from public, anon, authenticated;
grant execute on function public.platform_server_operator_demo_requests(integer)
  to service_role;

create or replace function public.platform_server_operator_update_demo_request(
  p_request_id uuid,
  p_status text,
  p_converted_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before platform.demo_requests%rowtype;
  v_after platform.demo_requests%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status not in ('contacted', 'qualified', 'converted', 'closed') then
    raise exception 'Unsupported demo request status';
  end if;

  select *
    into v_before
  from platform.demo_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Demo request not found';
  end if;

  if v_before.status = 'converted' and v_status <> 'converted' then
    raise exception 'Converted demo requests cannot be moved back into the prospect queue';
  end if;

  if v_status = 'converted' and p_converted_tenant_id is null then
    raise exception 'converted_tenant_id is required when a demo request becomes a customer';
  end if;

  update platform.demo_requests
  set
    status = v_status,
    converted_tenant_id = case
      when v_status = 'converted' then p_converted_tenant_id
      else null
    end,
    contacted_at = case
      when v_status in ('contacted', 'qualified', 'converted')
        then coalesce(contacted_at, now())
      else contacted_at
    end,
    contacted_by = case
      when v_status in ('contacted', 'qualified', 'converted')
        then coalesce(contacted_by, p_actor_user_id)
      else contacted_by
    end,
    updated_at = now()
  where id = p_request_id
  returning * into v_after;

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  )
  values (
    case when v_status = 'converted' then p_converted_tenant_id else null end,
    p_actor_user_id,
    'user',
    'demo_request.status_updated',
    'demo_request',
    p_request_id::text,
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object('source', 'platform_ops')
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.platform_server_operator_update_demo_request(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.platform_server_operator_update_demo_request(uuid, text, uuid, uuid)
  to service_role;

comment on function public.platform_server_create_demo_request(jsonb) is
  'Service-role bridge for idempotent public ReDream demo enquiry capture. Does not provision a tenant.';
comment on function public.platform_server_operator_demo_requests(integer) is
  'Service-role operator read bridge for ReDream demo enquiries.';
comment on function public.platform_server_operator_update_demo_request(uuid, text, uuid, uuid) is
  'Service-role audited operator mutation for ReDream demo enquiry status.';
