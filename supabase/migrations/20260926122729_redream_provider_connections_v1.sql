-- ReDream connected provider foundation.
-- One provider account belongs to one signed-in staff user inside one tenant.
-- Provider refresh tokens are encrypted at rest in Supabase Vault and are never
-- returned through browser-facing RPCs.

do $tenantise$
declare
  r record;
begin
  alter table djm_os.calendar_connections
    add column if not exists tenant_id uuid;

  alter table djm_os.channel_connections
    add column if not exists tenant_id uuid;

  update djm_os.calendar_connections c
  set tenant_id = (
    select m.tenant_id
    from platform.tenant_memberships m
    where m.user_id=c.user_id
      and m.status='active'
    order by m.is_primary desc,m.joined_at asc
    limit 1
  )
  where c.tenant_id is null;

  update djm_os.channel_connections c
  set tenant_id = (
    select m.tenant_id
    from platform.tenant_memberships m
    where m.user_id=c.user_id
      and m.status='active'
    order by m.is_primary desc,m.joined_at asc
    limit 1
  )
  where c.tenant_id is null;

  if exists(
    select 1
    from djm_os.calendar_connections
    where tenant_id is null
  ) then
    raise exception
      'Cannot tenantise legacy calendar connections without an active membership';
  end if;

  if exists(
    select 1
    from djm_os.channel_connections
    where tenant_id is null
  ) then
    raise exception
      'Cannot tenantise legacy channel connections without an active membership';
  end if;

  if not exists(
    select 1
    from pg_constraint
    where conrelid='djm_os.calendar_connections'::regclass
      and conname='calendar_connections_tenant_id_fkey'
  ) then
    alter table djm_os.calendar_connections
      add constraint calendar_connections_tenant_id_fkey
      foreign key(tenant_id)
      references platform.tenants(id)
      on delete cascade;
  end if;

  if not exists(
    select 1
    from pg_constraint
    where conrelid='djm_os.channel_connections'::regclass
      and conname='channel_connections_tenant_id_fkey'
  ) then
    alter table djm_os.channel_connections
      add constraint channel_connections_tenant_id_fkey
      foreign key(tenant_id)
      references platform.tenants(id)
      on delete cascade;
  end if;

  alter table djm_os.calendar_connections
    alter column tenant_id set not null;

  alter table djm_os.channel_connections
    alter column tenant_id set not null;

  alter table djm_os.calendar_connections
    drop constraint if exists calendar_connections_user_id_provider_key;

  alter table djm_os.channel_connections
    drop constraint if exists channel_connections_user_id_channel_provider_external_accou_key;

  if not exists(
    select 1
    from pg_constraint
    where conrelid='djm_os.calendar_connections'::regclass
      and conname='calendar_connections_tenant_user_provider_key'
  ) then
    alter table djm_os.calendar_connections
      add constraint calendar_connections_tenant_user_provider_key
      unique(tenant_id,user_id,provider);
  end if;

  if not exists(
    select 1
    from pg_constraint
    where conrelid='djm_os.channel_connections'::regclass
      and conname='channel_connections_tenant_user_channel_provider_external_key'
  ) then
    alter table djm_os.channel_connections
      add constraint channel_connections_tenant_user_channel_provider_external_key
      unique(tenant_id,user_id,channel,provider,external_account_id);
  end if;

  create index if not exists calendar_connections_tenant_user_idx
    on djm_os.calendar_connections(tenant_id,user_id,provider);

  create index if not exists channel_connections_tenant_user_idx
    on djm_os.channel_connections(tenant_id,user_id,channel,provider);
end
$tenantise$;

revoke all on djm_os.calendar_connections
  from public,anon,authenticated;

revoke all on djm_os.channel_connections
  from public,anon,authenticated;

drop policy if exists djm_team_select
  on djm_os.calendar_connections;
drop policy if exists djm_team_insert
  on djm_os.calendar_connections;
drop policy if exists djm_team_update
  on djm_os.calendar_connections;
drop policy if exists djm_team_delete
  on djm_os.calendar_connections;

drop policy if exists djm_team_select
  on djm_os.channel_connections;
