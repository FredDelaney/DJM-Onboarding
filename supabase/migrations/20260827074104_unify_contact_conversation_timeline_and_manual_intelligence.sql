create or replace function public.djm_network_log_contact_interaction(
  p_person_id uuid,
  p_channel text,
  p_summary text,
  p_organisation_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_create_followup_at timestamptz default null,
  p_followup_title text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := p_organisation_id;
  v_i uuid;
  v_capture_id uuid;
  v_task_id uuid;
  v_need_id uuid;
  v_name text;
  v_position text;
  v_needs_review boolean := false;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_channel not in ('whatsapp','linkedin','email','phone','meeting','instagram','other') then
    raise exception 'Unsupported channel';
  end if;
  if length(trim(coalesce(p_summary,'')))<2 then
    raise exception 'Summary is required';
  end if;

  select full_name into v_name
  from djm_os.people
  where id=p_person_id and coalesce(person_type,'club_contact')<>'player';
  if v_name is null then raise exception 'Club contact not found'; end if;

  if v_org is null then
    select organisation_id into v_org
    from djm_os.employments
    where person_id=p_person_id and is_current=true
    order by last_verified_at desc nulls last, updated_at desc
    limit 1;
  end if;

  insert into djm_os.captures(submitted_by,channel,capture_type,raw_text,person_id,organisation_id,status)
  values(v_uid,p_channel,'text',trim(p_summary),p_person_id,v_org,'processing')
  returning id into v_capture_id;

  insert into djm_os.interactions(
    team_member_id,person_id,organisation_id,channel,direction,summary,raw_text,
    occurred_at,source_external_id,source_type,confidence
  ) values(
    v_uid,p_person_id,v_org,p_channel,'logged',trim(p_summary),trim(p_summary),
    coalesce(p_occurred_at,now()),v_capture_id::text,'network_manual',1
  ) returning id into v_i;

  update djm_os.relationships
  set last_meaningful_at=greatest(coalesce(last_meaningful_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),updated_at=now()
  where team_member_id=v_uid and person_id=p_person_id;

  if p_create_followup_at is not null then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(
      coalesce(nullif(trim(coalesce(p_followup_title,'')),''),'Follow up with '||v_name),
      'relationship_followup',v_uid,p_person_id,v_org,v_i,p_create_followup_at,'open',3,'network_manual'
    ) returning id into v_task_id;
  elsif p_summary ~* '\m(i.ll|i will|we.ll|we will|send|follow up|call|speak|revert|get back|come back)\M' then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,status,priority,source)
    values(
      case
        when p_summary ~* '\msend\M' then 'Follow through on promised send'
        when p_summary ~* '\mcall\M|\mspeak\M' then 'Follow up on promised call'
        else 'Follow up on conversation commitment'
      end,
      'commitment',v_uid,p_person_id,v_org,v_i,'open',5,'network_manual'
    ) returning id into v_task_id;
  end if;

  v_position := case
    when p_summary ~* '\m(left[- ]?back|lb)\M' then 'LB'
    when p_summary ~* '\m(right[- ]?back|rb)\M' then 'RB'
    when p_summary ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
    when p_summary ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
    when p_summary ~* '\mdefensive midfielder|number 6|no\.? ?6\M' then '6'
    when p_summary ~* '\m(number 8|no\.? ?8|central midfielder|cm)\M' then '8'
    when p_summary ~* '\m(number 10|no\.? ?10|attacking midfielder|am)\M' then '10'
    when p_summary ~* '\mright winger|rw\M' then 'RW'
    when p_summary ~* '\mleft winger|lw\M' then 'LW'
    when p_summary ~* '\mwinger\M' then 'Winger'
    when p_summary ~* '\mstriker|centre forward|center forward|cf\M' then 'ST'
    when p_summary ~* '\mgoalkeeper|keeper|gk\M' then 'GK'
    else null
  end;

  if v_org is not null and v_position is not null and p_summary ~* '\m(need|looking|searching|want|require|after)\M' then
    insert into djm_os.club_needs(
      organisation_id,source_person_id,owner_user_id,source_interaction_id,title,position,
      profile_notes,status,confidence,confirmed_at,expires_at
    ) values(
      v_org,p_person_id,v_uid,v_i,v_position||' requirement',v_position,left(trim(p_summary),1000),
      'active',0.72,coalesce(p_occurred_at,now()),coalesce(p_occurred_at,now())+interval '45 days'
    ) returning id into v_need_id;
  elsif v_position is not null and p_summary ~* '\m(need|looking|searching|want|require|after)\M' then
    v_needs_review := true;
  end if;

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values(
    'CONTACT_INTERACTION_LOGGED',v_uid,p_person_id,v_org,v_i,
    jsonb_build_object(
      'channel',p_channel,'summary',trim(p_summary),'capture_id',v_capture_id,
      'task_id',v_task_id,'club_need_id',v_need_id,'position',v_position,'needs_review',v_needs_review
    ),
    'network',1,coalesce(p_occurred_at,now())
  );

  update djm_os.captures
  set status=case when v_needs_review then 'needs_review' else 'processed' end,
      extracted_json=jsonb_build_object(
        'interaction_id',v_i,'task_id',v_task_id,'club_need_id',v_need_id,
        'position',v_position,'needs_review',v_needs_review
      ),
      confidence=case when v_needs_review then 0.72 else 1 end,
      processed_at=now()
  where id=v_capture_id;

  return jsonb_build_object(
    'interaction_id',v_i,
    'organisation_id',v_org,
    'capture_id',v_capture_id,
    'task_id',v_task_id,
    'club_need_id',v_need_id,
    'position',v_position,
    'needs_review',v_needs_review
  );
end
$function$;

create or replace function public.djm_prepare_me(p_person_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $function$
 select (public.djm_catch_me_up(p_person_id) || jsonb_build_object(
  'recent_claims',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select c.claim_type,c.claim_key,c.value_json,c.confidence,c.verification_status,c.created_at,c.valid_until
      from djm_os.claims c
      where c.person_id=p_person_id and (c.valid_until is null or c.valid_until>now())
      order by c.created_at desc limit 12
    ) x
  ),'[]'::jsonb),
  'upcoming_meetings',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.starts_at)
    from (
      select m.id,m.title,m.starts_at,m.ends_at,m.meeting_url,m.status
      from djm_os.meetings m
      where m.person_id=p_person_id and m.starts_at>=now() and m.status not in ('cancelled')
      order by m.starts_at limit 5
    ) x
  ),'[]'::jsonb),
  'recent_messages',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sent_at desc)
    from (
      select m.id,m.sent_at,m.direction,m.sender_label,m.raw_text,m.message_type,t.id thread_id
      from djm_os.messages m
      join djm_os.conversation_threads t on t.id=m.thread_id
      where t.person_id=p_person_id
        and m.message_type='text'
        and nullif(trim(coalesce(m.raw_text,'')),'') is not null
        and not (coalesce(m.raw_text,'') ~* 'https?://' and coalesce(m.raw_text,'') ~* '<attached:')
      order by m.sent_at desc
      limit 8
    ) x
  ),'[]'::jsonb),
  'recent_timeline',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
    from (
      select *
      from (
        select
          'message'::text as item_type,
          m.id,
          m.sent_at as occurred_at,
          'whatsapp'::text as channel,
          m.direction,
          m.sender_label as actor_label,
          m.raw_text as body,
          m.message_type,
          t.id as thread_id,
          null::text as team_member_name,
          'whatsapp_import'::text as source_type
        from djm_os.messages m
        join djm_os.conversation_threads t on t.id=m.thread_id
        where t.person_id=p_person_id
          and m.message_type='text'
          and nullif(trim(coalesce(m.raw_text,'')),'') is not null

        union all

        select
          'logged'::text as item_type,
          i.id,
          i.occurred_at,
          i.channel,
          coalesce(i.direction,'logged') as direction,
          coalesce(tm.display_name,'DJM') as actor_label,
          coalesce(nullif(i.raw_text,''),i.summary) as body,
          'note'::text as message_type,
          null::uuid as thread_id,
          tm.display_name as team_member_name,
          i.source_type
        from djm_os.interactions i
        left join djm_os.team_members tm on tm.user_id=i.team_member_id
        where i.person_id=p_person_id
          and i.source_type in ('network_manual','djm_capture')
          and nullif(trim(coalesce(i.raw_text,i.summary,'')),'') is not null
      ) timeline_items
      order by occurred_at desc
      limit 24
    ) x
  ),'[]'::jsonb)
  ));
$function$;
