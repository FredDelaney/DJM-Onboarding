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
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid:=p_organisation_id; v_i uuid; v_name text;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_channel not in ('whatsapp','linkedin','email','phone','meeting','instagram','other') then raise exception 'Unsupported channel'; end if;
  if length(trim(coalesce(p_summary,'')))<2 then raise exception 'Summary is required'; end if;
  select full_name into v_name from djm_os.people where id=p_person_id and coalesce(person_type,'club_contact')<>'player';
  if v_name is null then raise exception 'Club contact not found'; end if;
  if v_org is null then select organisation_id into v_org from djm_os.employments where person_id=p_person_id and is_current=true order by last_verified_at desc nulls last,updated_at desc limit 1; end if;
  insert into djm_os.interactions(team_member_id,person_id,organisation_id,channel,summary,raw_text,occurred_at,source_type,confidence)
  values(v_uid,p_person_id,v_org,p_channel,trim(p_summary),trim(p_summary),coalesce(p_occurred_at,now()),'network_manual',1) returning id into v_i;
  update djm_os.relationships set last_meaningful_at=greatest(coalesce(last_meaningful_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),updated_at=now() where team_member_id=v_uid and person_id=p_person_id;
  if p_create_followup_at is not null then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(coalesce(nullif(trim(coalesce(p_followup_title,'')),''),'Follow up with '||v_name),'relationship_followup',v_uid,p_person_id,v_org,v_i,p_create_followup_at,'open',3,'network_manual');
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values('CONTACT_INTERACTION_LOGGED',v_uid,p_person_id,v_org,v_i,jsonb_build_object('channel',p_channel,'summary',trim(p_summary)),'network',1,coalesce(p_occurred_at,now()));
  return jsonb_build_object('interaction_id',v_i,'organisation_id',v_org);
end $$;
