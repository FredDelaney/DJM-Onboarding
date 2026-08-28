create or replace function public.djm_network_capture_text(
  p_text text, p_channel text default 'whatsapp', p_person_id uuid default null,
  p_organisation_id uuid default null, p_occurred_at timestamptz default now()
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_capture_id uuid; v_interaction_id uuid; v_summary text; v_task_id uuid; v_position text; v_needs_review boolean := false;
begin
  if p_text is null or length(trim(p_text)) < 2 then raise exception 'Capture text is required'; end if;
  v_summary := left(regexp_replace(trim(p_text), '\s+', ' ', 'g'), 240);
  insert into djm_os.captures(submitted_by, channel, capture_type, raw_text, person_id, organisation_id, status)
  values(auth.uid(), coalesce(nullif(trim(p_channel),''),'whatsapp'), 'text', trim(p_text), p_person_id, p_organisation_id, 'processing')
  returning id into v_capture_id;
  insert into djm_os.interactions(occurred_at, channel, direction, team_member_id, person_id, organisation_id, source_external_id, source_type, raw_text, summary, confidence)
  values(coalesce(p_occurred_at,now()), coalesce(nullif(trim(p_channel),''),'whatsapp'), 'captured', auth.uid(), p_person_id, p_organisation_id, v_capture_id::text, 'djm_capture', trim(p_text), v_summary, 1)
  returning id into v_interaction_id;
  if p_person_id is not null then
    insert into djm_os.relationships(team_member_id, person_id, last_meaningful_at, first_known_at, strength_score)
    values(auth.uid(), p_person_id, coalesce(p_occurred_at,now()), coalesce(p_occurred_at,now()), 35)
    on conflict (team_member_id, person_id) do update set
      last_meaningful_at = greatest(coalesce(djm_os.relationships.last_meaningful_at, excluded.last_meaningful_at), excluded.last_meaningful_at),
      strength_score = greatest(coalesce(djm_os.relationships.strength_score,0), 35), updated_at = now();
  end if;
  if p_text ~* '\m(i.ll|i will|we.ll|we will|send|follow up|call|speak|revert|get back|come back)\M' then
    insert into djm_os.tasks(title, task_type, owner_user_id, person_id, organisation_id, interaction_id, status, priority, source)
    values(case when p_text ~* '\msend\M' then 'Follow through on promised send' when p_text ~* '\mcall\M|\mspeak\M' then 'Follow up on promised call' else 'Follow up on conversation commitment' end,
      'commitment', auth.uid(), p_person_id, p_organisation_id, v_interaction_id, 'open', 5, 'auto_capture') returning id into v_task_id;
  end if;
  v_position := case
    when p_text ~* '\m(left[- ]?back|lb)\M' then 'LB'
    when p_text ~* '\m(right[- ]?back|rb)\M' then 'RB'
    when p_text ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
    when p_text ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
    when p_text ~* '\mdefensive midfielder|number 6|no\.? ?6\M' then '6'
    when p_text ~* '\m(number 8|no\.? ?8|central midfielder|cm)\M' then '8'
    when p_text ~* '\m(number 10|no\.? ?10|attacking midfielder|am)\M' then '10'
    when p_text ~* '\mright winger|rw\M' then 'RW'
    when p_text ~* '\mleft winger|lw\M' then 'LW'
    when p_text ~* '\mwinger\M' then 'Winger'
    when p_text ~* '\mstriker|centre forward|center forward|cf\M' then 'ST'
    when p_text ~* '\mgoalkeeper|keeper|gk\M' then 'GK'
    else null end;
  if p_organisation_id is not null and v_position is not null and p_text ~* '\m(need|looking|searching|want|require|after)\M' then
    insert into djm_os.club_needs(organisation_id, source_person_id, owner_user_id, source_interaction_id, title, position, profile_notes, status, confidence, confirmed_at, expires_at)
    values(p_organisation_id, p_person_id, auth.uid(), v_interaction_id, v_position || ' requirement', v_position, left(trim(p_text),1000), 'active', 0.72, coalesce(p_occurred_at,now()), coalesce(p_occurred_at,now()) + interval '45 days');
  elsif v_position is not null and p_text ~* '\m(need|looking|searching|want|require|after)\M' then v_needs_review := true; end if;
  insert into djm_os.events(event_type, actor_user_id, person_id, organisation_id, interaction_id, payload, source, confidence, occurred_at)
  values('CAPTURE_PROCESSED', auth.uid(), p_person_id, p_organisation_id, v_interaction_id,
    jsonb_build_object('capture_id',v_capture_id,'channel',coalesce(nullif(trim(p_channel),''),'whatsapp'),'task_created',v_task_id is not null,'position_detected',v_position,'needs_review',v_needs_review),
    'djm_capture', 1, coalesce(p_occurred_at,now()));
  update djm_os.captures set status = case when v_needs_review then 'needs_review' else 'processed' end,
    extracted_json = jsonb_build_object('interaction_id',v_interaction_id,'task_id',v_task_id,'position',v_position,'needs_review',v_needs_review),
    confidence = case when v_needs_review then 0.72 else 1 end, processed_at = now() where id=v_capture_id;
  return jsonb_build_object('capture_id',v_capture_id,'interaction_id',v_interaction_id,'task_id',v_task_id,'position',v_position,'needs_review',v_needs_review);
end;
$$;
revoke execute on function public.djm_network_capture_text(text, text, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.djm_network_capture_text(text, text, uuid, uuid, timestamptz) to authenticated;
notify pgrst, 'reload schema';
