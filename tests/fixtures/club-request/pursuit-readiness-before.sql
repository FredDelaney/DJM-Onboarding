-- Exact staging read models captured 29 October 2026 before the unknown-assessment correction.
-- Dependencies are supplied by the focused database fixture, never by live player data.

CREATE OR REPLACE FUNCTION public.platform_server_pursuit_readiness_core(p_tenant_id uuid, p_club_need_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match djm_os.player_matches%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_org djm_os.organisations%rowtype;
  v_player public.players%rowtype;
  v_access jsonb;
  v_best_route jsonb;
  v_route_score numeric := 0;
  v_route_state text := 'no_route';
  v_football numeric;
  v_registration numeric;
  v_commercial numeric;
  v_career numeric;
  v_demand numeric;
  v_score numeric;
  v_state text;
  v_completeness numeric;
  v_missing jsonb := '[]'::jsonb;
  v_bottleneck text;
  v_min_factor numeric;
begin
  select * into v_match
  from djm_os.player_matches pm
  where pm.tenant_id=p_tenant_id and pm.club_need_id=p_club_need_id and pm.player_id=p_player_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;

  select * into v_need from djm_os.club_needs n where n.id=p_club_need_id and n.tenant_id=p_tenant_id;
  if not found then raise exception 'club_need_not_found_for_tenant'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_need.organisation_id and o.tenant_id=p_tenant_id;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if v_player.id is null then raise exception 'player_not_found_for_tenant'; end if;

  v_access := public.platform_server_access_routes(p_tenant_id,v_need.organisation_id,3);
  v_best_route := v_access->'best_route';
  if v_best_route is not null and v_best_route<>'null'::jsonb then
    v_route_score := coalesce((v_best_route->>'route_score')::numeric,0);
    v_route_state := coalesce(v_best_route->>'route_state','no_route');
  elsif v_match.access_score is not null then
    v_route_score := v_match.access_score;
    v_route_state := case when v_route_score>=75 then 'warm' when v_route_score>=60 then 'usable' when v_route_score>=45 then 'developing' else 'weak' end;
  end if;

  v_football := coalesce(v_match.football_score,v_match.overall_score,50);
  v_registration := coalesce(v_match.registration_score,50);
  v_commercial := coalesce(v_match.commercial_score,50);
  v_career := coalesce(v_match.career_score,50);
  v_demand := case
    when lower(coalesce(v_need.need_type,''))='confirmed' then least(100,80+coalesce(v_need.priority,3)*4)
    when lower(coalesce(v_need.need_type,''))='predicted' then least(85,45+coalesce(v_need.priority,3)*5)
    else least(80,40+coalesce(v_need.priority,3)*5)
  end;

  if v_match.football_score is null and v_match.overall_score is null then v_missing:=v_missing||jsonb_build_array('football_fit'); end if;
  if v_match.registration_score is null then v_missing:=v_missing||jsonb_build_array('registration'); end if;
  if v_match.commercial_score is null then v_missing:=v_missing||jsonb_build_array('commercial_fit'); end if;
  if v_match.career_score is null then v_missing:=v_missing||jsonb_build_array('career_fit'); end if;
  if coalesce((v_access->>'route_count')::integer,0)=0 and v_match.access_score is null then v_missing:=v_missing||jsonb_build_array('club_access'); end if;

  v_completeness := round((1 - jsonb_array_length(v_missing)::numeric/5.0)*100,0);

  v_score := round(
      v_football*0.30
    + v_registration*0.20
    + v_commercial*0.15
    + v_career*0.10
    + v_route_score*0.15
    + v_demand*0.10
  ,0);

  v_state := case
    when v_score>=85 then 'strong_pursuit'
    when v_score>=75 then 'credible_pursuit'
    when v_score>=65 then 'conditional_pursuit'
    else 'weak_or_blocked'
  end;

  select factor_name,factor_score into v_bottleneck,v_min_factor
  from (values
    ('football_fit'::text,v_football),
    ('registration',v_registration),
    ('commercial_fit',v_commercial),
    ('career_fit',v_career),
    ('club_access',v_route_score),
    ('demand_certainty',v_demand)
  ) factors(factor_name,factor_score)
  order by factor_score asc,factor_name
  limit 1;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'club_need_id',v_need.id,
    'player_match_id',v_match.id,
    'player',jsonb_build_object(
      'player_id',v_player.id,
      'name',trim(concat_ws(' ',v_player.first_name,v_player.last_name)),
      'primary_position',v_player.primary_position,
      'current_club',v_player.current_club,
      'football_status',v_player.football_status
    ),
    'club',jsonb_build_object(
      'organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'league_name',v_org.league_name
    ),
    'need',jsonb_build_object(
      'title',v_need.title,'position',v_need.position,'need_type',v_need.need_type,'priority',v_need.priority,
      'expires_at',v_need.expires_at,'status',v_need.status
    ),
    'readiness_score',v_score,
    'readiness_state',v_state,
    'data_completeness',v_completeness,
    'missing_factors',v_missing,
    'bottleneck',jsonb_build_object('factor',v_bottleneck,'score',v_min_factor),
    'factors',jsonb_build_object(
      'football_fit',jsonb_build_object('score',v_football,'weight',0.30,'source',case when v_match.football_score is not null then 'player_match.football_score' when v_match.overall_score is not null then 'player_match.overall_score' else 'neutral_default_missing' end),
      'registration',jsonb_build_object('score',v_registration,'weight',0.20,'source',case when v_match.registration_score is not null then 'player_match.registration_score' else 'neutral_default_missing' end),
      'commercial_fit',jsonb_build_object('score',v_commercial,'weight',0.15,'source',case when v_match.commercial_score is not null then 'player_match.commercial_score' else 'neutral_default_missing' end),
      'career_fit',jsonb_build_object('score',v_career,'weight',0.10,'source',case when v_match.career_score is not null then 'player_match.career_score' else 'neutral_default_missing' end),
      'club_access',jsonb_build_object('score',v_route_score,'weight',0.15,'route_state',v_route_state,'source',case when coalesce((v_access->>'route_count')::integer,0)>0 then 'live_relationship_route' when v_match.access_score is not null then 'player_match.access_score' else 'no_recorded_access' end),
      'demand_certainty',jsonb_build_object('score',v_demand,'weight',0.10,'source','club_need.need_type_and_priority')
    ),
    'best_access_route',v_best_route,
    'match_reasoning',v_match.reasoning,
    'interpretation','Deterministic pursuit-readiness ranking for allocating agency effort. It is not a transfer probability, success probability or valuation.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_pursuit_readiness(p_tenant_id uuid, p_club_need_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_core jsonb;
  v_match_id uuid;
  v_need_health jsonb;
  v_player_health jsonb;
  v_floor integer;
  v_mode text;
  v_evidence_state text;
  v_org_id uuid;
  v_intro jsonb;
  v_intro_score integer:=0;
  v_direct_score integer:=0;
begin
  v_core:=public.platform_server_pursuit_readiness_core(p_tenant_id,p_club_need_id,p_player_id);
  begin v_match_id:=(v_core->>'player_match_id')::uuid; exception when others then v_match_id:=null; end;
  begin v_org_id:=(v_core->'club'->>'organisation_id')::uuid; exception when others then v_org_id:=null; end;
  begin v_direct_score:=coalesce((v_core->'factors'->'club_access'->>'score')::integer,0); exception when others then v_direct_score:=0; end;

  v_need_health:=platform.command_evidence_health_v2(p_tenant_id,jsonb_build_object(
    'source_type','club_need','source_id',p_club_need_id,'club_need_id',p_club_need_id,'player_id',p_player_id,
    'command_type','Review player match for live club need','evidence',jsonb_build_object('match_id',v_match_id)));
  v_player_health:=platform.command_evidence_health_v2(p_tenant_id,jsonb_build_object(
    'source_type','player','source_id',p_player_id,'player_id',p_player_id,'command_type','Player review required','evidence','{}'::jsonb));

  v_floor:=least(coalesce((v_need_health->>'score')::integer,0),coalesce((v_player_health->>'score')::integer,0));
  v_evidence_state:=case when v_floor>=80 then 'strong' when v_floor>=65 then 'usable' when v_floor>=45 then 'verify_first' else 'weak' end;

  if v_org_id is not null then
    v_intro:=public.platform_server_introduction_routes(p_tenant_id,v_org_id,3);
    begin v_intro_score:=coalesce((v_intro->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro_score:=0; end;
  else
    v_intro:=jsonb_build_object('routes','[]'::jsonb,'route_count',0,'best_route',null);
  end if;

  v_mode:=case
    when coalesce((v_need_health->>'score')::integer,0)<65 then 'validate_demand_evidence_first'
    when coalesce((v_player_health->>'score')::integer,0)<65 then 'verify_player_evidence_first'
    when v_direct_score<60 and v_intro_score>=80 and v_core->>'readiness_state' in ('strong_pursuit','credible_pursuit') then 'use_warm_introduction_then_review'
    when v_core->>'readiness_state'='strong_pursuit' then 'ready_for_human_review'
    when v_core->>'readiness_state'='credible_pursuit' then 'improve_bottleneck_then_review'
    when v_core->>'readiness_state'='conditional_pursuit' then 'conditional_review'
    else 'do_not_prioritise_without_change'
  end;

  return v_core || jsonb_build_object(
    'pursuit_operating_mode',v_mode,
    'evidence_health',jsonb_build_object(
      'score_floor',v_floor,'state',v_evidence_state,'club_demand',v_need_health,'player_record',v_player_health,
      'principle','Pursuit readiness and evidence health remain separate. A strong player-club fit can still require evidence validation before a pitch.'),
    'introduction_context',v_intro,
    'access_strategy',jsonb_build_object(
      'direct_access_score',v_direct_score,'best_introduction_score',v_intro_score,
      'recommended_mode',case when v_direct_score>=75 then 'use_direct_route' when v_direct_score>=60 then 'direct_route_usable' when v_intro_score>=80 then 'use_warm_introduction' when v_intro_score>=65 then 'consider_introduction' else 'develop_access' end,
      'principle','Introduction strength is kept separate from direct access and does not increase the pursuit readiness score.'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_pursuit_board(p_tenant_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
  v_items jsonb;
begin
  with matches as (
    select pm.club_need_id,pm.player_id
    from djm_os.player_matches pm
    join djm_os.club_needs n on n.id=pm.club_need_id and n.tenant_id=p_tenant_id and n.status='active'
    where pm.tenant_id=p_tenant_id and pm.status in ('suggested','review','shortlisted')
  ), readiness as (
    select public.platform_server_pursuit_readiness(p_tenant_id,m.club_need_id,m.player_id) as item from matches m
  ), ranked as (
    select item,row_number() over(order by (item->>'readiness_score')::numeric desc,item->'club'->>'name',item->'player'->>'name') as rank from readiness
  )
  select coalesce(jsonb_agg(item||jsonb_build_object('rank',rank) order by rank),'[]'::jsonb)
  into v_items from ranked where rank<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,
    'summary',jsonb_build_object(
      'pursuit_count',jsonb_array_length(v_items),
      'strong_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='strong_pursuit'),
      'credible_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='credible_pursuit'),
      'conditional_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='conditional_pursuit'),
      'weak_or_blocked_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='weak_or_blocked'),
      'ready_for_human_review_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'pursuit_operating_mode'='ready_for_human_review'),
      'evidence_validation_required_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'pursuit_operating_mode' in ('validate_demand_evidence_first','verify_player_evidence_first')),
      'warm_introduction_available_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'pursuit_operating_mode'='use_warm_introduction_then_review')
    ),
    'interpretation','Ranks player-club pursuit readiness separately from evidence confidence and access-route strategy. Introduction routes are not treated as direct access or transfer probability.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_career_aligned_pursuit_board(p_tenant_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_board jsonb;
  v_item jsonb;
  v_gate jsonb;
  v_match_id uuid;
  v_open jsonb:='[]'::jsonb;
  v_review jsonb:='[]'::jsonb;
  v_hold jsonb:='[]'::jsonb;
  v_open_count integer:=0;
  v_exception_open_count integer:=0;
  v_review_count integer:=0;
  v_hold_count integer:=0;
begin
  v_board:=public.platform_server_pursuit_board(p_tenant_id,greatest(1,least(coalesce(p_limit,20),100)));
  for v_item in select value from jsonb_array_elements(coalesce(v_board->'items','[]'::jsonb)) loop
    begin v_match_id:=(v_item->>'player_match_id')::uuid; exception when others then v_match_id:=null; end;
    if v_match_id is null then
      v_gate:=jsonb_build_object('state','hold_missing_match_identity','reason','Pursuit identity is incomplete.','next_action',jsonb_build_object('action_type','repair_pursuit_identity','requires_human_input',true));
    else
      v_gate:=public.platform_server_career_pursuit_gate(p_tenant_id,v_match_id);
    end if;
    v_item:=v_item||jsonb_build_object('career_strategy_gate',v_gate);
    if (v_gate->>'state') like 'open_%' then
      v_open:=v_open||jsonb_build_array(v_item); v_open_count:=v_open_count+1;
      if v_gate->>'state'='open_approved_exception' then v_exception_open_count:=v_exception_open_count+1; end if;
    elsif (v_gate->>'state') like 'review_%' then
      v_review:=v_review||jsonb_build_array(v_item); v_review_count:=v_review_count+1;
    else
      v_hold:=v_hold||jsonb_build_array(v_item); v_hold_count:=v_hold_count+1;
    end if;
  end loop;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'items',v_open||v_review||v_hold,
    'summary',jsonb_build_object('pursuit_count',v_open_count+v_review_count+v_hold_count,'career_aligned_open',v_open_count-v_exception_open_count,'approved_exception_open',v_exception_open_count,'human_exception_review',v_review_count,'career_strategy_hold',v_hold_count),
    'principle','Pursuit readiness and player career alignment remain separate. A strong football fit cannot silently override an approved player strategy.',
    'truth_contract',jsonb_build_object('career_strategy','Only human-authored, approved and player-confirmed strategy fields create a normal open gate.','football_fit','Career alignment never alters the underlying football/commercial/registration/access readiness score.','exceptions','A pursuit-specific exception requires player confirmation plus owner/admin approval and never rewrites the base strategy.','club_profile','Free-text target club profile is not machine-interpreted as a hard gate.')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_pitch_readiness_command(p_tenant_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_board jsonb:=public.platform_server_career_aligned_pursuit_board(p_tenant_id,greatest(1,least(coalesce(p_limit,50),100)));
  v_item jsonb;
  v_items jsonb:='[]'::jsonb;
  v_player_id uuid;
  v_org_id uuid;
  v_match_id uuid;
  v_gate_state text;
  v_player public.players%rowtype;
  v_published boolean:=false;
  v_profile_verified timestamptz;
  v_active_pitch integer:=0;
  v_state text;
  v_next jsonb;
  v_rank integer:=0;
begin
  for v_item in select value from jsonb_array_elements(coalesce(v_board->'items','[]'::jsonb)) loop
    v_player_id:=(v_item#>>'{player,player_id}')::uuid;
    v_org_id:=(v_item#>>'{club,organisation_id}')::uuid;
    v_match_id:=(v_item->>'player_match_id')::uuid;
    v_gate_state:=coalesce(v_item#>>'{career_strategy_gate,state}','unknown');
    select * into v_player from public.players p where p.id=v_player_id and p.tenant_id=p_tenant_id;
    select pp.published,pp.verified_at into v_published,v_profile_verified from public.player_public_profiles pp where pp.player_id=v_player_id;
    v_published:=coalesce(v_published,false);
    select count(*) into v_active_pitch
    from public.club_share_links s
    where s.player_id=v_player_id and s.organisation_id=v_org_id and s.active=true and s.revoked_at is null and (s.expires_at is null or s.expires_at>now());

    v_state:=case
      when v_gate_state not in ('open_aligned','open_approved_exception') then 'career_control_hold'
      when v_player.id is null then 'player_record_missing'
      when v_player.verification_status<>'verified' or v_player.verified_at is null then 'player_not_verified_for_external_share'
      when not v_published then 'club_profile_not_published'
      when v_profile_verified is null then 'club_profile_not_verified'
      when v_active_pitch>0 then 'active_pitch_exists'
      else 'ready_to_prepare_pitch' end;

    v_next:=case
      when v_state='career_control_hold' then jsonb_build_object('api_action','career_alignment','player_id',v_player_id,'instruction','Resolve the human-owned career strategy gate before external pitching.')
      when v_state='player_not_verified_for_external_share' then jsonb_build_object('api_action','player_service_card','player_id',v_player_id,'instruction','Verify the player record before using a public club share.')
      when v_state='club_profile_not_published' then jsonb_build_object('api_action','player_profile','player_id',v_player_id,'instruction','Review and publish the club-facing player profile before pitching.')
      when v_state='club_profile_not_verified' then jsonb_build_object('api_action','player_profile','player_id',v_player_id,'instruction','Verify the club-facing profile before external pitching.')
      when v_state='active_pitch_exists' then jsonb_build_object('api_action','pitch_execution','player_id',v_player_id,'organisation_id',v_org_id,'instruction','Use the existing active pitch rather than creating a duplicate share.')
      else jsonb_build_object('api_action','pitch_prepare','player_match_id',v_match_id,'instruction','Prepare the external pitch for human review. Sending remains a human action.') end;

    v_rank:=v_rank+1;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'rank',v_rank,
      'player_match_id',v_match_id,
      'player',v_item->'player',
      'club',v_item->'club',
      'need',v_item->'need',
      'pursuit_readiness',jsonb_build_object('score',v_item->'readiness_score','state',v_item->'readiness_state'),
      'career_gate',v_item->'career_strategy_gate',
      'external_profile',jsonb_build_object('player_verification_status',v_player.verification_status,'player_verified_at',v_player.verified_at,'profile_published',v_published,'profile_verified_at',v_profile_verified),
      'active_pitch_count',v_active_pitch,
      'pitch_readiness_state',v_state,
      'next_action',v_next
    ));
  end loop;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,
    'summary',jsonb_build_object(
      'pursuits',v_rank,
      'ready_to_prepare_pitch',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state'='ready_to_prepare_pitch'),
      'career_holds',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state'='career_control_hold'),
      'profile_or_verification_holds',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state' in ('player_not_verified_for_external_share','club_profile_not_published','club_profile_not_verified')),
      'active_pitches',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state'='active_pitch_exists')
    ),
    'truth_contract',jsonb_build_object(
      'separation','Internal pursuit readiness, player career permission and external pitch readiness are separate controls.',
      'profile','DJM only treats a pitch as externally shareable when the player record is verified and the club-facing public profile is published and verified.',
      'send','Ready to prepare does not mean automatically send. External pitching remains a human action.',
      'duplicates','An existing active share blocks duplicate pitch creation and routes the user back to Pitch Execution.'
    )
  );
end;
$function$;

-- Immediate score consumers and unchanged enrichment wrapper from the same baseline.
CREATE OR REPLACE FUNCTION public.platform_server_agency_playbook_core(p_tenant_id uuid, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,8),20));
  v_plays jsonb;
begin
  with pursuits as (
    select x.value as item
    from jsonb_array_elements(public.platform_server_pursuit_board(p_tenant_id,50)->'items') x
    where not exists(
      select 1
      from djm_os.deal_rooms d
      where d.tenant_id=p_tenant_id
        and d.status='active'
        and d.player_id=(x.value->'player'->>'player_id')::uuid
        and (
          d.club_need_id=(x.value->>'club_need_id')::uuid
          or d.organisation_id=(x.value->'club'->>'organisation_id')::uuid
        )
    )
  ), pursuit_plays as (
    select
      'pursuit:'||(item->>'player_match_id') as play_id,
      case
        when item->>'readiness_state'='strong_pursuit'
             and item->'need'->>'need_type'='confirmed'
             and coalesce((item->'best_access_route'->>'route_score')::integer,0)>=75
          then 'pitch_now'
        when coalesce((item->'best_access_route'->>'route_score')::integer,0)<60
          then 'strengthen_access_before_pitch'
        when item->'need'->>'need_type'='predicted'
          then 'validate_demand_before_pitch'
        else 'review_pursuit'
      end as play_type,
      (item->>'readiness_score')::integer as base_score,
      case
        when item->>'readiness_state'='strong_pursuit' and item->'need'->>'need_type'='confirmed' then 8
        when coalesce((item->'best_access_route'->>'route_score')::integer,0)<60 then 4
        when item->'need'->>'need_type'='predicted' then 2
        else 0
      end as policy_modifier,
      (item->'player'->>'name') || ' → ' || (item->'club'->>'name') as title,
      case
        when item->>'readiness_state'='strong_pursuit'
             and item->'need'->>'need_type'='confirmed'
             and coalesce((item->'best_access_route'->>'route_score')::integer,0)>=75
          then 'The player fit, confirmed demand and club access are all strong enough to justify immediate human review for a pitch.'
        when coalesce((item->'best_access_route'->>'route_score')::integer,0)<60
          then 'The player fit is credible, but access is the weakest part of the pursuit. Improve the route before spending the pitch.'
        when item->'need'->>'need_type'='predicted'
          then 'The player fit is credible, but the demand signal is still predicted rather than confirmed.'
        else 'The pursuit is credible enough to review, but at least one factor should be improved first.'
      end as rationale,
      case
        when item->>'readiness_state'='strong_pursuit'
             and item->'need'->>'need_type'='confirmed'
             and coalesce((item->'best_access_route'->>'route_score')::integer,0)>=75
          then 'Review the player pack and use the strongest club route to pitch.'
        when coalesce((item->'best_access_route'->>'route_score')::integer,0)<60
          then 'Warm the strongest relationship or create a second club route, then reassess the pitch.'
        when item->'need'->>'need_type'='predicted'
          then 'Use the best club route to validate whether the requirement is real before pitching the player.'
        else 'Review the bottleneck and decide whether the pursuit deserves agent time.'
      end as recommended_action,
      jsonb_build_object(
        'pursuit',item,
        'club_need_id',item->>'club_need_id',
        'player_id',item->'player'->>'player_id',
        'organisation_id',item->'club'->>'organisation_id'
      ) as evidence
    from pursuits
  ), unmatched_needs as (
    select n.id as club_need_id,n.title,n.priority,n.need_type,n.expires_at,o.id as organisation_id,o.name as organisation_name,
           public.platform_server_access_routes(p_tenant_id,o.id,3) as access
    from djm_os.club_needs n
    join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=p_tenant_id
    where n.tenant_id=p_tenant_id and n.status='active' and n.need_type='confirmed'
      and not exists(
        select 1 from djm_os.player_matches pm
        where pm.tenant_id=p_tenant_id and pm.club_need_id=n.id and pm.status in ('suggested','review','shortlisted')
      )
  ), need_plays as (
    select
      'need:'||club_need_id::text as play_id,
      'source_for_confirmed_need'::text as play_type,
      72 + least(coalesce(priority,3),5)*3 as base_score,
      case when coalesce((access->'best_route'->>'route_score')::integer,0)>=75 then 5 else 0 end as policy_modifier,
      organisation_name||' — '||title as title,
      'The club requirement is confirmed and there is no suitable player match recorded.' as rationale,
      case when coalesce((access->'best_route'->>'route_score')::integer,0)>=75
           then 'Keep the club warm through the best route while searching the roster and external network.'
           else 'Source suitable players and strengthen club access in parallel.' end as recommended_action,
      jsonb_build_object('club_need_id',club_need_id,'organisation_id',organisation_id,'need_type',need_type,'priority',priority,'expires_at',expires_at,'access',access) as evidence
    from unmatched_needs
  ), deal_inputs as (
    select d.*,
           public.platform_server_access_routes(p_tenant_id,d.organisation_id,3) as access,
           case
             when d.club_need_id is not null and d.player_id is not null and exists(
               select 1 from djm_os.player_matches pm
               where pm.tenant_id=p_tenant_id and pm.club_need_id=d.club_need_id and pm.player_id=d.player_id
             )
             then public.platform_server_pursuit_readiness(p_tenant_id,d.club_need_id,d.player_id)
             else null
           end as pursuit
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active'
  ), deal_plays as (
    select
      'deal:'||d.id::text as play_id,
      case
        when d.next_action_at is null or d.next_action_at<now() then 'protect_live_deal'
        when d.primary_blocker is not null and trim(d.primary_blocker)<>'' then 'remove_deal_blocker'
        else 'maintain_deal_momentum'
      end as play_type,
      least(100,
        68
        + case when d.next_action_at is null or d.next_action_at<now() then 10 else 0 end
        + case when coalesce(d.expected_commission,0)>=20000 then 6 when coalesce(d.expected_commission,0)>0 then 3 else 0 end
        + case when coalesce(d.probability,d.manual_probability,d.model_probability,0)>=50 then 5 else 0 end
      ) as base_score,
      case
        when coalesce((d.access->'best_route'->>'route_score')::integer,0)<60 then 3
        when coalesce((d.access->'best_route'->>'route_score')::integer,0)>=75 then 2
        else 0
      end
      + case when coalesce((d.pursuit->>'readiness_score')::integer,0)>=85 then 3 else 0 end as policy_modifier,
      d.title,
      case
        when d.next_action_at is null then 'The live deal has no scheduled next action.'
        when d.next_action_at<now() then 'The live deal next action is overdue.'
        when d.primary_blocker is not null and trim(d.primary_blocker)<>'' then 'A specific blocker is recorded on the live deal.'
        else 'The deal is active and needs deliberate momentum management.'
      end as rationale,
      case
        when coalesce((d.access->'best_route'->>'route_score')::integer,0)<60
          then 'Set the next deal action and strengthen the club route before relying on the current relationship.'
        when d.next_action_at is null or d.next_action_at<now()
          then 'Set and execute the next deal action through the strongest available club route.'
        else 'Work the recorded blocker and preserve the strongest route into the club.'
      end as recommended_action,
      jsonb_build_object(
        'deal_room_id',d.id,'organisation_id',d.organisation_id,'player_id',d.player_id,'club_need_id',d.club_need_id,
        'stage',d.stage,'probability',d.probability,'expected_commission',d.expected_commission,'currency',d.currency,
        'primary_blocker',d.primary_blocker,'next_action_text',d.next_action_text,'next_action_at',d.next_action_at,
        'access',d.access,'pursuit_readiness',d.pursuit
      ) as evidence
    from deal_inputs d
  ), combined as (
    select * from pursuit_plays
    union all select * from need_plays
    union all select * from deal_plays
  ), ranked as (
    select *,least(100,base_score+policy_modifier) as play_score,
           row_number() over(order by least(100,base_score+policy_modifier) desc,play_id) as play_rank
    from combined
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',play_rank,
    'play_id',play_id,
    'play_type',play_type,
    'play_score',play_score,
    'title',title,
    'rationale',rationale,
    'recommended_action',recommended_action,
    'evidence',evidence,
    'interpretation','Deterministic strategic-priority score for allocating agency attention. It is not a probability of transfer or deal success.'
  ) order by play_rank),'[]'::jsonb)
  into v_plays
  from ranked
  where play_rank<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'plays',v_plays,
    'summary',jsonb_build_object(
      'play_count',jsonb_array_length(v_plays),
      'pitch_now_count',(select count(*) from jsonb_array_elements(v_plays) x where x.value->>'play_type'='pitch_now'),
      'access_first_count',(select count(*) from jsonb_array_elements(v_plays) x where x.value->>'play_type'='strengthen_access_before_pitch'),
      'source_need_count',(select count(*) from jsonb_array_elements(v_plays) x where x.value->>'play_type'='source_for_confirmed_need'),
      'deal_protection_count',(select count(*) from jsonb_array_elements(v_plays) x where x.value->>'play_type' in ('protect_live_deal','remove_deal_blocker'))
    ),
    'principle','Use agent time where player fit, real demand, route strength and commercial importance justify it.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_deal_advantage(p_tenant_id uuid, p_deal_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_player public.players%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_readiness jsonb;
  v_momentum jsonb;
  v_account jsonb;
  v_pursuit jsonb:=null;
  v_direct integer:=0;
  v_intro integer:=0;
  v_route integer:=0;
  v_readiness_score integer:=0;
  v_momentum_score integer:=0;
  v_demand integer:=40;
  v_fit integer:=50;
  v_alignment integer:=50;
  v_optionality integer:=35;
  v_other_deals integer:=0;
  v_other_matches integer:=0;
  v_club_other_matches integer:=0;
  v_score integer:=0;
  v_edges jsonb:='[]'::jsonb;
  v_exposures jsonb:='[]'::jsonb;
  v_unknowns jsonb:='[]'::jsonb;
  v_salary_alignment text;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_deal.player_id is null then return jsonb_build_object('available',false,'reason','deal_advantage_currently_requires_player_deal','tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id); end if;
  select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;

  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_account:=public.platform_server_club_account(p_tenant_id,v_deal.organisation_id);
  if v_deal.club_need_id is not null and exists(select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id) then
    v_pursuit:=public.platform_server_pursuit_readiness(p_tenant_id,v_deal.club_need_id,v_deal.player_id);
  end if;
  begin v_direct:=coalesce((v_account->'access'->'direct'->'best_route'->>'route_score')::integer,0); exception when others then v_direct:=0; end;
  begin v_intro:=coalesce((v_account->'access'->'introductions'->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro:=0; end;
  begin v_readiness_score:=coalesce((v_readiness->>'score')::integer,0); exception when others then v_readiness_score:=0; end;
  begin v_momentum_score:=coalesce((v_momentum->>'momentum_score')::integer,0); exception when others then v_momentum_score:=0; end;
  begin if v_pursuit is not null then v_fit:=coalesce((v_pursuit->>'readiness_score')::integer,50); end if; exception when others then v_fit:=50; end;

  v_route:=case when v_direct>=80 then 90 when v_direct>=65 then 75 when v_intro>=85 then 68 when v_intro>=70 then 58 when v_direct>=45 then 45 else 30 end;
  if v_need.id is not null then
    v_demand:=case when v_need.need_type='confirmed' then least(100,78+coalesce(v_need.priority,3)*4) when v_need.need_type='predicted' then 55 else 50 end;
  else v_demand:=35; end if;

  v_salary_alignment:=v_readiness->'factors'->'commercial_terms_clarity'->'budget_alignment'->>'salary';
  v_alignment:=case v_salary_alignment when 'within_recorded_budget' then 90 when 'above_recorded_budget' then 25 else case when coalesce((v_readiness->'factors'->'commercial_terms_clarity'->>'score')::integer,0)>=80 then 70 else 45 end end;

  select count(*) into v_other_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=v_deal.player_id and d.status='active' and d.id<>p_deal_room_id;
  select count(*) into v_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=v_deal.player_id and (v_deal.club_need_id is null or pm.club_need_id<>v_deal.club_need_id) and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  if v_deal.club_need_id is not null then
    select count(*) into v_club_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id<>v_deal.player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  end if;
  v_optionality:=least(90,35+least(v_other_deals,2)*25+least(v_other_matches,3)*10);

  v_score:=round(v_route*0.20+v_readiness_score*0.20+v_demand*0.15+v_fit*0.15+v_optionality*0.10+v_momentum_score*0.10+v_alignment*0.10);

  if v_direct>=75 then v_edges:=v_edges||jsonb_build_array('strong_recorded_direct_club_route');
  elsif v_intro>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_warm_introduction_option');
  else v_exposures:=v_exposures||jsonb_build_array('club_access_not_strong'); end if;
  if v_need.need_type='confirmed' then v_edges:=v_edges||jsonb_build_array('confirmed_recorded_club_demand'); else v_unknowns:=v_unknowns||jsonb_build_array('club_demand_not_confirmed_or_not_linked'); end if;
  if v_fit>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_player_club_fit'); elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); end if;
  if v_salary_alignment='within_recorded_budget' then v_edges:=v_edges||jsonb_build_array('recorded_salary_within_recorded_club_budget'); elsif v_salary_alignment='above_recorded_budget' then v_exposures:=v_exposures||jsonb_build_array('recorded_salary_above_recorded_club_budget'); else v_unknowns:=v_unknowns||jsonb_build_array('salary_budget_alignment_unknown'); end if;
  if v_readiness_score<70 then v_exposures:=v_exposures||jsonb_build_array('negotiation_preparation_incomplete'); end if;
  if v_momentum_score<55 then v_exposures:=v_exposures||jsonb_build_array('deal_momentum_weak'); end if;
  if v_other_deals>0 or v_other_matches>0 then v_edges:=v_edges||jsonb_build_array('recorded_player_optionality_exists'); else v_exposures:=v_exposures||jsonb_build_array('limited_recorded_player_optionality'); end if;
  v_unknowns:=v_unknowns||jsonb_build_array('external_competitor_activity_unless_explicitly_recorded','club_true_alternatives_unless_explicitly_recorded','negotiation_power_not_inferred_from_score');

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'generated_at',now(),
    'operating_advantage_score',v_score,
    'state',case when v_score>=78 then 'strong_operating_position' when v_score>=62 then 'balanced_with_edges' when v_score>=48 then 'exposed_but_workable' else 'weak_recorded_position' end,
    'factors',jsonb_build_object(
      'route_strength',jsonb_build_object('score',v_route,'weight',0.20,'direct_access_score',v_direct,'best_introduction_score',v_intro),
      'negotiation_preparation',jsonb_build_object('score',v_readiness_score,'weight',0.20,'state',v_readiness->>'state'),
      'recorded_demand_strength',jsonb_build_object('score',v_demand,'weight',0.15,'need_type',v_need.need_type,'priority',v_need.priority),
      'player_club_fit',jsonb_build_object('score',v_fit,'weight',0.15,'source',case when v_pursuit is null then 'not_available' else 'pursuit_readiness' end),
      'recorded_player_optionality',jsonb_build_object('score',v_optionality,'weight',0.10,'other_active_deals',v_other_deals,'other_recorded_matches',v_other_matches),
      'deal_momentum',jsonb_build_object('score',v_momentum_score,'weight',0.10,'state',v_momentum->>'state'),
      'commercial_alignment',jsonb_build_object('score',v_alignment,'weight',0.10,'salary_alignment',v_salary_alignment)
    ),
    'club_recorded_internal_alternatives',jsonb_build_object('other_players_matched_to_same_need',v_club_other_matches,'interpretation','Internal recorded alternatives only; this is not evidence of the club actual shortlist or external competition.'),
    'edges',v_edges,'exposures',v_exposures,'unknowns',v_unknowns,
    'truth_contract',jsonb_build_object(
      'score','Deterministic operating-position score, not bargaining power, transfer probability or outcome forecast.',
      'optionality','Counts recorded alternative deals/matches only; it is not a BATNA valuation.',
      'competition','External competitor activity remains unknown unless explicitly recorded.',
      'club_alternatives','Other platform matches are not proof of the club real shortlist.',
      'legal','No factor establishes authority, eligibility or enforceability.'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_deal_advantage_fast(p_tenant_id uuid, p_deal_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_player public.players%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_readiness jsonb;
  v_momentum jsonb;
  v_direct_ctx jsonb;
  v_intro_ctx jsonb;
  v_pursuit jsonb:=null;
  v_direct integer:=0;
  v_intro integer:=0;
  v_route integer:=0;
  v_readiness_score integer:=0;
  v_momentum_score integer:=0;
  v_demand integer:=40;
  v_fit integer:=50;
  v_alignment integer:=50;
  v_optionality integer:=35;
  v_other_deals integer:=0;
  v_other_matches integer:=0;
  v_club_other_matches integer:=0;
  v_score integer:=0;
  v_edges jsonb:='[]'::jsonb;
  v_exposures jsonb:='[]'::jsonb;
  v_unknowns jsonb:='[]'::jsonb;
  v_salary_alignment text;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_deal.player_id is null then return jsonb_build_object('available',false,'reason','deal_advantage_currently_requires_player_deal','tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id); end if;
  select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;

  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_direct_ctx:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,3);
  v_intro_ctx:=public.platform_server_introduction_routes(p_tenant_id,v_deal.organisation_id,3);
  if v_deal.club_need_id is not null and exists(select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id) then
    v_pursuit:=public.platform_server_pursuit_readiness(p_tenant_id,v_deal.club_need_id,v_deal.player_id);
  end if;
  begin v_direct:=coalesce((v_direct_ctx->'best_route'->>'route_score')::integer,0); exception when others then v_direct:=0; end;
  begin v_intro:=coalesce((v_intro_ctx->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro:=0; end;
  begin v_readiness_score:=coalesce((v_readiness->>'score')::integer,0); exception when others then v_readiness_score:=0; end;
  begin v_momentum_score:=coalesce((v_momentum->>'momentum_score')::integer,0); exception when others then v_momentum_score:=0; end;
  begin if v_pursuit is not null then v_fit:=coalesce((v_pursuit->>'readiness_score')::integer,50); end if; exception when others then v_fit:=50; end;

  v_route:=case when v_direct>=80 then 90 when v_direct>=65 then 75 when v_intro>=85 then 68 when v_intro>=70 then 58 when v_direct>=45 then 45 else 30 end;
  if v_need.id is not null then v_demand:=case when v_need.need_type='confirmed' then least(100,78+coalesce(v_need.priority,3)*4) when v_need.need_type='predicted' then 55 else 50 end; else v_demand:=35; end if;
  v_salary_alignment:=v_readiness->'factors'->'commercial_terms_clarity'->'budget_alignment'->>'salary';
  v_alignment:=case v_salary_alignment when 'within_recorded_budget' then 90 when 'above_recorded_budget' then 25 else case when coalesce((v_readiness->'factors'->'commercial_terms_clarity'->>'score')::integer,0)>=80 then 70 else 45 end end;

  select count(*) into v_other_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=v_deal.player_id and d.status='active' and d.id<>p_deal_room_id;
  select count(*) into v_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=v_deal.player_id and (v_deal.club_need_id is null or pm.club_need_id<>v_deal.club_need_id) and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  if v_deal.club_need_id is not null then select count(*) into v_club_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id<>v_deal.player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active'); end if;
  v_optionality:=least(90,35+least(v_other_deals,2)*25+least(v_other_matches,3)*10);
  v_score:=round(v_route*0.20+v_readiness_score*0.20+v_demand*0.15+v_fit*0.15+v_optionality*0.10+v_momentum_score*0.10+v_alignment*0.10);

  if v_direct>=75 then v_edges:=v_edges||jsonb_build_array('strong_recorded_direct_club_route'); elsif v_intro>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_warm_introduction_option'); else v_exposures:=v_exposures||jsonb_build_array('club_access_not_strong'); end if;
  if v_need.need_type='confirmed' then v_edges:=v_edges||jsonb_build_array('confirmed_recorded_club_demand'); else v_unknowns:=v_unknowns||jsonb_build_array('club_demand_not_confirmed_or_not_linked'); end if;
  if v_fit>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_player_club_fit'); elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); end if;
  if v_salary_alignment='within_recorded_budget' then v_edges:=v_edges||jsonb_build_array('recorded_salary_within_recorded_club_budget'); elsif v_salary_alignment='above_recorded_budget' then v_exposures:=v_exposures||jsonb_build_array('recorded_salary_above_recorded_club_budget'); else v_unknowns:=v_unknowns||jsonb_build_array('salary_budget_alignment_unknown'); end if;
  if v_readiness_score<70 then v_exposures:=v_exposures||jsonb_build_array('negotiation_preparation_incomplete'); end if;
  if v_momentum_score<55 then v_exposures:=v_exposures||jsonb_build_array('deal_momentum_weak'); end if;
  if v_other_deals>0 or v_other_matches>0 then v_edges:=v_edges||jsonb_build_array('recorded_player_optionality_exists'); else v_exposures:=v_exposures||jsonb_build_array('limited_recorded_player_optionality'); end if;
  v_unknowns:=v_unknowns||jsonb_build_array('external_competitor_activity_unless_explicitly_recorded','club_true_alternatives_unless_explicitly_recorded','negotiation_power_not_inferred_from_score');

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'generated_at',now(),
    'operating_advantage_score',v_score,
    'state',case when v_score>=78 then 'strong_operating_position' when v_score>=62 then 'balanced_with_edges' when v_score>=48 then 'exposed_but_workable' else 'weak_recorded_position' end,
    'factors',jsonb_build_object(
      'route_strength',jsonb_build_object('score',v_route,'weight',0.20,'direct_access_score',v_direct,'best_introduction_score',v_intro),
      'negotiation_preparation',jsonb_build_object('score',v_readiness_score,'weight',0.20,'state',v_readiness->>'state'),
      'recorded_demand_strength',jsonb_build_object('score',v_demand,'weight',0.15,'need_type',v_need.need_type,'priority',v_need.priority),
      'player_club_fit',jsonb_build_object('score',v_fit,'weight',0.15,'source',case when v_pursuit is null then 'not_available' else 'pursuit_readiness' end),
      'recorded_player_optionality',jsonb_build_object('score',v_optionality,'weight',0.10,'other_active_deals',v_other_deals,'other_recorded_matches',v_other_matches),
      'deal_momentum',jsonb_build_object('score',v_momentum_score,'weight',0.10,'state',v_momentum->>'state'),
      'commercial_alignment',jsonb_build_object('score',v_alignment,'weight',0.10,'salary_alignment',v_salary_alignment)
    ),
    'best_routes',jsonb_build_object('direct',v_direct_ctx->'best_route','introduction',v_intro_ctx->'best_route'),
    'club_recorded_internal_alternatives',jsonb_build_object('other_players_matched_to_same_need',v_club_other_matches,'interpretation','Internal recorded alternatives only; this is not evidence of the club actual shortlist or external competition.'),
    'edges',v_edges,'exposures',v_exposures,'unknowns',v_unknowns,
    'truth_contract',jsonb_build_object('score','Deterministic operating-position score, not bargaining power, transfer probability or outcome forecast.','optionality','Recorded alternatives only, not a BATNA valuation.','competition','External competitor activity remains unknown unless explicitly recorded.')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_club_accounts(p_tenant_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
  v_items jsonb;
  v_total integer:=0;
  v_commercial integer:=0;
  v_demand integer:=0;
  v_underconnected integer:=0;
  v_intro integer:=0;
  v_strong_direct integer:=0;
  v_exposure jsonb;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  with relevant_orgs as (
    select distinct d.organisation_id as organisation_id
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active' and d.organisation_id is not null
    union
    select distinct n.organisation_id
    from djm_os.club_needs n
    where n.tenant_id=p_tenant_id and n.status='active' and n.organisation_id is not null
    union
    select distinct e.organisation_id
    from djm_os.employments e
    join djm_os.relationships r on r.person_id=e.person_id and r.tenant_id=e.tenant_id
    where e.tenant_id=p_tenant_id and e.is_current=true and e.organisation_id is not null
    union
    select distinct i.organisation_id
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id and i.organisation_id is not null and i.occurred_at>=now()-interval '180 days'
  ), orgs as (
    select o.* from djm_os.organisations o join relevant_orgs r on r.organisation_id=o.id where o.tenant_id=p_tenant_id
  ), deal_agg as (
    select d.organisation_id,count(*)::integer as active_deals,
           max(coalesce(d.probability,d.manual_probability,d.model_probability,0))::integer as highest_probability,
           count(*) filter(where d.next_action_at is null or d.next_action_at<now())::integer as deals_needing_action,
           jsonb_agg(jsonb_build_object('deal_room_id',d.id,'title',d.title,'stage',d.stage,'probability',coalesce(d.probability,d.manual_probability,d.model_probability,0),'expected_commission',d.expected_commission,'currency',d.currency,'primary_blocker',d.primary_blocker,'next_action_at',d.next_action_at) order by d.expected_commission desc nulls last) as deals
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active' and d.organisation_id is not null
    group by d.organisation_id
  ), deal_currency as (
    select organisation_id,jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',round(weighted_commission,2)) order by currency) as by_currency
    from (
      select d.organisation_id,coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,count(*)::integer as active_deals,
             coalesce(sum(d.expected_commission),0) as expected_commission,
             coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0) as weighted_commission
      from djm_os.deal_rooms d
      where d.tenant_id=p_tenant_id and d.status='active' and d.organisation_id is not null
      group by d.organisation_id,coalesce(nullif(trim(d.currency),''),'UNKNOWN')
    ) x group by organisation_id
  ), need_agg as (
    select n.organisation_id,count(*)::integer as active_needs,count(*) filter(where n.need_type='confirmed')::integer as confirmed_needs,
           max(coalesce(n.priority,0))::integer as highest_need_priority,
           min(n.expires_at) filter(where n.expires_at is not null) as earliest_expiry
    from djm_os.club_needs n
    where n.tenant_id=p_tenant_id and n.status='active' and n.organisation_id is not null
    group by n.organisation_id
  ), activity as (
    select i.organisation_id,count(*) filter(where i.occurred_at>=now()-interval '30 days')::integer as interactions_30d,
           count(*) filter(where i.occurred_at>=now()-interval '180 days')::integer as interactions_180d,
           max(i.occurred_at) as last_interaction_at
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id and i.organisation_id is not null
    group by i.organisation_id
  ), playbook as (
    select public.platform_server_agency_playbook(p_tenant_id,20)->'plays' as plays
  ), plays as (
    select x.value as play,
           coalesce(
             x.value->'evidence'->>'organisation_id',
             x.value->'evidence'->'pursuit'->'club'->>'organisation_id',
             x.value->'evidence'->'access'->'organisation'->>'organisation_id'
           )::uuid as organisation_id
    from playbook p cross join lateral jsonb_array_elements(coalesce(p.plays,'[]'::jsonb)) x
    where coalesce(
      x.value->'evidence'->>'organisation_id',
      x.value->'evidence'->'pursuit'->'club'->>'organisation_id',
      x.value->'evidence'->'access'->'organisation'->>'organisation_id'
    ) is not null
  ), top_play as (
    select distinct on (organisation_id) organisation_id,play
    from plays
    order by organisation_id,(play->>'play_score')::integer desc,(play->>'rank')::integer
  ), pursuit_board as (
    select public.platform_server_pursuit_board(p_tenant_id,50)->'items' as items
  ), pursuit_agg as (
    select (x.value->'club'->>'organisation_id')::uuid as organisation_id,
           count(*)::integer as pursuit_count,
           max((x.value->>'readiness_score')::integer) as best_pursuit_score,
           count(*) filter(where x.value->>'pursuit_operating_mode'='use_warm_introduction_then_review')::integer as pursuits_with_warm_intro
    from pursuit_board p cross join lateral jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) x
    group by (x.value->'club'->>'organisation_id')::uuid
  ), account_rows as (
    select o.id,o.name,o.country,o.city,o.league_name,
           coalesce(da.active_deals,0) as active_deals,
           coalesce(da.highest_probability,0) as highest_probability,
           coalesce(da.deals_needing_action,0) as deals_needing_action,
           coalesce(dc.by_currency,'[]'::jsonb) as commercial_by_currency,
           coalesce(na.active_needs,0) as active_needs,
           coalesce(na.confirmed_needs,0) as confirmed_needs,
           coalesce(na.highest_need_priority,0) as highest_need_priority,
           na.earliest_expiry,
           coalesce(ac.interactions_30d,0) as interactions_30d,
           coalesce(ac.interactions_180d,0) as interactions_180d,
           ac.last_interaction_at,
           coalesce(pa.pursuit_count,0) as pursuit_count,
           pa.best_pursuit_score,
           coalesce(pa.pursuits_with_warm_intro,0) as pursuits_with_warm_intro,
           tp.play as top_play,
           direct.access as direct,
           intro.access as intro
    from orgs o
    left join deal_agg da on da.organisation_id=o.id
    left join deal_currency dc on dc.organisation_id=o.id
    left join need_agg na on na.organisation_id=o.id
    left join activity ac on ac.organisation_id=o.id
    left join pursuit_agg pa on pa.organisation_id=o.id
    left join top_play tp on tp.organisation_id=o.id
    cross join lateral (select public.platform_server_access_routes(p_tenant_id,o.id,3) as access) direct
    cross join lateral (select public.platform_server_introduction_routes(p_tenant_id,o.id,3) as access) intro
  ), scored as (
    select *,
      coalesce((top_play->>'play_score')::integer,
        least(100,
          case when active_deals>0 then 65 else 0 end +
          case when confirmed_needs>0 then 15 when active_needs>0 then 8 else 0 end +
          case when coalesce((direct->'best_route'->>'route_score')::integer,0)>=75 then 10 when coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 8 else 0 end +
          case when interactions_30d>0 then 5 else 0 end
        )) as account_priority_score,
      coalesce((direct->'best_route'->>'route_score')::integer,0) as direct_score,
      coalesce((intro->'best_route'->>'introduction_score')::integer,0) as intro_score,
      case
        when active_deals>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)>=75 then 'commercially_active_well_connected'
        when active_deals>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)<60 and coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 'commercially_active_warm_introduction_available'
        when active_deals>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)<60 then 'commercially_active_underconnected'
        when confirmed_needs>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)>=60 then 'live_demand_connected'
        when confirmed_needs>0 and coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 'live_demand_warm_introduction_available'
        when confirmed_needs>0 then 'live_demand_access_gap'
        when coalesce((direct->'best_route'->>'route_score')::integer,0)>=75 then 'relationship_strong_no_live_business'
        else 'relationship_development' end as account_state
    from account_rows
  ), ranked as (
    select *,row_number() over(order by account_priority_score desc,active_deals desc,confirmed_needs desc,name) as account_rank
    from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',account_rank,
    'organisation_id',id,'name',name,'country',country,'city',city,'league_name',league_name,
    'account_state',account_state,'account_priority_score',account_priority_score,
    'commercial',jsonb_build_object('active_deals',active_deals,'deals_needing_action',deals_needing_action,'highest_probability',highest_probability,'by_currency',commercial_by_currency),
    'demand',jsonb_build_object('active_needs',active_needs,'confirmed_needs',confirmed_needs,'highest_need_priority',highest_need_priority,'earliest_expiry',earliest_expiry),
    'pursuits',jsonb_build_object('count',pursuit_count,'best_readiness_score',best_pursuit_score,'warm_introduction_available_count',pursuits_with_warm_intro),
    'access',jsonb_build_object(
      'direct_score',direct_score,'direct_state',direct->'best_route'->>'route_state','best_direct_contact',direct->'best_route'->>'person_name','best_direct_role',direct->'best_route'->>'role_title',
      'introduction_score',intro_score,'introduction_state',intro->'best_route'->>'introduction_state','introduction_via',intro->'best_route'->'intermediary'->>'name','introduction_target',intro->'best_route'->'target_contact'->>'name'
    ),
    'activity',jsonb_build_object('interactions_30d',interactions_30d,'interactions_180d',interactions_180d,'last_interaction_at',last_interaction_at),
    'top_play',case when top_play is null then null else jsonb_build_object('play_id',top_play->>'play_id','play_type',top_play->>'play_type','play_score',(top_play->>'play_score')::integer,'title',top_play->>'title','recommended_action',top_play->>'recommended_action','access_route_mode',top_play->>'access_route_mode','evidence_gate',top_play->>'evidence_gate') end
  ) order by account_rank) filter(where account_rank<=v_limit),'[]'::jsonb),
  count(*)::integer,
  count(*) filter(where active_deals>0)::integer,
  count(*) filter(where confirmed_needs>0)::integer,
  count(*) filter(where account_state in ('commercially_active_underconnected','live_demand_access_gap'))::integer,
  count(*) filter(where account_state in ('commercially_active_warm_introduction_available','live_demand_warm_introduction_available'))::integer,
  count(*) filter(where direct_score>=75)::integer
  into v_items,v_total,v_commercial,v_demand,v_underconnected,v_intro,v_strong_direct
  from ranked;

  with g as (
    select coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,count(*)::integer as active_deals,
           coalesce(sum(d.expected_commission),0) as expected_commission,
           coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0) as weighted_commission
    from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active'
    group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
  )
  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',round(weighted_commission,2)) order by currency),'[]'::jsonb)
  into v_exposure from g;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'clubs',v_items,
    'summary',jsonb_build_object(
      'relevant_clubs',v_total,'visible_clubs',jsonb_array_length(v_items),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_items),0),
      'clubs_with_active_deals',v_commercial,'clubs_with_confirmed_demand',v_demand,
      'underconnected_live_accounts',v_underconnected,'live_accounts_with_strong_introduction_option',v_intro,
      'clubs_with_strong_direct_access',v_strong_direct,'commercial_exposure_by_currency',v_exposure
    ),
    'principle','Rank club accounts by recorded live business, demand and strategic plays. Direct access and introduction access remain separate.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_agency_playbook(p_tenant_id uuid, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_core jsonb;
  v_all jsonb;
  v_visible jsonb;
  v_total integer;
  v_pitch integer;
  v_access integer;
  v_source integer;
  v_deal integer;
  v_verify integer;
  v_intro integer;
  v_deal_intro integer;
