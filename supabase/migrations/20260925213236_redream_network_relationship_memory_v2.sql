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
  v_tasks jsonb;
  v_commitments jsonb;
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
  select
    coalesce(
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
        order by route_score desc, last_meaningful_at desc nulls last
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

    select r.last_meaningful_at
    from djm_os.relationships r
    where r.tenant_id = p_tenant_id
      and r.person_id = p_person_id
      and r.last_meaningful_at is not null
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
  into v_tasks
  from djm_os.tasks t
  left join djm_os.team_members tm
    on tm.user_id = t.owner_user_id
  where t.tenant_id = p_tenant_id
    and t.person_id = p_person_id
    and t.status not in ('done', 'completed', 'cancelled');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'commitment_id', c.id,
        'task_id', c.task_id,
        'status', c.status,
        'due_at', c.due_at,
        'owner_user_id', c.owner_user_id,
        'owner_name', tm.display_name,
        'task_title', t.title,
        'task_type', t.task_type
      )
      order by c.due_at asc nulls last, c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_commitments
  from platform.agency_commitments c
  join djm_os.tasks t
    on t.id = c.task_id
   and t.tenant_id = c.tenant_id
  left join djm_os.team_members tm
    on tm.user_id = c.owner_user_id
  where c.tenant_id = p_tenant_id
    and t.person_id = p_person_id
    and c.status in ('active', 'overdue');

  return v_base || jsonb_build_object(
    'relationship_memory',
    jsonb_build_object(
      'state', v_state,
      'last_meaningful_at', v_last_meaningful,
      'best_route', v_best,
      'routes', v_routes,
      'recent_interactions', v_interactions,
      'open_tasks', v_tasks,
      'commitments', v_commitments
    ),
    'truth_contract',
    coalesce(v_base -> 'truth_contract', '{}'::jsonb) ||
    jsonb_build_object(
      'relationship_memory',
      'Relationship memory reflects information recorded by this agency. Missing offline conversations remain invisible.',
      'relationship_state',
      'Current, cooling and cold are recency descriptions only. They are not predictions of influence, response or deal success.',
      'relationship_route',
      'Best route identifies the strongest recorded agency relationship. It does not assign exclusive ownership of the person.'
    )
  );
end;
$function$;

create or replace function public.redream_relationship_person(
  p_person_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  return public.platform_server_relationship_person(
    v_tenant,
    p_person_id
  );
end;
$function$;

revoke all on function public.platform_server_relationship_person(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.platform_server_relationship_person(uuid, uuid)
to postgres, service_role;

revoke all on function public.redream_relationship_person(uuid)
from public, anon;

grant execute on function public.redream_relationship_person(uuid)
to authenticated, service_role;
