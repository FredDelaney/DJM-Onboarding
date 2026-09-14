create or replace function public.platform_server_player_review_pack(
  p_tenant_id uuid,
  p_player_id uuid,
  p_proof_window_days integer default 30,
  p_deadline_horizon_days integer default 90
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_proof jsonb:=public.platform_server_player_value_proof(p_tenant_id,p_player_id,p_proof_window_days);
  v_delta jsonb:=public.platform_server_player_value_proof_delta(p_tenant_id,p_player_id,null,null);
  v_career jsonb:=public.platform_server_player_career_alignment(p_tenant_id,p_player_id);
  v_deadlines jsonb:=public.platform_server_execution_deadline_command(p_tenant_id,p_deadline_horizon_days,500);
  v_relationship jsonb:=public.platform_server_player_relationship_control(p_tenant_id,500);
  v_player_deadlines jsonb;
  v_relationship_item jsonb;
begin
  if not exists(select 1 from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id) then raise exception 'player_not_found_for_tenant'; end if;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_player_deadlines
    from jsonb_array_elements(coalesce(v_deadlines->'items','[]'::jsonb)) with ordinality x(value,ord)
    where value#>>'{context,player_id}'=p_player_id::text;
  select value into v_relationship_item from jsonb_array_elements(coalesce(v_relationship->'items','[]'::jsonb)) where value->>'player_id'=p_player_id::text limit 1;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,'generated_at',now(),
    'player',jsonb_build_object('name',v_proof->>'player_name','football_status',v_relationship_item->>'football_status','contract_status',v_relationship_item->>'contract_status','contract_expiry',v_relationship_item->'contract_expiry'),
    'service_and_relationship_control',v_relationship_item,
    'career_alignment',v_career,
    'value_proof',v_proof,
    'value_proof_change',v_delta,
    'upcoming_recorded_deadlines',v_player_deadlines,
    'meeting_focus',jsonb_build_object(
      'service_control_state',v_relationship_item#>>'{service_control,state}',
      'relationship_control_state',v_relationship_item->>'state',
      'career_alignment_state',v_career->>'alignment_state',
      'value_proof_state',v_proof->>'proof_state',
      'nearest_deadline',case when jsonb_array_length(v_player_deadlines)>0 then v_player_deadlines->0 else null end
    ),
    'truth_contract',jsonb_build_object(
      'purpose','Prepare a factual player-service and career review from DJM records before a human conversation.',
      'not_sentiment','The pack does not infer player satisfaction, loyalty or relationship quality.',
      'not_advice','Career strategy remains human-owned and player-confirmed. The pack organises evidence and controls; it does not choose the player’s career objective.',
      'proof','Value proof reflects recorded DJM evidence only. Offline work that was not captured remains invisible.',
      'deadlines','Deadlines are recorded operating dates, not inferred legal or league deadlines.'
    )
  );
end;
$$;

create or replace function public.platform_server_owner_operating_review(
  p_tenant_id uuid,
  p_deadline_horizon_days integer default 30,
  p_proof_cadence_days integer default 30
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_control jsonb:=public.platform_server_agency_control_centre(p_tenant_id);
  v_deadlines jsonb:=public.platform_server_execution_deadline_command(p_tenant_id,p_deadline_horizon_days,100);
  v_proof_review jsonb:=public.platform_server_value_proof_review_queue(p_tenant_id,p_proof_cadence_days,100);
  v_route_learning jsonb:=public.platform_server_route_learning(p_tenant_id,730);
  v_market_learning jsonb:=public.platform_server_market_learning(p_tenant_id,730);
begin
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'control_centre',v_control,
    'execution_deadlines',v_deadlines,
    'player_value_proof_review',v_proof_review,
    'learning_watch',jsonb_build_object(
      'route_coverage',v_route_learning->'coverage',
      'route_evidence_policy',v_route_learning->'evidence_policy',
      'market_total_recorded_deals',v_market_learning->'total_recorded_deals',
      'market_evidence_policy',v_market_learning->'evidence_policy',
      'route_learning_action','route_learning',
      'market_learning_action','market_learning'
    ),
    'owner_focus',jsonb_build_object(
      'overdue_deadlines',v_deadlines#>>'{summary,overdue}',
      'deadlines_today',v_deadlines#>>'{summary,today}',
      'proof_snapshots_missing',v_proof_review#>>'{summary,snapshot_missing}',
      'proof_snapshots_due',v_proof_review#>>'{summary,snapshot_due}',
      'service_standard_breaches',v_control#>>'{executive_summary,service_standard_breaches}',
      'live_club_business_to_protect',v_control#>>'{executive_summary,live_club_business_to_protect}',
      'club_need_roster_gaps',v_control#>>'{executive_summary,club_need_roster_gaps}'
    ),
    'truth_contract',jsonb_build_object(
      'owner_review','This is an operating review, not a company valuation, legal-compliance certificate or employee performance score.',
      'learning','Market and route learning remain evidence-qualified and cannot automatically rewrite agency policy.',
      'deadlines','Only recorded dates are included; no transfer-window or regulatory deadline is inferred.',
      'proof','Proof cadence tracks persisted DJM evidence, not client satisfaction.'
    )
  );
end;
$$;

revoke all on function public.platform_server_player_review_pack(uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.platform_server_owner_operating_review(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_review_pack(uuid,uuid,integer,integer) to service_role;
grant execute on function public.platform_server_owner_operating_review(uuid,integer,integer) to service_role;
;