begin
  v_core:=public.platform_server_agency_playbook_core(p_tenant_id,20);

  with raw_plays as (
    select x.value as play,x.ordinality,
           platform.strategic_play_evidence_health(p_tenant_id,x.value) as health,
           case
             when nullif(x.value->'evidence'->>'organisation_id','') is not null then (x.value->'evidence'->>'organisation_id')::uuid
             when nullif(x.value->'evidence'->'pursuit'->'club'->>'organisation_id','') is not null then (x.value->'evidence'->'pursuit'->'club'->>'organisation_id')::uuid
             when nullif(x.value->'evidence'->'access'->'organisation'->>'organisation_id','') is not null then (x.value->'evidence'->'access'->'organisation'->>'organisation_id')::uuid
             else null end as organisation_id,
           coalesce((x.value->'evidence'->'pursuit'->'access_strategy'->>'best_introduction_score')::integer,0) as pursuit_intro_score,
           x.value->'evidence'->'pursuit'->'introduction_context'->'best_route' as pursuit_intro_route,
           x.value->'evidence'->'pursuit'->>'pursuit_operating_mode' as pursuit_mode,
           coalesce((x.value->'evidence'->'access'->'best_route'->>'route_score')::integer,
                    (x.value->'evidence'->'pursuit'->'access_strategy'->>'direct_access_score')::integer,0) as direct_score
    from jsonb_array_elements(coalesce(v_core->'plays','[]'::jsonb)) with ordinality x(value,ordinality)
  ), with_intro as (
    select r.*,
           case when r.organisation_id is not null then public.platform_server_introduction_routes(p_tenant_id,r.organisation_id,3)
                else jsonb_build_object('routes','[]'::jsonb,'route_count',0,'best_route',null) end as club_intro
    from raw_plays r
  ), plays as (
    select *,
           coalesce((club_intro->'best_route'->>'introduction_score')::integer,pursuit_intro_score,0) as intro_score,
           coalesce(club_intro->'best_route',pursuit_intro_route) as intro_route
    from with_intro
  ), gated as (
    select play || jsonb_build_object(
      'evidence_health',health,
      'introduction_context',case when intro_route is null or intro_route='null'::jsonb then null else intro_route end,
      'play_type',case
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('pitch_now','strengthen_access_before_pitch','validate_demand_before_pitch','review_pursuit') then 'validate_evidence_before_pitch'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type'='source_for_confirmed_need' then 'verify_need_before_sourcing'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') then 'verify_deal_evidence_first'
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type'='strengthen_access_before_pitch' and pursuit_mode='use_warm_introduction_then_review' and intro_score>=80 then 'use_warm_introduction_before_pitch'
        else play->>'play_type' end,
      'recommended_action',case
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('pitch_now','strengthen_access_before_pitch','validate_demand_before_pitch','review_pursuit') then 'Verify the underlying club-demand and player evidence before spending the pitch.'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type'='source_for_confirmed_need' then 'Verify that the club requirement is still live before allocating sourcing time.'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') then 'Verify the stale or weak deal facts before making the next commercial move.'
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type'='strengthen_access_before_pitch' and pursuit_mode='use_warm_introduction_then_review' and intro_score>=80
          then coalesce(intro_route->>'recommended_action','Use the strongest recorded warm introduction route.')||' Then reassess the player pitch.'
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') and direct_score<60 and intro_score>=80
          then coalesce(play->>'recommended_action','Set the next deal action.')||' Access tactic: '||coalesce(intro_route->>'recommended_action','Use the strongest recorded warm introduction route.')
        else play->>'recommended_action' end,
      'recommended_sequence',case
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') and direct_score<60 and intro_score>=80
          then jsonb_build_array(
            jsonb_build_object('step',1,'action','protect_deal','instruction',coalesce(play->>'recommended_action','Set the next deal action.')),
            jsonb_build_object('step',2,'action','use_warm_introduction','instruction',coalesce(intro_route->>'recommended_action','Use the strongest recorded warm introduction route.'))
          )
        else null end,
      'original_play_type',play->>'play_type',
      'evidence_gate',case when coalesce((health->>'score')::integer,0)<65 then 'verify_first' else 'ready' end,
      'access_route_mode',case
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') and direct_score<60 and intro_score>=80 then 'warm_introduction_available_for_deal'
        when pursuit_mode='use_warm_introduction_then_review' and intro_score>=80 then 'warm_introduction'
        else 'direct_or_develop' end,
      'access_strategy',jsonb_build_object(
        'direct_access_score',direct_score,
        'best_introduction_score',intro_score,
        'introduction_advantage_points',intro_score-direct_score,
        'best_introduction_route',case when intro_route is null or intro_route='null'::jsonb then null else intro_route end
      )
    ) as play,ordinality
    from plays
  )
  select coalesce(jsonb_agg(play order by ordinality),'[]'::jsonb),count(*)::integer,
         count(*) filter(where play->>'play_type'='pitch_now')::integer,
         count(*) filter(where play->>'play_type'='strengthen_access_before_pitch')::integer,
         count(*) filter(where play->>'play_type'='source_for_confirmed_need')::integer,
         count(*) filter(where play->>'play_type' in ('protect_live_deal','remove_deal_blocker'))::integer,
         count(*) filter(where play->>'evidence_gate'='verify_first')::integer,
         count(*) filter(where play->>'play_type'='use_warm_introduction_before_pitch')::integer,
         count(*) filter(where play->>'access_route_mode'='warm_introduction_available_for_deal')::integer
  into v_all,v_total,v_pitch,v_access,v_source,v_deal,v_verify,v_intro,v_deal_intro
  from gated;

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_visible
  from jsonb_array_elements(v_all) with ordinality x(value,ordinality) where x.ordinality<=v_limit;

  return v_core || jsonb_build_object(
    'plays',v_visible,
    'summary',jsonb_build_object(
      'play_count',v_total,'total_play_count',v_total,'visible_play_count',jsonb_array_length(v_visible),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_visible),0),
      'pitch_now_count',v_pitch,'access_first_count',v_access,'source_need_count',v_source,'deal_protection_count',v_deal,
      'warm_introduction_play_count',v_intro,'deal_plays_with_warm_introduction_option',v_deal_intro,
      'evidence_validation_required_count',v_verify,'summary_scope','all_ranked_plays'),
    'evidence_policy',jsonb_build_object('verify_first_threshold',65,'principle','Strategic priority is preserved, but weak evidence changes the play from act-now to verify-first.'),
    'access_policy',jsonb_build_object('principle','A warm introduction can change the recommended access tactic but never overwrites the recorded direct-access score.')
  );
end;
$function$;
