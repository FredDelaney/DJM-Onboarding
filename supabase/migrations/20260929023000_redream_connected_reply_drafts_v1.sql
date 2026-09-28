begin;

create table if not exists djm_os.connected_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,
  owner_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  interaction_id uuid not null
    references djm_os.interactions(id)
    on delete cascade,
  person_id uuid not null
    references djm_os.people(id)
    on delete cascade,
  organisation_id uuid
    references djm_os.organisations(id)
    on delete set null,
  channel text not null,
  source_occurred_at timestamptz not null,
  source_summary_hash text not null,
  draft_text text not null,
  model text,
  prompt_version text not null
    default 'connected_reply_v1',
  evidence_json jsonb not null
    default '{}'::jsonb,
  created_at timestamptz not null
    default now(),
  updated_at timestamptz not null
    default now(),
  unique(
    tenant_id,
    owner_user_id,
    interaction_id
  )
);

create index if not exists
  connected_reply_drafts_owner_updated_idx
on djm_os.connected_reply_drafts(
  tenant_id,
  owner_user_id,
  updated_at desc
);

alter table djm_os.connected_reply_drafts
  enable row level security;

revoke all on djm_os.connected_reply_drafts
from
  public,
  anon,
  authenticated;

grant
  select,
  insert,
  update,
  delete
on djm_os.connected_reply_drafts
to service_role;
create or replace function
  public.platform_server_connected_reply_context(
    p_tenant_id uuid,
    p_user_id uuid,
    p_interaction_id uuid
  )
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_interaction djm_os.interactions%rowtype;
  v_person_name text;
  v_source_org_name text;
  v_current_org_id uuid;
  v_current_org_name text;
  v_current_role text;
  v_recent jsonb:='[]'::jsonb;
  v_existing jsonb:=null;
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

  select *
  into v_interaction
  from djm_os.interactions i
  where i.id=p_interaction_id
    and i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in (
      'google_email',
      'microsoft_email',
      'instagram_selected_chat',
      'whatsapp_selected_chat'
    )
    and i.person_id is not null
    and nullif(trim(i.summary),'') is not null
  limit 1;

  if v_interaction.id is null then
    raise exception 'connected_interaction_not_available';
  end if;

  if (
    v_interaction.channel in (
      'google_email',
      'microsoft_email'
    )
    and lower(
      coalesce(
        v_interaction.direction,
        ''
      )
    ) not in (
      'inbound',
      'received'
    )
  )
  or (
    v_interaction.channel in (
      'instagram_selected_chat',
      'whatsapp_selected_chat'
    )
    and lower(
      coalesce(
        v_interaction.direction,
        ''
      )
    ) in (
      'outbound',
      'sent'
    )
  )
  then
    raise exception 'reply_draft_requires_inbound_interaction';
  end if;

  select p.full_name
  into v_person_name
  from djm_os.people p
  where p.id=v_interaction.person_id
    and p.tenant_id=p_tenant_id;

  if v_person_name is null then
    raise exception 'connected_person_not_available';
  end if;

  if v_interaction.organisation_id is not null then
    select o.name
    into v_source_org_name
    from djm_os.organisations o
    where o.id=v_interaction.organisation_id
      and o.tenant_id=p_tenant_id;
  end if;

  select
    e.organisation_id,
    o.name,
    e.role_title
  into
    v_current_org_id,
    v_current_org_name,
    v_current_role
  from djm_os.employments e
  join djm_os.organisations o
    on o.id=e.organisation_id
   and o.tenant_id=p_tenant_id
  where e.tenant_id=p_tenant_id
    and e.person_id=v_interaction.person_id
    and e.is_current
  order by
    coalesce(
      e.last_verified_at,
      e.updated_at
    ) desc nulls last,
    e.updated_at desc
  limit 1;

  select coalesce(
    jsonb_agg(
      item
      order by occurred_at desc
    ),
    '[]'::jsonb
  )
  into v_recent
  from (
    select
      jsonb_build_object(
        'interaction_id',i.id,
        'channel',i.channel,
        'direction',i.direction,
        'summary',left(i.summary,1200),
        'occurred_at',i.occurred_at
      ) as item,
      i.occurred_at
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id
      and i.team_member_id=p_user_id
      and i.person_id=v_interaction.person_id
      and i.id<>v_interaction.id
      and i.channel in (
        'google_email',
        'microsoft_email',
        'instagram_selected_chat',
        'whatsapp_selected_chat'
      )
      and nullif(trim(i.summary),'') is not null
      and i.occurred_at<=v_interaction.occurred_at
      and i.occurred_at>=
        v_interaction.occurred_at-
        interval '90 days'
    order by i.occurred_at desc
    limit 4
  ) q;

  select jsonb_build_object(
    'draft_id',d.id,
    'draft_text',d.draft_text,
    'model',d.model,
    'prompt_version',d.prompt_version,
    'updated_at',d.updated_at
  )
  into v_existing
  from djm_os.connected_reply_drafts d
  where d.tenant_id=p_tenant_id
    and d.owner_user_id=p_user_id
    and d.interaction_id=p_interaction_id
  limit 1;
  return jsonb_build_object(
    'contract_version',
      'redream_connected_reply_drafts_v1',
    'interaction',jsonb_build_object(
      'interaction_id',v_interaction.id,
      'channel',v_interaction.channel,
      'direction',v_interaction.direction,
      'summary',left(
        v_interaction.summary,
        1800
      ),
      'occurred_at',v_interaction.occurred_at
    ),
    'person',jsonb_build_object(
      'person_id',v_interaction.person_id,
      'name',v_person_name,
      'source_organisation_id',
        v_interaction.organisation_id,
      'source_organisation_name',
        v_source_org_name,
      'current_organisation_id',
        v_current_org_id,
      'current_organisation_name',
        v_current_org_name,
      'current_role',
        v_current_role
    ),
    'recent_context',v_recent,
    'existing_draft',v_existing,
    'truth_contract',jsonb_build_object(
      'source_scope',
        'The draft is grounded in one specific connected interaction owned by the signed-in agent.',
      'context_scope',
        'Recent context includes only that same agent connected conversation summaries with the same Network person.',
      'identity',
        'Current club and role come from the canonical tenant Network and may differ from the source-time organisation snapshot.',
      'external_action',
        'This contract prepares internal draft context only. It never sends a message or changes external provider data.',
      'commitments',
        'A draft must not invent prices, dates, promises, player availability, deal terms or other commitments that are not supported by recorded evidence.'
    )
  );
