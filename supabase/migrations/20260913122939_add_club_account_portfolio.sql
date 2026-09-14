create or replace function public.platform_server_club_accounts(p_tenant_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
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
$$;

revoke all on function public.platform_server_club_accounts(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_club_accounts(uuid,integer) to service_role;;
