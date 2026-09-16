create or replace function public.platform_server_begin_idempotent(
  p_tenant_id uuid,
  p_scope text,
  p_idempotency_key text,
  p_request_hash text default null,
  p_ttl_seconds integer default 86400,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row platform.idempotency_keys%rowtype;
  v_inserted integer := 0;
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 604800 then raise exception 'invalid_ttl'; end if;
  if p_lease_seconds < 10 or p_lease_seconds > 3600 then raise exception 'invalid_lease'; end if;
  if nullif(trim(p_scope),'') is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'invalid_idempotency_key'; end if;
  if not exists (select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_active'; end if;

  insert into platform.idempotency_keys(
    tenant_id, scope, idempotency_key, request_hash, status, locked_at, expires_at
  ) values (
    p_tenant_id, trim(p_scope), trim(p_idempotency_key), p_request_hash, 'pending', now(), now() + make_interval(secs => p_ttl_seconds)
  ) on conflict (tenant_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_row
  from platform.idempotency_keys
  where tenant_id=p_tenant_id and scope=trim(p_scope) and idempotency_key=trim(p_idempotency_key)
  for update;

  if v_inserted = 1 then
    return jsonb_build_object('state','claimed','execute',true,'id',v_row.id,'expires_at',v_row.expires_at);
  end if;

  if p_request_hash is not null and v_row.request_hash is not null and p_request_hash <> v_row.request_hash then
    return jsonb_build_object('state','conflict','execute',false,'reason','idempotency_key_reused_with_different_request','id',v_row.id);
  end if;

  if v_row.status='completed' then
    return jsonb_build_object('state','completed','execute',false,'id',v_row.id,'result',v_row.result_json);
  end if;

  if v_row.status='failed' and v_row.expires_at > now() then
    return jsonb_build_object('state','failed','execute',false,'id',v_row.id,'error_code',v_row.error_code);
  end if;

  if v_row.expires_at <= now() or v_row.locked_at is null or v_row.locked_at < now() - make_interval(secs => p_lease_seconds) then
    update platform.idempotency_keys
    set status='pending', request_hash=coalesce(p_request_hash,request_hash), locked_at=now(),
        expires_at=now()+make_interval(secs => p_ttl_seconds), result_json=null, error_code=null, completed_at=null, updated_at=now()
    where id=v_row.id
    returning * into v_row;
    return jsonb_build_object('state','reclaimed','execute',true,'id',v_row.id,'expires_at',v_row.expires_at);
  end if;

  return jsonb_build_object('state','in_progress','execute',false,'id',v_row.id,'locked_at',v_row.locked_at);
end;
$$;

create or replace function public.platform_server_complete_idempotent(
  p_tenant_id uuid,
  p_scope text,
  p_idempotency_key text,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update platform.idempotency_keys
  set status='completed', result_json=coalesce(p_result,'{}'::jsonb), error_code=null,
      completed_at=now(), locked_at=null, updated_at=now()
  where tenant_id=p_tenant_id and scope=trim(p_scope) and idempotency_key=trim(p_idempotency_key) and status='pending';
  return found;
end;
$$;

create or replace function public.platform_server_fail_idempotent(
  p_tenant_id uuid,
  p_scope text,
  p_idempotency_key text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update platform.idempotency_keys
  set status='failed', error_code=left(coalesce(p_error_code,'failed'),200), locked_at=null, updated_at=now()
  where tenant_id=p_tenant_id and scope=trim(p_scope) and idempotency_key=trim(p_idempotency_key) and status='pending';
  return found;
end;
$$;

revoke all on function public.platform_server_begin_idempotent(uuid,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.platform_server_complete_idempotent(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.platform_server_fail_idempotent(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.platform_server_begin_idempotent(uuid,text,text,text,integer,integer) to service_role;
grant execute on function public.platform_server_complete_idempotent(uuid,text,text,jsonb) to service_role;
grant execute on function public.platform_server_fail_idempotent(uuid,text,text,text) to service_role;
