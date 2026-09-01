-- DJM Opportunities recruitment workspace v1
-- Keeps club needs staff-only and turns each need into an operational recruitment brief.

create or replace function public.djm_market_needs_v2(p_status text default null::text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.is_live desc, x.priority desc, x.updated_at desc)
    from (
      select
        n.id,
        n.organisation_id,
        o.name as organisation_name,
        o.country as organisation_country,
        o.website_url,
        n.source_person_id,
        pe.full_name as source_person_name,
        (
          select e.role_title
          from djm_os.employments e
          where e.person_id = n.source_person_id
            and e.organisation_id = n.organisation_id
          order by e.is_current desc, e.updated_at desc
          limit 1
        ) as source_person_role,
        (
          select cm.value
          from djm_os.contact_methods cm
          where cm.person_id = n.source_person_id
            and cm.channel = 'email'
          order by cm.is_primary desc, cm.updated_at desc
          limit 1
        ) as source_person_email,
        (
          select cm.value
          from djm_os.contact_methods cm
          where cm.person_id = n.source_person_id
            and cm.channel = 'whatsapp'
          order by cm.is_primary desc, cm.updated_at desc
          limit 1
        ) as source_person_whatsapp,
        n.owner_user_id,
        tm.display_name as owner_name,
        n.title,
        n.position as need_position,
        n.secondary_position,
        n.preferred_foot,
        n.min_age,
        n.max_age,
        n.min_height_cm,
        n.transfer_type,
        n.transfer_budget,
        n.salary_budget,
        n.currency,
        n.salary_period,
        n.salary_tax_basis,
        n.nationality_preferences,
        n.passport_requirements,
        n.foreign_player_notes,
        n.playing_style,
        n.profile_notes,
        n.registration_notes,
        n.raw_request,
        n.source_context,
        n.received_at,
        n.priority,
        n.need_type,
        n.prediction_probability,
        n.prediction_basis,
        n.status as need_status,
        n.confidence,
        n.confirmed_at,
        n.expires_at,
        n.created_at,
        n.updated_at,
        n.status in ('active', 'open', 'confirmed') as is_live,
        (
          select count(*)
          from djm_os.player_matches m
          where m.club_need_id = n.id
            and m.status not in ('dismissed', 'rejected')
        ) as match_count,
        (
          select max(m.overall_score)
          from djm_os.player_matches m
          where m.club_need_id = n.id
            and m.status not in ('dismissed', 'rejected')
        ) as top_match_score,
        (
          select count(*)
          from djm_os.tasks t
          where t.club_need_id = n.id
            and t.status not in ('done', 'completed', 'cancelled')
        ) as open_task_count,
        (
          select min(t.due_at)
          from djm_os.tasks t
          where t.club_need_id = n.id
            and t.status not in ('done', 'completed', 'cancelled')
            and t.due_at is not null
        ) as next_task_due_at
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people pe on pe.id = n.source_person_id
      left join djm_os.team_members tm on tm.user_id = n.owner_user_id
      where p_status is null or p_status = '' or n.status = p_status
    ) x
  ), '[]'::jsonb);
end
$function$;

