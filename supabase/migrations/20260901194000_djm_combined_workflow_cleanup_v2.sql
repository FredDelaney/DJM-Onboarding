-- DJM combined workflow cleanup v2
-- Safe Home completion, proper player reply semantics, signed-player promotion
-- identity unification, Tell DJM discard, and better Home routing for player tasks.

create or replace function public.djm_tell_delete_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_capture djm_os.captures%rowtype;
  v_applied_count integer := 0;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select *
  into v_capture
  from djm_os.captures c
  where c.id = p_capture_id
  for update;

  if v_capture.id is null then
    raise exception 'Tell DJM update not found';
  end if;

  if v_capture.processing_version is distinct from 'tell_djm_v1' then
    raise exception 'Only Tell DJM updates can be deleted here';
  end if;

  if v_capture.status in ('queued','processing','retry') then
    raise exception 'This Tell DJM update is still processing';
  end if;

  if not (
    v_capture.submitted_by = v_uid
    or exists (
      select 1
      from djm_os.tell_djm_permissions p
      where p.user_id = v_uid
        and p.permission_scope = 'full'
        and p.is_enabled = true
    )
  ) then
    raise exception 'You do not have access to delete this Tell DJM update';
  end if;

  select count(*)
  into v_applied_count
  from djm_os.tell_djm_actions a
  where a.capture_id = p_capture_id
    and a.status = 'applied';

  if v_applied_count > 0 then
    raise exception 'This Tell DJM update has already changed DJM. Undo the applied updates before deleting it.';
  end if;

  delete from djm_os.captures
  where id = p_capture_id;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'TELL_DJM_CAPTURE_DELETED',
    v_uid,
    jsonb_build_object(
      'capture_id', p_capture_id,
      'previous_status', v_capture.status,
      'capture_type', v_capture.capture_type
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'deleted', true,
    'capture_id', p_capture_id
  );
end;
$$;

revoke all on function public.djm_tell_delete_capture(uuid) from public, anon;
grant execute on function public.djm_tell_delete_capture(uuid) to authenticated;


create or replace function djm_os.complete_player_request_internal(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_player_id uuid;
  v_updated integer := 0;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = v_uid
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select r.player_id
  into v_player_id
  from public.player_requests r
  where r.id = p_request_id;

  if v_player_id is null then
    raise exception 'Player request not found';
  end if;

  update public.player_requests
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_request_id
    and status not in ('completed','dismissed');

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'request_id', p_request_id,
    'player_id', v_player_id,
    'completed', v_updated > 0
  );
end;
$$;

revoke all on function djm_os.complete_player_request_internal(uuid) from public, anon;
grant execute on function djm_os.complete_player_request_internal(uuid) to authenticated;


