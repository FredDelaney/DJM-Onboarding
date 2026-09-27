-- ReDream messaging connections v1.
-- WhatsApp and Instagram are explicit opt-in evidence sources, not a second inbox.
-- Unselected threads store identifiers and activity metadata only. Message bodies are
-- only persisted after the signed-in agent explicitly selects that thread.

create table if not exists djm_os.messaging_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in ('whatsapp','instagram')),
  external_account_id text not null,
  external_business_id text,
  display_label text,
  access_secret_id uuid not null,
  scopes text[] not null default '{}'::text[],
  token_expires_at timestamptz,
  status text not null default 'connected'
    check(status in ('connected','error','disabled')),
  last_event_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,user_id,provider),
  unique(tenant_id,provider,external_account_id)
);

create index if not exists messaging_connections_tenant_user_idx
  on djm_os.messaging_connections(tenant_id,user_id,provider);

create table if not exists djm_os.messaging_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  connection_id uuid not null references djm_os.messaging_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in ('whatsapp','instagram')),
  external_thread_id text not null,
  participant_external_id text,
  participant_label text,
  is_selected boolean not null default false,
  selected_at timestamptz,
  selected_by uuid references auth.users(id) on delete set null,
  last_activity_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id,external_thread_id)
);

create index if not exists messaging_threads_owner_idx
  on djm_os.messaging_threads(tenant_id,user_id,provider,last_activity_at desc);

create table if not exists djm_os.messaging_message_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  connection_id uuid not null references djm_os.messaging_connections(id) on delete cascade,
  thread_id uuid not null references djm_os.messaging_threads(id) on delete cascade,
  external_message_id text not null,
  direction text not null default 'inbound'
    check(direction in ('inbound','outbound')),
  occurred_at timestamptz,
  capture_id uuid references djm_os.captures(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(connection_id,external_message_id)
);

create table if not exists djm_os.messaging_oauth_states (
  state_hash text primary key,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider='instagram'),
  return_to text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table djm_os.messaging_connections enable row level security;
alter table djm_os.messaging_threads enable row level security;
alter table djm_os.messaging_message_receipts enable row level security;
alter table djm_os.messaging_oauth_states enable row level security;

revoke all on djm_os.messaging_connections from public,anon,authenticated;
revoke all on djm_os.messaging_threads from public,anon,authenticated;
revoke all on djm_os.messaging_message_receipts from public,anon,authenticated;
revoke all on djm_os.messaging_oauth_states from public,anon,authenticated;

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
    'last_event_at',c.last_event_at,
    'last_error',c.last_error,
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

create or replace function public.redream_messaging_threads(
  p_provider text
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_items jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',t.provider,
    'external_thread_id',t.external_thread_id,
    'participant_label',t.participant_label,
    'is_selected',t.is_selected,
    'last_activity_at',t.last_activity_at
  ) order by t.is_selected desc,t.last_activity_at desc nulls last),'[]'::jsonb)
  into v_items
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider;

  return jsonb_build_object('threads',v_items);
end;
$function$;

