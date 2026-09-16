create or replace function platform.command_priority_profile(p_command jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_base integer := greatest(0,least(coalesce(nullif(p_command->>'priority_score','')::integer,0),100));
  v_modifier integer := 0;
  v_modifiers jsonb := '[]'::jsonb;
  v_source text := coalesce(p_command->>'source_type','');
  v_type text := coalesce(p_command->>'command_type','');
  v_evidence jsonb := coalesce(p_command->'evidence','{}'::jsonb);
  v_expected numeric;
  v_probability numeric;
  v_agency_priority text;
  v_need_type text;
  v_need_priority integer;
  v_match numeric;
  v_access numeric;
  v_source_priority integer;
  v_open_questions integer;
  v_effective integer;
  v_band text;
  v_commercial jsonb := null;
  v_dimensions jsonb := '{}'::jsonb;
begin
  begin v_expected := nullif(v_evidence->>'expected_commission','')::numeric; exception when others then v_expected := null; end;
  begin v_probability := nullif(v_evidence->>'probability','')::numeric; exception when others then v_probability := null; end;
  v_agency_priority := lower(coalesce(v_evidence->>'agency_priority',''));
  v_need_type := lower(coalesce(v_evidence->>'need_type',''));
  begin v_need_priority := nullif(v_evidence->>'need_priority','')::integer; exception when others then v_need_priority := null; end;
  begin v_match := nullif(v_evidence->>'overall_score','')::numeric; exception when others then v_match := null; end;
  begin v_access := nullif(v_evidence->>'access_score','')::numeric; exception when others then v_access := null; end;
  begin v_source_priority := nullif(v_evidence->>'source_priority','')::integer; exception when others then v_source_priority := null; end;
  begin v_open_questions := nullif(v_evidence->'receipt'->>'open_questions','')::integer; exception when others then v_open_questions := null; end;

  if v_source='deal_room' and v_expected is not null and v_expected>0 then
    if v_expected>=100000 then
      v_modifier:=v_modifier+8;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','commercial_exposure','points',8,'reason','Expected commission is at least 100,000 in the deal currency.'));
    elsif v_expected>=50000 then
      v_modifier:=v_modifier+6;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','commercial_exposure','points',6,'reason','Expected commission is at least 50,000 in the deal currency.'));
    elsif v_expected>=20000 then
      v_modifier:=v_modifier+4;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','commercial_exposure','points',4,'reason','Expected commission is at least 20,000 in the deal currency.'));
    else
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','commercial_exposure','points',2,'reason','The deal carries recorded expected commission.'));
    end if;

    if v_probability>=70 then
      v_modifier:=v_modifier+3;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','deal_maturity','points',3,'reason','Recorded deal probability is at least 70%.'));
    elsif v_probability>=50 then
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','deal_maturity','points',2,'reason','Recorded deal probability is at least 50%.'));
    elsif v_probability>0 then
      v_modifier:=v_modifier+1;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','deal_maturity','points',1,'reason','The deal has a non-zero recorded probability.'));
    end if;

    if nullif(trim(coalesce(v_evidence->>'primary_blocker','')),'') is not null then
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','active_blocker','points',2,'reason','A specific commercial blocker is recorded.'));
    end if;

    v_commercial:=jsonb_build_object(
      'expected_commission',v_expected,
      'currency',v_evidence->>'currency',
      'probability',v_probability,
      'primary_blocker',v_evidence->>'primary_blocker'
    );
  end if;

  if v_source='player' then
    if v_agency_priority='urgent' then
      v_modifier:=v_modifier+6;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','player_service_priority','points',6,'reason','The player is marked urgent by the agency.'));
    elsif v_agency_priority='high' then
      v_modifier:=v_modifier+4;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','player_service_priority','points',4,'reason','The player is marked high priority by the agency.'));
    end if;
  end if;

  if v_source='club_need' then
    if v_need_type='confirmed' then
      v_modifier:=v_modifier+4;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','demand_certainty','points',4,'reason','The club need is confirmed rather than predicted.'));
    end if;

    if v_need_priority>=5 then
      v_modifier:=v_modifier+4;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','need_priority','points',4,'reason','The club need is priority 5.'));
    elsif v_need_priority=4 then
      v_modifier:=v_modifier+3;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','need_priority','points',3,'reason','The club need is priority 4.'));
    elsif v_need_priority=3 then
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','need_priority','points',2,'reason','The club need is priority 3.'));
    end if;

    if v_match>=90 then
      v_modifier:=v_modifier+5;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','player_fit','points',5,'reason','The suggested player match score is at least 90.'));
    elsif v_match>=80 then
      v_modifier:=v_modifier+3;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','player_fit','points',3,'reason','The suggested player match score is at least 80.'));
    elsif v_match>=70 then
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','player_fit','points',2,'reason','The suggested player match score is at least 70.'));
    end if;

    if v_access>=80 then
      v_modifier:=v_modifier+3;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','relationship_access','points',3,'reason','Relationship/access score is at least 80.'));
    elsif v_access>=60 then
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','relationship_access','points',2,'reason','Relationship/access score is at least 60.'));
    end if;
  end if;

  if v_source='task' and v_source_priority is not null then
    if v_source_priority>=5 then
      v_modifier:=v_modifier+3;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','task_priority','points',3,'reason','The underlying task is priority 5.'));
    elsif v_source_priority=4 then
      v_modifier:=v_modifier+2;
      v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','task_priority','points',2,'reason','The underlying task is priority 4.'));
    end if;
  end if;

  if v_source='capture' and coalesce(v_open_questions,0)>0 then
    v_modifier:=v_modifier+least(4,v_open_questions);
    v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object('factor','blocked_intelligence','points',least(4,v_open_questions),'reason',v_open_questions||' clarification question(s) are blocking safe completion.'));
  end if;

  v_effective:=least(100,v_base+v_modifier);
  v_band:=case when v_effective>=88 then 'critical' when v_effective>=72 then 'high' when v_effective>=55 then 'medium' else 'low' end;

  v_dimensions:=jsonb_build_object(
    'urgency',case when v_base>=88 then 'critical' when v_base>=72 then 'high' when v_base>=55 then 'medium' else 'low' end,
    'commercial_exposure',case when v_expected is null then 'not_recorded' when v_expected>=50000 then 'high' when v_expected>=20000 then 'material' when v_expected>0 then 'recorded' else 'none' end,
    'player_service',case when v_agency_priority='urgent' then 'urgent' when v_agency_priority='high' then 'high' else 'normal_or_not_applicable' end,
    'demand_certainty',case when v_need_type='confirmed' then 'confirmed' when v_need_type='predicted' then 'predicted' else 'not_applicable' end,
    'fit_quality',case when v_match>=90 then 'very_strong' when v_match>=80 then 'strong' when v_match>=70 then 'credible' when v_match is null then 'not_scored' else 'weak_or_unproven' end,
    'relationship_access',case when v_access>=80 then 'strong' when v_access>=60 then 'useful' when v_access is null then 'not_scored' else 'limited' end
  );

  return jsonb_build_object(
    'base_rule_score',v_base,
    'policy_modifier',v_modifier,
    'effective_score',v_effective,
    'effective_band',v_band,
    'modifiers',v_modifiers,
    'dimensions',v_dimensions,
    'commercial_context',v_commercial,
    'interpretation','Deterministic decision-policy ranking. This score is not a probability or AI prediction.'
  );
