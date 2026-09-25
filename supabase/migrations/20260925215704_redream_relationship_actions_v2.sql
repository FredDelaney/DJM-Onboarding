create or replace function public.platform_server_relationship_record_interaction(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_person_id uuid,
  p_channel text,
  p_summary text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_summary text := trim(coalesce(p_summary, ''));
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_organisation_id uuid;
  v_interaction_id uuid;
begin
  if p_actor_user_id is null
     or not exists (
       select 1
       from platform.tenant_memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id = p_actor_user_id
         and m.status = 'active'
         and m.role in ('owner','admin','agent','scout','operations')
     )
  then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = p_actor_user_id
      and tm.is_active = true
  ) then
    raise exception 'team_member_not_active' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = p_tenant_id
      and coalesce(p.person_type, 'contact') <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  if v_channel not in (
    'whatsapp',
    'linkedin',
    'email',
    'phone',
    'meeting',
    'instagram',
    'other'
  ) then
    raise exception 'unsupported_channel';
  end if;

  if length(v_summary) < 2 or length(v_summary) > 4000 then
    raise exception 'summary_invalid';
  end if;

  if v_occurred_at > now() + interval '1 day' then
    raise exception 'interaction_date_invalid';
  end if;

  select e.organisation_id
  into v_organisation_id
  from djm_os.employments e
  where e.tenant_id = p_tenant_id
    and e.person_id = p_person_id
    and e.is_current = true
  order by e.last_verified_at desc nulls last,
           e.updated_at desc
  limit 1;

  insert into djm_os.interactions (
    tenant_id,
    occurred_at,
    channel,
    direction,
    team_member_id,
    person_id,
    organisation_id,
    source_type,
    raw_text,
    summary,
    confidence
  )
  values (
    p_tenant_id,
    v_occurred_at,
    v_channel,
    'logged',
    p_actor_user_id,
    p_person_id,
    v_organisation_id,
    'redream_manual',
    v_summary,
    v_summary,
    1
  )
  returning id into v_interaction_id;

  insert into djm_os.relationships (
    tenant_id,
    team_member_id,
    person_id,
    strength_score,
    access_score,
    trust_score,
    first_known_at,
    last_meaningful_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    p_person_id,
    20,
    20,
    50,
    v_occurred_at,
    v_occurred_at,
    now()
  )
  on conflict (team_member_id, person_id)
  do update set
    tenant_id = excluded.tenant_id,
    last_meaningful_at = greatest(
      coalesce(djm_os.relationships.last_meaningful_at, 'epoch'::timestamptz),
      excluded.last_meaningful_at
    ),
    updated_at = now();

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    person_id,
    organisation_id,
    interaction_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    'RELATIONSHIP_INTERACTION_RECORDED',
    p_actor_user_id,
    p_person_id,
    v_organisation_id,
    v_interaction_id,
    jsonb_build_object(
      'channel', v_channel,
      'summary_recorded', true
    ),
    'redream_relationships',
    1,
    v_occurred_at
  );

  return public.platform_server_relationship_person(
    p_tenant_id,
    p_person_id
  );
end;
$function$;

