-- ReDream messaging reliability v1.
-- Keeps Instagram Login access alive before expiry and exposes a clear reconnect
-- state without giving the browser access to provider secrets.

alter table djm_os.messaging_connections
  add column if not exists last_token_refreshed_at timestamptz;

create or replace function public.redream_messaging_connections()
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_items jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',c.provider,
    'display_label',c.display_label,
    'status',c.status,
    'health',
      case
        when c.status <> 'connected' then 'reconnect_required'
        when c.token_expires_at is not null
             and c.token_expires_at <= now() then 'reconnect_required'
        when c.token_expires_at is not null
             and c.token_expires_at <= now()+interval '7 days' then 'attention'
        else 'connected'
      end,
    'last_event_at',c.last_event_at,
    'last_error',c.last_error,
    'token_expires_at',c.token_expires_at,
    'metadata',c.metadata
  ) order by c.provider),'[]'::jsonb)
  into v_items
  from djm_os.messaging_connections c
  where c.tenant_id=v_tenant and c.user_id=v_user;

  return jsonb_build_object(
    'contract_version','redream_messaging_connections_v1',
    'connections',v_items
  );
end;
$function$;

create or replace function public.platform_server_messaging_maintenance_targets(
  p_limit integer default 20
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_targets jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'tenant_id',x.tenant_id,
    'user_id',x.user_id,
    'provider',x.provider,
    'token_expires_at',x.token_expires_at
  ) order by x.token_expires_at asc),'[]'::jsonb)
  into v_targets
  from (
    select
      c.tenant_id,
      c.user_id,
      c.provider,
      c.token_expires_at,
      c.created_at,
      c.last_token_refreshed_at
    from djm_os.messaging_connections c
    join platform.tenant_memberships m
      on m.tenant_id=c.tenant_id
     and m.user_id=c.user_id
     and m.status='active'
     and m.role in ('owner','admin','agent','operations','scout')
    join platform.tenants t
      on t.id=c.tenant_id
     and t.status='active'
    where c.provider='instagram'
      and c.status='connected'
      and c.token_expires_at is not null
      and c.token_expires_at <= now()+interval '30 days'
      and coalesce(c.last_token_refreshed_at,c.created_at)
            <= now()-interval '24 hours'
    order by c.token_expires_at asc
    limit v_limit
  ) x;

  return jsonb_build_object('targets',v_targets);
end;
$function$;

create or replace function public.platform_server_messaging_secret(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_connection djm_os.messaging_connections%rowtype;
  v_access_token text;
begin
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;

  select c.* into v_connection
  from djm_os.messaging_connections c
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider
  limit 1;

  if v_connection.id is null then
    raise exception 'messaging_connection_not_found';
  end if;

  select s.decrypted_secret into v_access_token
  from vault.decrypted_secrets s
  where s.id=v_connection.access_secret_id
  limit 1;

  if nullif(trim(coalesce(v_access_token,'')),'') is null then
    raise exception 'messaging_access_token_unavailable';
  end if;

  return jsonb_build_object(
    'tenant_id',v_connection.tenant_id,
    'user_id',v_connection.user_id,
    'provider',v_connection.provider,
    'access_token',v_access_token,
    'token_expires_at',v_connection.token_expires_at,
    'last_token_refreshed_at',v_connection.last_token_refreshed_at
  );
end;
$function$;

create or replace function public.platform_server_messaging_refresh_store(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_access_token text,
  p_token_expires_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_secret_id uuid;
begin
  if v_provider <> 'instagram' then
    raise exception 'unsupported_provider';
  end if;
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;
  if trim(coalesce(p_access_token,''))='' then
    raise exception 'access_token_required';
  end if;
  if p_token_expires_at is null or p_token_expires_at <= now() then
    raise exception 'valid_expiry_required';
  end if;

  select c.access_secret_id into v_secret_id
  from djm_os.messaging_connections c
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider
  for update;

  if v_secret_id is null then
    raise exception 'messaging_connection_not_found';
  end if;

  perform vault.update_secret(
    v_secret_id,
    trim(p_access_token),
    'redream-messaging-'||p_tenant_id::text||'-'||p_user_id::text||'-'||v_provider,
    'Encrypted ReDream messaging access token'
  );

  update djm_os.messaging_connections c
  set token_expires_at=p_token_expires_at,
      last_token_refreshed_at=now(),
      status='connected',
      last_error=null,
      updated_at=now()
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider;

  return jsonb_build_object(
    'provider',v_provider,
    'status','connected',
    'token_expires_at',p_token_expires_at
  );
end;
$function$;

create or replace function public.platform_server_messaging_maintenance_error(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_error text,
  p_reconnect_required boolean default false
)
returns void
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
begin
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;

  update djm_os.messaging_connections c
  set status=case
        when coalesce(p_reconnect_required,false) then 'error'
        else c.status
      end,
      last_error=left(nullif(trim(coalesce(p_error,'')),''),500),
      updated_at=now()
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider;
end;
$function$;

create or replace function public.platform_server_schedule_messaging_maintenance(
  p_supabase_url text
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_base text := rtrim(trim(coalesce(p_supabase_url,'')),'/');
  v_job_id bigint;
  v_command text;
begin
  if v_base !~ '^https://[a-z0-9]+[.]supabase[.]co$' then
    raise exception 'invalid_supabase_url';
  end if;

  select j.jobid into v_job_id
  from cron.job j
  where j.jobname='redream-messaging-maintenance'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  v_command := format(
    $cron$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-djm-cron',
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name='djm_push_cron_secret'
            limit 1
          )
        ),
        body := jsonb_build_object(
          'source','scheduled-messaging-maintenance'
        ),
        timeout_milliseconds := 120000
      );
    $cron$,
    v_base||'/functions/v1/redream-messaging-maintenance'
  );

  select cron.schedule(
    'redream-messaging-maintenance',
    '17 4 * * *',
    v_command
  ) into v_job_id;

  return jsonb_build_object(
    'job_id',v_job_id,
    'schedule','17 4 * * *'
  );
end;
$function$;

revoke all on function public.platform_server_messaging_maintenance_targets(integer)
  from public,anon,authenticated;
grant execute on function public.platform_server_messaging_maintenance_targets(integer)
  to service_role;

revoke all on function public.platform_server_messaging_secret(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.platform_server_messaging_secret(uuid,uuid,text)
  to service_role;

revoke all on function public.platform_server_messaging_refresh_store(
  uuid,uuid,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_refresh_store(
  uuid,uuid,text,text,timestamptz
) to service_role;

revoke all on function public.platform_server_messaging_maintenance_error(
  uuid,uuid,text,text,boolean
) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_maintenance_error(
  uuid,uuid,text,text,boolean
) to service_role;

revoke all on function public.platform_server_schedule_messaging_maintenance(text)
  from public,anon,authenticated;
grant execute on function public.platform_server_schedule_messaging_maintenance(text)
  to service_role;

notify pgrst,'reload schema';
