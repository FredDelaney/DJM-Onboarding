alter table platform.agency_pulse_events
  add column if not exists delegated_commands jsonb not null default '[]'::jsonb;

create or replace function public.platform_server_execute_agency_action(p_proposal_id uuid, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_result_id uuid;
  v_due timestamptz;
  v_priority integer;
  v_title text;
  v_current_status text;
  v_current_completed timestamptz;
  v_next_text text;
  v_next_at timestamptz;
  v_feedback_type text;
  v_snoozed_until timestamptz;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.approval_mode='review_only' then raise exception 'proposal_requires_manual_review'; end if;
  if v_p.expires_at <= now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  if v_p.action_type='complete_task' then
    select to_jsonb(t),t.status,t.completed_at into v_before,v_current_status,v_current_completed from djm_os.tasks t where t.id=v_p.target_id and t.tenant_id=v_p.tenant_id for update;
    if v_before is null then raise exception 'task_not_found'; end if;
    if v_current_status<>'open' then raise exception 'task_is_no_longer_open'; end if;
    update djm_os.tasks set status='completed',completed_at=now(),updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id returning id into v_result_id;
    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'completed' then raise exception 'task_write_verification_failed'; end if;
    v_feedback_type := 'completed';
  elsif v_p.action_type in ('create_search_task','create_player_task') then
    v_title := nullif(trim(v_p.proposed_payload->>'title'),''); if v_title is null then raise exception 'task_title_required'; end if;
    begin v_due := nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due := now()+interval '1 day'; end if;
    v_priority := greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,3),5));
    v_before := jsonb_build_object('created',true);
    insert into djm_os.tasks(title,task_type,player_id,club_need_id,due_at,status,priority,source,tenant_id)
    values(v_title,'agency_os',case when v_p.action_type='create_player_task' then v_p.target_id else null end,case when v_p.action_type='create_search_task' then v_p.target_id else null end,v_due,'open',v_priority,'agency_os:'||v_p.id::text,v_p.tenant_id) returning id into v_result_id;
    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'open' or v_after->>'source'<>'agency_os:'||v_p.id::text then raise exception 'task_creation_verification_failed'; end if;
    v_feedback_type := 'snoozed';
    v_snoozed_until := greatest(v_due,now()+interval '15 minutes');
  elsif v_p.action_type='set_deal_next_action' then
    v_next_text := nullif(trim(v_p.proposed_payload->>'next_action_text'),'');
    begin v_next_at := nullif(v_p.proposed_payload->>'next_action_at','')::timestamptz; exception when others then raise exception 'invalid_next_action_at'; end;
    if v_next_text is null or v_next_at is null then raise exception 'deal_next_action_input_required'; end if;
    if v_next_at <= now() then raise exception 'next_action_at_must_be_future'; end if;
    select to_jsonb(d) into v_before from djm_os.deal_rooms d where d.id=v_p.target_id and d.tenant_id=v_p.tenant_id and d.status='active' for update;
    if v_before is null then raise exception 'active_deal_not_found'; end if;
    update djm_os.deal_rooms set next_action_text=v_next_text,next_action_at=v_next_at,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id and status='active' returning id into v_result_id;
    select to_jsonb(d) into v_after from djm_os.deal_rooms d where d.id=v_result_id and d.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'next_action_text' is distinct from v_next_text or (v_after->>'next_action_at')::timestamptz is distinct from v_next_at then raise exception 'deal_write_verification_failed'; end if;
    v_feedback_type := 'completed';
  else raise exception 'action_type_not_executable:%',v_p.action_type;
  end if;

  update platform.agency_action_proposals
  set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),result_target_type=case when v_p.action_type in ('create_search_task','create_player_task') then 'task' else v_p.target_type end,result_target_id=v_result_id,before_json=v_before,after_json=v_after,verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),undo_supported=true,error_message=null,updated_at=now()
  where id=v_p.id returning * into v_p;

  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(
    v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,
    v_feedback_type,v_snoozed_until,
    jsonb_build_object(
      'proposal_id',v_p.id,
      'action_type',v_p.action_type,
      'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,
      'delegated_task_id',case when v_feedback_type='snoozed' then v_result_id else null end
    )
  );
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_before,v_after,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end));
  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type',v_p.result_target_type,'target_id',v_p.result_target_id,'verified',true,'undo_supported',true,'duplicate',false,'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,'snoozed_until',v_snoozed_until);
