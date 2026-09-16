create or replace function public.platform_server_demand_control_fast(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with needs as (
  select n.*,o.name club_name,o.country,o.city,o.league_name
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id and n.status='active' and (n.expires_at is null or n.expires_at>=now())
  order by case n.need_type when 'confirmed' then 0 else 1 end,n.priority desc,n.expires_at nulls last,n.received_at desc
  limit greatest(1,least(coalesce(p_limit,100),250))
), candidate_rows as materialized (
  select pm.club_need_id,pm.id player_match_id,pm.player_id,pm.status match_status,
    coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
    public.platform_server_career_pursuit_gate(p_tenant_id,pm.id) gate
  from djm_os.player_matches pm join needs n on n.id=pm.club_need_id
  join public.players p on p.id=pm.player_id and p.tenant_id=pm.tenant_id
  where pm.tenant_id=p_tenant_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')
), candidate_agg as (
  select c.club_need_id,
    count(*)::int recorded_candidates,
    count(*) filter(where c.gate->>'state' like 'open_%')::int career_open,
    count(*) filter(where c.gate->>'state' like 'review_%')::int human_review,
    count(*) filter(where not (c.gate->>'state' like 'open_%') and not (c.gate->>'state' like 'review_%'))::int held,
    coalesce(jsonb_agg(jsonb_build_object('player_match_id',c.player_match_id,'player_id',c.player_id,'player_name',c.player_name,'match_status',c.match_status,'career_gate_state',c.gate->>'state','career_gate_reason',c.gate->>'reason') order by c.player_name),'[]'::jsonb) candidates
  from candidate_rows c group by c.club_need_id
), direct_access as (
  select distinct on (e.organisation_id) e.organisation_id,r.access_score,r.strength_score,r.trust_score,r.last_meaningful_at,p.full_name contact_name,e.role_title,r.team_member_id
  from djm_os.relationships r join djm_os.employments e on e.tenant_id=r.tenant_id and e.person_id=r.person_id and e.is_current=true
  join djm_os.people p on p.tenant_id=r.tenant_id and p.id=r.person_id
  where r.tenant_id=p_tenant_id
  order by e.organisation_id,r.access_score desc nulls last,r.strength_score desc nulls last,r.last_meaningful_at desc nulls last
), base as (
  select n.*,coalesce(c.recorded_candidates,0) recorded_candidates,coalesce(c.career_open,0) career_open,coalesce(c.human_review,0) human_review,coalesce(c.held,0) held,coalesce(c.candidates,'[]'::jsonb) candidates,
    coalesce(d.access_score,0)::int direct_score,coalesce(d.strength_score,0)::int direct_strength,d.contact_name,d.role_title,d.team_member_id,
    case when coalesce(d.access_score,0)<70 then public.platform_server_introduction_routes(p_tenant_id,n.organisation_id,1) else null end intro
  from needs n left join candidate_agg c on c.club_need_id=n.id left join direct_access d on d.organisation_id=n.organisation_id
), classified as (
  select b.*,
    coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0) intro_score,
    case when b.direct_score>=70 then 'direct_route'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=70 and coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=b.direct_score+10 then 'warm_introduction'
         when b.direct_score>0 then 'developing_direct_route'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>0 then 'developing_introduction'
         else 'no_recorded_route' end access_mode,
    case when b.recorded_candidates=0 then 'roster_gap'
         when b.career_open=0 and b.human_review>0 then 'career_or_human_review_required'
         when b.career_open=0 then 'career_blocked'
         when b.direct_score>=70 then 'ready_direct'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=70 and coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=b.direct_score+10 then 'ready_via_introduction'
         else 'access_gap' end coverage_state
  from base b
), ranked as (
  select c.*,row_number() over(order by case c.need_type when 'confirmed' then 0 else 1 end,
    case c.coverage_state when 'ready_direct' then 1 when 'ready_via_introduction' then 2 when 'access_gap' then 3 when 'career_or_human_review_required' then 4 when 'career_blocked' then 5 when 'roster_gap' then 6 else 9 end,
    c.priority desc,c.expires_at nulls last,c.club_name,c.title) rn
  from classified c
), items as (
  select r.*,case r.coverage_state
    when 'roster_gap' then jsonb_build_object('action_type','scout_or_recruit_for_need','instruction','No recorded roster match exists for this active club need. Scout or recruit against the recorded profile rather than forcing an unsuitable player.','requires_human_input',true)
    when 'career_or_human_review_required' then jsonb_build_object('action_type','resolve_pursuit_gate','instruction','A recorded candidate exists, but career-strategy or human review must be resolved before external escalation.','requires_human_input',true)
    when 'career_blocked' then jsonb_build_object('action_type','resolve_player_strategy_control','instruction','Recorded candidates exist but none are open under the player career controls.','requires_human_input',true)
    when 'ready_direct' then jsonb_build_object('action_type','open_deep_pursuit_review','instruction','A career-open candidate and strong direct route are recorded. Open the full pursuit review before any external pitch.','requires_human_input',true)
    when 'ready_via_introduction' then jsonb_build_object('action_type','open_deep_pursuit_review','instruction','A career-open candidate exists and a warm introduction is the stronger route. Open the full pursuit review before using it.','requires_human_input',true)
    else jsonb_build_object('action_type','build_club_access','instruction','A career-open candidate exists, but access is not yet strong enough. Build or source the route before spending the player relationship.','requires_human_input',true) end next_action
  from ranked r
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'summary',jsonb_build_object(
    'active_needs',(select count(*) from items),
    'ready_for_deep_pursuit_review',(select count(*) from items where coverage_state in ('ready_direct','ready_via_introduction')),
    'roster_gaps',(select count(*) from items where coverage_state='roster_gap'),
    'access_gaps',(select count(*) from items where coverage_state='access_gap'),
    'career_or_human_review',(select count(*) from items where coverage_state in ('career_or_human_review_required','career_blocked'))
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'command_rank',rn,'club_need_id',id,
    'club',jsonb_build_object('organisation_id',organisation_id,'name',club_name,'country',country,'city',city,'league_name',league_name),
    'need',jsonb_build_object('title',title,'position',position,'secondary_position',secondary_position,'preferred_foot',preferred_foot,'min_age',min_age,'max_age',max_age,'min_height_cm',min_height_cm,'transfer_type',transfer_type,'transfer_budget',transfer_budget,'salary_budget',salary_budget,'currency',currency,'salary_period',salary_period,'priority',priority,'need_type',need_type,'confidence',confidence,'prediction_probability',prediction_probability,'confirmed_at',confirmed_at,'expires_at',expires_at,'received_at',received_at),
    'coverage_state',coverage_state,
    'candidate_coverage',jsonb_build_object('recorded_candidates',recorded_candidates,'career_open',career_open,'human_review',human_review,'held',held,'candidates',candidates),
    'access',jsonb_build_object('mode',access_mode,'direct_score',direct_score,'direct_strength',direct_strength,'best_direct_contact',contact_name,'best_direct_role',role_title,'team_member_id',team_member_id,'introduction_score',intro_score,'best_introduction_route',intro->'best_route'),
    'next_action',next_action
  ) order by rn) from items),'[]'::jsonb),
  'principle','Use a compact demand-control pass for portfolio allocation, preserving player-career gates and recorded access. Open the deep pursuit model before an external pitch.',
  'truth_contract',jsonb_build_object(
    'demand','Confirmed and predicted needs remain distinct. Predicted need is not treated as confirmed club instruction.',
    'candidate','Recorded candidates are existing player-match records; no new football fit is invented by this fast control.',
    'career','Every recorded candidate still passes through the human-owned career pursuit gate.',
    'access','Direct access uses the best recorded direct relationship. Warm-introduction logic is checked only when direct access is below the operating threshold.',
    'deep_review','Fast demand control does not calculate full pursuit readiness or transfer probability. A ready state means the prerequisites for deep human review are recorded.'
  )
);
$$;