end;
$function$;

revoke all on function
  public.platform_server_connected_reply_context(
    uuid,
    uuid,
    uuid
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_connected_reply_context(
    uuid,
    uuid,
    uuid
  )
to
  postgres,
  service_role;
create or replace function
  public.platform_server_connected_reply_store(
    p_tenant_id uuid,
    p_user_id uuid,
    p_interaction_id uuid,
    p_draft_text text,
    p_model text,
    p_prompt_version text,
    p_evidence jsonb default '{}'::jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_interaction djm_os.interactions%rowtype;
  v_text text:=
    nullif(
      trim(
        coalesce(
          p_draft_text,
          ''
        )
      ),
      ''
    );
  v_hash text;
  v_draft djm_os.connected_reply_drafts%rowtype;
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

  if v_text is null
    or length(v_text)>4000
  then
    raise exception 'reply_draft_invalid';
  end if;

  if jsonb_typeof(
    coalesce(
      p_evidence,
      '{}'::jsonb
    )
  )<>'object'
  then
    raise exception 'reply_evidence_invalid';
  end if;

  select *
  into v_interaction
  from djm_os.interactions i
  where i.id=p_interaction_id
    and i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in (
      'google_email',
      'microsoft_email',
      'instagram_selected_chat',
      'whatsapp_selected_chat'
    )
    and i.person_id is not null
    and nullif(trim(i.summary),'') is not null
  limit 1;

  if v_interaction.id is null then
    raise exception 'connected_interaction_not_available';
  end if;

  if (
    v_interaction.channel in (
      'google_email',
      'microsoft_email'
    )
    and lower(
      coalesce(
        v_interaction.direction,
        ''
      )
    ) not in (
      'inbound',
      'received'
    )
  )
  or (
    v_interaction.channel in (
      'instagram_selected_chat',
      'whatsapp_selected_chat'
    )
    and lower(
      coalesce(
        v_interaction.direction,
        ''
      )
    ) in (
      'outbound',
      'sent'
    )
  )
  then
    raise exception 'reply_draft_requires_inbound_interaction';
  end if;

  v_hash:=md5(
    coalesce(
      v_interaction.summary,
      ''
    )||
    '|'||
    v_interaction.occurred_at::text
  );

  insert into djm_os.connected_reply_drafts(
    tenant_id,
    owner_user_id,
    interaction_id,
    person_id,
    organisation_id,
    channel,
    source_occurred_at,
    source_summary_hash,
    draft_text,
    model,
    prompt_version,
    evidence_json,
    updated_at
  )
  values(
    p_tenant_id,
    p_user_id,
    p_interaction_id,
    v_interaction.person_id,
    v_interaction.organisation_id,
    v_interaction.channel,
    v_interaction.occurred_at,
    v_hash,
    v_text,
    nullif(
      trim(
        coalesce(
          p_model,
          ''
        )
      ),
      ''
    ),
    coalesce(
      nullif(
        trim(
          coalesce(
            p_prompt_version,
            ''
          )
        ),
        ''
      ),
      'connected_reply_v1'
    ),
    coalesce(
      p_evidence,
      '{}'::jsonb
    ),
    now()
  )
  on conflict (
    tenant_id,
    owner_user_id,
    interaction_id
  )
  do update
  set
    person_id=excluded.person_id,
    organisation_id=excluded.organisation_id,
    channel=excluded.channel,
    source_occurred_at=
      excluded.source_occurred_at,
    source_summary_hash=
      excluded.source_summary_hash,
    draft_text=excluded.draft_text,
    model=excluded.model,
    prompt_version=
      excluded.prompt_version,
    evidence_json=
      excluded.evidence_json,
    updated_at=now()
  returning *
  into v_draft;

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
    case
      when lower(
        coalesce(
          v_draft.model,
          ''
        )
      )='human_edit'
        then 'CONNECTED_REPLY_DRAFT_EDITED'
      else 'CONNECTED_REPLY_DRAFT_GENERATED'
    end,
    p_user_id,
    v_interaction.person_id,
    v_interaction.organisation_id,
    jsonb_build_object(
      'draft_id',v_draft.id,
      'interaction_id',
        p_interaction_id,
      'channel',
        v_interaction.channel,
      'model',
        v_draft.model,
      'prompt_version',
        v_draft.prompt_version,
      'source_summary_hash',
        v_hash
    ),
    'connected_work',
    1,
    now()
  );

  return jsonb_build_object(
    'draft_id',v_draft.id,
    'interaction_id',
      v_draft.interaction_id,
    'draft_text',
      v_draft.draft_text,
    'model',v_draft.model,
    'prompt_version',
      v_draft.prompt_version,
    'updated_at',
      v_draft.updated_at,
    'external_action',false
  );
end;
$function$;

revoke all on function
  public.platform_server_connected_reply_store(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_connected_reply_store(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb
  )
to
  postgres,
  service_role;

notify pgrst,'reload schema';

commit;
