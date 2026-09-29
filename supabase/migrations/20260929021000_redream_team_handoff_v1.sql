begin;

create or replace function public.platform_server_team_handoff_preview(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_from_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_source jsonb;
  v_candidates jsonb:='[]'::jsonb;
  v_players jsonb:='[]'::jsonb;
  v_prospects jsonb:='[]'::jsonb;
  v_needs jsonb:='[]'::jsonb;
  v_deals jsonb:='[]'::jsonb;
  v_tasks jsonb:='[]'::jsonb;
begin
  if not exists(
    select 1
    from platform.tenants t
    where t.id=p_tenant_id
      and t.status='active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  if not exists(
    select 1
    from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'management_access_required'
      using errcode='42501';
  end if;

  select jsonb_build_object(
    'user_id',m.user_id,
    'name',coalesce(
      nullif(trim(tm.display_name),''),
      m.user_id::text
    ),
    'tenant_role',m.role,
    'role_title',nullif(trim(tm.role_title),'')
  )
  into v_source
  from platform.tenant_memberships m
  left join djm_os.team_members tm
    on tm.user_id=m.user_id
  where m.tenant_id=p_tenant_id
    and m.user_id=p_from_user_id
    and m.status='active'
    and m.role in (
      'owner',
      'admin',
      'agent',
      'operations',
      'scout'
    )
  limit 1;

  if v_source is null then
    raise exception 'source_staff_not_found';
  end if;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id',x.user_id,
        'name',x.display_name,
        'tenant_role',x.tenant_role,
        'role_title',x.role_title,
        'load',jsonb_build_object(
          'players',x.players,
          'recruitment_targets',x.recruitment_targets,
          'club_needs',x.club_needs,
          'active_deals',x.active_deals,
          'open_tasks',x.open_tasks,
          'overdue_tasks',x.overdue_tasks
        )
      )
      order by lower(x.display_name),x.user_id
    ),
    '[]'::jsonb
  )
  into v_candidates
  from (
    select
      m.user_id,
      coalesce(
        nullif(trim(tm.display_name),''),
        m.user_id::text
      ) as display_name,
      m.role as tenant_role,
      coalesce(
        nullif(trim(tm.role_title),''),
        initcap(m.role)
      ) as role_title,
      (
        select count(*)::int
        from public.players p
        where p.tenant_id=p_tenant_id
          and p.primary_staff_user_id=m.user_id
          and coalesce(
            p.football_status,
            'active'
          ) not in ('retired','inactive')
      ) as players,
      (
        select count(*)::int
        from djm_os.scouting_prospects sp
        where sp.tenant_id=p_tenant_id
          and sp.owner_user_id=m.user_id
          and sp.signed_player_id is null
      ) as recruitment_targets,
      (
        select count(*)::int
        from djm_os.club_needs n
        where n.tenant_id=p_tenant_id
          and n.owner_user_id=m.user_id
          and n.status='active'
      ) as club_needs,
      (
        select count(*)::int
        from djm_os.deal_rooms d
        where d.tenant_id=p_tenant_id
          and d.owner_user_id=m.user_id
          and d.status='active'
      ) as active_deals,
      (
        select count(*)::int
        from djm_os.tasks t
        where t.tenant_id=p_tenant_id
          and t.owner_user_id=m.user_id
          and t.status='open'
      ) as open_tasks,
      (
        select count(*)::int
        from djm_os.tasks t
        where t.tenant_id=p_tenant_id
          and t.owner_user_id=m.user_id
          and t.status='open'
          and t.due_at is not null
          and t.due_at<now()
      ) as overdue_tasks
    from platform.tenant_memberships m
    left join djm_os.team_members tm
      on tm.user_id=m.user_id
    where m.tenant_id=p_tenant_id
      and m.status='active'
      and m.user_id<>p_from_user_id
      and m.role in (
        'owner',
        'admin',
        'agent',
        'operations',
        'scout'
      )
  ) x;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'name',coalesce(
          nullif(trim(p.preferred_name),''),
          nullif(
            trim(
              concat_ws(
                ' ',
                p.first_name,
                p.last_name
              )
            ),
            ''
          ),
          'Player'
        ),
        'football_status',p.football_status,
        'contract_status',p.contract_status,
        'contract_expiry',p.contract_expiry,
        'next_action',p.next_action,
        'next_action_due',p.next_action_due,
        'open_player_requests',(
          select count(*)::int
          from public.player_requests r
          where r.player_id=p.id
            and r.status='open'
            and (
              r.assigned_to_user_id is null
              or r.assigned_to_user_id=p_from_user_id
            )
        )
      )
      order by
        lower(
          coalesce(
            nullif(trim(p.preferred_name),''),
            concat_ws(' ',p.first_name,p.last_name)
          )
        ),
        p.id
    ),
    '[]'::jsonb
  )
  into v_players
  from public.players p
  where p.tenant_id=p_tenant_id
    and p.primary_staff_user_id=p_from_user_id
    and coalesce(
      p.football_status,
      'active'
    ) not in ('retired','inactive');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',sp.id,
        'name',sp.full_name,
        'current_club',sp.current_club,
        'primary_position',sp.primary_position,
        'recruitment_stage',sp.recruitment_stage,
        'next_action_at',sp.next_action_at
      )
      order by
        sp.recruitment_priority desc,
        sp.next_action_at nulls last,
        lower(sp.full_name)
    ),
    '[]'::jsonb
  )
  into v_prospects
  from djm_os.scouting_prospects sp
  where sp.tenant_id=p_tenant_id
    and sp.owner_user_id=p_from_user_id
    and sp.signed_player_id is null;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',n.id,
        'title',n.title,
        'position',n.position,
        'organisation_id',n.organisation_id,
        'organisation_name',o.name,
        'priority',n.priority,
        'expires_at',n.expires_at
      )
      order by
        n.priority desc,
        n.expires_at nulls last,
        lower(n.title)
    ),
    '[]'::jsonb
  )
  into v_needs
  from djm_os.club_needs n
  join djm_os.organisations o
    on o.id=n.organisation_id
   and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id
    and n.owner_user_id=p_from_user_id
    and n.status='active';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',d.id,
        'title',d.title,
        'stage',d.stage,
        'organisation_id',d.organisation_id,
        'organisation_name',o.name,
        'player_id',d.player_id,
        'player_name',case
          when p.id is null then null
          else coalesce(
            nullif(trim(p.preferred_name),''),
            nullif(
              trim(
                concat_ws(
                  ' ',
                  p.first_name,
                  p.last_name
                )
              ),
              ''
            )
          )
        end,
        'expected_commission',d.expected_commission,
        'currency',d.currency
      )
      order by
        d.expected_commission desc nulls last,
        lower(d.title)
    ),
    '[]'::jsonb
  )
  into v_deals
  from djm_os.deal_rooms d
  join djm_os.organisations o
    on o.id=d.organisation_id
   and o.tenant_id=d.tenant_id
  left join public.players p
    on p.id=d.player_id
   and p.tenant_id=d.tenant_id
  where d.tenant_id=p_tenant_id
    and d.owner_user_id=p_from_user_id
    and d.status='active';
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',t.id,
        'title',t.title,
        'task_type',t.task_type,
        'due_at',t.due_at,
        'priority',t.priority,
        'player_id',t.player_id,
        'player_name',case
          when p.id is null then null
          else coalesce(
            nullif(trim(p.preferred_name),''),
            nullif(
              trim(
                concat_ws(
                  ' ',
                  p.first_name,
                  p.last_name
                )
              ),
              ''
            )
          )
        end,
        'person_id',t.person_id,
        'person_name',pe.full_name,
        'organisation_id',t.organisation_id,
        'organisation_name',o.name,
        'commitment',(
          select jsonb_build_object(
            'id',c.id,
            'status',c.status,
            'due_at',c.due_at
          )
          from platform.agency_commitments c
          where c.tenant_id=p_tenant_id
            and c.task_id=t.id
            and c.status in ('active','overdue')
          limit 1
        )
      )
      order by
        (t.due_at is null),
        t.due_at,
        t.priority desc,
        lower(t.title)
    ),
    '[]'::jsonb
  )
  into v_tasks
  from djm_os.tasks t
  left join public.players p
    on p.id=t.player_id
   and p.tenant_id=t.tenant_id
  left join djm_os.people pe
    on pe.id=t.person_id
   and pe.tenant_id=t.tenant_id
  left join djm_os.organisations o
    on o.id=t.organisation_id
   and o.tenant_id=t.tenant_id
  where t.tenant_id=p_tenant_id
    and t.owner_user_id=p_from_user_id
    and t.status='open';

  return jsonb_build_object(
    'available',true,
    'source',v_source,
    'candidates',v_candidates,
    'work',jsonb_build_object(
      'players',v_players,
      'recruitment_targets',v_prospects,
      'club_needs',v_needs,
      'deals',v_deals,
      'tasks',v_tasks
    ),
    'summary',jsonb_build_object(
      'players',jsonb_array_length(v_players),
      'recruitment_targets',jsonb_array_length(v_prospects),
      'club_needs',jsonb_array_length(v_needs),
      'deals',jsonb_array_length(v_deals),
      'tasks',jsonb_array_length(v_tasks),
      'total',
        jsonb_array_length(v_players)+
        jsonb_array_length(v_prospects)+
        jsonb_array_length(v_needs)+
        jsonb_array_length(v_deals)+
        jsonb_array_length(v_tasks)
    ),
    'truth_contract',jsonb_build_object(
      'selection',
        'Only explicitly selected accountable work moves. Unselected work stays with the current owner.',
      'commitments',
        'Active or overdue commitments linked to a selected task move with that task so task and commitment ownership stay aligned.',
      'player_requests',
        'Open player requests that are unassigned or owned by the source agent move with a selected player.',
      'personal_connections',
        'Personal calendars, provider connections, selected chats and personal connected accounts are never transferred.',
      'relationships',
        'Recorded relationship routes are evidence of agency access and are not treated as exclusive contact ownership.',
      'capacity',
        'Candidate workload is recorded ownership only. It is not a capacity score or performance ranking.'
    )
  );