exception when others then
  if v_p.id is not null then
    update platform.agency_action_proposals set status=case when status in ('applied','expired','undone') then status else 'failed' end,error_message=left(sqlerrm,1000),updated_at=now() where id=v_p.id;
  end if;
  raise;
end;
$function$;

revoke all on function public.platform_server_execute_agency_action(uuid,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_execute_agency_action(uuid,uuid) to service_role;

create or replace function public.platform_server_refresh_agency_pulse(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_home jsonb;
  v_attention jsonb;
  v_commands jsonb;
  v_status text;
  v_critical integer;
  v_high integer;
  v_visible integer;
  v_signature text;
  v_old platform.tenant_attention_state%rowtype;
  v_new jsonb := '[]'::jsonb;
  v_resolved jsonb := '[]'::jsonb;
  v_delegated jsonb := '[]'::jsonb;
  v_escalated jsonb := '[]'::jsonb;
  v_deescalated jsonb := '[]'::jsonb;
  v_changed boolean := false;
  v_event_id uuid;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  v_home := public.platform_server_agency_home(p_tenant_id,12);
  v_attention := coalesce(v_home->'attention','{}'::jsonb);
  v_commands := coalesce(v_attention->'commands','[]'::jsonb);
  v_status := coalesce(v_attention->>'status','clear');
  v_critical := coalesce((v_attention->>'critical_count')::integer,0);
  v_high := coalesce((v_attention->>'high_count')::integer,0);
  v_visible := coalesce((v_attention->>'visible_signals')::integer,0);

  select md5(coalesce(string_agg(
    (c.value->>'command_id')||':'||coalesce(c.value->>'priority_band','')||':'||coalesce(c.value->'actionability'->>'mode','')
    ,'|' order by c.value->>'command_id'),'empty'))
  into v_signature
  from jsonb_array_elements(v_commands) c;

  select * into v_old from platform.tenant_attention_state where tenant_id=p_tenant_id for update;

  if not found then
    insert into platform.tenant_attention_state(tenant_id,status,signature,critical_count,high_count,visible_count,commands,last_changed_at,last_checked_at)
    values(p_tenant_id,v_status,v_signature,v_critical,v_high,v_visible,v_commands,now(),now());

    insert into platform.agency_pulse_events(tenant_id,event_type,current_signature,current_status,new_commands,delegated_commands,snapshot)
    values(p_tenant_id,'baseline',v_signature,v_status,'[]'::jsonb,'[]'::jsonb,jsonb_build_object('attention',v_attention,'baseline',true))
    returning id into v_event_id;

    return jsonb_build_object(
      'tenant_id',p_tenant_id,'event_type','baseline','changed',false,'event_id',v_event_id,
      'status',v_status,'critical_count',v_critical,'high_count',v_high,'visible_count',v_visible,
      'new_commands','[]'::jsonb,'delegated_commands','[]'::jsonb,'escalated_commands','[]'::jsonb,'deescalated_commands','[]'::jsonb,'resolved_commands','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(c.value order by (c.value->>'priority_score')::integer desc),'[]'::jsonb)
  into v_new
  from jsonb_array_elements(v_commands) c
  where not exists(
    select 1 from jsonb_array_elements(coalesce(v_old.commands,'[]'::jsonb)) o
    where o.value->>'command_id'=c.value->>'command_id'
  );

  select coalesce(jsonb_agg(o.value order by (o.value->>'priority_score')::integer desc),'[]'::jsonb)
  into v_delegated
  from jsonb_array_elements(coalesce(v_old.commands,'[]'::jsonb)) o
  where not exists(
    select 1 from jsonb_array_elements(v_commands) c
    where c.value->>'command_id'=o.value->>'command_id'
  )
  and exists(
    select 1
    from platform.agency_command_feedback f
    where f.tenant_id=p_tenant_id
      and f.command_id=o.value->>'command_id'
      and f.feedback_type='snoozed'
      and f.snoozed_until>now()
      and f.metadata->>'operating_state'='delegated'
      and f.created_at=(
        select max(f2.created_at) from platform.agency_command_feedback f2
        where f2.tenant_id=f.tenant_id and f2.command_id=f.command_id and f2.feedback_type<>'shown'
      )
  );

  select coalesce(jsonb_agg(o.value order by (o.value->>'priority_score')::integer desc),'[]'::jsonb)
  into v_resolved
  from jsonb_array_elements(coalesce(v_old.commands,'[]'::jsonb)) o
  where not exists(
    select 1 from jsonb_array_elements(v_commands) c
    where c.value->>'command_id'=o.value->>'command_id'
  )
  and not exists(
    select 1 from jsonb_array_elements(v_delegated) d
    where d.value->>'command_id'=o.value->>'command_id'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'command_id',c.value->>'command_id','title',c.value->>'title',
    'from_band',o.value->>'priority_band','to_band',c.value->>'priority_band',
    'from_score',(o.value->>'priority_score')::integer,'to_score',(c.value->>'priority_score')::integer,
    'command',c.value
  ) order by (c.value->>'priority_score')::integer desc),'[]'::jsonb)
  into v_escalated
  from jsonb_array_elements(v_commands) c
  join lateral (
    select x.value from jsonb_array_elements(coalesce(v_old.commands,'[]'::jsonb)) x
    where x.value->>'command_id'=c.value->>'command_id' limit 1
  ) o on true
  where (case c.value->>'priority_band' when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end)
      > (case o.value->>'priority_band' when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end);

  select coalesce(jsonb_agg(jsonb_build_object(
    'command_id',c.value->>'command_id','title',c.value->>'title',
    'from_band',o.value->>'priority_band','to_band',c.value->>'priority_band',
    'from_score',(o.value->>'priority_score')::integer,'to_score',(c.value->>'priority_score')::integer,
    'command',c.value
  ) order by (c.value->>'priority_score')::integer desc),'[]'::jsonb)
  into v_deescalated
  from jsonb_array_elements(v_commands) c
  join lateral (
    select x.value from jsonb_array_elements(coalesce(v_old.commands,'[]'::jsonb)) x
    where x.value->>'command_id'=c.value->>'command_id' limit 1
  ) o on true
  where (case c.value->>'priority_band' when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end)
      < (case o.value->>'priority_band' when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end);

  v_changed := v_signature is distinct from v_old.signature or v_status is distinct from v_old.status;

  update platform.tenant_attention_state
  set status=v_status,signature=v_signature,critical_count=v_critical,high_count=v_high,visible_count=v_visible,
      commands=v_commands,last_checked_at=now(),last_changed_at=case when v_changed then now() else last_changed_at end,updated_at=now()
  where tenant_id=p_tenant_id;

  if v_changed then
    insert into platform.agency_pulse_events(
      tenant_id,event_type,previous_signature,current_signature,previous_status,current_status,
      new_commands,delegated_commands,escalated_commands,deescalated_commands,resolved_commands,snapshot
    ) values(
      p_tenant_id,'changed',v_old.signature,v_signature,v_old.status,v_status,
      v_new,v_delegated,v_escalated,v_deescalated,v_resolved,
      jsonb_build_object('attention',v_attention,'previous_visible_count',v_old.visible_count)
    ) returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'event_type',case when v_changed then 'changed' else 'unchanged' end,'changed',v_changed,
    'event_id',v_event_id,'previous_status',v_old.status,'status',v_status,
    'critical_count',v_critical,'high_count',v_high,'visible_count',v_visible,
    'new_commands',v_new,'delegated_commands',v_delegated,'escalated_commands',v_escalated,'deescalated_commands',v_deescalated,'resolved_commands',v_resolved
  );
end;
$function$;

revoke all on function public.platform_server_refresh_agency_pulse(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_refresh_agency_pulse(uuid) to service_role;

create or replace function public.platform_server_agency_pulse(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'tenant_id',s.tenant_id,'status',s.status,'critical_count',s.critical_count,'high_count',s.high_count,
    'visible_count',s.visible_count,'last_changed_at',s.last_changed_at,'last_checked_at',s.last_checked_at,
    'commands',s.commands,
    'latest_change',(
      select jsonb_build_object(
        'event_id',e.id,'event_type',e.event_type,'previous_status',e.previous_status,'current_status',e.current_status,
        'new_commands',e.new_commands,'delegated_commands',e.delegated_commands,
        'escalated_commands',e.escalated_commands,'deescalated_commands',e.deescalated_commands,
        'resolved_commands',e.resolved_commands,'created_at',e.created_at
      ) from platform.agency_pulse_events e
      where e.tenant_id=s.tenant_id and e.event_type='changed'
      order by e.created_at desc limit 1
    )
  )
  from platform.tenant_attention_state s
  where s.tenant_id=p_tenant_id;
$function$;

revoke all on function public.platform_server_agency_pulse(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_agency_pulse(uuid) to service_role;;