create or replace function public.platform_server_relationship_add_work(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_person_id uuid,
  p_kind text,
  p_title text,
  p_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_organisation_id uuid;
  v_task_id uuid;
  v_task_type text;
begin
  if p_actor_user_id is null
     or not exists (
       select 1
       from platform.tenant_memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id = p_actor_user_id
         and m.status = 'active'
         and m.role in ('owner','admin','agent','scout','operations')
     )
  then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = p_actor_user_id
      and tm.is_active = true
  ) then
    raise exception 'team_member_not_active' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = p_tenant_id
      and coalesce(p.person_type, 'contact') <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  if v_kind not in ('followup', 'promise') then
    raise exception 'unsupported_relationship_work';
  end if;

  if length(v_title) < 2 or length(v_title) > 240 then
    raise exception 'work_title_invalid';
  end if;

  if p_due_at is null then
    raise exception 'due_date_required';
  end if;

  select e.organisation_id
  into v_organisation_id
  from djm_os.employments e
  where e.tenant_id = p_tenant_id
    and e.person_id = p_person_id
    and e.is_current = true
  order by e.last_verified_at desc nulls last,
           e.updated_at desc
  limit 1;

  v_task_type := case
    when v_kind = 'promise' then 'commitment'
    else 'relationship_followup'
  end;

  insert into djm_os.tasks (
    tenant_id,
    title,
    task_type,
    owner_user_id,
    person_id,
    organisation_id,
    due_at,
    status,
    priority,
    source
  )
  values (
    p_tenant_id,
    v_title,
    v_task_type,
    p_actor_user_id,
    p_person_id,
    v_organisation_id,
    p_due_at,
    'open',
    case when v_kind = 'promise' then 5 else 3 end,
    'redream_relationships'
  )
  returning id into v_task_id;

  insert into djm_os.events (
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
  values (
    p_tenant_id,
    case
      when v_kind = 'promise'
        then 'RELATIONSHIP_PROMISE_CREATED'
      else 'RELATIONSHIP_FOLLOWUP_CREATED'
    end,
    p_actor_user_id,
    p_person_id,
    v_organisation_id,
    jsonb_build_object(
      'task_id', v_task_id,
      'kind', v_kind,
      'due_at', p_due_at
    ),
    'redream_relationships',
    1,
    now()
  );

  return public.platform_server_relationship_person(
    p_tenant_id,
    p_person_id
  );
end;
$function$;

create or replace function public.platform_server_relationship_update_route(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_person_id uuid,
  p_strength_score smallint default null,
  p_access_score smallint default null,
  p_trust_score smallint default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if p_actor_user_id is null
     or not exists (
       select 1
       from platform.tenant_memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id = p_actor_user_id
         and m.status = 'active'
         and m.role in ('owner','admin','agent','scout','operations')
     )
  then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = p_actor_user_id
      and tm.is_active = true
  ) then
    raise exception 'team_member_not_active' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = p_tenant_id
      and coalesce(p.person_type, 'contact') <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  if p_strength_score is not null
     and (p_strength_score < 0 or p_strength_score > 100)
  then
    raise exception 'strength_score_invalid';
  end if;

  if p_access_score is not null
     and (p_access_score < 0 or p_access_score > 100)
  then
    raise exception 'access_score_invalid';
  end if;

  if p_trust_score is not null
     and (p_trust_score < 0 or p_trust_score > 100)
  then
    raise exception 'trust_score_invalid';
  end if;

  insert into djm_os.relationships (
    tenant_id,
    team_member_id,
    person_id,
    strength_score,
    access_score,
    trust_score,
    relationship_notes,
    first_known_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    p_person_id,
    coalesce(p_strength_score, 20),
    coalesce(p_access_score, 20),
    coalesce(p_trust_score, 50),
    v_notes,
    now(),
    now()
  )
  on conflict (team_member_id, person_id)
  do update set
    tenant_id = excluded.tenant_id,
    strength_score = coalesce(
      p_strength_score,
      djm_os.relationships.strength_score
    ),
    access_score = coalesce(
      p_access_score,
      djm_os.relationships.access_score
    ),
    trust_score = coalesce(
      p_trust_score,
      djm_os.relationships.trust_score
    ),
    relationship_notes = coalesce(
      v_notes,
      djm_os.relationships.relationship_notes
    ),
    updated_at = now();

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    'RELATIONSHIP_ROUTE_UPDATED',
    p_actor_user_id,
    p_person_id,
    jsonb_build_object(
      'strength_recorded', p_strength_score is not null,
      'access_recorded', p_access_score is not null,
      'trust_recorded', p_trust_score is not null,
      'note_recorded', v_notes is not null
    ),
    'redream_relationships',
    1,
    now()
  );

  return public.platform_server_relationship_person(
    p_tenant_id,
    p_person_id
  );
end;
$function$;