create or replace function public.redream_messaging_thread_set_selected(
  p_provider text,
  p_external_thread_id text,
  p_selected boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_thread_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;
  if trim(coalesce(p_external_thread_id,''))='' then
    raise exception 'thread_required';
  end if;

  update djm_os.messaging_threads t
  set is_selected=coalesce(p_selected,false),
      selected_at=case when coalesce(p_selected,false) then now() else null end,
      selected_by=case when coalesce(p_selected,false) then v_user else null end,
      updated_at=now()
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider
    and t.external_thread_id=trim(p_external_thread_id)
  returning t.id into v_thread_id;

  if v_thread_id is null then raise exception 'thread_not_found'; end if;

  return jsonb_build_object(
    'thread_id',v_thread_id,
    'selected',coalesce(p_selected,false)
  );
end;
$function$;

create or replace function public.redream_messaging_connect_context()
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_slug text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied';
  end if;
  select t.slug into v_slug
  from platform.tenants t
  where t.id=v_tenant and t.status='active';
  if v_slug is null then raise exception 'workspace_unavailable'; end if;
  return jsonb_build_object(
    'tenant_id',v_tenant,
    'user_id',v_user,
    'workspace_slug',v_slug
  );
end;
$function$;

create or replace function public.redream_messaging_oauth_begin(
  p_provider text,
  p_return_to text
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := private.redream_request_tenant();
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_return_to text := trim(coalesce(p_return_to,''));
  v_host text;
  v_state text;
  v_hash text;
  v_slug text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_provider <> 'instagram' then raise exception 'unsupported_provider'; end if;

  if v_return_to !~ '^https://[^[:space:]]+$'
     and v_return_to !~ '^http://localhost(:[0-9]+)?(/|$)' then
    raise exception 'invalid_return_destination';
  end if;

  v_host := lower(split_part(split_part(split_part(v_return_to,'://',2),'/',1),':',1));
  if v_host <> 'localhost'
     and not exists(
       select 1 from platform.tenant_domains d
       where d.tenant_id=v_tenant
         and lower(d.hostname)=v_host
         and d.status='verified'
     ) then
    raise exception 'return_destination_not_owned_by_workspace';
  end if;

  select t.slug into v_slug
  from platform.tenants t
  where t.id=v_tenant and t.status='active';
  if v_slug is null then raise exception 'workspace_unavailable'; end if;

  delete from djm_os.messaging_oauth_states s
  where s.expires_at<now()-interval '1 hour'
     or (s.user_id=v_user and s.tenant_id=v_tenant
         and s.used_at is not null and s.used_at<now()-interval '10 minutes');

  v_state := encode(extensions.gen_random_bytes(32),'hex');
  v_hash := encode(extensions.digest(v_state,'sha256'),'hex');

  insert into djm_os.messaging_oauth_states(
    state_hash,tenant_id,user_id,provider,return_to,expires_at
  ) values (
    v_hash,v_tenant,v_user,v_provider,v_return_to,now()+interval '10 minutes'
  );

  return jsonb_build_object(
    'state',v_state,
    'workspace_slug',v_slug,
    'return_to',v_return_to
  );
end;
$function$;

create or replace function public.redream_messaging_oauth_consume(
  p_state text,
  p_provider text
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_hash text;
  v_row djm_os.messaging_oauth_states%rowtype;
  v_slug text;
begin
  if v_provider <> 'instagram' then raise exception 'invalid_oauth_state'; end if;
  if coalesce(length(trim(p_state)),0)<32 then raise exception 'invalid_oauth_state'; end if;

  v_hash := encode(extensions.digest(trim(p_state),'sha256'),'hex');
  update djm_os.messaging_oauth_states s
  set used_at=now()
  where s.state_hash=v_hash
    and s.provider=v_provider
    and s.used_at is null
    and s.expires_at>now()
  returning s.* into v_row;

  if v_row.state_hash is null then raise exception 'invalid_or_expired_oauth_state'; end if;
  if not private.user_has_staff_tenant_access(v_row.tenant_id,v_row.user_id) then
    raise exception 'workspace_access_no_longer_valid';
  end if;

  select t.slug into v_slug
  from platform.tenants t
  where t.id=v_row.tenant_id and t.status='active';
  if v_slug is null then raise exception 'workspace_unavailable'; end if;

  return jsonb_build_object(
    'tenant_id',v_row.tenant_id,
    'user_id',v_row.user_id,
    'workspace_slug',v_slug,
    'return_to',v_row.return_to
  );
end;
$function$;

create or replace function public.redream_messaging_connection_store(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_external_account_id text,
  p_external_business_id text,
  p_display_label text,
  p_access_token text,
  p_scopes text[],
  p_token_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_secret_id uuid;
  v_secret_name text;
  v_connection_id uuid;
begin
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;
  if trim(coalesce(p_external_account_id,''))='' then
    raise exception 'external_account_required';
  end if;
  if trim(coalesce(p_access_token,''))='' then
    raise exception 'access_token_required';
  end if;

  select c.access_secret_id into v_secret_id
  from djm_os.messaging_connections c
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider
  for update;

  v_secret_name :=
    'redream-messaging-'||p_tenant_id::text||'-'||p_user_id::text||'-'||v_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      trim(p_access_token),
      v_secret_name,
      'Encrypted ReDream messaging access token'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      trim(p_access_token),
      v_secret_name,
      'Encrypted ReDream messaging access token'
    );
  end if;

  insert into djm_os.messaging_connections(
    tenant_id,user_id,provider,external_account_id,external_business_id,
    display_label,access_secret_id,scopes,token_expires_at,status,last_error,
    metadata,updated_at
  ) values (
    p_tenant_id,p_user_id,v_provider,trim(p_external_account_id),
    nullif(trim(coalesce(p_external_business_id,'')),''),
    nullif(trim(coalesce(p_display_label,'')),''),
    v_secret_id,coalesce(p_scopes,'{}'::text[]),p_token_expires_at,
    'connected',null,coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict(tenant_id,user_id,provider)
  do update set
    external_account_id=excluded.external_account_id,
    external_business_id=excluded.external_business_id,
    display_label=excluded.display_label,
    access_secret_id=excluded.access_secret_id,
    scopes=excluded.scopes,
    token_expires_at=excluded.token_expires_at,
    status='connected',
    last_error=null,
    metadata=excluded.metadata,
    updated_at=now()
  returning id into v_connection_id;

  return jsonb_build_object(
    'connection_id',v_connection_id,
    'provider',v_provider,
    'status','connected'
  );
end;
$function$;

create or replace function public.redream_messaging_connection_disconnect(
  p_provider text
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_secret_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  select c.access_secret_id into v_secret_id
  from djm_os.messaging_connections c
  where c.tenant_id=v_tenant and c.user_id=v_user and c.provider=v_provider
  for update;

  delete from djm_os.messaging_connections c
  where c.tenant_id=v_tenant and c.user_id=v_user and c.provider=v_provider;

  if v_secret_id is not null then
    delete from vault.secrets s where s.id=v_secret_id;
  end if;

  return jsonb_build_object('provider',v_provider,'status','disconnected');
end;
$function$;

create or replace function public.redream_messaging_receive(
  p_provider text,
  p_external_account_id text,
  p_external_thread_id text,
  p_external_message_id text,
  p_participant_external_id text,
  p_participant_label text,
  p_message_text text,
  p_occurred_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_connection djm_os.messaging_connections%rowtype;
  v_thread djm_os.messaging_threads%rowtype;
  v_receipt_id uuid;
  v_capture_id uuid;
  v_client_capture_id uuid := gen_random_uuid();
  v_message text := nullif(trim(coalesce(p_message_text,'')),'');
begin
  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;
  if trim(coalesce(p_external_account_id,''))='' then
    raise exception 'external_account_required';
  end if;
  if trim(coalesce(p_external_thread_id,''))='' then
    raise exception 'thread_required';
  end if;
  if trim(coalesce(p_external_message_id,''))='' then
    raise exception 'message_id_required';
  end if;

  select * into v_connection
  from djm_os.messaging_connections c
  where c.provider=v_provider
    and c.external_account_id=trim(p_external_account_id)
    and c.status='connected'
  limit 1;

  if v_connection.id is null then
    return jsonb_build_object('accepted',false,'reason','connection_not_found');
  end if;

  insert into djm_os.messaging_threads(
    tenant_id,connection_id,user_id,provider,external_thread_id,
    participant_external_id,participant_label,last_activity_at,metadata
  ) values (
    v_connection.tenant_id,v_connection.id,v_connection.user_id,v_provider,
    trim(p_external_thread_id),
    nullif(trim(coalesce(p_participant_external_id,'')),''),
    nullif(trim(coalesce(p_participant_label,'')),''),
    coalesce(p_occurred_at,now()),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(connection_id,external_thread_id)
  do update set
    participant_external_id=coalesce(
      excluded.participant_external_id,djm_os.messaging_threads.participant_external_id
    ),
    participant_label=coalesce(
      excluded.participant_label,djm_os.messaging_threads.participant_label
    ),
    last_activity_at=greatest(
      coalesce(djm_os.messaging_threads.last_activity_at,'epoch'::timestamptz),
      coalesce(excluded.last_activity_at,now())
    ),
    metadata=djm_os.messaging_threads.metadata||excluded.metadata,
    updated_at=now()
  returning * into v_thread;

  insert into djm_os.messaging_message_receipts(
    tenant_id,connection_id,thread_id,external_message_id,direction,occurred_at
  ) values (
    v_connection.tenant_id,v_connection.id,v_thread.id,
    trim(p_external_message_id),'inbound',coalesce(p_occurred_at,now())
  )
  on conflict(connection_id,external_message_id) do nothing
  returning id into v_receipt_id;

  update djm_os.messaging_connections
  set last_event_at=coalesce(p_occurred_at,now()),last_error=null,updated_at=now()
  where id=v_connection.id;

  if v_receipt_id is null then
    return jsonb_build_object('accepted',true,'duplicate',true,'selected',v_thread.is_selected);
  end if;

  if not v_thread.is_selected then
    return jsonb_build_object(
      'accepted',true,'duplicate',false,'selected',false,'capture_id',null
    );
  end if;

  if v_message is null then
    return jsonb_build_object(
      'accepted',true,'duplicate',false,'selected',true,
      'capture_id',null,'unsupported_content',true
    );
  end if;

  if not exists(
    select 1
    from djm_os.tell_djm_permissions p
    cross join djm_os.tell_djm_settings s
    where p.tenant_id=v_connection.tenant_id
      and p.user_id=v_connection.user_id
      and p.is_enabled=true
      and p.permission_scope in ('full','scout')
      and s.id=1
      and s.is_live=true
  ) then
    return jsonb_build_object(
      'accepted',true,'duplicate',false,'selected',true,
      'capture_id',null,'reason','redream_ai_not_enabled'
    );
  end if;

  insert into djm_os.captures(
    tenant_id,submitted_by,channel,capture_type,raw_text,status,confidence,
    client_capture_id,context_json,next_attempt_at,processing_version
  ) values (
    v_connection.tenant_id,v_connection.user_id,
    case when v_provider='whatsapp' then 'whatsapp_selected_chat'
         else 'instagram_selected_chat' end,
    'text',v_message,'queued',null,v_client_capture_id,
    jsonb_build_object(
      'capture_origin',v_provider,
      'provider',v_provider,
      'external_thread_id',v_thread.external_thread_id,
      'external_message_id',trim(p_external_message_id),
      'participant_label',v_thread.participant_label,
      'occurred_at',coalesce(p_occurred_at,now())
    ),
    now(),'tell_djm_v1'
  )
  returning id into v_capture_id;

  update djm_os.messaging_message_receipts
  set capture_id=v_capture_id
  where id=v_receipt_id;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at
  ) values (
    v_connection.tenant_id,'REDREAM_AI_CAPTURE_QUEUED',v_connection.user_id,
    jsonb_build_object(
      'capture_id',v_capture_id,
      'capture_type','text',
      'client_capture_id',v_client_capture_id,
      'capture_origin',v_provider
    ),
    'redream_messaging',1,coalesce(p_occurred_at,now())
  );

  return jsonb_build_object(
    'accepted',true,'duplicate',false,'selected',true,'capture_id',v_capture_id
  );
end;
$function$;

revoke all on function public.redream_messaging_connections()
  from public,anon;
grant execute on function public.redream_messaging_connections()
  to authenticated;

revoke all on function public.redream_messaging_threads(text)
  from public,anon;
grant execute on function public.redream_messaging_threads(text)
  to authenticated;

revoke all on function public.redream_messaging_thread_set_selected(text,text,boolean)
  from public,anon;
grant execute on function public.redream_messaging_thread_set_selected(text,text,boolean)
  to authenticated;

revoke all on function public.redream_messaging_connect_context()
  from public,anon;
grant execute on function public.redream_messaging_connect_context()
  to authenticated;

revoke all on function public.redream_messaging_oauth_begin(text,text)
  from public,anon;
grant execute on function public.redream_messaging_oauth_begin(text,text)
  to authenticated;

revoke all on function public.redream_messaging_oauth_consume(text,text)
  from public,anon,authenticated;
grant execute on function public.redream_messaging_oauth_consume(text,text)
  to service_role;

revoke all on function public.redream_messaging_connection_store(
  uuid,uuid,text,text,text,text,text,text[],timestamptz,jsonb
) from public,anon,authenticated;
grant execute on function public.redream_messaging_connection_store(
  uuid,uuid,text,text,text,text,text,text[],timestamptz,jsonb
) to service_role;

revoke all on function public.redream_messaging_connection_disconnect(text)
  from public,anon;
grant execute on function public.redream_messaging_connection_disconnect(text)
  to authenticated;

revoke all on function public.redream_messaging_receive(
  text,text,text,text,text,text,text,timestamptz,jsonb
) from public,anon,authenticated;
grant execute on function public.redream_messaging_receive(
  text,text,text,text,text,text,text,timestamptz,jsonb
) to service_role;

notify pgrst,'reload schema';
