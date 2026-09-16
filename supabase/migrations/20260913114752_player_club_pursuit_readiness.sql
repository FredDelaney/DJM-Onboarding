create or replace function public.platform_server_pursuit_readiness(
  p_tenant_id uuid,
  p_club_need_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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

revoke all on function public.platform_server_pursuit_readiness(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_pursuit_readiness(uuid,uuid,uuid) to service_role;

create or replace function public.platform_server_pursuit_board(
  p_tenant_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,20),50));
  v_items jsonb;
begin
  with matches as (
    select pm.club_need_id,pm.player_id
    from djm_os.player_matches pm
    join djm_os.club_needs n on n.id=pm.club_need_id and n.tenant_id=p_tenant_id and n.status='active'
    where pm.tenant_id=p_tenant_id and pm.status in ('suggested','review','shortlisted')
  ), readiness as (
    select public.platform_server_pursuit_readiness(p_tenant_id,m.club_need_id,m.player_id) as item
    from matches m
  ), ranked as (
    select item,row_number() over(order by (item->>'readiness_score')::numeric desc,item->'club'->>'name',item->'player'->>'name') as rank
    from readiness
  )
  select coalesce(jsonb_agg(item||jsonb_build_object('rank',rank) order by rank),'[]'::jsonb)
  into v_items
  from ranked
  where rank<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'items',v_items,
    'summary',jsonb_build_object(
      'pursuit_count',jsonb_array_length(v_items),
      'strong_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='strong_pursuit'),
      'credible_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='credible_pursuit'),
      'conditional_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='conditional_pursuit'),
      'weak_or_blocked_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='weak_or_blocked')
    ),
    'interpretation','Ranks recorded player-club matches by pursuit readiness, not probability of transfer.'
  );
end;
$function$;

revoke all on function public.platform_server_pursuit_board(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_pursuit_board(uuid,integer) to service_role;;
