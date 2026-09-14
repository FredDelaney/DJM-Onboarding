create or replace function public.platform_server_player_value_proof_portfolio(p_tenant_id uuid, p_window_days integer default 30, p_limit integer default 100)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with params as (
  select now()-make_interval(days=>greatest(1,least(coalesce(p_window_days,30),366))) as since_at
), players as (
  select p.id,coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name
  from public.players p where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
), task_counts as (
  select t.player_id,count(*)::int n from djm_os.tasks t,params x where t.tenant_id=p_tenant_id and t.player_id is not null and t.completed_at>=x.since_at group by t.player_id
), request_counts as (
  select r.player_id,count(*)::int n from public.player_requests r join players p on p.id=r.player_id,params x where r.completed_at>=x.since_at group by r.player_id
), strategy_counts as (
  select s.player_id,
    count(*) filter(where s.created_at>=x.since_at)::int versions,
    count(*) filter(where s.player_confirmed_at>=x.since_at)::int confirmations,
    count(*) filter(where s.approved_at>=x.since_at)::int approvals
  from platform.player_career_strategies s,params x where s.tenant_id=p_tenant_id group by s.player_id
), match_counts as (
  select m.player_id,count(*)::int n from djm_os.player_matches m,params x where m.tenant_id=p_tenant_id and m.created_at>=x.since_at group by m.player_id
), opp_counts as (
  select o.player_id,count(*)::int n from public.player_opportunities o,params x where o.tenant_id=p_tenant_id and o.created_at>=x.since_at group by o.player_id
), deal_counts as (
  select d.player_id,
    count(*) filter(where d.created_at>=x.since_at)::int opened,
    count(*) filter(where d.status='won' and d.closed_at>=x.since_at)::int won
  from djm_os.deal_rooms d,params x where d.tenant_id=p_tenant_id and d.player_id is not null group by d.player_id
), snap_ranked as (
  select d.player_id,s.observed_at,s.stage,lag(s.stage) over(partition by s.deal_room_id order by s.observed_at,s.id) previous_stage
  from platform.deal_state_snapshots s join djm_os.deal_rooms d on d.id=s.deal_room_id and d.tenant_id=s.tenant_id
  where s.tenant_id=p_tenant_id and d.player_id is not null
), stage_counts as (
  select q.player_id,count(*)::int n from snap_ranked q,params x
  where q.observed_at>=x.since_at and q.previous_stage is not null and q.stage is not null and q.stage<>q.previous_stage
    and (case q.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
      > (case q.previous_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
  group by q.player_id
), facts as (
  select p.id,p.player_name,
    coalesce(tc.n,0) tasks_completed,coalesce(rc.n,0) requests_resolved,
    coalesce(sc.versions,0) strategy_versions,coalesce(sc.confirmations,0) strategy_confirmations,coalesce(sc.approvals,0) strategy_approvals,
    coalesce(mc.n,0) matches_added,coalesce(oc.n,0) opportunities_opened,coalesce(dc.opened,0) deals_opened,coalesce(dc.won,0) deals_won,coalesce(st.n,0) stage_advances
  from players p
  left join task_counts tc on tc.player_id=p.id left join request_counts rc on rc.player_id=p.id left join strategy_counts sc on sc.player_id=p.id
  left join match_counts mc on mc.player_id=p.id left join opp_counts oc on oc.player_id=p.id left join deal_counts dc on dc.player_id=p.id left join stage_counts st on st.player_id=p.id
), classified as (
  select f.*,
    case when deals_won>0 or stage_advances>0 or deals_opened>0 then 'material_market_change_recorded'
         when tasks_completed+requests_resolved+strategy_versions+strategy_confirmations+strategy_approvals+matches_added+opportunities_opened>0 then 'service_delivery_recorded'
         else 'thin_recorded_evidence' end proof_state
  from facts f
), ranked as (
  select *,row_number() over(order by case proof_state when 'thin_recorded_evidence' then 1 when 'service_delivery_recorded' then 2 else 3 end,player_name) rn from classified
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'window_days',greatest(1,least(coalesce(p_window_days,30),366)),
  'summary',jsonb_build_object(
    'active_players',(select count(*) from players),
    'players_with_thin_recorded_evidence',(select count(*) from classified where proof_state='thin_recorded_evidence'),
    'players_with_recorded_service_delivery',(select count(*) from classified where proof_state='service_delivery_recorded'),
    'players_with_material_market_change',(select count(*) from classified where proof_state='material_market_change_recorded')
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'player_id',id,'player_name',player_name,'proof_state',proof_state,
    'service_delivery',jsonb_build_object('agency_work_completed',tasks_completed,'player_requests_resolved',requests_resolved,'career_strategy_versions_created',strategy_versions,'career_strategy_confirmations',strategy_confirmations,'career_strategy_approvals',strategy_approvals),
    'market_work',jsonb_build_object('market_matches_added',matches_added,'opportunities_opened',opportunities_opened,'club_processes_opened',deals_opened,'recorded_deal_stage_advances',stage_advances,'recorded_deals_won',deals_won),
    'open_full_proof',jsonb_build_object('api_action','player_value_proof','player_id',id)
  ) order by rn) from ranked where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),
  'truth_contract',jsonb_build_object('thin_evidence','Thin recorded evidence means DJM has little recorded service change in the selected window. It does not prove that no offline work occurred.','no_score','Players are grouped by recorded proof state; no composite agent-performance or player-satisfaction score is calculated.','performance_scope','This portfolio uses compact recorded facts only. Full player-safe proof is generated on demand.')
);
$$;

