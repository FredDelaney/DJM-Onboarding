create unique index if not exists redream_tasks_open_deal_followup_uidx
on djm_os.tasks(tenant_id,source)
where task_type='deal_followup'
  and status='open'
  and source is not null;

alter function public.platform_server_prepare_deal_step(
  uuid,uuid,text,uuid,jsonb
) rename to platform_server_prepare_deal_step_core_v2;

create or replace function public.platform_server_prepare_deal_step(
  p_tenant_id uuid,
  p_deal_room_id uuid,
  p_step_type text,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
  v_deal djm_os.deal_rooms%rowtype;
  v_owner uuid;
  v_owner_name text;
  v_candidates jsonb:=null;
begin
  if p_step_type='set_next_action' then
    select *
    into v_deal
    from djm_os.deal_rooms d
    where d.id=p_deal_room_id
      and d.tenant_id=p_tenant_id
      and d.status='active';

    if not found then
      raise exception 'active_deal_not_found_for_tenant';
    end if;

    v_owner:=v_deal.owner_user_id;

    if v_owner is null
       or not exists(
         select 1
         from platform.tenant_memberships m
         where m.tenant_id=p_tenant_id
           and m.user_id=v_owner
           and m.status='active'
           and m.role in ('owner','admin','agent','scout','operations')
       ) then
      v_result:=public.platform_server_prepare_deal_step_core_v2(
        p_tenant_id,
        p_deal_room_id,
        'assign_owner',
        p_actor_user_id,
        p_input
      );

      v_candidates:=public.platform_server_deal_owner_candidates(
        p_tenant_id,
        p_deal_room_id,
        10
      );

      return v_result || jsonb_build_object(
        'ownership_required_first',true,
        'required_inputs',jsonb_build_array('owner_user_id'),
        'owner_candidates',v_candidates,
        'reminder_truth',
        'Assign one active agency user before recording a dated follow-up.'
      );
    end if;
  end if;

  v_result:=public.platform_server_prepare_deal_step_core_v2(
    p_tenant_id,
    p_deal_room_id,
    p_step_type,
    p_actor_user_id,
    p_input
  );

  if coalesce(v_result->>'action_type','')<>'set_deal_next_action' then
    return v_result;
  end if;

  if v_deal.id is null then
    select *
    into v_deal
    from djm_os.deal_rooms d
    where d.id=p_deal_room_id
      and d.tenant_id=p_tenant_id
      and d.status='active';

    if not found then
      raise exception 'active_deal_not_found_for_tenant';
    end if;

    v_owner:=v_deal.owner_user_id;
  end if;

  select nullif(trim(tm.display_name),'')
  into v_owner_name
  from djm_os.team_members tm
  where tm.user_id=v_owner
    and tm.is_active
  limit 1;

  return v_result || jsonb_build_object(
    'required_inputs',
      case
        when v_result->>'status'='needs_input'
          then jsonb_build_array('next_action_text','next_action_at')
        else coalesce(v_result->'required_inputs','[]'::jsonb)
      end,
    'reminder_owner_user_id',v_owner,
    'reminder_owner_name',coalesce(v_owner_name,'Responsible user'),
    'reminder_assignment','deal_owner',
    'reminder_truth',
      'The dated follow-up becomes one open task owned by the assigned deal owner.'
  );
end;
$function$;

revoke all on function public.platform_server_prepare_deal_step(
  uuid,uuid,text,uuid,jsonb
) from public,anon,authenticated;

revoke all on function public.platform_server_prepare_deal_step_core_v2(
  uuid,uuid,text,uuid,jsonb
) from public,anon,authenticated;

grant execute on function public.platform_server_prepare_deal_step(
  uuid,uuid,text,uuid,jsonb
) to postgres,service_role;

grant execute on function public.platform_server_prepare_deal_step_core_v2(
  uuid,uuid,text,uuid,jsonb
) to postgres,service_role;

alter function public.platform_server_execute_agency_action(
  uuid,uuid
) rename to platform_server_execute_agency_action_core_v10;

create or replace function public.platform_server_execute_agency_action(
  p_proposal_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_result jsonb;
  v_deal djm_os.deal_rooms%rowtype;
  v_task djm_os.tasks%rowtype;
  v_owner uuid;
  v_source text;
  v_next_text text;
  v_next_at timestamptz;
  v_task_before jsonb;
  v_task_after jsonb;
begin
  select *
  into v_p
  from platform.agency_action_proposals
  where id=p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found';
  end if;

  if v_p.action_type<>'set_deal_next_action' then
    return public.platform_server_execute_agency_action_core_v10(
      p_proposal_id,
      p_actor_user_id
    );
  end if;

  if v_p.status='applied' then
    v_result:=public.platform_server_execute_agency_action_core_v10(
      p_proposal_id,
      p_actor_user_id
    );

    return v_result || jsonb_build_object(
      'follow_up_task_id',
        v_p.verification_json->>'follow_up_task_id',
      'follow_up_owner_user_id',
        v_p.verification_json->>'follow_up_owner_user_id'
    );
  end if;

  v_source:='redream:deal_followup:'||v_p.target_id::text;

  select *
  into v_task
  from djm_os.tasks t
  where t.tenant_id=v_p.tenant_id
    and t.source=v_source
    and t.task_type='deal_followup'
    and t.status='open'
  order by t.updated_at desc
  limit 1
  for update;

  if found then
    v_task_before:=to_jsonb(v_task);
  else
    v_task_before:=null;
  end if;

  v_result:=public.platform_server_execute_agency_action_core_v10(
    p_proposal_id,
    p_actor_user_id
  );

  select *
  into v_deal
  from djm_os.deal_rooms d
  where d.id=v_p.target_id
    and d.tenant_id=v_p.tenant_id
    and d.status='active';

  if not found then
    raise exception 'active_deal_not_found_after_next_action';
  end if;

  v_next_text:=nullif(
    trim(v_p.proposed_payload->>'next_action_text'),
    ''
  );

  begin
    v_next_at:=nullif(
      v_p.proposed_payload->>'next_action_at',
      ''
    )::timestamptz;
  exception when others then
    raise exception 'invalid_next_action_at';
  end;

  if v_next_text is null or v_next_at is null then
    raise exception 'deal_next_action_input_required';
  end if;

  v_owner:=v_deal.owner_user_id;

  if v_owner is null
     or not exists(
       select 1
       from platform.tenant_memberships m
       where m.tenant_id=v_p.tenant_id
         and m.user_id=v_owner
         and m.status='active'
         and m.role in ('owner','admin','agent','scout','operations')
     ) then
    raise exception 'deal_follow_up_owner_required';
  end if;

  insert into djm_os.tasks(
    title,
    task_type,
    owner_user_id,
    organisation_id,
    player_id,
    club_need_id,
    due_at,
    status,
    priority,
    source,
    tenant_id
  )
  values(
    v_next_text,
    'deal_followup',
    v_owner,
    v_deal.organisation_id,
    v_deal.player_id,
    v_deal.club_need_id,
    v_next_at,
    'open',
    4,
    v_source,
    v_p.tenant_id
  )
  on conflict (tenant_id,source)
  where task_type='deal_followup'
    and status='open'
    and source is not null
  do update
  set title=excluded.title,
      owner_user_id=excluded.owner_user_id,
      organisation_id=excluded.organisation_id,
      player_id=excluded.player_id,
      club_need_id=excluded.club_need_id,
      due_at=excluded.due_at,
      priority=excluded.priority,
      updated_at=now(),
      completed_at=null
  returning * into v_task;

  v_task_after:=to_jsonb(v_task);

  update platform.agency_action_proposals
  set verification_json=
      coalesce(verification_json,'{}'::jsonb)
      || jsonb_build_object(
        'follow_up_task_id',v_task.id,
        'follow_up_owner_user_id',v_owner,
        'follow_up_task_before',v_task_before,
        'follow_up_task_after',v_task_after
      ),
      updated_at=now()
  where id=p_proposal_id;

  insert into platform.audit_events(
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values(
    v_p.tenant_id,
    p_actor_user_id,
    'user',
    'deal_followup.task_synced',
    'task',
    v_task.id::text,
    v_task_after,
    jsonb_build_object(
      'deal_room_id',v_p.target_id,
      'owner_user_id',v_owner,
      'source',v_source
    )
  );

  return v_result || jsonb_build_object(
    'follow_up_task_id',v_task.id,
    'follow_up_owner_user_id',v_owner,
    'follow_up_due_at',v_next_at,
    'follow_up_task_created_or_updated',true
  );
end;
$function$;

revoke all on function public.platform_server_execute_agency_action(
  uuid,uuid
) from public,anon,authenticated;

revoke all on function public.platform_server_execute_agency_action_core_v10(
  uuid,uuid
) from public,anon,authenticated;

grant execute on function public.platform_server_execute_agency_action(
  uuid,uuid
) to postgres,service_role;

grant execute on function public.platform_server_execute_agency_action_core_v10(
  uuid,uuid
) to postgres,service_role;

alter function public.platform_server_undo_agency_action(
  uuid,uuid
) rename to platform_server_undo_agency_action_core_v10;

create or replace function public.platform_server_undo_agency_action(
  p_proposal_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_result jsonb;
  v_task djm_os.tasks%rowtype;
  v_restore djm_os.tasks%rowtype;
  v_task_id uuid;
  v_before_task jsonb;
  v_after_task jsonb;
  v_task_exists boolean:=false;
begin
  select *
  into v_p
  from platform.agency_action_proposals
  where id=p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found';
  end if;

  if v_p.action_type<>'set_deal_next_action' then
    return public.platform_server_undo_agency_action_core_v10(
      p_proposal_id,
      p_actor_user_id
    );
  end if;

  begin
    v_task_id:=nullif(
      v_p.verification_json->>'follow_up_task_id',
      ''
    )::uuid;
  exception when others then
    v_task_id:=null;
  end;

  v_before_task:=
    v_p.verification_json->'follow_up_task_before';

  v_after_task:=
    v_p.verification_json->'follow_up_task_after';

  if v_task_id is not null then
    select *
    into v_task
    from djm_os.tasks t
    where t.id=v_task_id
      and t.tenant_id=v_p.tenant_id
    for update;

    v_task_exists:=found;
  end if;

  if v_task_exists
     and v_after_task is not null
     and jsonb_typeof(v_after_task)='object'
     and (
       v_task.title is distinct from v_after_task->>'title'
       or v_task.owner_user_id is distinct from
         nullif(v_after_task->>'owner_user_id','')::uuid
       or v_task.due_at is distinct from
         nullif(v_after_task->>'due_at','')::timestamptz
       or v_task.status is distinct from v_after_task->>'status'
       or v_task.source is distinct from v_after_task->>'source'
       or v_task.priority is distinct from
         nullif(v_after_task->>'priority','')::smallint
       or v_task.organisation_id is distinct from
         nullif(v_after_task->>'organisation_id','')::uuid
       or v_task.player_id is distinct from
         nullif(v_after_task->>'player_id','')::uuid
       or v_task.club_need_id is distinct from
         nullif(v_after_task->>'club_need_id','')::uuid
     ) then
    raise exception 'follow_up_task_changed_after_action_review_manually';
  end if;

  v_result:=public.platform_server_undo_agency_action_core_v10(
    p_proposal_id,
    p_actor_user_id
  );

  if v_before_task is null
     or jsonb_typeof(v_before_task)='null' then
    if v_task_exists then
      delete from djm_os.tasks
      where id=v_task_id
        and tenant_id=v_p.tenant_id;
    end if;
  else
    v_restore:=jsonb_populate_record(
      null::djm_os.tasks,
      v_before_task
    );

    if v_task_exists then
      update djm_os.tasks
      set title=v_restore.title,
          task_type=v_restore.task_type,
          owner_user_id=v_restore.owner_user_id,
          person_id=v_restore.person_id,
          organisation_id=v_restore.organisation_id,
          player_id=v_restore.player_id,
          interaction_id=v_restore.interaction_id,
          club_need_id=v_restore.club_need_id,
          due_at=v_restore.due_at,
          status=v_restore.status,
          priority=v_restore.priority,
          source=v_restore.source,
          completed_at=v_restore.completed_at,
          source_message_id=v_restore.source_message_id,
          updated_at=now()
      where id=v_task_id
        and tenant_id=v_p.tenant_id;
    else
      insert into djm_os.tasks(
        id,
        title,
        task_type,
        owner_user_id,
        person_id,
        organisation_id,
        player_id,
        interaction_id,
        club_need_id,
        due_at,
        status,
        priority,
        source,
        created_at,
        completed_at,
        updated_at,
        source_message_id,
        tenant_id
      )
      values(
        v_restore.id,
        v_restore.title,
        v_restore.task_type,
        v_restore.owner_user_id,
        v_restore.person_id,
        v_restore.organisation_id,
        v_restore.player_id,
        v_restore.interaction_id,
        v_restore.club_need_id,
        v_restore.due_at,
        v_restore.status,
        v_restore.priority,
        v_restore.source,
        v_restore.created_at,
        v_restore.completed_at,
        now(),
        v_restore.source_message_id,
        v_restore.tenant_id
      );
    end if;
  end if;

  insert into platform.audit_events(
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values(
    v_p.tenant_id,
    p_actor_user_id,
    'user',
    'deal_followup.task_restored_on_undo',
    'agency_action',
    p_proposal_id::text,
    v_before_task,
    jsonb_build_object(
      'deal_room_id',v_p.target_id,
      'follow_up_task_id',v_task_id
    )
  );

  return v_result || jsonb_build_object(
    'follow_up_task_restored',true,
    'follow_up_task_id',v_task_id
  );
end;
$function$;

revoke all on function public.platform_server_undo_agency_action(
  uuid,uuid
) from public,anon,authenticated;

revoke all on function public.platform_server_undo_agency_action_core_v10(
  uuid,uuid
) from public,anon,authenticated;

grant execute on function public.platform_server_undo_agency_action(
  uuid,uuid
) to postgres,service_role;

grant execute on function public.platform_server_undo_agency_action_core_v10(
  uuid,uuid
) to postgres,service_role;

create or replace function public.platform_server_pitch_execution_command(
  p_tenant_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with base as (
  select
    s.id share_id,
    s.player_id,
    s.opportunity_id deal_room_id,
    s.organisation_id,
    s.pitch_status,
    s.active,
    s.expires_at,
    s.view_count,
    s.last_viewed_at,
    s.sent_at,
    s.created_at,
    s.revoked_at,
    coalesce(
      nullif(trim(p.preferred_name),''),
      nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Player'
    ) player_name,
    o.name club_name,
    d.stage deal_stage,
    d.status deal_status,
    d.owner_user_id deal_owner_user_id,
    nullif(trim(tm.display_name),'') deal_owner_name,
    d.next_action_text,
    d.next_action_at,
    d.pitch_status deal_pitch_status,
    r.response_type,
    r.message response_message,
    r.responder_name,
    r.responder_email,
    r.identity_status response_identity_status,
    r.updated_at response_updated_at,
    case
      when not s.active
        or s.revoked_at is not null
        then 'revoked'
      when s.expires_at is not null
        and s.expires_at<now()
        then 'expired'
      when r.share_id is not null
        then 'explicit_share_response_received'
      when s.sent_at is null
        then 'draft_or_ready_not_confirmed_sent'
      when coalesce(s.view_count,0)=0
        or s.last_viewed_at is null
        then 'sent_no_recorded_open'
      when d.id is not null
        and d.next_action_at is null
        then 'opened_no_recorded_deal_next_action'
      when d.id is not null
        and d.next_action_at is not null
        then 'opened_with_recorded_deal_next_action'
      else 'opened_no_linked_deal'
    end execution_state
  from public.club_share_links s
  join public.players p
    on p.id=s.player_id
   and p.tenant_id=p_tenant_id
  left join djm_os.organisations o
    on o.id=s.organisation_id
   and o.tenant_id=p_tenant_id
  left join djm_os.deal_rooms d
    on d.id=s.opportunity_id
   and d.tenant_id=p_tenant_id
  left join djm_os.team_members tm
    on tm.user_id=d.owner_user_id
   and tm.is_active
  left join platform.club_pitch_responses r
    on r.share_id=s.id
   and r.tenant_id=p_tenant_id
), ranked as (
  select
    b.*,
    row_number() over(
      order by
        case execution_state
          when 'explicit_share_response_received' then 1
          when 'opened_no_recorded_deal_next_action' then 2
          when 'opened_no_linked_deal' then 3
          when 'sent_no_recorded_open' then 4
          when 'draft_or_ready_not_confirmed_sent' then 5
          when 'opened_with_recorded_deal_next_action' then 6
          when 'expired' then 7
          else 8
        end,
        coalesce(
          response_updated_at,
          last_viewed_at,
          sent_at,
          created_at
        ) desc
    ) rn
  from base b
), summary as (
  select
    count(*)::int total_shares,
    count(*) filter(
      where sent_at is not null
    )::int sent_shares,
    count(*) filter(
      where coalesce(view_count,0)>0
    )::int shares_with_recorded_open,
    count(*) filter(
      where response_type is not null
    )::int explicit_responses,
    count(*) filter(
      where execution_state='opened_no_recorded_deal_next_action'
    )::int opened_without_deal_next_action,
    count(*) filter(
      where execution_state='sent_no_recorded_open'
    )::int sent_no_recorded_open,
    count(*) filter(
      where execution_state='draft_or_ready_not_confirmed_sent'
    )::int not_confirmed_sent
  from base
)
select jsonb_build_object(
  'available',true,
  'tenant_id',p_tenant_id,
  'generated_at',now(),
  'summary',(select to_jsonb(summary) from summary),
  'items',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'rank',rn,
        'share_id',share_id,
        'player_id',player_id,
        'player_name',player_name,
        'organisation_id',organisation_id,
        'club_name',club_name,
        'deal_room_id',deal_room_id,
        'deal_stage',deal_stage,
        'deal_status',deal_status,
        'deal_owner_user_id',deal_owner_user_id,
        'deal_owner_name',deal_owner_name,
        'pitch_status',pitch_status,
        'deal_pitch_status',deal_pitch_status,
        'execution_state',execution_state,
        'sent_at',sent_at,
        'view_count',view_count,
        'last_viewed_at',last_viewed_at,
        'next_action_text',next_action_text,
        'next_action_at',next_action_at,
        'expires_at',expires_at,
        'explicit_response',
          case
            when response_type is null then null
            else jsonb_build_object(
              'response_type',response_type,
              'message',response_message,
              'responder_name',responder_name,
              'responder_email',responder_email,
              'identity_status',response_identity_status,
              'updated_at',response_updated_at
            )
          end,
        'recommended_review',
          case
            when execution_state='explicit_share_response_received'
              then jsonb_build_object(
                'api_action','pitch_responses',
                'instruction',
                'Review the explicit share-link response and decide the human commercial next step. Do not auto-change the deal stage.'
              )
            when execution_state='opened_no_recorded_deal_next_action'
              then jsonb_build_object(
                'api_action','deal_war_room',
                'deal_room_id',deal_room_id,
                'instruction',
                'The pitch was opened and the linked deal has no recorded next action. Decide the next move; the open itself is not evidence of interest.'
              )
            when execution_state='opened_no_linked_deal'
              then jsonb_build_object(
                'instruction',
                'The pitch was opened but is not linked to a deal room. Decide whether this should become a tracked pursuit or deal before further follow-up.'
              )
            when execution_state='sent_no_recorded_open'
              then jsonb_build_object(
                'instruction',
                'No open has been recorded. Follow the human-recorded deal next-action date if one exists; no reminder date is invented automatically.'
              )
            when execution_state='draft_or_ready_not_confirmed_sent'
              then jsonb_build_object(
                'instruction',
                'The share has not been human-confirmed as sent. Do not treat it as external outreach yet.'
              )
            else null
          end
      )
      order by rn
    )
    from ranked
    where rn<=greatest(
      1,
      least(coalesce(p_limit,100),500)
    )
  ),'[]'::jsonb),
  'truth_contract',jsonb_build_object(
    'response',
    'An explicit response submitted through the share link is stronger evidence than a page view, but responder identity remains self-asserted unless separately verified.',
    'opens',
    'A recorded open means the share URL was viewed. It is not evidence of club interest, intent, decision-maker identity or transfer probability.',
    'views',
    'Repeated views can come from the same person, forwarding, previews or automated systems; view_count is not treated as unique people.',
    'sent',
    'A pitch is treated as sent only when sent_at was explicitly recorded. Creating or publishing a link is not the same as contacting a club.',
    'stage',
    'No share response automatically wins, loses, advances or closes a deal.',
    'follow_up',
    'No pitch follow-up deadline is invented automatically. The linked deal next_action_at remains the authoritative recorded operating date.'
  )
);
$function$;

revoke all on function public.platform_server_pitch_execution_command(
  uuid,integer
) from public,anon,authenticated;

grant execute on function public.platform_server_pitch_execution_command(
  uuid,integer
) to postgres,service_role;


create or replace function public.platform_server_pitch_execution_command(
  p_tenant_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with base as (
  select
    s.id share_id,
    s.player_id,
    s.opportunity_id deal_room_id,
    s.organisation_id,
    s.pitch_status,
    s.active,
    s.expires_at,
    s.view_count,
    s.last_viewed_at,
    s.sent_at,
    s.created_at,
    s.revoked_at,
    coalesce(
      nullif(trim(p.preferred_name),''),
      nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Player'
    ) player_name,
    o.name club_name,
    d.stage deal_stage,
    d.status deal_status,
    d.owner_user_id deal_owner_user_id,
    tm.display_name deal_owner_name,
    d.next_action_text,
    d.next_action_at,
    d.pitch_status deal_pitch_status,
    r.response_type,
    r.message response_message,
    r.responder_name,
    r.responder_email,
    r.identity_status response_identity_status,
    r.updated_at response_updated_at,
    case
      when not s.active or s.revoked_at is not null then 'revoked'
      when s.expires_at is not null and s.expires_at<now() then 'expired'
      when r.share_id is not null then 'explicit_share_response_received'
      when s.sent_at is null then 'draft_or_ready_not_confirmed_sent'
      when coalesce(s.view_count,0)=0 or s.last_viewed_at is null then 'sent_no_recorded_open'
      when d.id is not null and d.next_action_at is null then 'opened_no_recorded_deal_next_action'
      when d.id is not null and d.next_action_at is not null then 'opened_with_recorded_deal_next_action'
      else 'opened_no_linked_deal'
    end execution_state
  from public.club_share_links s
  join public.players p
    on p.id=s.player_id
   and p.tenant_id=p_tenant_id
  left join djm_os.organisations o
    on o.id=s.organisation_id
   and o.tenant_id=p_tenant_id
  left join djm_os.deal_rooms d
    on d.id=s.opportunity_id
   and d.tenant_id=p_tenant_id
  left join djm_os.team_members tm
    on tm.user_id=d.owner_user_id
  left join platform.club_pitch_responses r
    on r.share_id=s.id
   and r.tenant_id=p_tenant_id
),
ranked as (
  select
    b.*,
    row_number() over(
      order by
        case execution_state
          when 'explicit_share_response_received' then 1
          when 'opened_no_recorded_deal_next_action' then 2
          when 'opened_no_linked_deal' then 3
          when 'sent_no_recorded_open' then 4
          when 'draft_or_ready_not_confirmed_sent' then 5
          when 'opened_with_recorded_deal_next_action' then 6
          when 'expired' then 7
          else 8
        end,
        coalesce(
          response_updated_at,
          last_viewed_at,
          sent_at,
          created_at
        ) desc
    ) rn
  from base b
),
summary as (
  select
    count(*)::int total_shares,
    count(*) filter(where sent_at is not null)::int sent_shares,
    count(*) filter(where coalesce(view_count,0)>0)::int shares_with_recorded_open,
    count(*) filter(where response_type is not null)::int explicit_responses,
    count(*) filter(where execution_state='opened_no_recorded_deal_next_action')::int opened_without_deal_next_action,
    count(*) filter(where execution_state='sent_no_recorded_open')::int sent_no_recorded_open,
    count(*) filter(where execution_state='draft_or_ready_not_confirmed_sent')::int not_confirmed_sent,
    count(*) filter(
      where deal_room_id is not null
        and deal_owner_user_id is null
    )::int linked_deals_without_owner
  from base
)
select jsonb_build_object(
  'available',true,
  'tenant_id',p_tenant_id,
  'generated_at',now(),
  'summary',(select to_jsonb(summary) from summary),
  'items',coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'rank',rn,
          'share_id',share_id,
          'player_id',player_id,
          'player_name',player_name,
          'organisation_id',organisation_id,
          'club_name',club_name,
          'deal_room_id',deal_room_id,
          'deal_stage',deal_stage,
          'deal_status',deal_status,
          'deal_owner_user_id',deal_owner_user_id,
          'deal_owner_name',deal_owner_name,
          'pitch_status',pitch_status,
          'deal_pitch_status',deal_pitch_status,
          'execution_state',execution_state,
          'sent_at',sent_at,
          'view_count',view_count,
          'last_viewed_at',last_viewed_at,
          'next_action_text',next_action_text,
          'next_action_at',next_action_at,
          'expires_at',expires_at,
          'explicit_response',
          case
            when response_type is null then null
            else jsonb_build_object(
              'response_type',response_type,
              'message',response_message,
              'responder_name',responder_name,
              'responder_email',responder_email,
              'identity_status',response_identity_status,
              'updated_at',response_updated_at
            )
          end,
          'recommended_review',
          case
            when execution_state='explicit_share_response_received' then
              jsonb_build_object(
                'api_action','pitch_responses',
                'instruction',
                'Review the explicit share-link response and decide the human commercial next step. Do not auto-change the deal stage.'
              )
            when execution_state='opened_no_recorded_deal_next_action'
              and deal_owner_user_id is null then
              jsonb_build_object(
                'api_action','deal_control_fix_prepare',
                'deal_room_id',deal_room_id,
                'instruction',
                'The linked deal has no owner. Assign one accountable agency user before recording a follow-up.'
              )
            when execution_state='opened_no_recorded_deal_next_action' then
              jsonb_build_object(
                'api_action','deal_step_prepare',
                'deal_room_id',deal_room_id,
                'step_type','set_next_action',
                'instruction',
                'The pitch was opened and the linked deal has no recorded next action. The deal owner must choose the next move and when to do it.'
              )
            when execution_state='opened_no_linked_deal' then
              jsonb_build_object(
                'instruction',
                'The pitch was opened but is not linked to a deal room. Decide whether this should become a tracked pursuit or deal before further follow-up.'
              )
            when execution_state='sent_no_recorded_open'
              and deal_room_id is not null
              and deal_owner_user_id is null then
              jsonb_build_object(
                'api_action','deal_control_fix_prepare',
                'deal_room_id',deal_room_id,
                'instruction',
                'The linked deal has no owner. Assign one accountable agency user before recording a follow-up.'
              )
            when execution_state='sent_no_recorded_open'
              and deal_room_id is not null
              and next_action_at is null then
              jsonb_build_object(
                'api_action','deal_step_prepare',
                'deal_room_id',deal_room_id,
                'step_type','set_next_action',
                'instruction',
                'No open has been recorded. The deal owner must choose the follow-up action and date; ReDream does not invent a reminder.'
              )
            when execution_state='sent_no_recorded_open' then
              jsonb_build_object(
                'instruction',
                'No open has been recorded. Follow the recorded deal next-action date.'
              )
            when execution_state='draft_or_ready_not_confirmed_sent' then
              jsonb_build_object(
                'instruction',
                'The share has not been human-confirmed as sent. Do not treat it as external outreach yet.'
              )
            else null
          end
        )
        order by rn
      )
      from ranked
      where rn<=greatest(
        1,
        least(coalesce(p_limit,100),500)
      )
    ),
    '[]'::jsonb
  ),
  'truth_contract',jsonb_build_object(
    'response',
    'An explicit response submitted through the share link is stronger evidence than a page view, but responder identity remains self-asserted unless separately verified.',
    'opens',
    'A recorded open means the share URL was viewed. It is not evidence of club interest, intent, decision-maker identity or transfer probability.',
    'views',
    'Repeated views can come from the same person, forwarding, previews or automated systems; ReDream does not treat view_count as unique people.',
    'sent',
    'A pitch is treated as sent only when sent_at was explicitly recorded. Creating or publishing a link is not the same as contacting a club.',
    'stage',
    'No share response automatically wins, loses, advances or closes a deal.',
    'follow_up',
    'ReDream does not invent a pitch follow-up deadline. The linked deal next_action_at remains the authoritative recorded operating date.',
    'ownership',
    'A recorded deal follow-up belongs to the linked deal owner. An unowned deal must be assigned before a new follow-up can be recorded.'
  )
);
$function$;

revoke all on function public.platform_server_pitch_execution_command(
  uuid,
  integer
) from public,anon,authenticated;

grant execute on function public.platform_server_pitch_execution_command(
  uuid,
  integer
) to postgres,service_role;