drop policy if exists djm_team_insert
  on djm_os.channel_connections;
drop policy if exists djm_team_update
  on djm_os.channel_connections;
drop policy if exists djm_team_delete
  on djm_os.channel_connections;

create table if not exists djm_os.provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  provider text not null
    check(provider in ('google','microsoft')),
  external_account_id text not null,
  email text,
  display_label text,
  capabilities text[] not null
    default '{}'::text[]
    check(
      capabilities <@
        array['calendar','contacts','email']::text[]
    ),
  scopes text[] not null default '{}'::text[],
  refresh_secret_id uuid not null,
  status text not null default 'connected'
    check(status in ('connected','error','disabled')),
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,user_id,provider),
  unique(tenant_id,provider,external_account_id)
);

create index if not exists provider_connections_tenant_user_idx
  on djm_os.provider_connections(tenant_id,user_id,status);

alter table djm_os.provider_connections
  enable row level security;

revoke all on djm_os.provider_connections
  from public,anon,authenticated;

create table if not exists djm_os.provider_oauth_states (
  state_hash text primary key,
  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  provider text not null
    check(provider in ('google','microsoft')),
  capabilities text[] not null
    check(
      capabilities <@
        array['calendar','contacts','email']::text[]
    ),
  return_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists provider_oauth_states_expiry_idx
  on djm_os.provider_oauth_states(expires_at)
  where used_at is null;

alter table djm_os.provider_oauth_states
  enable row level security;

revoke all on djm_os.provider_oauth_states
  from public,anon,authenticated;

insert into platform.integration_catalog(
  provider_key,
  display_name,
  integration_type,
  supports_platform_managed,
  supports_tenant_credentials,
  billable,
  status,
  metadata
)
values
(
  'google_workspace',
  'Google Workspace',
  'productivity',
  true,
  false,
  false,
  'available',
  '{"account_scope":"per_user","capabilities":["calendar","contacts","email"],"token_storage":"supabase_vault"}'::jsonb
),
(
  'microsoft_365',
  'Microsoft 365',
  'productivity',
  true,
  false,
  false,
  'available',
  '{"account_scope":"per_user","capabilities":["calendar","contacts","email"],"token_storage":"supabase_vault"}'::jsonb
)
on conflict(provider_key) do update
set
  display_name=excluded.display_name,
  integration_type=excluded.integration_type,
  supports_platform_managed=excluded.supports_platform_managed,
  supports_tenant_credentials=excluded.supports_tenant_credentials,
  billable=excluded.billable,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.redream_provider_connections()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := private.redream_request_tenant();
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',c.provider,
        'email',c.email,
        'display_label',c.display_label,
        'capabilities',c.capabilities,
        'scopes',c.scopes,
        'status',c.status,
        'last_synced_at',c.last_synced_at,
        'last_error',c.last_error,
        'updated_at',c.updated_at
      )
      order by c.provider
    ),
    '[]'::jsonb
  )
  into v_items
  from djm_os.provider_connections c
  where c.tenant_id=v_tenant
    and c.user_id=v_user;

  return jsonb_build_object(
    'contract_version',
    'redream_provider_connections_v1',
    'connections',
    v_items
  );
end;
$function$;

