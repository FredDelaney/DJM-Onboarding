create or replace function public.platform_server_agency_control_centre(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,50);
  v_roster jsonb:=public.platform_server_roster_command(p_tenant_id,12);
  v_origination jsonb:=public.platform_server_origination_command(p_tenant_id,12);
  v_revenue jsonb:=public.platform_server_revenue_command(p_tenant_id,10);
  v_capacity jsonb:=public.platform_server_team_capacity(p_tenant_id);
  v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120);
  v_ready jsonb:=public.platform_server_go_live_readiness(p_tenant_id);
  v_learning jsonb:=public.platform_server_learning_center(p_tenant_id);
  v_scouting jsonb:=public.platform_server_scouting_mandates(p_tenant_id,10);
  v_service_lane jsonb;
  v_roster_lane jsonb;
  v_origin_lane jsonb;
  v_revenue_lane jsonb;
  v_state text;
begin
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_service_lane
  from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_roster_lane
  from jsonb_array_elements(coalesce(v_roster->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_origin_lane
  from jsonb_array_elements(coalesce(v_origination->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_revenue_lane
  from jsonb_array_elements(coalesce(v_revenue->'protect_revenue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;

  v_state:=case
    when coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0)>0 then 'operating_controls_need_attention'
    when coalesce(v_ready->>'state','')<>'ready_for_controlled_use' then 'setup_gaps_remain'
    when coalesce((v_origination#>>'{coverage_summary,ready_to_work}')::integer,0)>0 then 'commercial_execution_available'
    else 'controlled' end;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,
    'executive_summary',jsonb_build_object(
      'active_players',coalesce((v_roster#>>'{summary,active_players}')::integer,0),
      'active_deals',coalesce((v_assurance#>>'{summary,active_deals}')::integer,0),
      'service_standard_breaches',coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0),
      'players_without_primary_owner',coalesce((v_capacity#>>'{summary,active_players_without_primary_owner}')::integer,0),
      'deals_without_owner',coalesce((v_capacity#>>'{summary,active_deals_without_owner}')::integer,0),
      'club_needs_ready_to_work',coalesce((v_origination#>>'{coverage_summary,ready_to_work}')::integer,0),
      'club_need_roster_gaps',coalesce((v_origination#>>'{coverage_summary,roster_gaps}')::integer,0),
      'representation_records_needing_review',coalesce((v_rep#>>'{summary,records_needing_review}')::integer,0),
      'go_live_state',v_ready->>'state',
      'learning_maturity',v_learning->>'maturity_state'
    ),
    'lanes',jsonb_build_object(
      'service_control',jsonb_build_object('summary',v_assurance->'summary','items',v_service_lane),
      'roster_effort',jsonb_build_object('summary',v_roster->'summary','items',v_roster_lane),
      'club_demand_origination',jsonb_build_object('summary',v_origination->'coverage_summary','items',v_origin_lane),
      'revenue_execution',jsonb_build_object(
        'commercial_hygiene',v_revenue->'commercial_hygiene',
        'pipeline_creation',v_revenue->'pipeline_creation',
        'by_currency',v_revenue->'by_currency',
        'items',v_revenue_lane
      ),
      'scouting_mandates',jsonb_build_object('count',v_scouting->'mandate_count','items',v_scouting->'items')
    ),
    'governance',jsonb_build_object(
      'team_capacity_summary',v_capacity->'summary',
      'representation_summary',v_rep->'summary',
      'go_live',jsonb_build_object('state',v_ready->>'state','summary',v_ready->'summary','next_action',v_ready->'next_action'),
      'learning',jsonb_build_object('maturity_state',v_learning->>'maturity_state','next_learning_action',v_learning->'next_learning_action')
    ),
    'truth_contract',jsonb_build_object(
      'no_composite_score','The Control Centre intentionally keeps player service, revenue, demand, ownership and setup controls in separate lanes rather than collapsing them into one opaque score.',
      'priority','Ordering inside each lane uses that domain’s recorded operating rules; lanes are not mathematically compared with each other.',
      'revenue','Commercial exposure is shown by recorded currency and is not converted across currencies or treated as guaranteed revenue.',
      'scope','Only work and facts recorded in the platform are visible.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_agency_control_centre(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_agency_control_centre(uuid) to service_role;;
