begin;

create or replace function public.platform_server_connected_work(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,6),12));
  v_unlinked_count integer:=0;
  v_followup_count integer:=0;
  v_recent_count integer:=0;
  v_meeting_count integer:=0;
  v_unlinked_by_provider jsonb:='[]'::jsonb;
  v_latest_unlinked_at timestamptz;
  v_recent jsonb:='[]'::jsonb;
  v_meetings jsonb:='[]'::jsonb;
  v_owner_name text;
begin
  if p_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied';
  end if;

  select
    coalesce(
      nullif(trim(tm.display_name),''),
      'You'
    )
  into v_owner_name
  from platform.tenant_memberships membership
  left join djm_os.team_members tm
    on tm.user_id=membership.user_id
   and tm.is_active
  where membership.tenant_id=p_tenant_id
    and membership.user_id=p_user_id
    and membership.status='active'
    and membership.role in (
      'owner','admin','agent','operations','scout'
    )
  limit 1;

  v_owner_name:=coalesce(v_owner_name,'You');
  select
    count(*)::int,
    max(mt.last_activity_at)
  into
    v_unlinked_count,
    v_latest_unlinked_at
  from djm_os.messaging_threads mt
  where mt.tenant_id=p_tenant_id
    and mt.user_id=p_user_id
    and mt.is_selected=true
    and mt.bound_person_id is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',provider,
        'count',item_count
      )
      order by item_count desc,provider
    ),
    '[]'::jsonb
  )
  into v_unlinked_by_provider
  from (
    select
      mt.provider,
      count(*)::int as item_count
    from djm_os.messaging_threads mt
    where mt.tenant_id=p_tenant_id
      and mt.user_id=p_user_id
      and mt.is_selected=true
      and mt.bound_person_id is null
    group by mt.provider
  ) q;

  select count(*)::int
  into v_followup_count
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id
    and t.owner_user_id=p_user_id
    and t.status not in (
      'done','completed','cancelled'
    )
    and t.source like 'tell_djm:%'
    and exists (
      select 1
      from djm_os.captures c
      where c.tenant_id=p_tenant_id
        and t.source like
          'tell_djm:'||c.id::text||':%'
        and (
          c.context_json->>'capture_origin'='email'
          or c.channel in (
            'instagram_selected_chat',
            'whatsapp_selected_chat'
          )
        )
    );
  select count(*)::int
  into v_recent_count
  from djm_os.interactions i
  where i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in (
      'google_email',
      'microsoft_email',
      'instagram_selected_chat',
      'whatsapp_selected_chat'
    )
    and i.occurred_at>now()-interval '30 days'
    and (
      i.person_id is not null
      or i.organisation_id is not null
    );

  select coalesce(
    jsonb_agg(item order by sort_at desc),
    '[]'::jsonb
  )
  into v_recent
  from (
    select
      jsonb_build_object(
        'interaction_id',i.id,
        'channel',i.channel,
        'direction',i.direction,
        'summary',i.summary,
        'occurred_at',i.occurred_at,
        'person_id',i.person_id,
        'person_name',p.full_name,
        'organisation_id',i.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',p_user_id,
        'owner_name',v_owner_name
      ) as item,
      i.occurred_at as sort_at
    from djm_os.interactions i
    left join djm_os.people p
      on p.id=i.person_id
     and p.tenant_id=i.tenant_id
    left join djm_os.organisations o
      on o.id=i.organisation_id
     and o.tenant_id=i.tenant_id
    where i.tenant_id=p_tenant_id
      and i.team_member_id=p_user_id
      and i.channel in (
        'google_email',
        'microsoft_email',
        'instagram_selected_chat',
        'whatsapp_selected_chat'
      )
      and i.occurred_at>now()-interval '30 days'
      and (
        i.person_id is not null
        or i.organisation_id is not null
      )
    order by i.occurred_at desc
    limit least(v_limit,4)
  ) q;
  select count(*)::int
  into v_meeting_count
  from djm_os.meetings m
  where m.tenant_id=p_tenant_id
    and m.owner_user_id=p_user_id
    and m.status='scheduled'
    and m.starts_at between
      now() and now()+interval '7 days'
    and (
      m.person_id is not null
      or m.organisation_id is not null
    );

  select coalesce(
    jsonb_agg(item order by starts_at),
    '[]'::jsonb
  )
  into v_meetings
  from (
    select
      jsonb_build_object(
        'meeting_id',m.id,
        'title',m.title,
        'starts_at',m.starts_at,
        'ends_at',m.ends_at,
        'provider',m.provider,
        'meeting_url',m.meeting_url,
        'person_id',m.person_id,
        'person_name',p.full_name,
        'organisation_id',m.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',p_user_id,
        'owner_name',v_owner_name
      ) as item,
      m.starts_at
    from djm_os.meetings m
    left join djm_os.people p
      on p.id=m.person_id
     and p.tenant_id=m.tenant_id
    left join djm_os.organisations o
      on o.id=m.organisation_id
     and o.tenant_id=m.tenant_id
    where m.tenant_id=p_tenant_id
      and m.owner_user_id=p_user_id
      and m.status='scheduled'
      and m.starts_at between
        now() and now()+interval '7 days'
      and (
        m.person_id is not null
        or m.organisation_id is not null
      )
    order by m.starts_at
    limit 2
  ) q;
  return jsonb_build_object(
    'contract_version',
      'redream_connected_work_home_v1',
    'generated_at',now(),
    'summary',jsonb_build_object(
      'selected_chats_needing_link',
        v_unlinked_count,
      'connected_followups_open',
        v_followup_count,
      'recent_connected_conversations',
        v_recent_count,
      'linked_meetings_next_7_days',
        v_meeting_count
    ),
    'identity_resolution',jsonb_build_object(
      'count',v_unlinked_count,
      'by_provider',v_unlinked_by_provider,
      'latest_activity_at',v_latest_unlinked_at
    ),
    'recent_conversations',v_recent,
    'upcoming_meetings',v_meetings,
    'owner',jsonb_build_object(
      'user_id',p_user_id,
      'name',v_owner_name
    ),
    'truth_contract',jsonb_build_object(
      'personal_scope',
        'Home Connected Work shows only the signed-in agent connected accounts, owned follow-ups, recorded interactions and personal Calendar.',
      'shared_context',
        'Person and organisation identity comes from the shared tenant Network.',
      'identity',
        'Unlinked chats remain unresolved until an agent explicitly links them to an existing Network contact.',
      'external_action',
        'Connected Work never sends an external message automatically.'
    )
  );
end;
$function$;

create or replace function public.redream_connected_work(
  p_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  return public.platform_server_connected_work(
    v_tenant,
    v_user,
    p_limit
  );
end;
$function$;
revoke all on function
  public.platform_server_connected_work(uuid,uuid,integer)
from public,anon,authenticated;

grant execute on function
  public.platform_server_connected_work(uuid,uuid,integer)
to postgres,service_role;

revoke all on function
  public.redream_connected_work(integer)
from public,anon;

grant execute on function
  public.redream_connected_work(integer)
to authenticated,service_role;

notify pgrst,'reload schema';

commit;
