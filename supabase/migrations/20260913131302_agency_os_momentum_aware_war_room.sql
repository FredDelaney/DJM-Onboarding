create or replace function public.platform_server_deal_war_room(p_tenant_id uuid, p_deal_room_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_org djm_os.organisations%rowtype;
  v_player public.players%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_control jsonb;
  v_momentum jsonb;
  v_decision_map jsonb;
  v_account jsonb;
  v_evidence jsonb;
  v_pursuit jsonb:=null;
  v_play jsonb:=null;
  v_interactions jsonb;
  v_tasks jsonb;
  v_commitments jsonb;
  v_sequence jsonb:='[]'::jsonb;
  v_step integer:=0;
  v_direct_score integer:=0;
  v_intro_score integer:=0;
  v_evidence_score integer:=50;
  v_attention_score integer:=0;
  v_momentum_score integer:=0;
  v_momentum_state text;
  v_control_score integer:=0;
  v_weighted_commission numeric:=0;
  v_next_move jsonb:=null;
  v_next_control jsonb:=null;
  v_rescue_state text:='normal';
  v_rescue_reason text:=null;
  v_force_decision boolean:=false;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_deal.organisation_id and o.tenant_id=p_tenant_id;
  if v_deal.player_id is not null then select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id; end if;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;

  v_control:=platform.deal_control_health(p_tenant_id,p_deal_room_id);
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_decision_map:=public.platform_server_deal_decision_map(p_tenant_id,p_deal_room_id);
  v_account:=public.platform_server_club_account(p_tenant_id,v_deal.organisation_id);
  v_evidence:=v_control->'factors'->'evidence_health'->'detail';
  begin v_direct_score:=coalesce((v_control->'factors'->'access_execution'->>'direct_access_score')::integer,0); exception when others then v_direct_score:=0; end;
  begin v_intro_score:=coalesce((v_control->'factors'->'access_execution'->>'best_introduction_score')::integer,0); exception when others then v_intro_score:=0; end;
  begin v_evidence_score:=coalesce((v_evidence->>'score')::integer,50); exception when others then v_evidence_score:=50; end;
  begin v_control_score:=coalesce((v_control->>'score')::integer,0); exception when others then v_control_score:=0; end;
  begin v_momentum_score:=coalesce((v_momentum->>'momentum_score')::integer,0); exception when others then v_momentum_score:=0; end;
  v_momentum_state:=coalesce(v_momentum->>'state','unknown');

  if v_deal.club_need_id is not null and v_deal.player_id is not null and exists(
    select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id
  ) then
    v_pursuit:=public.platform_server_pursuit_readiness(p_tenant_id,v_deal.club_need_id,v_deal.player_id);
  end if;

  select x.value into v_play
  from jsonb_array_elements(public.platform_server_agency_playbook(p_tenant_id,20)->'plays') x
  where x.value->>'play_id'='deal:'||p_deal_room_id::text limit 1;
  begin v_attention_score:=coalesce((v_play->>'play_score')::integer,0); exception when others then v_attention_score:=0; end;

  v_weighted_commission:=round(coalesce(v_deal.expected_commission,0)*coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability,0)/100.0,2);

  if v_attention_score>=80 and v_momentum_state in ('stalled','busy_not_moving','stalled_or_uncontrolled') then
    v_rescue_state:='commercial_rescue';
    v_rescue_reason:='High strategic attention but no recent forward movement.';
    v_force_decision:=true;
  elsif v_attention_score>=80 and v_momentum_state in ('busy_but_cooling','cooling') then
    v_rescue_state:='momentum_recovery';
    v_rescue_reason:='The deal still matters, but forward movement is cooling.';
  elsif v_control_score<70 and v_attention_score>=80 then
    v_rescue_state:='control_recovery';
    v_rescue_reason:='The deal is strategically important but process control is fragile.';
  elsif v_momentum_state='progressing' then
    v_rescue_state:='protect_momentum';
    v_rescue_reason:='The deal is moving. Preserve pace and remove the next bottleneck.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'interaction_id',i.id,'occurred_at',i.occurred_at,'channel',i.channel,'direction',i.direction,'summary',i.summary,
    'person_id',i.person_id,'person_name',p.full_name,'team_member_id',i.team_member_id,'team_member_name',tm.display_name,
    'confidence',i.confidence,'source_type',i.source_type
  ) order by i.occurred_at desc),'[]'::jsonb)
  into v_interactions
  from (
    select * from djm_os.interactions i
    where i.tenant_id=p_tenant_id and i.organisation_id=v_deal.organisation_id
    order by i.occurred_at desc limit 12
  ) i
  left join djm_os.people p on p.id=i.person_id and p.tenant_id=p_tenant_id
  left join djm_os.team_members tm on tm.user_id=i.team_member_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id',t.id,'title',t.title,'task_type',t.task_type,'priority',t.priority,'due_at',t.due_at,'status',t.status,
    'owner_user_id',t.owner_user_id,'owner_name',tm.display_name,'source',t.source
  ) order by t.priority desc,t.due_at nulls last,t.created_at desc),'[]'::jsonb)
  into v_tasks
  from djm_os.tasks t
  left join djm_os.team_members tm on tm.user_id=t.owner_user_id
  where t.tenant_id=p_tenant_id and t.status='open'
    and (t.organisation_id=v_deal.organisation_id or t.player_id=v_deal.player_id or (v_deal.club_need_id is not null and t.club_need_id=v_deal.club_need_id));

  select coalesce(jsonb_agg(jsonb_build_object(
    'commitment_id',c.id,'proposal_id',c.proposal_id,'command_id',c.command_id,'task_id',c.task_id,'status',c.status,'due_at',c.due_at,'owner_user_id',c.owner_user_id,'metadata',c.metadata
  ) order by c.due_at nulls last,c.created_at desc),'[]'::jsonb)
  into v_commitments
  from platform.agency_commitments c
  join djm_os.tasks t on t.id=c.task_id and t.tenant_id=c.tenant_id
  where c.tenant_id=p_tenant_id and c.status in ('active','overdue')
    and (t.organisation_id=v_deal.organisation_id or t.player_id=v_deal.player_id or (v_deal.club_need_id is not null and t.club_need_id=v_deal.club_need_id));

  if v_evidence_score<65 then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','blocking','step_type','verify_evidence','executable',true,
      'instruction','Verify the stale, weak or contradictory facts before making the next commercial move.',
      'success_condition','Evidence health reaches the normal-action threshold or the uncertainty is explicitly resolved.',
      'evidence_health',v_evidence
    ));
  end if;

  if v_deal.owner_user_id is null then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','control','step_type','assign_owner','executable',true,'requires_input',true,
      'instruction','Assign one accountable deal owner.',
      'success_condition','One active agency team member owns the deal.'
    ));
  end if;

  if v_direct_score<60 and v_intro_score>=80 then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','access','step_type','request_warm_introduction','executable',true,
      'instruction',coalesce(v_account->'access'->'introductions'->'best_route'->>'recommended_action','Use the strongest recorded warm-introduction route.'),
      'success_condition','A fresh interaction occurs with the target contact or target club.',
      'introduction_context',v_account->'access'->'introductions'->'best_route'
    ));
  end if;

  if v_force_decision then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','commercial','step_type','force_decision_or_park','executable',true,
      'instruction','Force a real decision: advance the deal, change the route, or deliberately park it. Do not allow another low-information follow-up cycle.',
      'success_condition','The stage/status changes, the decision-maker route changes materially, or the deal is deliberately parked.',
      'momentum_state',v_momentum_state,'momentum_score',v_momentum_score
    ));
  elsif v_momentum_state in ('busy_but_cooling','cooling') and v_direct_score>=60 then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','commercial','step_type','recover_momentum','executable',true,
      'instruction','Create one decision-producing follow-up rather than another status check. Anchor it to the recorded next decision.',
      'success_condition','A forward-movement event is recorded within the recovery window.',
      'momentum_state',v_momentum_state,'momentum_score',v_momentum_score
    ));
  end if;

  if nullif(trim(v_deal.primary_blocker),'') is not null then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','commercial','step_type','resolve_blocker','executable',true,
      'instruction','Resolve blocker: '||v_deal.primary_blocker,
      'success_condition','The recorded blocker is removed, superseded or the deal moves despite it.',
      'blocker',v_deal.primary_blocker
    ));
  end if;

  if nullif(trim(v_deal.next_action_text),'') is null or v_deal.next_action_at is null or v_deal.next_action_at<now() then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'priority','control','step_type','set_next_action','executable',true,'requires_input',true,
      'instruction',case when nullif(trim(v_deal.next_action_text),'') is not null then v_deal.next_action_text else 'Set the single concrete next action that creates deal movement.' end,
      'success_condition','A concrete future-dated next action is recorded and owned.',
      'current_next_action_text',v_deal.next_action_text,'current_next_action_at',v_deal.next_action_at
    ));
  end if;

  v_step:=v_step+1;
  v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
    'step',v_step,'priority','decision','step_type','decision_checkpoint','executable',true,
    'instruction',case when nullif(trim(v_deal.next_decision),'') is not null then v_deal.next_decision else 'Define the next decision that will advance, park or close the deal.' end,
    'success_condition','The deal advances stage, is deliberately parked/lost, or the next decision is explicitly redefined.',
    'next_decision',v_deal.next_decision
  ));

  select x.value into v_next_control
  from jsonb_array_elements(v_sequence) x
  where x.value->>'priority'='control'
  order by (x.value->>'step')::integer limit 1;

  select x.value into v_next_move
  from jsonb_array_elements(v_sequence) x
  where x.value->>'priority'<>'control'
  order by (x.value->>'step')::integer limit 1;
  if v_next_move is null then v_next_move:=v_next_control; end if;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),
    'deal',jsonb_build_object(
      'deal_room_id',v_deal.id,'title',v_deal.title,'stage',v_deal.stage,'status',v_deal.status,'pitch_status',v_deal.pitch_status,
      'probability',coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability),'probability_source',v_deal.probability_source,
      'expected_commission',v_deal.expected_commission,'currency',v_deal.currency,'weighted_commission',v_weighted_commission,
      'transfer_fee',v_deal.transfer_fee,'player_salary',v_deal.player_salary,'salary_period',v_deal.salary_period,'financial_notes',v_deal.financial_notes,
      'primary_blocker',v_deal.primary_blocker,'next_decision',v_deal.next_decision,'next_action_text',v_deal.next_action_text,'next_action_at',v_deal.next_action_at,
      'last_meaningful_at',v_deal.last_meaningful_at,'owner_user_id',v_deal.owner_user_id
    ),
    'organisation',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'league_name',v_org.league_name),
    'player',case when v_player.id is null then null else jsonb_build_object('player_id',v_player.id,'name',trim(concat_ws(' ',v_player.first_name,v_player.last_name)),'primary_position',v_player.primary_position,'current_club',v_player.current_club,'football_status',v_player.football_status) end,
    'club_need',case when v_need.id is null then null else jsonb_build_object('club_need_id',v_need.id,'title',v_need.title,'position',v_need.position,'need_type',v_need.need_type,'priority',v_need.priority,'expires_at',v_need.expires_at) end,
    'attention',jsonb_build_object('score',v_attention_score,'strategic_play',v_play,'interpretation','Attention score is strategic priority, not deal probability.'),
    'control_health',v_control,
    'momentum',v_momentum,
    'rescue',jsonb_build_object('state',v_rescue_state,'reason',v_rescue_reason,'requires_forced_decision',v_force_decision),
    'evidence_health',v_evidence,
    'pursuit_readiness',v_pursuit,
    'decision_map',v_decision_map,
    'access',v_account->'access',
    'recent_interactions',v_interactions,
    'open_work',jsonb_build_object('tasks',v_tasks,'commitments',v_commitments),
    'closing_sequence',v_sequence,
    'next_best_move',v_next_move,
    'next_control_fix',v_next_control,
    'truth_contract',jsonb_build_object(
      'probability','recorded_agent_or_model_estimate_only','attention','strategic_priority_not_probability','control','execution_quality_not_probability',
      'momentum','recorded_forward_movement_and_recency_not_probability','rescue','operating_state_triggered_by_attention_plus_momentum/control_not_prediction',
      'decision_map','role_proximity_from_recorded_titles_not_proof_of_signing_authority','access','direct_and_introduction_routes_remain_separate',
      'closing_sequence','deterministic operating sequence from recorded deal state; external communication remains human-led'
    )
  );
