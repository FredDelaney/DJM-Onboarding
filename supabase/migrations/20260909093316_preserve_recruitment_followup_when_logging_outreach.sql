create or replace function public.djm_recruitment_log_interaction(
  p_prospect_id uuid,
  p_channel text,
  p_summary text,
  p_direction text default null,
  p_occurred_at timestamptz default now(),
  p_next_action_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_id uuid;
  v_stage text;
  v_name text;
  v_owner uuid;
  v_priority smallint;
  v_existing_next timestamptz;
  v_effective_next timestamptz;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_channel not in ('whatsapp','instagram','linkedin','email','phone','meeting','other') then
    raise exception 'Unsupported channel';
  end if;

  if p_direction is not null and p_direction not in ('inbound','outbound','mutual') then
    raise exception 'Unsupported direction';
  end if;

  if length(trim(coalesce(p_summary,''))) < 2 then
    raise exception 'Summary is required';
  end if;

  select
    recruitment_stage,
    full_name,
    coalesce(owner_user_id,(select auth.uid())),
    recruitment_priority,
    next_action_at
  into
    v_stage,
    v_name,
    v_owner,
    v_priority,
    v_existing_next
  from djm_os.scouting_prospects
  where id = p_prospect_id
    and linked_player_id is null;

  if v_name is null then
    raise exception 'Recruitment target not found';
  end if;

  v_effective_next := coalesce(p_next_action_at, v_existing_next);

  insert into djm_os.recruitment_interactions(
    prospect_id,
    owner_user_id,
    channel,
    direction,
    summary,
    occurred_at,
    source
  )
  values(
    p_prospect_id,
    (select auth.uid()),
    p_channel,
    p_direction,
    trim(p_summary),
    coalesce(p_occurred_at,now()),
    'djm_os'
  )
  returning id into v_id;

  update djm_os.scouting_prospects
  set
    first_contact_at = coalesce(
      first_contact_at,
      case
        when p_direction in ('outbound','mutual') then coalesce(p_occurred_at,now())
        else first_contact_at
      end
    ),
    last_contact_at = case
      when p_direction in ('outbound','mutual') then greatest(
        coalesce(last_contact_at,'epoch'::timestamptz),
        coalesce(p_occurred_at,now())
      )
      else last_contact_at
    end,
    last_reply_at = case
      when p_direction in ('inbound','mutual') then greatest(
        coalesce(last_reply_at,'epoch'::timestamptz),
        coalesce(p_occurred_at,now())
      )
      else last_reply_at
    end,
    recruitment_stage = case
      when recruitment_stage in ('identified','researching','ready_to_contact') and p_direction='outbound' then 'contacted'
      when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and p_direction in ('inbound','mutual') then 'replied'
      else recruitment_stage
    end,
    next_action_at = v_effective_next,
    owner_user_id = coalesce(owner_user_id,(select auth.uid())),
    preferred_contact_channel = coalesce(preferred_contact_channel,p_channel),
    updated_at = now()
  where id = p_prospect_id;

  delete from djm_os.tasks
  where source = ('recruitment:'||p_prospect_id::text)
    and status not in ('completed','cancelled');

  if v_effective_next is not null then
    insert into djm_os.tasks(
      title,
      task_type,
      owner_user_id,
      due_at,
      status,
      priority,
      source
    )
    values(
      'Follow up recruitment target: '||v_name,
      'recruitment_followup',
      v_owner,
      v_effective_next,
      'open',
      least(5,greatest(1,coalesce(v_priority,3))),
      'recruitment:'||p_prospect_id::text
    );
  else
    insert into djm_os.tasks(
      title,
      task_type,
      owner_user_id,
      due_at,
      status,
      priority,
      source
    )
    values(
      'Set next step: '||v_name,
      'recruitment_next_step',
      v_owner,
      now(),
      'open',
      least(5,greatest(1,coalesce(v_priority,3))),
      'recruitment:'||p_prospect_id::text
    );
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    'RECRUITMENT_INTERACTION_LOGGED',
    (select auth.uid()),
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'channel',p_channel,
      'direction',p_direction,
      'summary',trim(p_summary),
      'submitted_next_action_at',p_next_action_at,
      'effective_next_action_at',v_effective_next
    ),
    'recruitment',
    1,
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object(
    'interaction_id',v_id,
    'prospect_id',p_prospect_id,
    'next_action_at',v_effective_next,
    'next_action_required',v_effective_next is null
  );
end
$function$;
