create or replace function public.platform_server_network_coverage(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_org record;
  v_access jsonb;
  v_best jsonb;
  v_best_score integer;
  v_route_count integer;
  v_coverage_state text;
  v_risk_state text;
  v_recommended text;
  v_deal_values jsonb;
  v_items jsonb := '[]'::jsonb;
  v_relevant_count integer := 0;
  v_warm_count integer := 0;
  v_usable_count integer := 0;
  v_weak_count integer := 0;
  v_gap_count integer := 0;
  v_single_count integer := 0;
  v_exposed_by_currency jsonb;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then
    raise exception 'tenant_not_found';
  end if;

  for v_org in
    with relevant as (
      select d.organisation_id
      from djm_os.deal_rooms d
      where d.tenant_id=p_tenant_id and d.status='active'
      union
      select n.organisation_id
      from djm_os.club_needs n
      where n.tenant_id=p_tenant_id and n.status='active'
    )
    select o.id,o.name,o.country,o.city,o.league_name,
      (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.organisation_id=o.id and d.status='active')::integer as active_deals,
      (select count(*) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=o.id and n.status='active')::integer as active_needs,
      (select count(*) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=o.id and n.status='active' and n.need_type='confirmed')::integer as confirmed_needs,
      (select max(n.priority) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=o.id and n.status='active') as highest_need_priority,
      (select max(coalesce(d.probability,d.manual_probability,d.model_probability,0)) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.organisation_id=o.id and d.status='active') as highest_deal_probability
    from relevant r
    join djm_os.organisations o on o.id=r.organisation_id and o.tenant_id=p_tenant_id
    order by o.name
  loop
    v_relevant_count := v_relevant_count+1;
    v_access := public.platform_server_access_routes(p_tenant_id,v_org.id,10);
    v_best := v_access->'best_route';
    v_route_count := coalesce((v_access->>'route_count')::integer,0);
    v_best_score := case when v_best is null or v_best='null'::jsonb then 0 else coalesce((v_best->>'route_score')::integer,0) end;

    v_coverage_state := case
      when v_route_count=0 then 'no_recorded_route'
      when v_best_score>=75 and v_route_count>=2 then 'strong_and_redundant'
      when v_best_score>=75 then 'strong_but_single_threaded'
      when v_best_score>=60 then 'usable'
      when v_best_score>=45 then 'developing'
      else 'weak'
    end;

    v_risk_state := case
      when v_route_count=0 and (v_org.active_deals>0 or v_org.confirmed_needs>0) then 'critical_access_gap'
      when v_best_score<60 and v_org.active_deals>0 then 'commercial_exposure_behind_weak_access'
      when v_best_score<60 and v_org.confirmed_needs>0 then 'live_demand_behind_weak_access'
      when v_route_count=1 and (v_org.active_deals>0 or v_org.confirmed_needs>0) then 'single_thread_dependency'
      when v_best_score>=75 and v_route_count>=2 then 'well_covered'
      else 'monitor'
    end;

    v_recommended := case v_risk_state
      when 'critical_access_gap' then 'Build a direct decision-maker route before relying on this opportunity.'
      when 'commercial_exposure_behind_weak_access' then 'Warm the existing route or create a second route before the deal becomes more time-sensitive.'
      when 'live_demand_behind_weak_access' then 'Strengthen club access while player search or pitching continues.'
      when 'single_thread_dependency' then 'Create a second credible contact route so the relationship is not dependent on one person.'
      when 'well_covered' then 'Use the strongest route and preserve the secondary relationship as redundancy.'
      else 'Maintain the relationship and monitor recency.'
    end;

    if v_route_count=0 then v_gap_count:=v_gap_count+1;
    elsif v_best_score>=75 then v_warm_count:=v_warm_count+1;
    elsif v_best_score>=60 then v_usable_count:=v_usable_count+1;
    else v_weak_count:=v_weak_count+1;
    end if;
    if v_route_count=1 then v_single_count:=v_single_count+1; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'currency',x.currency,
      'active_deals',x.active_deals,
      'expected_commission',x.expected_commission,
      'weighted_commission',x.weighted_commission
    ) order by x.currency),'[]'::jsonb)
    into v_deal_values
    from (
      select coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,
             count(*)::integer as active_deals,
             coalesce(sum(d.expected_commission),0) as expected_commission,
             round(coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0),2) as weighted_commission
      from djm_os.deal_rooms d
      where d.tenant_id=p_tenant_id and d.organisation_id=v_org.id and d.status='active'
      group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
    ) x;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'organisation_id',v_org.id,
      'organisation_name',v_org.name,
      'country',v_org.country,
      'city',v_org.city,
      'league_name',v_org.league_name,
      'active_deals',v_org.active_deals,
      'active_needs',v_org.active_needs,
      'confirmed_needs',v_org.confirmed_needs,
      'highest_need_priority',v_org.highest_need_priority,
      'highest_deal_probability',v_org.highest_deal_probability,
      'deal_value_by_currency',v_deal_values,
      'route_count',v_route_count,
      'best_route',v_best,
      'coverage_state',v_coverage_state,
      'risk_state',v_risk_state,
      'single_threaded',v_route_count=1,
      'recommended_network_action',v_recommended
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'currency',g.currency,
    'active_deals',g.active_deals,
    'expected_commission',g.expected_commission,
    'weighted_commission',g.weighted_commission
  ) order by g.currency),'[]'::jsonb)
  into v_exposed_by_currency
  from (
    select coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,
           count(*)::integer as active_deals,
           coalesce(sum(d.expected_commission),0) as expected_commission,
           round(coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0),2) as weighted_commission
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active'
      and coalesce((public.platform_server_access_routes(p_tenant_id,d.organisation_id,1)->'best_route'->>'route_score')::integer,0)<60
    group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
  ) g;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'summary',jsonb_build_object(
      'relevant_clubs',v_relevant_count,
      'warm_access_clubs',v_warm_count,
      'usable_access_clubs',v_usable_count,
      'weak_or_developing_access_clubs',v_weak_count,
      'no_route_clubs',v_gap_count,
      'single_threaded_clubs',v_single_count,
      'commercial_exposure_with_weak_access_by_currency',v_exposed_by_currency
    ),
    'clubs',v_items,
    'method',jsonb_build_object(
      'warm_threshold',75,
      'usable_threshold',60,
      'redundancy_required_for_strong_coverage',2,
      'interpretation','Network coverage measures recorded access depth around active deals and club demand. It does not predict whether a club will transact.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_network_coverage(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_network_coverage(uuid) to service_role;

create or replace function public.platform_server_agency_brief_full(
  p_tenant_id uuid,
  p_window_hours integer default 24,
  p_decision_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select public.platform_server_agency_brief_context(p_tenant_id,p_window_hours,p_decision_limit)
         || jsonb_build_object('network_coverage',public.platform_server_network_coverage(p_tenant_id));
$function$;

revoke all on function public.platform_server_agency_brief_full(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_brief_full(uuid,integer,integer) to service_role;

create or replace function public.platform_server_agency_home_full(
  p_tenant_id uuid,
  p_command_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select public.platform_server_agency_home_context(p_tenant_id,p_command_limit)
         || jsonb_build_object('network_coverage',public.platform_server_network_coverage(p_tenant_id)->'summary');
$function$;

revoke all on function public.platform_server_agency_home_full(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_home_full(uuid,integer) to service_role;;
