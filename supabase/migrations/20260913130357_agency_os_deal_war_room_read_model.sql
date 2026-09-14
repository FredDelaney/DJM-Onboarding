create or replace function platform.deal_control_health(p_tenant_id uuid, p_deal_room_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_evidence jsonb;
  v_access jsonb;
  v_intro jsonb;
  v_direct_score integer:=0;
  v_intro_score integer:=0;
  v_next_action integer:=20;
  v_next_decision integer:=35;
  v_evidence_score integer:=50;
  v_access_execution integer:=30;
  v_recency integer:=20;
  v_ownership integer:=35;
  v_commercial integer:=20;
  v_decision_network integer:=30;
  v_decision_roles integer:=0;
  v_score integer;
  v_state text;
  v_gaps jsonb:='[]'::jsonb;
  v_owner_active boolean:=false;
begin
  select * into v_deal
  from djm_os.deal_rooms d
  where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;

  v_evidence:=platform.command_evidence_health_v2(
    p_tenant_id,
    jsonb_build_object(
      'source_type','deal_room','source_id',v_deal.id::text,
      'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id
    )
  );
  begin v_evidence_score:=coalesce((v_evidence->>'score')::integer,50); exception when others then v_evidence_score:=50; end;

  v_access:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,5);
  v_intro:=public.platform_server_introduction_routes(p_tenant_id,v_deal.organisation_id,5);
  begin v_direct_score:=coalesce((v_access->'best_route'->>'route_score')::integer,0); exception when others then v_direct_score:=0; end;
  begin v_intro_score:=coalesce((v_intro->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro_score:=0; end;

  v_next_action:=case
    when nullif(trim(v_deal.next_action_text),'') is null or v_deal.next_action_at is null then 20
    when v_deal.next_action_at<now() then 35
    when v_deal.next_action_at<=now()+interval '2 days' then 100
    else 90 end;

  v_next_decision:=case when nullif(trim(v_deal.next_decision),'') is not null then 100 else 35 end;

  v_access_execution:=case
    when v_direct_score>=75 then 100
    when v_direct_score>=60 then 80
    when v_intro_score>=80 then 85
    when v_direct_score>=45 then 60
    when v_intro_score>=65 then 65
    else 30 end;

  v_recency:=platform.evidence_freshness_score(v_deal.last_meaningful_at);

  if v_deal.owner_user_id is not null then
    select exists(
      select 1 from platform.tenant_memberships m
      where m.tenant_id=p_tenant_id and m.user_id=v_deal.owner_user_id and m.status='active'
    ) into v_owner_active;
  end if;
  v_ownership:=case when v_owner_active then 100 when v_deal.owner_user_id is not null then 55 else 35 end;

  v_commercial:=20
    + case when v_deal.expected_commission is not null and nullif(trim(v_deal.currency),'') is not null then 30 else 0 end
    + case when coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability) is not null then 20 else 0 end
    + case when v_deal.transfer_fee is not null then 15 else 0 end
    + case when v_deal.player_salary is not null then 15 else 0 end;
  v_commercial:=least(100,v_commercial);

  select count(*)::integer into v_decision_roles
  from djm_os.employments e
  where e.tenant_id=p_tenant_id and e.organisation_id=v_deal.organisation_id and e.is_current=true
    and platform.access_role_relevance(e.role_title)>=90;
  v_decision_network:=case when v_decision_roles>=2 then 100 when v_decision_roles=1 then 75 else 30 end;

  v_score:=round(
    v_next_action*0.20 +
    v_next_decision*0.15 +
    v_evidence_score*0.15 +
    v_access_execution*0.15 +
    v_recency*0.10 +
    v_ownership*0.10 +
    v_commercial*0.10 +
    v_decision_network*0.05
  )::integer;

  v_state:=case when v_score>=85 then 'controlled' when v_score>=70 then 'workable' when v_score>=55 then 'fragile' else 'exposed' end;

  if v_next_action<60 then v_gaps:=v_gaps||jsonb_build_array(case when v_deal.next_action_at is not null and v_deal.next_action_at<now() then 'next_action_overdue' else 'next_action_not_controlled' end); end if;
  if v_next_decision<60 then v_gaps:=v_gaps||jsonb_build_array('next_decision_not_defined'); end if;
  if v_evidence_score<65 then v_gaps:=v_gaps||jsonb_build_array('evidence_below_action_threshold'); end if;
  if v_access_execution<70 then v_gaps:=v_gaps||jsonb_build_array('club_access_is_weak'); end if;
  if v_ownership<70 then v_gaps:=v_gaps||jsonb_build_array('deal_owner_not_active_or_missing'); end if;
  if v_recency<60 then v_gaps:=v_gaps||jsonb_build_array('meaningful_activity_is_stale'); end if;
  if v_decision_network<60 then v_gaps:=v_gaps||jsonb_build_array('decision_role_map_is_thin'); end if;
  if v_commercial<70 then v_gaps:=v_gaps||jsonb_build_array('commercial_terms_are_incomplete'); end if;

  return jsonb_build_object(
    'score',v_score,'state',v_state,'gaps',v_gaps,
    'factors',jsonb_build_object(
      'next_action_control',jsonb_build_object('score',v_next_action,'weight',0.20),
      'next_decision_clarity',jsonb_build_object('score',v_next_decision,'weight',0.15),
      'evidence_health',jsonb_build_object('score',v_evidence_score,'weight',0.15,'detail',v_evidence),
      'access_execution',jsonb_build_object('score',v_access_execution,'weight',0.15,'direct_access_score',v_direct_score,'best_introduction_score',v_intro_score),
      'meaningful_activity_recency',jsonb_build_object('score',v_recency,'weight',0.10,'last_meaningful_at',v_deal.last_meaningful_at),
      'ownership',jsonb_build_object('score',v_ownership,'weight',0.10,'owner_user_id',v_deal.owner_user_id,'active_owner',v_owner_active),
      'commercial_clarity',jsonb_build_object('score',v_commercial,'weight',0.10),
      'decision_network',jsonb_build_object('score',v_decision_network,'weight',0.05,'high_relevance_roles_recorded',v_decision_roles)
    ),
    'interpretation','Deal control measures how well the process is being run. It is not the probability of a transfer or deal success.'
  );
end;
$$;

create or replace function public.platform_server_deal_decision_map(p_tenant_id uuid, p_deal_room_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_org djm_os.organisations%rowtype;
  v_direct jsonb;
  v_intro jsonb;
  v_people jsonb;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_deal.organisation_id and o.tenant_id=p_tenant_id;

  v_direct:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,10);
  v_intro:=public.platform_server_introduction_routes(p_tenant_id,v_deal.organisation_id,20);

  with staff as (
    select p.id as person_id,p.full_name,e.role_title,e.department,e.confidence,e.last_verified_at,
           platform.access_role_relevance(e.role_title) as role_relevance
    from djm_os.employments e
    join djm_os.people p on p.id=e.person_id and p.tenant_id=p_tenant_id
    where e.tenant_id=p_tenant_id and e.organisation_id=v_deal.organisation_id and e.is_current=true
  ), direct_routes as (
    select (x.value->>'person_id')::uuid person_id,x.value route
    from jsonb_array_elements(coalesce(v_direct->'routes','[]'::jsonb)) x
  ), intro_routes as (
    select (x.value->'target_contact'->>'person_id')::uuid person_id,x.value route,
           row_number() over(partition by x.value->'target_contact'->>'person_id' order by (x.value->>'introduction_score')::integer desc) rn
    from jsonb_array_elements(coalesce(v_intro->'routes','[]'::jsonb)) x
  ), enriched as (
    select s.*,
           dr.route as direct_route,
           ir.route as intro_route,
           coalesce((dr.route->>'route_score')::integer,0) as direct_score,
           coalesce((ir.route->>'introduction_score')::integer,0) as intro_score,
           ia.last_interaction_at,coalesce(ia.interactions_30d,0)::integer interactions_30d
    from staff s
    left join direct_routes dr on dr.person_id=s.person_id
    left join intro_routes ir on ir.person_id=s.person_id and ir.rn=1
    left join lateral (
      select max(i.occurred_at) last_interaction_at,count(*) filter(where i.occurred_at>=now()-interval '30 days') interactions_30d
      from djm_os.interactions i
      where i.tenant_id=p_tenant_id and i.person_id=s.person_id
    ) ia on true
  ), ranked as (
    select *,row_number() over(order by role_relevance desc,greatest(direct_score,intro_score) desc,full_name) rank
    from enriched
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,'person_id',person_id,'name',full_name,'role_title',role_title,'department',department,
    'role_relevance',role_relevance,
    'role_proximity',case when role_relevance>=95 then 'primary_football_decision_role' when role_relevance>=80 then 'high_influence_role' when role_relevance>=60 then 'supporting_influence_role' else 'secondary_role' end,
    'employment_confidence',confidence,'employment_last_verified_at',last_verified_at,
    'direct_route',direct_route,'introduction_route',intro_route,
    'route_mode',case when direct_score>=75 then 'direct_warm' when direct_score>=60 then 'direct_usable' when intro_score>=80 then 'strong_introduction_available' when direct_score>0 then 'direct_developing' when intro_score>=65 then 'usable_introduction_available' else 'unconnected' end,
    'best_route_score',greatest(direct_score,intro_score),'direct_score',direct_score,'introduction_score',intro_score,
    'last_interaction_at',last_interaction_at,'interactions_30d',interactions_30d,
    'recommended_access_action',case
      when direct_score>=75 then 'Use the existing direct relationship with '||full_name||'.'
      when direct_score>=60 then 'Use the direct route deliberately and keep the relationship current.'
      when intro_score>=80 then coalesce(intro_route->>'recommended_action','Use the strongest recorded introduction path.')
      when direct_score>0 then 'Warm the existing direct relationship before relying on it for a deal decision.'
      when intro_score>=65 then coalesce(intro_route->>'recommended_action','Use the recorded introduction path carefully.')
      else 'No credible access route is recorded yet.' end
  ) order by rank),'[]'::jsonb)
  into v_people from ranked;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',v_deal.id,
    'organisation',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'league_name',v_org.league_name),
    'people',v_people,
    'summary',jsonb_build_object(
      'recorded_staff',jsonb_array_length(v_people),
      'primary_roles',(select count(*) from jsonb_array_elements(v_people) x where x.value->>'role_proximity'='primary_football_decision_role'),
      'warm_direct_roles',(select count(*) from jsonb_array_elements(v_people) x where x.value->>'route_mode'='direct_warm'),
      'strong_introduction_roles',(select count(*) from jsonb_array_elements(v_people) x where x.value->>'route_mode'='strong_introduction_available')
    ),
    'truth_contract','Role proximity is inferred from recorded job title. It does not prove formal signing authority or final decision ownership.'
  );