create or replace function public.djm_market_need_workspace(p_need_id uuid)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if not exists(select 1 from djm_os.club_needs n where n.id = p_need_id) then
    raise exception 'Club need not found';
  end if;

  select jsonb_build_object(
    'need', (
      select
        to_jsonb(n)
        || jsonb_build_object(
          'need_position', n.position,
          'need_status', n.status,
          'organisation_name', o.name,
          'organisation_country', o.country,
          'website_url', o.website_url,
          'source_person_name', pe.full_name,
          'source_person_role', (
            select e.role_title
            from djm_os.employments e
            where e.person_id = n.source_person_id
              and e.organisation_id = n.organisation_id
            order by e.is_current desc, e.updated_at desc
            limit 1
          ),
          'source_person_email', (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = n.source_person_id
              and cm.channel = 'email'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          ),
          'source_person_whatsapp', (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = n.source_person_id
              and cm.channel = 'whatsapp'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          )
        )
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people pe on pe.id = n.source_person_id
      where n.id = p_need_id
    ),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.route_score desc, x.full_name)
      from (
        select
          p.id,
          p.full_name,
          e.role_title,
          e.department,
          p.country,
          p.city,
          (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = p.id and cm.channel = 'whatsapp'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          ) as whatsapp,
          (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = p.id and cm.channel = 'email'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          ) as email,
          coalesce((
            select max(r.strength_score)
            from djm_os.relationships r
            where r.person_id = p.id
          ), 0)::int as relationship_strength,
          coalesce((
            select max(r.access_score)
            from djm_os.relationships r
            where r.person_id = p.id
          ), 0)::int as access_score,
          coalesce((
            select max(r.strength_score + r.access_score)
            from djm_os.relationships r
            where r.person_id = p.id
          ), 0)::int as route_score,
          (
            select max(i.occurred_at)
            from djm_os.interactions i
            where i.person_id = p.id
          ) as last_interaction_at
        from djm_os.club_needs n
        join djm_os.employments e
          on e.organisation_id = n.organisation_id
         and e.is_current = true
        join djm_os.people p on p.id = e.person_id
        where n.id = p_need_id
          and coalesce(p.person_type, 'club_contact') <> 'player'
      ) x
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.is_closed, x.due_at nulls last, x.priority desc, x.created_at desc)
      from (
        select
          t.id,
          t.title,
          t.task_type,
          t.owner_user_id,
          tm.display_name as owner_name,
          t.person_id,
          p.full_name as person_name,
          t.organisation_id,
          o.name as organisation_name,
          t.club_need_id,
          t.due_at,
          t.status,
          t.priority,
          t.source,
          t.created_at,
          t.completed_at,
          t.updated_at,
          t.status in ('done', 'completed', 'cancelled') as is_closed
        from djm_os.tasks t
        left join djm_os.team_members tm on tm.user_id = t.owner_user_id
        left join djm_os.people p on p.id = t.person_id
        left join djm_os.organisations o on o.id = t.organisation_id
        where t.club_need_id = p_need_id
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

create or replace function public.djm_market_upsert_need_task(
  p_need_id uuid,
  p_title text,
  p_task_id uuid default null::uuid,
  p_due_at timestamp with time zone default null::timestamp with time zone,
  p_person_id uuid default null::uuid,
  p_priority smallint default 3,
  p_status text default 'open'::text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_task_id uuid;
  v_org_id uuid;
  v_source_person_id uuid;
  v_person_id uuid;
  v_status text;
  v_existing_owner uuid;
  v_existing_need uuid;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_title is null or length(trim(p_title)) < 2 then
    raise exception 'Task title is required';
  end if;

  if p_priority is null or p_priority < 1 or p_priority > 5 then
    raise exception 'Priority must be between 1 and 5';
  end if;

  v_status := lower(trim(coalesce(p_status, 'open')));
  if v_status not in ('open', 'in_progress', 'snoozed', 'done', 'completed', 'cancelled') then
    raise exception 'Invalid task status';
  end if;

  select n.organisation_id, n.source_person_id
    into v_org_id, v_source_person_id
  from djm_os.club_needs n
  where n.id = p_need_id;

  if not found then
    raise exception 'Club need not found';
  end if;

  v_person_id := coalesce(p_person_id, v_source_person_id);

  if v_person_id is not null
     and v_person_id is distinct from v_source_person_id
     and not exists(
       select 1
       from djm_os.employments e
       where e.person_id = v_person_id
         and e.organisation_id = v_org_id
         and e.is_current = true
     ) then
    raise exception 'Task contact must be linked to this club';
  end if;

  if p_task_id is null then
    insert into djm_os.tasks(
      title,
      task_type,
      owner_user_id,
      person_id,
      organisation_id,
      club_need_id,
      due_at,
      status,
      priority,
      source,
      completed_at
    ) values (
      trim(p_title),
      'club_need_followup',
      auth.uid(),
      v_person_id,
      v_org_id,
      p_need_id,
      p_due_at,
      v_status,
      p_priority,
      'opportunity_os',
      case when v_status in ('done', 'completed') then now() else null end
    ) returning id into v_task_id;
  else
    select t.owner_user_id, t.club_need_id
      into v_existing_owner, v_existing_need
    from djm_os.tasks t
    where t.id = p_task_id;

    if not found then
      raise exception 'Task not found';
    end if;

    if v_existing_need is distinct from p_need_id then
      raise exception 'Task does not belong to this club need';
    end if;

    if v_existing_owner is not null and v_existing_owner <> auth.uid() then
      raise exception 'Only the task owner can edit this task';
    end if;

    update djm_os.tasks
    set
      title = trim(p_title),
      task_type = 'club_need_followup',
      owner_user_id = coalesce(v_existing_owner, auth.uid()),
      person_id = v_person_id,
      organisation_id = v_org_id,
      club_need_id = p_need_id,
      due_at = p_due_at,
      status = v_status,
      priority = p_priority,
      source = 'opportunity_os',
      completed_at = case when v_status in ('done', 'completed') then coalesce(completed_at, now()) else null end,
      updated_at = now()
    where id = p_task_id
    returning id into v_task_id;
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    case when p_task_id is null then 'CLUB_NEED_TASK_CREATED' else 'CLUB_NEED_TASK_UPDATED' end,
    auth.uid(),
    v_org_id,
    v_person_id,
    jsonb_build_object(
      'task_id', v_task_id,
      'club_need_id', p_need_id,
      'due_at', p_due_at,
      'status', v_status,
      'priority', p_priority
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'task_id', v_task_id,
    'club_need_id', p_need_id,
    'status', v_status
  );
end
$function$;

revoke all on function public.djm_market_need_workspace(uuid) from public;
revoke all on function public.djm_market_need_workspace(uuid) from anon;
grant execute on function public.djm_market_need_workspace(uuid) to authenticated;

revoke all on function public.djm_market_upsert_need_task(uuid, text, uuid, timestamp with time zone, uuid, smallint, text) from public;
revoke all on function public.djm_market_upsert_need_task(uuid, text, uuid, timestamp with time zone, uuid, smallint, text) from anon;
grant execute on function public.djm_market_upsert_need_task(uuid, text, uuid, timestamp with time zone, uuid, smallint, text) to authenticated;

comment on function public.djm_market_need_workspace(uuid) is
  'Staff-only recruitment workspace for one club need, its current club contacts and need-linked tasks.';

comment on function public.djm_market_upsert_need_task(uuid, text, uuid, timestamp with time zone, uuid, smallint, text) is
  'Creates or edits a DJM follow-up task tied to a specific club need.';