create or replace function public.djm_complete_player_request(p_request_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select djm_os.complete_player_request_internal(p_request_id);
$$;

revoke all on function public.djm_complete_player_request(uuid) from public, anon;
grant execute on function public.djm_complete_player_request(uuid) to authenticated;


create or replace function public.djm_player_send_reply(
  p_player_id uuid,
  p_request_id uuid,
  p_title text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_incoming public.player_requests%rowtype;
  v_reply_id uuid;
  v_candidate_task_id uuid;
  v_candidate_task_count integer := 0;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = v_uid
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if nullif(trim(coalesce(p_message,'')),'') is null then
    raise exception 'Reply message is required';
  end if;

  select *
  into v_incoming
  from public.player_requests r
  where r.id = p_request_id
    and r.player_id = p_player_id
  for update;

  if v_incoming.id is null then
    raise exception 'Player message not found';
  end if;

  if v_incoming.created_by is not null
     or v_incoming.request_type not in ('message','signal') then
    raise exception 'This item is not an incoming player message';
  end if;

  if v_incoming.status = 'completed' then
    raise exception 'This player message has already been handled';
  end if;

  insert into public.player_requests(
    player_id,
    title,
    message,
    request_type,
    status,
    created_by,
    completed_at
  )
  values (
    p_player_id,
    coalesce(
      nullif(trim(coalesce(p_title,'')),''),
      'Reply from DJM'
    ),
    trim(p_message),
    'message',
    'completed',
    v_uid,
    now()
  )
  returning id into v_reply_id;

  update public.player_requests
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_request_id;

  select count(*)
  into v_candidate_task_count
  from djm_os.tasks t
  where t.player_id = p_player_id
    and t.status not in ('done','completed','cancelled')
    and t.task_type = 'tell_djm'
    and t.source like 'tell_djm:%'
    and lower(t.title) ~ '(catch[ -]?up|follow[ -]?up|reply|message|contact|speak|call|check[ -]?in)';

  -- Auto-complete only when the reply maps to one unambiguous
  -- communication follow-up. If there are several, leave them visible
  -- so the user can choose the correct one from Home.
  if v_candidate_task_count = 1 then
    select t.id
    into v_candidate_task_id
    from djm_os.tasks t
    where t.player_id = p_player_id
      and t.status not in ('done','completed','cancelled')
      and t.task_type = 'tell_djm'
      and t.source like 'tell_djm:%'
      and lower(t.title) ~ '(catch[ -]?up|follow[ -]?up|reply|message|contact|speak|call|check[ -]?in)'
    limit 1;

    update djm_os.tasks
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_candidate_task_id;
  else
    v_candidate_task_id := null;
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'PLAYER_MESSAGE_REPLIED',
    v_uid,
    p_player_id,
    jsonb_build_object(
      'incoming_request_id', p_request_id,
      'reply_request_id', v_reply_id,
      'auto_completed_task_id', v_candidate_task_id,
      'communication_task_candidates', v_candidate_task_count
    ),
    'player_inbox',
    1,
    now()
  );

  return jsonb_build_object(
    'player_id', p_player_id,
    'incoming_request_id', p_request_id,
    'reply_request_id', v_reply_id,
    'auto_completed_task_id', v_candidate_task_id,
    'communication_task_candidates', v_candidate_task_count
  );
end;
$$;

revoke all on function public.djm_player_send_reply(uuid,uuid,text,text) from public, anon;
grant execute on function public.djm_player_send_reply(uuid,uuid,text,text) to authenticated;


create or replace function public.djm_recruitment_promote_to_signed_player(p_prospect_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  sp djm_os.scouting_prospects%rowtype;
  v_player_id uuid;
  v_first text;
  v_last text;
  v_space int;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select *
  into sp
  from djm_os.scouting_prospects
  where id = p_prospect_id
  for update;

  if sp.id is null then
    raise exception 'Recruitment target not found';
  end if;

  if sp.signed_player_id is not null then
    return jsonb_build_object(
      'player_id', sp.signed_player_id,
      'already_promoted', true
    );
  end if;

  if sp.recruitment_stage <> 'signed' then
    raise exception 'Target must be marked signed before promotion';
  end if;

  v_space := strpos(trim(sp.full_name), ' ');
  if v_space > 0 then
    v_first := left(trim(sp.full_name), v_space - 1);
    v_last := substr(trim(sp.full_name), v_space + 1);
  else
    v_first := trim(sp.full_name);
    v_last := null;
  end if;

  insert into public.players(
    first_name,
    last_name,
    date_of_birth,
    nationalities,
    preferred_foot,
    primary_position,
    secondary_positions,
    current_club,
    current_country,
    contract_expiry,
    transfermarkt_url,
    wyscout_url,
    instagram_url,
    onboarding_status,
    verification_status,
    agency_priority,
    next_action,
    review_required_at,
    review_reason
  )
  values (
    v_first,
    v_last,
    sp.date_of_birth,
    case
      when nullif(trim(coalesce(sp.nationality,'')),'') is null then '{}'::text[]
      else array[trim(sp.nationality)]
    end,
    sp.preferred_foot,
    sp.primary_position,
    coalesce(sp.secondary_positions,'{}'::text[]),
    sp.current_club,
    sp.current_country,
    sp.contract_expiry,
    sp.transfermarkt_url,
    sp.wyscout_url,
    sp.instagram_url,
    'not_started',
    'unverified',
    'high',
    'Complete DJM Player onboarding',
    now(),
    'Promoted from DJM Recruitment after signing'
  )
  returning id into v_player_id;

  -- Inserting the Signed Player creates a temporary player-only universal
  -- subject. When this Recruitment target already has a prospect subject,
  -- remove only that new duplicate before linking the prospect to the player.
  delete from djm_os.football_intelligence_subjects created
  where created.player_id = v_player_id
    and created.prospect_id is null
    and exists (
      select 1
      from djm_os.football_intelligence_subjects existing
      where existing.prospect_id = p_prospect_id
        and existing.id <> created.id
    );

  update djm_os.scouting_prospects
  set signed_player_id = v_player_id,
      linked_player_id = v_player_id,
      signed_at = coalesce(signed_at,now()),
      next_action_at = null,
      updated_at = now()
  where id = p_prospect_id;

  update djm_os.tasks
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where source = ('recruitment:' || p_prospect_id::text)
    and status not in ('completed','cancelled');

  insert into djm_os.events(
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'RECRUITMENT_PROMOTED_TO_SIGNED_PLAYER',
    (select auth.uid()),
    v_player_id,
    jsonb_build_object(
      'prospect_id', p_prospect_id,
      'player_name', sp.full_name
    ),
    'recruitment',
    1,
    now()
  );

  return jsonb_build_object(
    'player_id', v_player_id,
    'prospect_id', p_prospect_id,
    'already_promoted', false,
    'onboarding_status', 'not_started'
  );
end;
$$;


create or replace function public.djm_command_center()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_focus jsonb;
  v_opportunities jsonb;
  v_quality jsonb;
  v_summary jsonb;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id = v_uid
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select jsonb_build_object(
    'open_tasks',(
      select count(*)
      from djm_os.tasks t
      where t.status not in ('done','completed','cancelled')
        and (t.owner_user_id is null or t.owner_user_id = v_uid)
    ),
    'overdue_tasks',(
      select count(*)
      from djm_os.tasks t
      where t.status not in ('done','completed','cancelled')
        and (t.owner_user_id is null or t.owner_user_id = v_uid)
        and t.due_at < now()
    ),
    'reviews',(
      select count(*)
      from djm_os.review_items r
      where r.status = 'open'
        and (r.owner_user_id is null or r.owner_user_id = v_uid)
    ),
    'meetings_7d',(
      select count(*)
      from djm_os.meetings m
      where m.owner_user_id = v_uid
        and m.status not in ('cancelled','no_show')
        and m.starts_at >= now()
        and m.starts_at < now() + interval '7 days'
    ),
    'club_contacts',(
      select count(*)
      from djm_os.people p
      where coalesce(p.person_type,'club_contact') <> 'player'
    ),
    'clubs',(
      select count(*)
      from djm_os.organisations o
      where o.organisation_type = 'club'
    ),
    'recruitment_active',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage not in ('signed','declined','lost')
    ),
    'recruitment_hot',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')
    ),
    'active_needs',(
      select count(*)
      from djm_os.club_needs n
      where n.status in ('active','open','confirmed')
    ),
    'needs_without_matches',(
      select count(*)
      from djm_os.club_needs n
      where n.status in ('active','open','confirmed')
        and not exists(
          select 1
          from djm_os.player_matches m
          where m.club_need_id = n.id
            and m.status not in ('dismissed','rejected')
        )
    ),
    'active_deals',(
      select count(*)
      from djm_os.deal_rooms d
      where d.status = 'active'
    )
  )
  into v_summary;

  with focus_items as (
    select
      'review'::text kind,
      r.id,
      r.title,
      coalesce(r.detail,'Needs a quick human check') subtitle,
      r.created_at action_at,
      98::int score,
      '/network'::text href,
      null::text action,
      r.created_at created_at
    from djm_os.review_items r
    where r.status = 'open'
      and (r.owner_user_id is null or r.owner_user_id = v_uid)

    union all

    select
      'task',
      t.id,
      t.title,
      concat_ws(
        ' · ',
        nullif(p.full_name,''),
        nullif(concat_ws(' ',pl.first_name,pl.last_name),''),
        nullif(o.name,''),
        case when t.due_at < now() then 'Overdue' else null end
      ),
      t.due_at,
      least(
        100,
        55
        + coalesce(t.priority,3) * 5
        + case
            when t.due_at < now() then 20
            when t.due_at < now() + interval '24 hours' then 10
            else 0
          end
      )::int,
      case
        when t.source like 'recruitment:%'
          then '/recruitment/' || replace(t.source,'recruitment:','')
        when t.player_id is not null
          then '/admin/players/' || t.player_id::text || '#inbox'
        when t.person_id is not null
          then '/network/contacts/' || t.person_id::text
        when t.organisation_id is not null
          then '/network/clubs/' || t.organisation_id::text
        else '/network'
      end,
      'complete',
      t.created_at
    from djm_os.tasks t
    left join djm_os.people p on p.id = t.person_id
    left join public.players pl on pl.id = t.player_id
    left join djm_os.organisations o on o.id = t.organisation_id
    where t.status not in ('done','completed','cancelled')
      and (t.owner_user_id is null or t.owner_user_id = v_uid)

    union all

    select
      'recruitment',
      sp.id,
      'Recruitment · ' || sp.full_name,
      concat_ws(
        ' · ',
        nullif(sp.current_club,''),
        nullif(sp.primary_position,''),
        replace(coalesce(sp.recruitment_stage,'identified'),'_',' ')
      ),
      sp.next_action_at,
      least(
        100,
        45
        + coalesce(sp.recruitment_priority,3) * 8
        + case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end
        + case when sp.next_action_at < now() then 15 else 0 end
      )::int,
      '/recruitment/' || sp.id::text,
      null,
      sp.created_at
    from djm_os.scouting_prospects sp
    where sp.linked_player_id is null
      and sp.recruitment_stage not in ('signed','declined','lost','paused')
      and (sp.owner_user_id is null or sp.owner_user_id = v_uid)
      and (
        sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')
        or sp.next_action_at is null
        or sp.next_action_at < now() + interval '3 days'
        or (sp.recruitment_priority >= 4 and sp.first_contact_at is null)
      )
      and not exists(
        select 1
        from djm_os.tasks t
        where t.source = 'recruitment:' || sp.id::text
          and t.status not in ('done','completed','cancelled')
      )

    union all

    select
      'meeting',
      m.id,
      'Meeting · ' || m.title,
      concat_ws(' · ',nullif(p.full_name,''),nullif(o.name,'')),
      m.starts_at,
      case when m.starts_at < now() + interval '24 hours' then 90 else 72 end,
      case
        when m.person_id is not null then '/network/contacts/' || m.person_id::text
        when m.organisation_id is not null then '/network/clubs/' || m.organisation_id::text
        else '/network'
      end,
      null,
      m.created_at
    from djm_os.meetings m
    left join djm_os.people p on p.id = m.person_id
    left join djm_os.organisations o on o.id = m.organisation_id
    where m.owner_user_id = v_uid
      and m.status not in ('cancelled','no_show')
      and m.starts_at >= now()
      and m.starts_at < now() + interval '7 days'

    union all

    select
      'need',
      n.id,
      'Club need · ' || coalesce(n.position,n.title),
      o.name
        || case
             when not exists(
               select 1
               from djm_os.player_matches pm
               where pm.club_need_id = n.id
                 and pm.status not in ('dismissed','rejected')
             )
             then ' · No signed-player match yet'
             else ''
           end,
      coalesce(n.updated_at,n.created_at),
      case
        when not exists(
          select 1
          from djm_os.player_matches pm
          where pm.club_need_id = n.id
            and pm.status not in ('dismissed','rejected')
        )
        then 76
        else 58
      end,
      '/market',
      null,
      n.created_at
    from djm_os.club_needs n
    join djm_os.organisations o on o.id = n.organisation_id
    where n.status in ('active','open','confirmed')

    union all

    select
      'deal',
      d.id,
      'Deal · ' || d.title,
      concat_ws(
        ' · ',
        nullif(o.name,''),
        replace(coalesce(d.stage,''),'_',' '),
        case when d.primary_blocker is not null then 'Blocker: ' || d.primary_blocker else null end
      ),
      d.next_action_at,
      least(
        100,
        70
        + coalesce(d.probability,30) / 4
        + case when d.next_action_at < now() then 10 else 0 end
      )::int,
      '/market/deals/' || d.id::text,
      null,
      d.created_at
    from djm_os.deal_rooms d
    left join djm_os.organisations o on o.id = d.organisation_id
    where d.status = 'active'
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(x)
      order by x.score desc,x.action_at asc nulls last,x.created_at desc
    ),
    '[]'::jsonb
  )
  into v_focus
  from (
    select *
    from focus_items
    order by score desc,action_at asc nulls last,created_at desc
    limit 16
  ) x;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.top_match_score desc nulls last,x.updated_at desc),
    '[]'::jsonb
  )
  into v_opportunities
  from (
    select
      n.id,
      n.title,
      n.position,
      n.organisation_id,
      o.name organisation_name,
      n.updated_at,
      count(pm.id) filter(where pm.status not in ('dismissed','rejected')) match_count,
      max(pm.overall_score) filter(where pm.status not in ('dismissed','rejected')) top_match_score
    from djm_os.club_needs n
    join djm_os.organisations o on o.id = n.organisation_id
    left join djm_os.player_matches pm on pm.club_need_id = n.id
    where n.status in ('active','open','confirmed')
    group by n.id,o.name
    order by
      max(pm.overall_score) filter(where pm.status not in ('dismissed','rejected')) desc nulls last,
      n.updated_at desc
    limit 10
  ) x;

  select jsonb_build_object(
    'contacts_missing_club',(
      select count(*)
      from djm_os.people p
      where coalesce(p.person_type,'club_contact') <> 'player'
        and not exists(
          select 1
          from djm_os.employments e
          where e.person_id = p.id
            and e.is_current = true
        )
    ),
    'contacts_missing_role',(
      select count(*)
      from djm_os.people p
      where coalesce(p.person_type,'club_contact') <> 'player'
        and exists(
          select 1
          from djm_os.employments e
          where e.person_id = p.id
            and e.is_current = true
            and nullif(trim(coalesce(e.role_title,'')),'') is null
        )
    ),
    'recruitment_missing_transfermarkt',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage not in ('signed','declined','lost')
        and nullif(trim(coalesce(sp.transfermarkt_url,'')),'') is null
    ),
    'recruitment_missing_contact',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage not in ('signed','declined','lost')
        and nullif(trim(coalesce(sp.whatsapp,'')),'') is null
        and nullif(trim(coalesce(sp.email,'')),'') is null
        and nullif(trim(coalesce(sp.instagram_url,'')),'') is null
    ),
    'open_reviews',(
      select count(*)
      from djm_os.review_items r
      where r.status = 'open'
    ),
    'stale_needs',(
      select count(*)
      from djm_os.club_needs n
      where n.status in ('active','open','confirmed')
        and n.updated_at < now() - interval '21 days'
    )
  )
  into v_quality;

  return jsonb_build_object(
    'generated_at',now(),
    'summary',v_summary,
    'focus',v_focus,
    'opportunities',v_opportunities,
    'quality',v_quality,
    'automation',public.djm_automation_health()
  );
end;
$$;
