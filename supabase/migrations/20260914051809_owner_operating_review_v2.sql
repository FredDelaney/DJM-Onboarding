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
  v_receivables jsonb:=public.platform_server_receivables_command(p_tenant_id,90,100);
  v_closeout jsonb:=public.platform_server_deal_closeout_command(p_tenant_id,100);
begin
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'control_centre',v_control,
    'execution_deadlines',v_deadlines,
    'player_value_proof_review',v_proof_review,
    'cash_collection',v_receivables,
    'deal_closeout',v_closeout,
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
      'club_need_roster_gaps',v_control#>>'{executive_summary,club_need_roster_gaps}',
      'open_receivables',v_receivables#>>'{summary,open_receivables}',
      'overdue_receivables',v_receivables#>>'{summary,overdue_receivables}',
      'won_deals_missing_receivable_record',v_receivables#>>'{summary,won_deals_with_expected_commission_but_no_receivable_record}',
      'closeout_deals',v_closeout->>'deal_count'
    ),
    'truth_contract',jsonb_build_object(
      'owner_review','This is an operating review, not a company valuation, legal-compliance certificate or employee performance score.',
      'learning','Market and route learning remain evidence-qualified and cannot automatically rewrite agency policy.',
      'deadlines','Only recorded dates are included; no transfer-window or regulatory deadline is inferred.',
      'proof','Proof cadence tracks persisted DJM evidence, not client satisfaction.',
      'cash','Receivables are human-recorded collection schedules and do not turn forecast commission into money owed automatically.',
      'closeout','Operational deal closeout is not legal certification of transfer registration, contract enforceability or regulatory compliance.'
    )
  );
end;
$$;

revoke all on function public.platform_server_owner_operating_review(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_owner_operating_review(uuid,integer,integer) to service_role;;
