begin;

create or replace function public.platform_server_messaging_history_context(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_external_thread_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_thread djm_os.messaging_threads%rowtype;
  v_current_org_id uuid;
  v_current_org_name text;
  v_person_name text;
  v_player_name text;
begin
  if p_user_id is null
     or not private.user_has_staff_tenant_access(
       p_tenant_id,
       p_user_id
     )
  then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  if v_provider<>'instagram' then
    raise exception 'unsupported_provider';
  end if;

  if v_external_thread_id='' then
    raise exception 'thread_required';
  end if;

  select t.*
  into v_thread
  from djm_os.messaging_threads t
  where t.tenant_id=p_tenant_id
    and t.user_id=p_user_id
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
    and t.is_selected=true
    and num_nonnulls(
      t.bound_person_id,
      t.bound_player_id
    )=1
  limit 1;

  if v_thread.id is null then
    raise exception 'selected_identity_bound_thread_not_found';
  end if;

  if nullif(
    trim(
      coalesce(
        v_thread.metadata->>'catalog_conversation_id',
        ''
      )
    ),
    ''
  ) is null then
    raise exception 'catalog_conversation_unavailable';
  end if;

  if v_thread.bound_person_id is not null then
    select p.full_name
    into v_person_name
    from djm_os.people p
    where p.id=v_thread.bound_person_id
      and p.tenant_id=p_tenant_id;

    select
      e.organisation_id,
      o.name
    into
      v_current_org_id,
      v_current_org_name
    from djm_os.employments e
    join djm_os.organisations o
      on o.id=e.organisation_id
     and o.tenant_id=p_tenant_id
    where e.tenant_id=p_tenant_id
      and e.person_id=v_thread.bound_person_id
      and e.is_current=true
    order by
      coalesce(
        e.last_verified_at,
        e.updated_at
      ) desc nulls last,
      e.updated_at desc,
      e.id
    limit 1;
  else
    select coalesce(
      nullif(trim(p.preferred_name),''),
      nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Player'
    )
    into v_player_name
    from public.players p
    where p.id=v_thread.bound_player_id
      and p.tenant_id=p_tenant_id;
  end if;

  return jsonb_build_object(
    'thread_id',v_thread.id,
    'connection_id',v_thread.connection_id,
    'provider',v_thread.provider,
    'external_thread_id',v_thread.external_thread_id,
    'catalog_conversation_id',
      v_thread.metadata->>'catalog_conversation_id',
    'participant_external_id',
      v_thread.participant_external_id,
    'participant_label',
      v_thread.participant_label,
    'bound_person_id',
      v_thread.bound_person_id,
    'bound_person_name',
      v_person_name,
    'bound_organisation_id',
      case
        when v_thread.bound_person_id is not null
          then v_current_org_id
        else null
      end,
    'bound_organisation_name',
      case
        when v_thread.bound_person_id is not null
          then v_current_org_name
        else null
      end,
    'bound_player_id',
      v_thread.bound_player_id,
    'bound_player_name',
      v_player_name,
    'identity_kind',
      case
        when v_thread.bound_player_id is not null
          then 'player'
        else 'network_person'
      end,
    'last_history_bootstrap_at',
      v_thread.metadata->>'history_bootstrap_at',
    'truth_contract',jsonb_build_object(
      'selection',
        'Only a chat explicitly selected by the signed-in agent is eligible.',
      'identity',
        'Recent history is imported only after the selected chat has exactly one explicit canonical Network person or signed-player identity.',
      'club',
        'Network-person club context follows current canonical employment. A player current club is context only and is not promoted to messaging organisation identity.',
      'external_action',
        'Reading selected chat history never sends an external message.'
    )
  );
end;
$function$;

revoke all on function
  public.platform_server_messaging_history_context(
    uuid,
    uuid,
    text,
    text
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_messaging_history_context(
    uuid,
    uuid,
    text,
    text
  )
to
  postgres,
  service_role;


create or replace function public.platform_server_messaging_history_ingest(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_external_thread_id text,
  p_external_message_id text,
  p_direction text,
  p_message_text text,
  p_occurred_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_external_message_id text:=trim(coalesce(p_external_message_id,''));
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_message text:=nullif(trim(coalesce(p_message_text,'')),'');
  v_thread djm_os.messaging_threads%rowtype;
  v_receipt_id uuid;
  v_interaction_id uuid;
  v_organisation_id uuid;
  v_source_uri text;
begin
  if p_user_id is null
     or not private.user_has_staff_tenant_access(
       p_tenant_id,
       p_user_id
     )
  then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  if v_provider<>'instagram' then
    raise exception 'unsupported_provider';
  end if;

  if v_external_thread_id=''
     or v_external_message_id=''
  then
    raise exception 'message_identity_required';
  end if;

  if v_direction not in ('inbound','outbound') then
    raise exception 'message_direction_required';
  end if;

  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'message_metadata_invalid';
  end if;

  select t.*
  into v_thread
  from djm_os.messaging_threads t
  where t.tenant_id=p_tenant_id
    and t.user_id=p_user_id
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
    and t.is_selected=true
    and num_nonnulls(
      t.bound_person_id,
      t.bound_player_id
    )=1
  limit 1;

  if v_thread.id is null then
    raise exception 'selected_identity_bound_thread_not_found';
  end if;

  insert into djm_os.messaging_message_receipts(
    tenant_id,
    connection_id,
    thread_id,
    external_message_id,
    direction,
    occurred_at
  )
  values(
    p_tenant_id,
    v_thread.connection_id,
    v_thread.id,
    v_external_message_id,
    v_direction,
    coalesce(p_occurred_at,now())
  )
  on conflict(connection_id,external_message_id)
  do nothing
  returning id
  into v_receipt_id;

  if v_receipt_id is null then
    if v_thread.bound_person_id is not null then
      select e.organisation_id
      into v_organisation_id
      from djm_os.employments e
      where e.tenant_id=p_tenant_id
        and e.person_id=v_thread.bound_person_id
        and e.is_current=true
      order by
        coalesce(
          e.last_verified_at,
          e.updated_at
        ) desc nulls last,
        e.updated_at desc,
        e.id
      limit 1;

      with target as (
        select i.id
        from djm_os.interactions i
        where i.tenant_id=p_tenant_id
          and i.team_member_id=p_user_id
          and i.channel='instagram_selected_chat'
          and i.source_type='instagram_history'
          and i.source_external_id=v_external_message_id
        order by i.created_at desc,i.id
        limit 1
      )
      update djm_os.interactions i
      set
        person_id=v_thread.bound_person_id,
        organisation_id=v_organisation_id,
        player_id=null
      from target
      where i.id=target.id
        and (
          i.person_id is distinct from v_thread.bound_person_id
          or i.organisation_id is distinct from v_organisation_id
          or i.player_id is not null
        )
      returning i.id
      into v_interaction_id;
    else
      with target as (
        select i.id
        from djm_os.interactions i
        where i.tenant_id=p_tenant_id
          and i.team_member_id=p_user_id
          and i.channel='instagram_selected_chat'
          and i.source_type='instagram_history'
          and i.source_external_id=v_external_message_id
        order by i.created_at desc,i.id
        limit 1
      )
      update djm_os.interactions i
      set
        person_id=null,
        organisation_id=null,
        player_id=v_thread.bound_player_id
      from target
      where i.id=target.id
        and (
          i.person_id is not null
          or i.organisation_id is not null
          or i.player_id is distinct from v_thread.bound_player_id
        )
      returning i.id
      into v_interaction_id;
    end if;

    return jsonb_build_object(
      'accepted',true,
      'duplicate',true,
      'selected',true,
      'identity_refreshed',
        v_interaction_id is not null,
      'interaction_id',v_interaction_id
    );
  end if;

  if v_message is null then
    return jsonb_build_object(
      'accepted',true,
      'duplicate',false,
      'selected',true,
      'unsupported_content',true,
      'interaction_id',null
    );
  end if;

  if v_thread.bound_person_id is not null then
    select e.organisation_id
    into v_organisation_id
    from djm_os.employments e
    where e.tenant_id=p_tenant_id
      and e.person_id=v_thread.bound_person_id
      and e.is_current=true
    order by
      coalesce(
        e.last_verified_at,
        e.updated_at
      ) desc nulls last,
      e.updated_at desc,
      e.id
    limit 1;
  end if;

  v_source_uri:=
    'instagram://conversation/'||
    coalesce(
      nullif(
        trim(
          v_thread.metadata->>'catalog_conversation_id'
        ),
        ''
      ),
      v_thread.external_thread_id
    );

  insert into djm_os.interactions(
    tenant_id,
    occurred_at,
    channel,
    direction,
    team_member_id,
    person_id,
    organisation_id,
    player_id,
    source_external_id,
    source_type,
    source_uri,
    raw_text,
    summary,
    confidence
  )
  values(
    p_tenant_id,
    coalesce(p_occurred_at,now()),
    'instagram_selected_chat',
    v_direction,
    p_user_id,
    v_thread.bound_person_id,
    case
      when v_thread.bound_person_id is not null
        then v_organisation_id
      else null
    end,
    v_thread.bound_player_id,
    v_external_message_id,
    'instagram_history',
    v_source_uri,
    null,
    left(v_message,1800),
    1
  )
  returning id
  into v_interaction_id;

  return jsonb_build_object(
    'accepted',true,
    'duplicate',false,
    'selected',true,
    'unsupported_content',false,
    'interaction_id',v_interaction_id,
    'direction',v_direction,
    'identity_kind',
      case
        when v_thread.bound_player_id is not null
          then 'player'
        else 'network_person'
      end,
    'external_action',false
  );
end;
$function$;

revoke all on function
  public.platform_server_messaging_history_ingest(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    timestamptz,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_messaging_history_ingest(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    timestamptz,
    jsonb
  )
to
  postgres,
  service_role;


create or replace function public.platform_server_messaging_history_complete(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_external_thread_id text,
  p_messages_seen integer,
  p_messages_imported integer,
  p_duplicates integer,
  p_unsupported integer,
  p_identity_refreshed integer,
  p_oldest_at timestamptz default null,
  p_newest_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_thread djm_os.messaging_threads%rowtype;
  v_organisation_id uuid;
begin
  if p_user_id is null
     or not private.user_has_staff_tenant_access(
       p_tenant_id,
       p_user_id
     )
  then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  if v_provider<>'instagram' then
    raise exception 'unsupported_provider';
  end if;

  select t.*
  into v_thread
  from djm_os.messaging_threads t
  where t.tenant_id=p_tenant_id
    and t.user_id=p_user_id
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
    and t.is_selected=true
    and num_nonnulls(
      t.bound_person_id,
      t.bound_player_id
    )=1
  limit 1
  for update;

  if v_thread.id is null then
    raise exception 'selected_identity_bound_thread_not_found';
  end if;

  if v_thread.bound_person_id is not null then
    select e.organisation_id
    into v_organisation_id
    from djm_os.employments e
    where e.tenant_id=p_tenant_id
      and e.person_id=v_thread.bound_person_id
      and e.is_current=true
    order by
      coalesce(
        e.last_verified_at,
        e.updated_at
      ) desc nulls last,
      e.updated_at desc,
      e.id
    limit 1;
  end if;

  update djm_os.messaging_threads
  set
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'history_bootstrap_at',now(),
      'history_bootstrap_version','selected_history_v1',
      'history_messages_seen',
        greatest(0,coalesce(p_messages_seen,0)),
      'history_messages_imported',
        greatest(0,coalesce(p_messages_imported,0)),
      'history_duplicates',
        greatest(0,coalesce(p_duplicates,0)),
      'history_unsupported',
        greatest(0,coalesce(p_unsupported,0)),
      'history_identity_refreshed',
        greatest(0,coalesce(p_identity_refreshed,0)),
      'history_oldest_at',p_oldest_at,
      'history_newest_at',p_newest_at
    ),
    updated_at=now()
  where id=v_thread.id;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    person_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'MESSAGING_HISTORY_BOOTSTRAPPED',
    p_user_id,
    v_thread.bound_person_id,
    case
      when v_thread.bound_person_id is not null
        then v_organisation_id
      else null
    end,
    jsonb_build_object(
      'provider',v_provider,
      'external_thread_id',v_external_thread_id,
      'thread_id',v_thread.id,
      'bound_player_id',v_thread.bound_player_id,
      'identity_kind',
        case
          when v_thread.bound_player_id is not null
            then 'player'
          else 'network_person'
        end,
      'messages_seen',
        greatest(0,coalesce(p_messages_seen,0)),
      'messages_imported',
        greatest(0,coalesce(p_messages_imported,0)),
      'duplicates',
        greatest(0,coalesce(p_duplicates,0)),
      'unsupported',
        greatest(0,coalesce(p_unsupported,0)),
      'identity_refreshed',
        greatest(0,coalesce(p_identity_refreshed,0)),
      'oldest_at',p_oldest_at,
      'newest_at',p_newest_at,
      'external_action',false
    ),
    'redream_messaging',
    1,
    now()
  );

  return jsonb_build_object(
    'ok',true,
    'thread_id',v_thread.id,
    'messages_seen',
      greatest(0,coalesce(p_messages_seen,0)),
    'messages_imported',
      greatest(0,coalesce(p_messages_imported,0)),
    'duplicates',
      greatest(0,coalesce(p_duplicates,0)),
    'unsupported',
      greatest(0,coalesce(p_unsupported,0)),
    'identity_refreshed',
      greatest(0,coalesce(p_identity_refreshed,0)),
    'external_action',false
  );
end;
$function$;

revoke all on function
  public.platform_server_messaging_history_complete(
    uuid,
    uuid,
    text,
    text,
    integer,
    integer,
    integer,
    integer,
    integer,
    timestamptz,
    timestamptz
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_messaging_history_complete(
    uuid,
    uuid,
    text,
    text,
    integer,
    integer,
    integer,
    integer,
    integer,
    timestamptz,
    timestamptz
  )
to
  postgres,
  service_role;

notify pgrst,'reload schema';

commit;