create or replace function public.redream_relationship_record_interaction(
  p_person_id uuid,
  p_channel text,
  p_summary text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  return public.platform_server_relationship_record_interaction(
    v_tenant,
    auth.uid(),
    p_person_id,
    p_channel,
    p_summary,
    p_occurred_at
  );
end;
$function$;

create or replace function public.redream_relationship_add_work(
  p_person_id uuid,
  p_kind text,
  p_title text,
  p_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  return public.platform_server_relationship_add_work(
    v_tenant,
    auth.uid(),
    p_person_id,
    p_kind,
    p_title,
    p_due_at
  );
end;
$function$;

create or replace function public.redream_relationship_update_route(
  p_person_id uuid,
  p_strength_score smallint default null,
  p_access_score smallint default null,
  p_trust_score smallint default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  return public.platform_server_relationship_update_route(
    v_tenant,
    auth.uid(),
    p_person_id,
    p_strength_score,
    p_access_score,
    p_trust_score,
    p_notes
  );
end;
$function$;

revoke all on function public.platform_server_relationship_record_interaction(
  uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;

revoke all on function public.platform_server_relationship_add_work(
  uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;

revoke all on function public.platform_server_relationship_update_route(
  uuid, uuid, uuid, smallint, smallint, smallint, text
) from public, anon, authenticated;

grant execute on function public.platform_server_relationship_record_interaction(
  uuid, uuid, uuid, text, text, timestamptz
) to postgres, service_role;

grant execute on function public.platform_server_relationship_add_work(
  uuid, uuid, uuid, text, text, timestamptz
) to postgres, service_role;

grant execute on function public.platform_server_relationship_update_route(
  uuid, uuid, uuid, smallint, smallint, smallint, text
) to postgres, service_role;

revoke all on function public.redream_relationship_record_interaction(
  uuid, text, text, timestamptz
) from public, anon;

revoke all on function public.redream_relationship_add_work(
  uuid, text, text, timestamptz
) from public, anon;

revoke all on function public.redream_relationship_update_route(
  uuid, smallint, smallint, smallint, text
) from public, anon;

grant execute on function public.redream_relationship_record_interaction(
  uuid, text, text, timestamptz
) to authenticated, service_role;

grant execute on function public.redream_relationship_add_work(
  uuid, text, text, timestamptz
) to authenticated, service_role;

grant execute on function public.redream_relationship_update_route(
  uuid, smallint, smallint, smallint, text
) to authenticated, service_role;

create or replace function public.platform_server_relationship_person(
  p_tenant_id uuid,
  p_person_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb;
  v_routes jsonb;
  v_interactions jsonb;
  v_followups jsonb;
  v_promises jsonb;
  v_best jsonb;
  v_last_meaningful timestamptz;
  v_state text;
begin
  if not exists (
    select 1
    from platform.tenants t
    where t.id = p_tenant_id
      and t.status = 'active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = p_tenant_id
      and coalesce(p.person_type, 'contact') <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  v_base := public.platform_server_contact_reach(
    p_tenant_id,
    p_person_id
  );

  with route_rows as (
    select
      r.team_member_id,
      tm.display_name as owner_name,
      coalesce(r.strength_score, 0)::integer as strength_score,
      coalesce(r.access_score, 0)::integer as access_score,
      coalesce(r.trust_score, 0)::integer as trust_score,
      r.first_known_at,
      r.last_meaningful_at,
      r.relationship_notes,
      round(
        coalesce(r.strength_score, 0)::numeric * 0.30 +
        coalesce(r.access_score, 0)::numeric * 0.25 +
        coalesce(r.trust_score, 0)::numeric * 0.20 +
        platform.access_recency_score(r.last_meaningful_at)::numeric * 0.25
      )::integer as route_score
    from djm_os.relationships r
    join platform.tenant_memberships membership
      on membership.tenant_id = p_tenant_id
     and membership.user_id = r.team_member_id
     and membership.status = 'active'
     and membership.role in (
       'owner',
       'admin',
       'agent',
       'scout',
       'operations'
     )
    left join djm_os.team_members tm
      on tm.user_id = r.team_member_id
    where r.tenant_id = p_tenant_id
      and r.person_id = p_person_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'owner_user_id', team_member_id,
        'owner_name', owner_name,
        'strength_score', strength_score,
        'access_score', access_score,
        'trust_score', trust_score,
        'route_score', route_score,
        'first_known_at', first_known_at,
        'last_meaningful_at', last_meaningful_at,
        'notes', relationship_notes
      )
      order by route_score desc,
               last_meaningful_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_routes
  from route_rows;

  if jsonb_array_length(v_routes) > 0 then
    v_best := v_routes -> 0;
  else
    v_best := null;
  end if;

  select max(x.occurred_at)
  into v_last_meaningful
  from (
    select i.occurred_at
    from djm_os.interactions i
    where i.tenant_id = p_tenant_id
      and i.person_id = p_person_id

    union all

    select r.last_meaning_at
    from (
      select
        relationship.last_meaningful_at as last_meaning_at
      from djm_os.relationships relationship
      where relationship.tenant_id = p_tenant_id
        and relationship.person_id = p_person_id
        and relationship.last_meaningful_at is not null
    ) r
  ) x;

  v_state := case
    when v_last_meaningful is null then 'not_recorded'
    when v_last_meaningful >= now() - interval '45 days' then 'current'
    when v_last_meaningful >= now() - interval '90 days' then 'cooling'
    else 'cold'
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'interaction_id', i.id,
        'occurred_at', i.occurred_at,
        'channel', i.channel,
        'direction', i.direction,
        'summary', i.summary,
        'source_type', i.source_type,
        'team_member_id', i.team_member_id,
        'team_member_name', tm.display_name,
        'organisation_id', i.organisation_id,
        'organisation_name', o.name
      )
      order by i.occurred_at desc
    ),
    '[]'::jsonb
  )
  into v_interactions
  from (
    select *
    from djm_os.interactions
    where tenant_id = p_tenant_id
      and person_id = p_person_id
    order by occurred_at desc
    limit 20
  ) i
  left join djm_os.team_members tm
    on tm.user_id = i.team_member_id
  left join djm_os.organisations o
    on o.id = i.organisation_id
   and o.tenant_id = p_tenant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'task_id', t.id,
        'title', t.title,
        'task_type', t.task_type,
        'owner_user_id', t.owner_user_id,
        'owner_name', tm.display_name,
        'due_at', t.due_at,
        'status', t.status,
        'priority', t.priority,
        'source', t.source
      )
      order by
        case when t.due_at is null then 1 else 0 end,
        t.due_at asc,
        t.priority desc,
        t.created_at desc
    ),
    '[]'::jsonb
  )
  into v_followups
  from djm_os.tasks t
  left join djm_os.team_members tm
    on tm.user_id = t.owner_user_id
  where t.tenant_id = p_tenant_id
    and t.person_id = p_person_id
    and t.status not in ('done', 'completed', 'cancelled')
    and coalesce(t.task_type, '') <> 'commitment'
    and not exists (
      select 1
      from platform.agency_commitments c
      where c.tenant_id = p_tenant_id
        and c.task_id = t.id
        and c.status in ('active', 'overdue')
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'task_id', t.id,
        'title', t.title,
        'task_type', t.task_type,
        'owner_user_id', t.owner_user_id,
        'owner_name', tm.display_name,
        'due_at', coalesce(c.due_at, t.due_at),
        'status', coalesce(c.status, t.status),
        'priority', t.priority,
        'source', t.source,
        'commitment_id', c.id
      )
      order by
        case when coalesce(c.due_at, t.due_at) is null then 1 else 0 end,
        coalesce(c.due_at, t.due_at) asc,
        t.created_at desc
    ),
    '[]'::jsonb
  )
  into v_promises
  from djm_os.tasks t
  left join platform.agency_commitments c
    on c.tenant_id = p_tenant_id
   and c.task_id = t.id
   and c.status in ('active', 'overdue')
  left join djm_os.team_members tm
    on tm.user_id = coalesce(c.owner_user_id, t.owner_user_id)
  where t.tenant_id = p_tenant_id
    and t.person_id = p_person_id
    and t.status not in ('done', 'completed', 'cancelled')
    and (
      t.task_type = 'commitment'
      or c.id is not null
    );

  return v_base || jsonb_build_object(
    'relationship_memory',
    jsonb_build_object(
      'state', v_state,
      'last_meaningful_at', v_last_meaningful,
      'best_route', v_best,
      'routes', v_routes,
      'recent_interactions', v_interactions,
      'followups', v_followups,
      'promises', v_promises,
      'open_tasks', v_followups,
      'commitments', v_promises
    ),
    'truth_contract',
    coalesce(v_base -> 'truth_contract', '{}'::jsonb) ||
    jsonb_build_object(
      'relationship_memory',
      'Relationship memory reflects information recorded by this agency. Missing offline conversations remain invisible.',
      'relationship_state',
      'Current, cooling and cold are recency descriptions only. They are not predictions of influence, response or deal success.',
      'relationship_route',
      'Best route identifies the strongest recorded agency relationship. It does not assign exclusive ownership of the person.',
      'promises',
      'Promises are commitments the agency has recorded and should follow through on. They are shown separately from general follow-up.'
    )
  );
end;
$function$;