create or replace function platform.build_origination_from_demand(p_tenant_id uuid,p_cov jsonb,p_limit integer default 25)
returns jsonb
language sql
stable
set search_path=''
as $$
with x as (
  select value item,
    case value#>>'{need,need_type}' when 'confirmed' then 0 else 1 end certainty_rank,
    case value->>'coverage_state' when 'ready_direct' then 1 when 'ready_via_introduction' then 2 when 'access_gap' then 3 when 'career_or_human_review_required' then 4 when 'career_blocked' then 5 when 'roster_gap' then 6 else 9 end action_rank,
    coalesce((value#>>'{need,priority}')::integer,3) priority,
    nullif(value#>>'{need,expires_at}','')::timestamptz expires_at
  from jsonb_array_elements(coalesce(p_cov->'items','[]'::jsonb))
), ranked as (
  select *,row_number() over(order by certainty_rank,action_rank,priority desc,expires_at nulls last,item#>>'{club,name}',item#>>'{need,title}') rn from x
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'items',coalesce(jsonb_agg(item||jsonb_build_object('command_rank',rn,'why_now',case
    when item#>>'{need,need_type}'='confirmed' and item->>'coverage_state'='ready_direct' then 'Confirmed demand, a career-open recorded candidate and strong direct access are present. Open the deep pursuit review before external pitch.'
    when item#>>'{need,need_type}'='confirmed' and item->>'coverage_state'='ready_via_introduction' then 'Confirmed demand and a career-open recorded candidate exist; the recorded warm introduction is stronger than direct access. Open deep pursuit review before use.'
    when item#>>'{need,need_type}'='confirmed' and item->>'coverage_state'='roster_gap' then 'Confirmed club demand exists but no recorded roster match exists, creating a concrete scouting brief.'
    when item->>'coverage_state' like '%career%' then 'A recorded player match exists, but player-career control must be resolved before external escalation.'
    when item->>'coverage_state'='access_gap' then 'A career-open candidate exists but recorded club access is the operating bottleneck.'
    when item#>>'{need,need_type}'='predicted' then 'This is predicted demand only; treat it as preparation, not confirmed club instruction.'
    else 'Recorded demand has a defined operating next step.' end) order by rn) filter(where rn<=greatest(1,least(coalesce(p_limit,25),100))),'[]'::jsonb),
  'coverage_summary',p_cov->'summary',
  'ranking_policy',jsonb_build_object('order',jsonb_build_array('confirmed demand before predicted demand','ready direct route','ready warm-introduction route','access gap','career/human review','roster gap','higher recorded club priority','earlier expiry'),'no_composite_score',true),
  'truth_contract',p_cov->'truth_contract'
) from ranked;
$$;

create or replace function platform.build_scouting_from_demand(p_tenant_id uuid,p_cov jsonb,p_limit integer default 50)
returns jsonb
language sql
stable
set search_path=''
as $$
with x as (
  select value item,row_number() over(order by case value#>>'{need,need_type}' when 'confirmed' then 0 else 1 end,coalesce((value#>>'{need,priority}')::integer,3) desc,nullif(value#>>'{need,expires_at}','')::timestamptz nulls last,value#>>'{club,name}',value#>>'{need,title}') rn
  from jsonb_array_elements(coalesce(p_cov->'items','[]'::jsonb)) where value->>'coverage_state'='roster_gap'
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'items',coalesce(jsonb_agg(jsonb_build_object('rank',rn,'club_need_id',item->>'club_need_id','club',item->'club','profile',item->'need','access',item->'access','mandate_state','candidate_search_required','prepare_action',jsonb_build_object('api_action','scouting_mandate_prepare','club_need_id',item->>'club_need_id','human_confirmation_required',true),'success_definition','At least one new recorded player match is created for this club need. Completing the scouting task alone is not downstream success.') order by rn) filter(where rn<=greatest(1,least(coalesce(p_limit,50),100))),'[]'::jsonb),
  'mandate_count',count(*) filter(where rn<=greatest(1,least(coalesce(p_limit,50),100))),
  'principle','Turn genuine roster gaps against recorded club demand into explicit scouting work. Do not create a mandate when a recorded candidate already exists.',
  'truth_contract',p_cov->'truth_contract'
) from x;
$$;

create or replace function public.platform_server_origination_command_fast(p_tenant_id uuid,p_limit integer default 25)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_cov jsonb:=public.platform_server_demand_control_fast(p_tenant_id,200); begin return platform.build_origination_from_demand(p_tenant_id,v_cov,p_limit); end;
$$;

create or replace function public.platform_server_scouting_mandates(p_tenant_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_cov jsonb:=public.platform_server_demand_control_fast(p_tenant_id,200); begin return platform.build_scouting_from_demand(p_tenant_id,v_cov,p_limit); end;
$$;

revoke all on function platform.build_origination_from_demand(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function platform.build_scouting_from_demand(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.platform_server_demand_control_fast(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_origination_command_fast(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_scouting_mandates(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_demand_control_fast(uuid,integer) to service_role;
grant execute on function public.platform_server_origination_command_fast(uuid,integer) to service_role;
grant execute on function public.platform_server_scouting_mandates(uuid,integer) to service_role;

create or replace function public.platform_server_agency_control_centre(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,50);
  v_roster jsonb:=public.platform_server_roster_command(p_tenant_id,12);
  v_demand jsonb:=public.platform_server_demand_control_fast(p_tenant_id,100);
  v_origination jsonb:=platform.build_origination_from_demand(p_tenant_id,v_demand,12);
  v_scouting jsonb:=platform.build_scouting_from_demand(p_tenant_id,v_demand,10);
  v_revenue jsonb:=public.platform_server_revenue_command(p_tenant_id,10);
  v_capacity jsonb:=public.platform_server_team_capacity(p_tenant_id);
  v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120);
  v_ready jsonb:=public.platform_server_go_live_readiness(p_tenant_id);
  v_learning jsonb:=public.platform_server_learning_center(p_tenant_id);
  v_relationships jsonb:=public.platform_server_player_relationship_control(p_tenant_id,20);
  v_clubs jsonb:=public.platform_server_club_portfolio_control(p_tenant_id,20);
  v_proof jsonb:=public.platform_server_player_value_proof_portfolio(p_tenant_id,30,20);
  v_service_lane jsonb; v_roster_lane jsonb; v_origin_lane jsonb; v_revenue_lane jsonb; v_relationship_lane jsonb; v_club_lane jsonb; v_proof_lane jsonb;
  v_state text;
begin
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_service_lane from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_roster_lane from jsonb_array_elements(coalesce(v_roster->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_origin_lane from jsonb_array_elements(coalesce(v_origination->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_revenue_lane from jsonb_array_elements(coalesce(v_revenue->'protect_revenue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_relationship_lane from jsonb_array_elements(coalesce(v_relationships->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_club_lane from jsonb_array_elements(coalesce(v_clubs->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_proof_lane from jsonb_array_elements(coalesce(v_proof->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  v_state:=case when coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0)>0 then 'operating_controls_need_attention' when coalesce(v_ready->>'state','')<>'ready_for_controlled_use' then 'setup_gaps_remain' when coalesce((v_demand#>>'{summary,ready_for_deep_pursuit_review}')::integer,0)>0 then 'commercial_execution_available' else 'controlled' end;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,
    'executive_summary',jsonb_build_object(
      'active_players',coalesce((v_roster#>>'{summary,active_players}')::integer,0),'active_deals',coalesce((v_assurance#>>'{summary,active_deals}')::integer,0),'service_standard_breaches',coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0),
      'players_without_primary_owner',coalesce((v_capacity#>>'{summary,active_players_without_primary_owner}')::integer,0),'deals_without_owner',coalesce((v_capacity#>>'{summary,active_deals_without_owner}')::integer,0),
      'club_needs_ready_for_deep_review',coalesce((v_demand#>>'{summary,ready_for_deep_pursuit_review}')::integer,0),'club_need_roster_gaps',coalesce((v_demand#>>'{summary,roster_gaps}')::integer,0),
      'representation_records_needing_review',coalesce((v_rep#>>'{summary,records_needing_review}')::integer,0),'players_needing_immediate_service_intervention',coalesce((v_relationships#>>'{summary,immediate_service_interventions}')::integer,0),
      'live_club_business_to_protect',coalesce((v_clubs#>>'{summary,live_business_to_protect}')::integer,0),'players_with_thin_30d_value_proof',coalesce((v_proof#>>'{summary,players_with_thin_recorded_evidence}')::integer,0),
      'go_live_state',v_ready->>'state','learning_maturity',v_learning->>'maturity_state'),
    'lanes',jsonb_build_object(
      'service_control',jsonb_build_object('summary',v_assurance->'summary','items',v_service_lane),
      'player_relationship_control',jsonb_build_object('summary',v_relationships->'summary','items',v_relationship_lane),
      'player_value_proof',jsonb_build_object('window_days',30,'summary',v_proof->'summary','items',v_proof_lane),
      'roster_effort',jsonb_build_object('summary',v_roster->'summary','items',v_roster_lane),
      'club_demand_origination',jsonb_build_object('summary',v_demand->'summary','items',v_origin_lane,'deep_review_action','origination_command'),
      'club_portfolio',jsonb_build_object('summary',v_clubs->'summary','items',v_club_lane),
      'revenue_execution',jsonb_build_object('commercial_hygiene',v_revenue->'commercial_hygiene','pipeline_creation',v_revenue->'pipeline_creation','by_currency',v_revenue->'by_currency','items',v_revenue_lane),
      'scouting_mandates',jsonb_build_object('count',v_scouting->'mandate_count','items',v_scouting->'items')),
    'governance',jsonb_build_object('team_capacity_summary',v_capacity->'summary','representation_summary',v_rep->'summary','go_live',jsonb_build_object('state',v_ready->>'state','summary',v_ready->'summary','next_action',v_ready->'next_action'),'learning',jsonb_build_object('maturity_state',v_learning->>'maturity_state','next_learning_action',v_learning->'next_learning_action')),
    'truth_contract',jsonb_build_object('no_composite_score','The Control Centre intentionally keeps player service, value proof, revenue, demand, club accounts, ownership and setup controls in separate lanes rather than collapsing them into one opaque score.','demand_fast_path','HOME uses compact demand control and preserves player-career permission and recorded access. Full pursuit readiness is calculated only when the opportunity is opened.','value_proof','Thin recorded proof never means no work occurred; it means DJM has little captured evidence in the selected period.','revenue','Commercial exposure is shown by recorded currency and is not converted across currencies or treated as guaranteed revenue.','scope','Only work and facts recorded in the platform are visible.')
  );
end;
$$;

revoke all on function public.platform_server_agency_control_centre(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_agency_control_centre(uuid) to service_role;
;