end;
$function$;
create or replace function public.platform_server_team_handoff_apply(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_selection jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_selection jsonb:=coalesce(p_selection,'{}'::jsonb);
  v_player_ids uuid[]:='{}'::uuid[];
  v_prospect_ids uuid[]:='{}'::uuid[];
  v_need_ids uuid[]:='{}'::uuid[];
  v_deal_ids uuid[]:='{}'::uuid[];
  v_task_ids uuid[]:='{}'::uuid[];
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_expected integer;
  v_found integer;
  v_players_moved integer:=0;
  v_requests_moved integer:=0;
  v_prospects_moved integer:=0;
  v_needs_moved integer:=0;
  v_deals_moved integer:=0;
  v_tasks_moved integer:=0;
  v_commitments_moved integer:=0;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'management_access_required'
      using errcode='42501';
  end if;

  if p_from_user_id is null
     or p_to_user_id is null
     or p_from_user_id=p_to_user_id then
    raise exception 'handoff_users_invalid';
  end if;

  if not exists(
    select 1
    from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id
      and m.user_id=p_from_user_id
      and m.status='active'
      and m.role in (
        'owner',
        'admin',
        'agent',
        'operations',
        'scout'
      )
  ) then
    raise exception 'source_staff_not_found';
  end if;

  if not exists(
    select 1
    from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id
      and m.user_id=p_to_user_id
      and m.status='active'
      and m.role in (
        'owner',
        'admin',
        'agent',
        'operations',
        'scout'
      )
  ) then
    raise exception 'target_staff_not_found';
  end if;

  if length(coalesce(v_note,''))>500 then
    raise exception 'handoff_note_too_long';
  end if;

  if coalesce(jsonb_typeof(v_selection->'player_ids'),'array')<>'array'
     or coalesce(jsonb_typeof(v_selection->'recruitment_target_ids'),'array')<>'array'
     or coalesce(jsonb_typeof(v_selection->'club_need_ids'),'array')<>'array'
     or coalesce(jsonb_typeof(v_selection->'deal_ids'),'array')<>'array'
     or coalesce(jsonb_typeof(v_selection->'task_ids'),'array')<>'array' then
    raise exception 'handoff_selection_invalid';
  end if;
  select coalesce(
    array_agg(distinct x.value::uuid),
    '{}'::uuid[]
  )
  into v_player_ids
  from jsonb_array_elements_text(
    coalesce(
      v_selection->'player_ids',
      '[]'::jsonb
    )
  ) x(value);

  select coalesce(
    array_agg(distinct x.value::uuid),
    '{}'::uuid[]
  )
  into v_prospect_ids
  from jsonb_array_elements_text(
    coalesce(
      v_selection->'recruitment_target_ids',
      '[]'::jsonb
    )
  ) x(value);

  select coalesce(
    array_agg(distinct x.value::uuid),
    '{}'::uuid[]
  )
  into v_need_ids
  from jsonb_array_elements_text(
    coalesce(
      v_selection->'club_need_ids',
      '[]'::jsonb
    )
  ) x(value);

  select coalesce(
    array_agg(distinct x.value::uuid),
    '{}'::uuid[]
  )
  into v_deal_ids
  from jsonb_array_elements_text(
    coalesce(
      v_selection->'deal_ids',
      '[]'::jsonb
    )
  ) x(value);

  select coalesce(
    array_agg(distinct x.value::uuid),
    '{}'::uuid[]
  )
  into v_task_ids
  from jsonb_array_elements_text(
    coalesce(
      v_selection->'task_ids',
      '[]'::jsonb
    )
  ) x(value);

  if cardinality(v_player_ids)>200
     or cardinality(v_prospect_ids)>200
     or cardinality(v_need_ids)>200
     or cardinality(v_deal_ids)>200
     or cardinality(v_task_ids)>200 then
    raise exception 'handoff_selection_too_large';
  end if;

  if cardinality(v_player_ids)+
     cardinality(v_prospect_ids)+
     cardinality(v_need_ids)+
     cardinality(v_deal_ids)+
     cardinality(v_task_ids)=0 then
    raise exception 'handoff_selection_empty';
  end if;
  v_expected:=cardinality(v_player_ids);
  select count(*)::int
  into v_found
  from public.players p
  where p.tenant_id=p_tenant_id
    and p.id=any(v_player_ids)
    and p.primary_staff_user_id=p_from_user_id
    and coalesce(
      p.football_status,
      'active'
    ) not in ('retired','inactive');
  if v_found<>v_expected then
    raise exception 'handoff_player_selection_stale';
  end if;

  v_expected:=cardinality(v_prospect_ids);
  select count(*)::int
  into v_found
  from djm_os.scouting_prospects sp
  where sp.tenant_id=p_tenant_id
    and sp.id=any(v_prospect_ids)
    and sp.owner_user_id=p_from_user_id
    and sp.signed_player_id is null;
  if v_found<>v_expected then
    raise exception 'handoff_recruitment_selection_stale';
  end if;

  v_expected:=cardinality(v_need_ids);
  select count(*)::int
  into v_found
  from djm_os.club_needs n
  where n.tenant_id=p_tenant_id
    and n.id=any(v_need_ids)
    and n.owner_user_id=p_from_user_id
    and n.status='active';
  if v_found<>v_expected then
    raise exception 'handoff_club_need_selection_stale';
  end if;

  v_expected:=cardinality(v_deal_ids);
  select count(*)::int
  into v_found
  from djm_os.deal_rooms d
  where d.tenant_id=p_tenant_id
    and d.id=any(v_deal_ids)
    and d.owner_user_id=p_from_user_id
    and d.status='active';
  if v_found<>v_expected then
    raise exception 'handoff_deal_selection_stale';
  end if;

  v_expected:=cardinality(v_task_ids);
  select count(*)::int
  into v_found
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id
    and t.id=any(v_task_ids)
    and t.owner_user_id=p_from_user_id
    and t.status='open';
  if v_found<>v_expected then
    raise exception 'handoff_task_selection_stale';
  end if;
  update public.players p
  set
    primary_staff_user_id=p_to_user_id,
    updated_at=now()
  where p.tenant_id=p_tenant_id
    and p.id=any(v_player_ids);
  get diagnostics v_players_moved=row_count;

  update public.player_requests r
  set
    assigned_to_user_id=p_to_user_id,
    updated_at=now()
  where r.player_id=any(v_player_ids)
    and r.status='open'
    and (
      r.assigned_to_user_id is null
      or r.assigned_to_user_id=p_from_user_id
    );
  get diagnostics v_requests_moved=row_count;

  update djm_os.scouting_prospects sp
  set
    owner_user_id=p_to_user_id,
    updated_at=now()
  where sp.tenant_id=p_tenant_id
    and sp.id=any(v_prospect_ids);
  get diagnostics v_prospects_moved=row_count;

  update djm_os.club_needs n
  set
    owner_user_id=p_to_user_id,
    updated_at=now()
  where n.tenant_id=p_tenant_id
    and n.id=any(v_need_ids);
  get diagnostics v_needs_moved=row_count;

  update djm_os.deal_rooms d
  set
    owner_user_id=p_to_user_id,
    updated_at=now()
  where d.tenant_id=p_tenant_id
    and d.id=any(v_deal_ids);
  get diagnostics v_deals_moved=row_count;

  update djm_os.tasks t
  set
    owner_user_id=p_to_user_id,
    updated_at=now()
  where t.tenant_id=p_tenant_id
    and t.id=any(v_task_ids);
  get diagnostics v_tasks_moved=row_count;

  update platform.agency_commitments c
  set
    owner_user_id=p_to_user_id,
    updated_at=now()
  where c.tenant_id=p_tenant_id
    and c.task_id=any(v_task_ids)
    and c.status in ('active','overdue');
  get diagnostics v_commitments_moved=row_count;
  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  select
    p_tenant_id,
    'PLAYER_ASSIGNMENT_UPDATED',
    p_actor_user_id,
    id,
    jsonb_build_object(
      'player_id',id,
      'previous_assigned_to_user_id',
        p_from_user_id,
      'assigned_to_user_id',
        p_to_user_id,
      'handoff',true
    ),
    'team_handoff',
    1,
    now()
  from unnest(v_player_ids) id;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  select
    p_tenant_id,
    'RECRUITMENT_OWNER_UPDATED',
    p_actor_user_id,
    jsonb_build_object(
      'prospect_id',id,
      'previous_owner_user_id',
        p_from_user_id,
      'owner_user_id',
        p_to_user_id,
      'handoff',true
    ),
    'team_handoff',
    1,
    now()
  from unnest(v_prospect_ids) id;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  select
    p_tenant_id,
    'CLUB_NEED_OWNER_UPDATED',
    p_actor_user_id,
    n.organisation_id,
    jsonb_build_object(
      'club_need_id',n.id,
      'previous_owner_user_id',
        p_from_user_id,
      'owner_user_id',
        p_to_user_id,
      'handoff',true
    ),
    'team_handoff',
    1,
    now()
  from djm_os.club_needs n
  where n.tenant_id=p_tenant_id
    and n.id=any(v_need_ids);

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  select
    p_tenant_id,
    'OPPORTUNITY_OWNER_UPDATED',
    p_actor_user_id,
    d.organisation_id,
    jsonb_build_object(
      'opportunity_id',d.id,
      'previous_owner_user_id',
        p_from_user_id,
      'owner_user_id',
        p_to_user_id,
      'handoff',true
    ),
    'team_handoff',
    1,
    now()
  from djm_os.deal_rooms d
  where d.tenant_id=p_tenant_id
    and d.id=any(v_deal_ids);

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    player_id,
    person_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  select
    p_tenant_id,
    'TASK_OWNER_UPDATED',
    p_actor_user_id,
    t.player_id,
    t.person_id,
    t.organisation_id,
    jsonb_build_object(
      'task_id',t.id,
      'previous_owner_user_id',
        p_from_user_id,
      'owner_user_id',
        p_to_user_id,
      'handoff',true
    ),
    'team_handoff',
    1,
    now()
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id
    and t.id=any(v_task_ids);
  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'TEAM_HANDOFF_APPLIED',
    p_actor_user_id,
    jsonb_build_object(
      'from_user_id',p_from_user_id,
      'to_user_id',p_to_user_id,
      'player_ids',to_jsonb(v_player_ids),
      'recruitment_target_ids',
        to_jsonb(v_prospect_ids),
      'club_need_ids',to_jsonb(v_need_ids),
      'deal_ids',to_jsonb(v_deal_ids),
      'task_ids',to_jsonb(v_task_ids),
      'open_player_requests_moved',
        v_requests_moved,
      'linked_commitments_moved',
        v_commitments_moved,
      'note',v_note
    ),
    'team_handoff',
    1,
    now()
  );

  return jsonb_build_object(
    'applied',true,
    'from_user_id',p_from_user_id,
    'to_user_id',p_to_user_id,
    'moved',jsonb_build_object(
      'players',v_players_moved,
      'open_player_requests',
        v_requests_moved,
      'recruitment_targets',
        v_prospects_moved,
      'club_needs',v_needs_moved,
      'deals',v_deals_moved,
      'tasks',v_tasks_moved,
      'linked_commitments',
        v_commitments_moved
    ),
    'note',v_note
  );