end;
$function$;

revoke all on function platform.command_priority_profile(jsonb) from public,anon,authenticated,service_role;

create or replace function public.platform_server_agency_home(p_tenant_id uuid, p_command_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := coalesce(p_command_limit,5);
  v_raw jsonb;
  v_commands jsonb;
  v_suppressed integer := 0;
  v_visible integer := 0;
  v_critical integer := 0;
  v_high integer := 0;
  v_status text;
  v_top jsonb;
  v_changes jsonb;
  v_value jsonb;
  v_quality jsonb;
begin
  if v_limit not between 1 and 12 then raise exception 'invalid_command_limit'; end if;
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;

  v_raw := public.platform_server_agency_commands(p_tenant_id,25);

  with expanded as (
    select c.value as command
    from jsonb_array_elements(coalesce(v_raw->'commands','[]'::jsonb)) c
  ), annotated as (
    select e.command,
      platform.command_priority_profile(e.command) as profile,
      lf.feedback_type,
      lf.snoozed_until,
      lf.created_at as feedback_at,
      case
        when lf.feedback_type='snoozed' and lf.snoozed_until>now() then true
        when lf.feedback_type in ('dismissed','not_relevant') and lf.created_at>=now()-interval '14 days' then true
        when lf.feedback_type='completed' and lf.created_at>=now()-interval '2 days' then true
        else false
      end as suppressed
    from expanded e
    left join lateral (
      select f.feedback_type,f.snoozed_until,f.created_at
      from platform.agency_command_feedback f
      where f.tenant_id=p_tenant_id and f.command_id=e.command->>'command_id' and f.feedback_type<>'shown'
      order by f.created_at desc limit 1
    ) lf on true
  ), enriched as (
    select
      command || jsonb_build_object(
        'base_priority_score',(command->>'priority_score')::integer,
        'priority_score',(profile->>'effective_score')::integer,
        'priority_band',profile->>'effective_band',
        'decision_basis',profile,
        'decision_state',coalesce(feedback_type,'new'),
        'snoozed_until',snoozed_until,
        'last_feedback_at',feedback_at,
        'actionability',platform.command_actionability(command)
      ) as command,
      suppressed
    from annotated
  ), ranked as (
    select command,suppressed,
      row_number() over(order by (command->>'priority_score')::integer desc,(command->>'base_priority_score')::integer desc,command->>'title') as effective_rank
    from enriched
  ), visible as (
    select command || jsonb_build_object('rank',effective_rank) as command,effective_rank
    from ranked
    where not suppressed
    order by effective_rank
    limit v_limit
  )
  select
    coalesce((select jsonb_agg(command order by effective_rank) from visible),'[]'::jsonb),
    (select count(*) from ranked where suppressed),
    (select count(*) from ranked where not suppressed),
    (select count(*) from ranked where not suppressed and (command->>'priority_score')::integer>=88),
    (select count(*) from ranked where not suppressed and (command->>'priority_score')::integer between 72 and 87)
  into v_commands,v_suppressed,v_visible,v_critical,v_high;

  v_status:=case when v_visible=0 then 'clear' when v_critical>0 then 'critical_attention' when v_high>0 then 'attention_needed' else 'normal' end;
  v_top:=case when jsonb_array_length(v_commands)>0 then v_commands->0 else null end;

  select jsonb_build_object(
    'tell_djm_captures',(select count(*) from djm_os.captures c where c.tenant_id=p_tenant_id and c.created_at>=now()-interval '24 hours'),
    'tell_djm_actions_applied',(select count(*) from djm_os.tell_djm_actions a where a.tenant_id=p_tenant_id and a.applied_at>=now()-interval '24 hours'),
    'club_needs_created',(select count(*) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.created_at>=now()-interval '24 hours'),
    'player_matches_created',(select count(*) from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.created_at>=now()-interval '24 hours'),
    'opportunities_created',(select count(*) from public.player_opportunities o where o.tenant_id=p_tenant_id and o.created_at>=now()-interval '24 hours'),
    'tasks_completed',(select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.completed_at>=now()-interval '24 hours'),
    'interactions_logged',(select count(*) from djm_os.interactions i where i.tenant_id=p_tenant_id and i.created_at>=now()-interval '24 hours'),
    'meetings_created',(select count(*) from djm_os.meetings m where m.tenant_id=p_tenant_id and m.created_at>=now()-interval '24 hours'),
    'deals_updated',(select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.updated_at>=now()-interval '24 hours')
  ) into v_changes;

  v_value:=public.platform_server_value_proof(p_tenant_id,30);
  v_quality:=public.platform_server_command_quality(p_tenant_id,30);

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),
    'attention',jsonb_build_object(
      'status',v_status,'visible_signals',v_visible,'critical_count',v_critical,'high_count',v_high,
      'suppressed_by_decision_memory',v_suppressed,'top_command',v_top,'commands',v_commands,
      'ranking_policy','urgency_plus_explainable_decision_value_v1'
    ),
    'changed_last_24h',v_changes,
    'value_proof_30d',v_value,
    'command_quality_30d',v_quality
  );
end;
$function$;

revoke all on function public.platform_server_agency_home(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_home(uuid,integer) to service_role;;