create or replace function public.platform_server_club_portfolio_control(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with relevant_orgs as (
  select organisation_id from djm_os.deal_rooms where tenant_id=p_tenant_id and status='active'
  union select organisation_id from djm_os.club_needs where tenant_id=p_tenant_id and status='active'
  union select organisation_id from djm_os.interactions where tenant_id=p_tenant_id and organisation_id is not null and occurred_at>=now()-interval '180 days'
), orgs as (
  select o.id,o.name,o.country,o.city,o.league_name from djm_os.organisations o join relevant_orgs r on r.organisation_id=o.id where o.tenant_id=p_tenant_id
), deals as (
  select d.organisation_id,
    count(*) filter(where d.status='active')::int active_deals,
    count(*) filter(where d.status='active' and (d.next_action_at is null or d.next_action_at<=now()))::int deals_needing_action,
    count(*) filter(where d.status='won')::int won_deals,
    count(*) filter(where d.status='lost')::int lost_deals,
    coalesce(jsonb_agg(jsonb_build_object('currency',z.currency,'active_deals',z.active_deals,'expected_commission',z.expected_commission,'weighted_commission',z.weighted_commission)) filter(where z.currency is not null),'[]'::jsonb) by_currency
  from djm_os.deal_rooms d
  left join lateral (
    select x.currency,count(*)::int active_deals,coalesce(sum(x.expected_commission),0) expected_commission,coalesce(sum(x.expected_commission*x.probability/100.0),0) weighted_commission
    from djm_os.deal_rooms x where x.tenant_id=p_tenant_id and x.organisation_id=d.organisation_id and x.status='active' group by x.currency
  ) z on true
  where d.tenant_id=p_tenant_id group by d.organisation_id
), needs as (
  select n.organisation_id,
    count(*) filter(where n.status='active')::int active_needs,
    count(*) filter(where n.status='active' and n.need_type='confirmed')::int confirmed_needs,
    min(n.expires_at) filter(where n.status='active') earliest_expiry
  from djm_os.club_needs n where n.tenant_id=p_tenant_id group by n.organisation_id
), need_matches as (
  select n.organisation_id,
    count(distinct pm.id) filter(where n.status='active' and pm.status in ('suggested','reviewing','shortlisted','pitched','active'))::int recorded_candidate_matches,
    count(distinct n.id) filter(where n.status='active' and n.need_type='confirmed' and pm.id is null)::int confirmed_needs_without_recorded_match
  from djm_os.club_needs n left join djm_os.player_matches pm on pm.tenant_id=n.tenant_id and pm.club_need_id=n.id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')
  where n.tenant_id=p_tenant_id group by n.organisation_id
), activity as (
  select i.organisation_id,count(*) filter(where i.occurred_at>=now()-interval '30 days')::int interactions_30d,max(i.occurred_at) last_interaction_at
  from djm_os.interactions i where i.tenant_id=p_tenant_id and i.organisation_id is not null group by i.organisation_id
), direct_access as (
  select distinct on (e.organisation_id) e.organisation_id,r.access_score,r.strength_score,r.trust_score,r.last_meaningful_at,p.full_name contact_name,e.role_title,r.team_member_id
  from djm_os.relationships r join djm_os.employments e on e.tenant_id=r.tenant_id and e.person_id=r.person_id and e.is_current=true
  join djm_os.people p on p.tenant_id=r.tenant_id and p.id=r.person_id
  where r.tenant_id=p_tenant_id
  order by e.organisation_id,r.access_score desc nulls last,r.strength_score desc nulls last,r.last_meaningful_at desc nulls last
), origins as (
  select d.organisation_id,count(*) filter(where o.confirmation_status='confirmed')::int confirmed_origin_deals,
    coalesce(jsonb_agg(distinct o.route_type) filter(where o.confirmation_status='confirmed' and o.route_type is not null),'[]'::jsonb) origin_routes
  from djm_os.deal_rooms d left join platform.deal_origin_attributions o on o.tenant_id=d.tenant_id and o.deal_room_id=d.id
  where d.tenant_id=p_tenant_id group by d.organisation_id
), facts as (
  select o.*,
    coalesce(d.active_deals,0) active_deals,coalesce(d.deals_needing_action,0) deals_needing_action,coalesce(d.won_deals,0) won_deals,coalesce(d.lost_deals,0) lost_deals,coalesce(d.by_currency,'[]'::jsonb) by_currency,
    coalesce(n.active_needs,0) active_needs,coalesce(n.confirmed_needs,0) confirmed_needs,n.earliest_expiry,
    coalesce(nm.recorded_candidate_matches,0) recorded_candidate_matches,coalesce(nm.confirmed_needs_without_recorded_match,0) confirmed_needs_without_recorded_match,
    coalesce(a.interactions_30d,0) interactions_30d,a.last_interaction_at,
    coalesce(da.access_score,0) direct_access_score,coalesce(da.strength_score,0) relationship_strength,da.contact_name,da.role_title,da.team_member_id,
    coalesce(og.confirmed_origin_deals,0) confirmed_origin_deals,coalesce(og.origin_routes,'[]'::jsonb) origin_routes
  from orgs o left join deals d on d.organisation_id=o.id left join needs n on n.organisation_id=o.id left join need_matches nm on nm.organisation_id=o.id
  left join activity a on a.organisation_id=o.id left join direct_access da on da.organisation_id=o.id left join origins og on og.organisation_id=o.id
), classified as (
  select f.*,
    case when active_deals>0 and deals_needing_action>0 then 'protect_live_business'
         when confirmed_needs_without_recorded_match>0 then 'fill_confirmed_roster_gap'
         when confirmed_needs>0 and recorded_candidate_matches>0 then 'review_confirmed_demand_candidate'
         when active_deals>0 then 'maintain_live_business'
         when active_needs>0 and direct_access_score<50 then 'develop_access_for_live_demand'
         when active_needs>0 then 'develop_live_demand'
         else 'relationship_development' end control_state,
    case when active_deals>0 and deals_needing_action>0 then 1 when confirmed_needs_without_recorded_match>0 then 2 when confirmed_needs>0 and recorded_candidate_matches>0 then 3 when active_deals>0 then 4 when active_needs>0 and direct_access_score<50 then 5 when active_needs>0 then 6 else 7 end control_rank
  from facts f
), ranked as (
  select *,row_number() over(order by control_rank,confirmed_needs desc,active_deals desc,direct_access_score desc,last_interaction_at desc nulls last,name) rn from classified
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'summary',jsonb_build_object(
    'relevant_clubs',(select count(*) from classified),
    'live_business_to_protect',(select count(*) from classified where control_state='protect_live_business'),
    'confirmed_roster_gaps',(select sum(confirmed_needs_without_recorded_match) from classified),
    'confirmed_demand_with_recorded_candidates',(select count(*) from classified where control_state='review_confirmed_demand_candidate'),
    'live_demand_access_development',(select count(*) from classified where control_state='develop_access_for_live_demand')
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'rank',rn,'organisation_id',id,'club',jsonb_build_object('name',name,'country',country,'city',city,'league_name',league_name),'state',control_state,
    'live_business',jsonb_build_object('active_deals',active_deals,'deals_needing_action',deals_needing_action,'commercial_by_currency',by_currency),
    'demand',jsonb_build_object('active_needs',active_needs,'confirmed_needs',confirmed_needs,'recorded_candidate_matches',recorded_candidate_matches,'confirmed_needs_without_recorded_match',confirmed_needs_without_recorded_match,'earliest_expiry',earliest_expiry),
    'direct_relationship',jsonb_build_object('access_score',direct_access_score,'relationship_strength',relationship_strength,'best_recorded_contact',contact_name,'role_title',role_title,'team_member_id',team_member_id),
    'relationship_activity',jsonb_build_object('interactions_30d',interactions_30d,'last_interaction_at',last_interaction_at),
    'historical_evidence',jsonb_build_object('won_deals',won_deals,'lost_deals',lost_deals,'confirmed_origin_deals',confirmed_origin_deals,'recorded_origin_routes',origin_routes),
    'next_action',case control_state
      when 'protect_live_business' then jsonb_build_object('api_action','deal_portfolio','instruction','Protect the live deals that currently need action before chasing new account activity.')
      when 'fill_confirmed_roster_gap' then jsonb_build_object('api_action','scouting_mandates','instruction','Turn the confirmed uncovered need into a scouting mandate.')
      when 'review_confirmed_demand_candidate' then jsonb_build_object('api_action','origination_command','instruction','Review career permission and the best route before escalating the recorded candidate.')
      when 'maintain_live_business' then jsonb_build_object('api_action','deal_portfolio','instruction','Maintain disciplined execution on the current live business.')
      when 'develop_access_for_live_demand' then jsonb_build_object('api_action','access_routes','instruction','Improve the club route before spending the player relationship.')
      when 'develop_live_demand' then jsonb_build_object('api_action','demand_coverage','instruction','Review the live demand and whether the agency can credibly serve it.')
      else jsonb_build_object('api_action','club_account','instruction','Develop the relationship deliberately; no live business or demand currently forces action.') end
  ) order by rn) from ranked where rn<=greatest(1,least(coalesce(p_limit,100),250))),'[]'::jsonb),
  'principle','Use fast recorded account facts on the portfolio surface. Open the deep club account or origination workflow for pursuit gates, introduction paths and detailed relationship intelligence.',
  'truth_contract',jsonb_build_object(
    'no_club_score','No composite club priority score is used in this control surface.',
    'candidate','A recorded player match means a candidate exists in DJM; it does not mean the player is career-cleared or that the club has accepted the player.',
    'access','The fast portfolio shows the best recorded direct relationship only. Warm-introduction intelligence remains available in the deep club and origination workflows.',
    'history','Won/lost and origin counts are recorded history, not a forecast of future conversion.',
    'demand','Confirmed and predicted needs remain distinct in the underlying need record; confirmed demand is never inferred from a prediction.'
  )
);
$$;

revoke all on function public.platform_server_player_value_proof_portfolio(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_value_proof_portfolio(uuid,integer,integer) to service_role;
revoke all on function public.platform_server_club_portfolio_control(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_club_portfolio_control(uuid,integer) to service_role;
;