end;
$function$;

create or replace function public.redream_team_handoff_preview(
  p_from_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_tenant uuid:=private.redream_request_tenant();
begin
  if v_user is null then
    raise exception 'authentication_required'
      using errcode='42501';
  end if;

  return public.platform_server_team_handoff_preview(
    v_tenant,
    v_user,
    p_from_user_id
  );
end;
$function$;

create or replace function public.redream_team_handoff_apply(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_selection jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_tenant uuid:=private.redream_request_tenant();
begin
  if v_user is null then
    raise exception 'authentication_required'
      using errcode='42501';
  end if;

  return public.platform_server_team_handoff_apply(
    v_tenant,
    v_user,
    p_from_user_id,
    p_to_user_id,
    p_selection,
    p_note
  );
end;
$function$;
revoke all on function
  public.platform_server_team_handoff_preview(
    uuid,uuid,uuid
  )
from public,anon,authenticated;

revoke all on function
  public.platform_server_team_handoff_apply(
    uuid,uuid,uuid,uuid,jsonb,text
  )
from public,anon,authenticated;

grant execute on function
  public.platform_server_team_handoff_preview(
    uuid,uuid,uuid
  )
to service_role;

grant execute on function
  public.platform_server_team_handoff_apply(
    uuid,uuid,uuid,uuid,jsonb,text
  )
to service_role;

revoke all on function
  public.redream_team_handoff_preview(uuid)
from public,anon;

revoke all on function
  public.redream_team_handoff_apply(
    uuid,uuid,jsonb,text
  )
from public,anon;

grant execute on function
  public.redream_team_handoff_preview(uuid)
to authenticated,service_role;

grant execute on function
  public.redream_team_handoff_apply(
    uuid,uuid,jsonb,text
  )
to authenticated,service_role;

notify pgrst,'reload schema';

commit;
