create or replace function public.djm_network_complete_meeting(p_meeting_id uuid,p_summary text,p_next_action text default null,p_next_action_due timestamptz default null)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_m djm_os.meetings%rowtype;v_interaction uuid;v_task uuid;
begin
  select * into v_m from djm_os.meetings where id=p_meeting_id and owner_user_id=auth.uid();
  if not found then raise exception 'Meeting not found or not owned by you'; end if;
  if p_summary is null or length(trim(p_summary))<2 then raise exception 'Meeting summary is required'; end if;

  update djm_os.meetings set status='completed',notes=trim(p_summary),updated_at=now() where id=p_meeting_id;
  insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,organisation_id,source_external_id,source_type,raw_text,summary,confidence)
  values(v_m.starts_at,'meeting','completed',auth.uid(),v_m.person_id,v_m.organisation_id,p_meeting_id::text,'network_meeting',trim(p_summary),left(trim(p_summary),240),1)
  returning id into v_interaction;
  if v_m.person_id is not null then
    insert into djm_os.relationships(team_member_id,person_id,last_meaningful_at,first_known_at,strength_score)
    values(auth.uid(),v_m.person_id,v_m.starts_at,v_m.starts_at,40)
    on conflict(team_member_id,person_id) do update set last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),updated_at=now();
  end if;
  if p_next_action is not null and length(trim(p_next_action))>1 then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(trim(p_next_action),'meeting_followup',auth.uid(),v_m.person_id,v_m.organisation_id,v_interaction,p_next_action_due,'open',4,'meeting') returning id into v_task;
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values('MEETING_COMPLETED',auth.uid(),v_m.person_id,v_m.organisation_id,v_interaction,jsonb_build_object('meeting_id',p_meeting_id,'task_id',v_task),'network',1,now());
  return jsonb_build_object('meeting_id',p_meeting_id,'interaction_id',v_interaction,'task_id',v_task);
end;
$$;
revoke execute on function public.djm_network_complete_meeting(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.djm_network_complete_meeting(uuid,text,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