create or replace function public.redream_provider_oauth_begin(
  p_provider text,
  p_capabilities text[] default array['calendar','contacts']::text[],
  p_return_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := private.redream_request_tenant();
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_capabilities text[];
  v_state text;
  v_state_hash text;
  v_slug text;
  v_return_to text := trim(coalesce(p_return_to,''));
  v_host text;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if v_provider not in ('google','microsoft') then
    raise exception 'unsupported_provider';
  end if;

  select coalesce(
    array_agg(distinct lower(trim(x)))
      filter(where trim(x)<>''),
    '{}'::text[]
  )
  into v_capabilities
  from unnest(
    coalesce(
      p_capabilities,
      array['calendar','contacts']::text[]
    )
  ) x;

  if cardinality(v_capabilities)=0 then
    v_capabilities :=
      array['calendar','contacts']::text[];
  end if;

  if exists(
    select 1
    from unnest(v_capabilities) x
    where x not in ('calendar','contacts','email')
  ) then
    raise exception 'unsupported_capability';
  end if;

  if 'email'=any(v_capabilities)
     and not (
       'calendar'=any(v_capabilities)
       or 'contacts'=any(v_capabilities)
     ) then
    raise exception 'email_requires_connected_workspace_context';
  end if;

  if v_return_to !~ '^https://[^[:space:]]+$'
     and v_return_to !~ '^http://localhost(:[0-9]+)?(/|$)' then
    raise exception 'invalid_return_destination';
  end if;

  v_host :=
    lower(
      split_part(
        split_part(
          split_part(v_return_to,'://',2),
          '/',
          1
        ),
        ':',
        1
      )
    );

  if v_host <> 'localhost'
     and not exists(
       select 1
       from platform.tenant_domains d
       where d.tenant_id=v_tenant
         and lower(d.hostname)=v_host
         and d.status='verified'
     ) then
    raise exception 'return_destination_not_owned_by_workspace';
  end if;

  select t.slug
  into v_slug
  from platform.tenants t
  where t.id=v_tenant
    and t.status='active';

  if v_slug is null then
    raise exception 'workspace_unavailable';
  end if;

  delete from djm_os.provider_oauth_states s
  where s.expires_at<now()-interval '1 hour'
     or (
       s.user_id=v_user
       and s.tenant_id=v_tenant
       and s.used_at is not null
       and s.used_at<now()-interval '10 minutes'
     );

  v_state :=
    encode(
      extensions.gen_random_bytes(32),
      'hex'
    );

  v_state_hash :=
    encode(
      extensions.digest(
        v_state,
        'sha256'
      ),
      'hex'
    );

  insert into djm_os.provider_oauth_states(
    state_hash,
    tenant_id,
    user_id,
    provider,
    capabilities,
    return_to,
    expires_at
  )
  values(
    v_state_hash,
    v_tenant,
    v_user,
    v_provider,
    v_capabilities,
    v_return_to,
    now()+interval '10 minutes'
  );

  return jsonb_build_object(
    'state',
    v_state,
    'provider',
    v_provider,
    'capabilities',
    v_capabilities,
    'workspace_slug',
    v_slug,
    'return_to',
    v_return_to
  );
end;
$function$;

create or replace function public.redream_provider_oauth_consume(
  p_state text,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_hash text;
  v_provider text :=
    lower(trim(coalesce(p_provider,'')));
  v_row djm_os.provider_oauth_states%rowtype;
  v_slug text;
begin
  if v_provider not in ('google','microsoft') then
    raise exception 'invalid_oauth_state';
  end if;

  if coalesce(length(trim(p_state)),0)<32 then
    raise exception 'invalid_oauth_state';
  end if;

  v_hash :=
    encode(
      extensions.digest(
        trim(p_state),
        'sha256'
      ),
      'hex'
    );

  update djm_os.provider_oauth_states s
  set used_at=now()
  where s.state_hash=v_hash
    and s.provider=v_provider
    and s.used_at is null
    and s.expires_at>now()
  returning s.*
  into v_row;

  if v_row.state_hash is null then
    raise exception 'invalid_or_expired_oauth_state';
  end if;

  if not private.user_has_staff_tenant_access(
    v_row.tenant_id,
    v_row.user_id
  ) then
    raise exception 'workspace_access_no_longer_valid';
  end if;

  select t.slug
  into v_slug
  from platform.tenants t
  where t.id=v_row.tenant_id
    and t.status='active';

  if v_slug is null then
    raise exception 'workspace_unavailable';
  end if;

  return jsonb_build_object(
    'tenant_id',
    v_row.tenant_id,
    'user_id',
    v_row.user_id,
    'provider',
    v_row.provider,
    'capabilities',
    v_row.capabilities,
    'return_to',
    v_row.return_to,
    'workspace_slug',
    v_slug
  );
end;
$function$;

create or replace function public.redream_provider_connection_store(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_external_account_id text,
  p_email text,
  p_display_label text,
  p_capabilities text[],
  p_scopes text[],
  p_refresh_token text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text :=
    lower(trim(coalesce(p_provider,'')));
  v_capabilities text[];
  v_secret_id uuid;
  v_connection_id uuid;
  v_secret_name text;
begin
  if v_provider not in ('google','microsoft') then
    raise exception 'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied';
  end if;

  if trim(coalesce(p_external_account_id,''))='' then
    raise exception 'external_account_required';
  end if;

  select coalesce(
    array_agg(distinct lower(trim(x)))
      filter(where trim(x)<>''),
    '{}'::text[]
  )
  into v_capabilities
  from unnest(
    coalesce(
      p_capabilities,
      '{}'::text[]
    )
  ) x;

  if cardinality(v_capabilities)=0
     or exists(
       select 1
       from unnest(v_capabilities) x
       where x not in ('calendar','contacts','email')
     ) then
    raise exception 'invalid_capabilities';
  end if;

  select c.refresh_secret_id
  into v_secret_id
  from djm_os.provider_connections c
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider
  for update;

  v_secret_name :=
    'redream-provider-' ||
    p_tenant_id::text || '-' ||
    p_user_id::text || '-' ||
    v_provider;

  if nullif(trim(coalesce(p_refresh_token,'')),'') is not null then
    if v_secret_id is null then
      v_secret_id :=
        vault.create_secret(
          trim(p_refresh_token),
          v_secret_name,
          'Encrypted ReDream OAuth refresh token'
        );
    else
      perform vault.update_secret(
        v_secret_id,
        trim(p_refresh_token),
        v_secret_name,
        'Encrypted ReDream OAuth refresh token'
      );
    end if;
  elsif v_secret_id is null then
    raise exception 'refresh_token_required';
  end if;

  insert into djm_os.provider_connections(
    tenant_id,
    user_id,
    provider,
    external_account_id,
    email,
    display_label,
    capabilities,
    scopes,
    refresh_secret_id,
    status,
    last_error,
    metadata,
    updated_at
  )
  values(
    p_tenant_id,
    p_user_id,
    v_provider,
    trim(p_external_account_id),
    nullif(trim(coalesce(p_email,'')),''),
    nullif(trim(coalesce(p_display_label,'')),''),
    v_capabilities,
    coalesce(p_scopes,'{}'::text[]),
    v_secret_id,
    'connected',
    null,
    coalesce(p_metadata,'{}'::jsonb),
    now()
  )
  on conflict(tenant_id,user_id,provider)
  do update set
    external_account_id=excluded.external_account_id,
    email=excluded.email,
    display_label=excluded.display_label,
    capabilities=excluded.capabilities,
    scopes=excluded.scopes,
    refresh_secret_id=excluded.refresh_secret_id,
    status='connected',
    last_error=null,
    metadata=excluded.metadata,
    updated_at=now()
  returning id
  into v_connection_id;

  if 'calendar'=any(v_capabilities) then
    insert into djm_os.calendar_connections(
      tenant_id,
      user_id,
      provider,
      external_account_id,
      email,
      status,
      scopes,
      last_synced_at,
      updated_at
    )
    values(
      p_tenant_id,
      p_user_id,
      v_provider,
      trim(p_external_account_id),
      nullif(trim(coalesce(p_email,'')),''),
      'connected',
      coalesce(p_scopes,'{}'::text[]),
      null,
      now()
    )
    on conflict(tenant_id,user_id,provider)
    do update set
      external_account_id=excluded.external_account_id,
      email=excluded.email,
      status='connected',
      scopes=excluded.scopes,
      updated_at=now();
  else
    delete from djm_os.calendar_connections c
    where c.tenant_id=p_tenant_id
      and c.user_id=p_user_id
      and c.provider=v_provider;
  end if;

  return jsonb_build_object(
    'connection_id',
    v_connection_id,
    'provider',
    v_provider,
    'status',
    'connected'
  );
end;
$function$;

create or replace function public.redream_provider_connection_disconnect(
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := private.redream_request_tenant();
  v_provider text :=
    lower(trim(coalesce(p_provider,'')));
  v_secret_id uuid;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if v_provider not in ('google','microsoft') then
    raise exception 'unsupported_provider';
  end if;

  select c.refresh_secret_id
  into v_secret_id
  from djm_os.provider_connections c
  where c.tenant_id=v_tenant
    and c.user_id=v_user
    and c.provider=v_provider
  for update;

  delete from djm_os.provider_connections c
  where c.tenant_id=v_tenant
    and c.user_id=v_user
    and c.provider=v_provider;

  delete from djm_os.calendar_connections c
  where c.tenant_id=v_tenant
    and c.user_id=v_user
    and c.provider=v_provider;

  if v_secret_id is not null then
    delete from vault.secrets s
    where s.id=v_secret_id;
  end if;

  return jsonb_build_object(
    'provider',
    v_provider,
    'status',
    'disconnected'
  );
end;
$function$;

-- Keep legacy connection reads tenant-aware while removing browser table access.
create or replace function public.djm_channel_connections()
returns table(
  id uuid,
  channel text,
  provider text,
  display_label text,
  status text,
  capabilities text[],
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  return query
  select
    c.id,
    c.channel,
    c.provider,
    c.display_label,
    c.status,
    c.capabilities,
    c.last_synced_at,
    c.last_error,
    c.created_at
  from djm_os.channel_connections c
  where c.tenant_id=v_tenant
    and c.user_id=auth.uid()
  order by c.channel,c.provider;
end;
$function$;

create or replace function public.djm_register_channel_connection(
  p_channel text,
  p_provider text,
  p_external_account_id text default null,
  p_display_label text default null,
  p_capabilities text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_id uuid;
begin
  if trim(coalesce(p_channel,''))='' then
    raise exception 'Channel required';
  end if;

  insert into djm_os.channel_connections(
    tenant_id,
    user_id,
    channel,
    provider,
    external_account_id,
    display_label,
    status,
    capabilities
  )
  values(
    v_tenant,
    auth.uid(),
    lower(trim(p_channel)),
    nullif(lower(trim(coalesce(p_provider,''))),''),
    nullif(trim(coalesce(p_external_account_id,'')),''),
    nullif(trim(coalesce(p_display_label,'')),''),
    'configured',
    coalesce(p_capabilities,'{}'::text[])
  )
  on conflict(
    tenant_id,
    user_id,
    channel,
    provider,
    external_account_id
  )
  do update set
    display_label=coalesce(
      excluded.display_label,
      djm_os.channel_connections.display_label
    ),
    capabilities=excluded.capabilities,
    status='configured',
    updated_at=now()
  returning id
  into v_id;

  return jsonb_build_object(
    'id',
    v_id,
    'status',
    'configured'
  );
end;
$function$;

revoke all on function public.redream_provider_connections()
  from public,anon;
grant execute on function public.redream_provider_connections()
  to authenticated;

revoke all on function public.redream_provider_oauth_begin(
  text,text[],text
) from public,anon;
grant execute on function public.redream_provider_oauth_begin(
  text,text[],text
) to authenticated;

revoke all on function public.redream_provider_oauth_consume(
  text,text
) from public,anon,authenticated;
grant execute on function public.redream_provider_oauth_consume(
  text,text
) to service_role;

revoke all on function public.redream_provider_connection_store(
  uuid,uuid,text,text,text,text,text[],text[],text,jsonb
) from public,anon,authenticated;
grant execute on function public.redream_provider_connection_store(
  uuid,uuid,text,text,text,text,text[],text[],text,jsonb
) to service_role;

revoke all on function public.redream_provider_connection_disconnect(text)
  from public,anon;
grant execute on function public.redream_provider_connection_disconnect(text)
  to authenticated;

revoke all on function public.djm_channel_connections()
  from public,anon;
grant execute on function public.djm_channel_connections()
  to authenticated;

revoke all on function public.djm_register_channel_connection(
  text,text,text,text,text[]
) from public,anon;
grant execute on function public.djm_register_channel_connection(
  text,text,text,text,text[]
) to authenticated;

notify pgrst,'reload schema';