end;
$$;

create or replace function public.platform_server_deal_portfolio(p_tenant_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
  v_items jsonb;
  v_all jsonb;
  v_total integer;
begin
  with rooms as (
    select d.id from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active'
  ), war as (
    select public.platform_server_deal_war_room(p_tenant_id,r.id) item from rooms r
  ), ranked as (
    select item,row_number() over(order by coalesce((item->'attention'->>'score')::integer,0) desc,coalesce((item->'deal'->>'expected_commission')::numeric,0) desc,item->'deal'->>'title') rank
    from war
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,
    'deal_room_id',item->'deal'->>'deal_room_id','title',item->'deal'->>'title','stage',item->'deal'->>'stage',
    'probability',(item->'deal'->>'probability')::integer,'expected_commission',(item->'deal'->>'expected_commission')::numeric,
    'weighted_commission',(item->'deal'->>'weighted_commission')::numeric,'currency',item->'deal'->>'currency',
    'organisation',item->'organisation'->>'name','player',item->'player'->>'name',
    'attention_score',(item->'attention'->>'score')::integer,
    'control_score',(item->'control_health'->>'score')::integer,'control_state',item->'control_health'->>'state',
    'momentum_score',(item->'momentum'->>'momentum_score')::integer,'momentum_state',item->'momentum'->>'state',
    'rescue_state',item->'rescue'->>'state','rescue_reason',item->'rescue'->>'reason',
    'evidence_score',(item->'evidence_health'->>'score')::integer,'evidence_state',item->'evidence_health'->>'state',
    'direct_access_score',(item->'control_health'->'factors'->'access_execution'->>'direct_access_score')::integer,
    'best_introduction_score',(item->'control_health'->'factors'->'access_execution'->>'best_introduction_score')::integer,
    'primary_blocker',item->'deal'->>'primary_blocker','next_decision',item->'deal'->>'next_decision',
    'next_best_move',item->'next_best_move','next_control_fix',item->'next_control_fix','control_gaps',item->'control_health'->'gaps'
  ) order by rank),'[]'::jsonb),count(*)::integer
  into v_all,v_total
  from ranked;

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_all) with ordinality x(value,ordinality) where x.ordinality<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'deals',v_items,
    'summary',jsonb_build_object(
      'active_deals',v_total,'visible_deals',jsonb_array_length(v_items),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_items),0),
      'controlled_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'control_state'='controlled'),
      'fragile_or_exposed_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'control_state' in ('fragile','exposed')),
      'progressing_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'momentum_state'='progressing'),
      'cooling_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'momentum_state' in ('busy_but_cooling','cooling')),
      'stalled_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'momentum_state' in ('stalled','busy_not_moving','stalled_or_uncontrolled')),
      'commercial_rescue_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'rescue_state'='commercial_rescue'),
      'momentum_recovery_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'rescue_state'='momentum_recovery'),
      'evidence_blocked_deals',(select count(*) from jsonb_array_elements(v_all) x where coalesce((x.value->>'evidence_score')::integer,0)<65),
      'deals_with_strong_introduction_option',(select count(*) from jsonb_array_elements(v_all) x where coalesce((x.value->>'direct_access_score')::integer,0)<60 and coalesce((x.value->>'best_introduction_score')::integer,0)>=80),
      'commercial_exposure_by_currency',(
        select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',weighted_commission) order by currency),'[]'::jsonb)
        from (
          select coalesce(nullif(x.value->>'currency',''),'UNKNOWN') currency,count(*)::integer active_deals,
                 coalesce(sum((x.value->>'expected_commission')::numeric),0) expected_commission,
                 coalesce(sum((x.value->>'weighted_commission')::numeric),0) weighted_commission
          from jsonb_array_elements(v_all) x group by coalesce(nullif(x.value->>'currency',''),'UNKNOWN')
        ) c
      )
    ),
    'principle','Attention decides where to focus; control shows process quality; momentum shows whether the deal is actually moving. None is a success probability.'
  );
end;
$$;

revoke execute on function public.platform_server_deal_war_room(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_war_room(uuid,uuid) to service_role;
revoke execute on function public.platform_server_deal_portfolio(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_portfolio(uuid,integer) to service_role;;