end;
$$;

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
  v_weighted_commission numeric:=0;
  v_next_move jsonb:=null;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_deal.organisation_id and o.tenant_id=p_tenant_id;
  if v_deal.player_id is not null then select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id; end if;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;

  v_control:=platform.deal_control_health(p_tenant_id,p_deal_room_id);
  v_decision_map:=public.platform_server_deal_decision_map(p_tenant_id,p_deal_room_id);
  v_account:=public.platform_server_club_account(p_tenant_id,v_deal.organisation_id);
  v_evidence:=v_control->'factors'->'evidence_health'->'detail';
  begin v_direct_score:=coalesce((v_control->'factors'->'access_execution'->>'direct_access_score')::integer,0); exception when others then v_direct_score:=0; end;
  begin v_intro_score:=coalesce((v_control->'factors'->'access_execution'->>'best_introduction_score')::integer,0); exception when others then v_intro_score:=0; end;
  begin v_evidence_score:=coalesce((v_evidence->>'score')::integer,50); exception when others then v_evidence_score:=50; end;

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
      'step',v_step,'step_type','verify_evidence','priority','blocking','executable',true,
      'instruction','Verify the stale, weak or contradictory facts before making the next commercial move.',
      'success_condition','Evidence health reaches the normal-action threshold or the uncertainty is explicitly resolved.',
      'evidence_health',v_evidence
    ));
  end if;

  if v_deal.owner_user_id is null then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','assign_owner','priority','control','executable',false,
      'instruction','Assign one accountable deal owner before adding more activity.',
      'success_condition','One active agency team member owns the deal.'
    ));
  end if;

  if v_direct_score<60 and v_intro_score>=80 then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','request_warm_introduction','priority','access','executable',true,
      'instruction',coalesce(v_account->'access'->'introductions'->'best_route'->>'recommended_action','Use the strongest recorded warm-introduction route.'),
      'success_condition','A fresh interaction occurs with the target contact or target club.',
      'introduction_context',v_account->'access'->'introductions'->'best_route'
    ));
  end if;

  if nullif(trim(v_deal.primary_blocker),'') is not null then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','resolve_blocker','priority','commercial','executable',true,
      'instruction','Resolve blocker: '||v_deal.primary_blocker,
      'success_condition','The recorded blocker is removed, superseded or the deal moves despite it.',
      'blocker',v_deal.primary_blocker
    ));
  end if;

  if nullif(trim(v_deal.next_action_text),'') is null or v_deal.next_action_at is null or v_deal.next_action_at<now() then
    v_step:=v_step+1;
    v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','set_next_action','priority','control','executable',true,'requires_input',true,
      'instruction',case when nullif(trim(v_deal.next_action_text),'') is not null then v_deal.next_action_text else 'Set the single concrete next action that creates deal movement.' end,
      'success_condition','A concrete future-dated next action is recorded and owned.',
      'current_next_action_text',v_deal.next_action_text,'current_next_action_at',v_deal.next_action_at
    ));
  end if;

  v_step:=v_step+1;
  v_sequence:=v_sequence||jsonb_build_array(jsonb_build_object(
    'step',v_step,'step_type','decision_checkpoint','priority','decision','executable',true,
    'instruction',case when nullif(trim(v_deal.next_decision),'') is not null then v_deal.next_decision else 'Define the next decision that will advance, park or close the deal.' end,
    'success_condition','The deal advances stage, is deliberately parked/lost, or the next decision is explicitly redefined.',
    'next_decision',v_deal.next_decision
  ));

  if jsonb_array_length(v_sequence)>0 then v_next_move:=v_sequence->0; end if;

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
    'evidence_health',v_evidence,
    'pursuit_readiness',v_pursuit,
    'decision_map',v_decision_map,
    'access',v_account->'access',
    'recent_interactions',v_interactions,
    'open_work',jsonb_build_object('tasks',v_tasks,'commitments',v_commitments),
    'closing_sequence',v_sequence,
    'next_best_move',v_next_move,
    'truth_contract',jsonb_build_object(
      'probability','recorded_agent_or_model_estimate_only','attention','strategic_priority_not_probability','control','execution_quality_not_probability',
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
  v_total integer;
begin
  with rooms as (
    select d.id
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active'
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
    'evidence_score',(item->'evidence_health'->>'score')::integer,'evidence_state',item->'evidence_health'->>'state',
    'direct_access_score',(item->'control_health'->'factors'->'access_execution'->>'direct_access_score')::integer,
    'best_introduction_score',(item->'control_health'->'factors'->'access_execution'->>'best_introduction_score')::integer,
    'primary_blocker',item->'deal'->>'primary_blocker','next_decision',item->'deal'->>'next_decision',
    'next_best_move',item->'next_best_move','control_gaps',item->'control_health'->'gaps'
  ) order by rank) filter(where rank<=v_limit),'[]'::jsonb),count(*)::integer
  into v_items,v_total
  from ranked;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'deals',v_items,
    'summary',jsonb_build_object(
      'active_deals',v_total,'visible_deals',jsonb_array_length(v_items),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_items),0),
      'controlled_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'control_state'='controlled'),
      'fragile_or_exposed_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'control_state' in ('fragile','exposed')),
      'evidence_blocked_deals',(select count(*) from jsonb_array_elements(v_items) x where coalesce((x.value->>'evidence_score')::integer,0)<65),
      'deals_with_strong_introduction_option',(select count(*) from jsonb_array_elements(v_items) x where coalesce((x.value->>'direct_access_score')::integer,0)<60 and coalesce((x.value->>'best_introduction_score')::integer,0)>=80)
    ),
    'principle','Use attention to decide where to focus and control health to decide what must be fixed inside each deal. Neither is a success probability.'
  );
end;
$$;

revoke execute on function platform.deal_control_health(uuid,uuid) from public,anon,authenticated;
grant execute on function platform.deal_control_health(uuid,uuid) to service_role;
revoke execute on function public.platform_server_deal_decision_map(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_decision_map(uuid,uuid) to service_role;
revoke execute on function public.platform_server_deal_war_room(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_war_room(uuid,uuid) to service_role;
revoke execute on function public.platform_server_deal_portfolio(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_portfolio(uuid,integer) to service_role;;
