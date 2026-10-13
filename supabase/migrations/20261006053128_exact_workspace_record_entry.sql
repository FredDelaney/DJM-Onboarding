-- Exact search entry uses the same recorded candidate and career controls as the demand list.
create or replace function public.platform_server_workspace_need_record(p_tenant_id uuid,p_user_id uuid,p_need_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
 if p_tenant_id is null or p_user_id is null or not private.user_is_tenant_admin(p_tenant_id,p_user_id) then
  raise exception 'tenant_admin_access_required' using errcode='42501';
 end if;
 with needs as (
  select n.*,o.name club_name,o.country,o.city,o.league_name
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id and n.id=p_need_id and (to_jsonb(n)->>'archived_at') is null and (to_jsonb(o)->>'archived_at') is null
  order by case n.need_type when 'confirmed' then 0 else 1 end,n.priority desc,n.expires_at nulls last,n.received_at desc

), candidate_rows as materialized (
  select pm.club_need_id,pm.id player_match_id,pm.player_id,pm.status match_status,
    coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
    public.platform_server_career_pursuit_gate(p_tenant_id,pm.id) gate
  from djm_os.player_matches pm join needs n on n.id=pm.club_need_id
  join public.players p on p.id=pm.player_id and p.tenant_id=pm.tenant_id
  where pm.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.football_status,'active')<>'retired' and pm.status in ('suggested','reviewing','shortlisted','pitched','active')
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
    'need',jsonb_build_object('status',status,'title',title,'position',position,'secondary_position',secondary_position,'preferred_foot',preferred_foot,'min_age',min_age,'max_age',max_age,'min_height_cm',min_height_cm,'transfer_type',transfer_type,'transfer_budget',transfer_budget,'salary_budget',salary_budget,'currency',currency,'salary_period',salary_period,'priority',priority,'need_type',need_type,'confidence',confidence,'prediction_probability',prediction_probability,'confirmed_at',confirmed_at,'expires_at',expires_at,'received_at',received_at),
    'coverage_state',coverage_state,
    'candidate_coverage',jsonb_build_object('recorded_candidates',recorded_candidates,'career_open',career_open,'human_review',human_review,'held',held,'candidates',candidates),
    'access',jsonb_build_object('mode',access_mode,'direct_score',direct_score,'direct_strength',direct_strength,'best_direct_contact',contact_name,'best_direct_role',role_title,'team_member_id',team_member_id,'introduction_score',intro_score,'best_introduction_route',intro->'best_route'),
    'next_action',case when status='active' and (expires_at is null or expires_at>=now()) then next_action else null end
  ) order by rn) from items),'[]'::jsonb),
  'principle','Use a compact demand-control pass for portfolio allocation, preserving player-career gates and recorded access. Open the deep pursuit model before an external pitch.',
  'truth_contract',jsonb_build_object(
    'demand','Confirmed and predicted needs remain distinct. Predicted need is not treated as confirmed club instruction.',
    'candidate','Recorded candidates are existing player-match records; no new football fit is invented by this fast control.',
    'career','Every recorded candidate still passes through the human-owned career pursuit gate.',
    'access','Direct access uses the best recorded direct relationship. Warm-introduction logic is checked only when direct access is below the operating threshold.',
    'deep_review','Fast demand control does not calculate full pursuit readiness or transfer probability. A ready state means the prerequisites for deep human review are recorded.'
  )
) into v_result;
 return jsonb_build_object('available',jsonb_array_length(v_result->'items')>0,'item',v_result#>'{items,0}');
end;
$function$;
revoke all on function public.platform_server_workspace_need_record(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_workspace_need_record(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
