-- ReDream Instagram conversation catalogue v1.
-- Existing Instagram conversations can be listed as metadata-only thread stubs so
-- agents can choose which chats ReDream may learn from before any body is stored.

alter table djm_os.messaging_connections
  add column if not exists last_catalog_synced_at timestamptz;

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
    'external_account_id',v_connection.external_account_id,
    'external_business_id',v_connection.external_business_id,
    'display_label',v_connection.display_label,
    'metadata',v_connection.metadata,
    'access_token',v_access_token,
    'token_expires_at',v_connection.token_expires_at,
    'last_token_refreshed_at',v_connection.last_token_refreshed_at,
    'last_catalog_synced_at',v_connection.last_catalog_synced_at
  );
end;
$function$;

create or replace function public.platform_server_messaging_thread_catalog_upsert(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_external_thread_id text,
  p_participant_external_id text,
  p_participant_label text,
  p_last_activity_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_connection_id uuid;
  v_thread_id uuid;
  v_existing_thread_id uuid;
begin
  if v_provider <> 'instagram' then
    raise exception 'unsupported_provider';
  end if;
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;
  if trim(coalesce(p_external_thread_id,''))='' then
    raise exception 'thread_required';
  end if;

  select c.id into v_connection_id
  from djm_os.messaging_connections c
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider
    and c.status='connected'
  limit 1;

  if v_connection_id is null then
    raise exception 'messaging_connection_not_found';
  end if;

  if nullif(trim(coalesce(p_participant_external_id,'')),'') is not null then
    select t.id
    into v_existing_thread_id
    from djm_os.messaging_threads t
    where t.connection_id=v_connection_id
      and t.provider='instagram'
      and t.participant_external_id=trim(p_participant_external_id)
    order by t.is_selected desc,t.updated_at desc
    limit 1;

    if v_existing_thread_id is not null then
      update djm_os.messaging_threads t
      set participant_label=coalesce(
            nullif(trim(coalesce(p_participant_label,'')),''),
            t.participant_label
          ),
          last_activity_at=greatest(
            coalesce(t.last_activity_at,'epoch'::timestamptz),
            coalesce(p_last_activity_at,'epoch'::timestamptz)
          ),
          metadata=t.metadata
            ||coalesce(p_metadata,'{}'::jsonb)
            ||jsonb_build_object(
              'catalog_conversation_id',
              trim(p_external_thread_id)
            ),
          updated_at=now()
      where t.id=v_existing_thread_id
      returning t.id into v_thread_id;

      return jsonb_build_object(
        'thread_id',v_thread_id,
        'matched_by','participant'
      );
    end if;
  end if;

  insert into djm_os.messaging_threads(
    tenant_id,
    connection_id,
    user_id,
    provider,
    external_thread_id,
    participant_external_id,
    participant_label,
    last_activity_at,
    metadata
  ) values (
    p_tenant_id,
    v_connection_id,
    p_user_id,
    v_provider,
    trim(p_external_thread_id),
    nullif(trim(coalesce(p_participant_external_id,'')),''),
    nullif(trim(coalesce(p_participant_label,'')),''),
    p_last_activity_at,
    coalesce(p_metadata,'{}'::jsonb)
      ||jsonb_build_object(
        'catalog_conversation_id',
        trim(p_external_thread_id)
      )
  )
  on conflict(connection_id,external_thread_id)
  do update set
    participant_external_id=coalesce(
      excluded.participant_external_id,
      djm_os.messaging_threads.participant_external_id
    ),
    participant_label=coalesce(
      excluded.participant_label,
      djm_os.messaging_threads.participant_label
    ),
    last_activity_at=greatest(
      coalesce(djm_os.messaging_threads.last_activity_at,'epoch'::timestamptz),
      coalesce(excluded.last_activity_at,'epoch'::timestamptz)
    ),
    metadata=djm_os.messaging_threads.metadata||excluded.metadata,
    updated_at=now()
  returning id into v_thread_id;

  return jsonb_build_object('thread_id',v_thread_id);
end;
$function$;

create or replace function public.platform_server_messaging_catalog_complete(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_threads_seen integer
)
returns void
language plpgsql security definer set search_path=''
as $function$
declare
  v_provider text := lower(trim(coalesce(p_provider,'')));
begin
  if v_provider <> 'instagram' then
    raise exception 'unsupported_provider';
  end if;
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;

  update djm_os.messaging_connections c
  set last_catalog_synced_at=now(),
      last_error=null,
      metadata=c.metadata||jsonb_build_object(
        'last_catalog_threads_seen',
        greatest(0,coalesce(p_threads_seen,0))
      ),
      updated_at=now()
  where c.tenant_id=p_tenant_id
    and c.user_id=p_user_id
    and c.provider=v_provider;
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
  v_matching_thread_id uuid;
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

  if v_provider='instagram'
     and nullif(trim(coalesce(p_participant_external_id,'')),'') is not null then
    select t.id
    into v_matching_thread_id
    from djm_os.messaging_threads t
    where t.connection_id=v_connection.id
      and t.provider='instagram'
      and t.participant_external_id=trim(p_participant_external_id)
    order by t.is_selected desc,t.updated_at desc
    limit 1;

    if v_matching_thread_id is not null then
      update djm_os.messaging_threads t
      set participant_label=coalesce(
            nullif(trim(coalesce(p_participant_label,'')),''),
            t.participant_label
          ),
          last_activity_at=greatest(
            coalesce(t.last_activity_at,'epoch'::timestamptz),
            coalesce(p_occurred_at,now())
          ),
          metadata=t.metadata
            ||coalesce(p_metadata,'{}'::jsonb)
            ||jsonb_build_object(
              'webhook_participant_match',
              true
            ),
          updated_at=now()
      where t.id=v_matching_thread_id
      returning t.* into v_thread;
    end if;
  end if;

  if v_thread.id is null then
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
  end if;

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

revoke all on function public.platform_server_messaging_secret(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.platform_server_messaging_secret(uuid,uuid,text)
  to service_role;

revoke all on function public.platform_server_messaging_thread_catalog_upsert(
  uuid,uuid,text,text,text,text,timestamptz,jsonb
) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_thread_catalog_upsert(
  uuid,uuid,text,text,text,text,timestamptz,jsonb
) to service_role;

revoke all on function public.platform_server_messaging_catalog_complete(
  uuid,uuid,text,integer
) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_catalog_complete(
  uuid,uuid,text,integer
) to service_role;

notify pgrst,'reload schema';
