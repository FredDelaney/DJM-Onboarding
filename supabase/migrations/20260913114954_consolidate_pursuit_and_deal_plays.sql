create or replace function public.platform_server_agency_playbook(
  p_tenant_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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

revoke all on function public.platform_server_agency_playbook(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_playbook(uuid,integer) to service_role;;
