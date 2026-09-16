create or replace function platform.assurance_action_plan(p_entity_type text,p_breach_code text) returns jsonb
language sql immutable set search_path=''
as $function$
select case p_breach_code
  when 'primary_owner_missing' then jsonb_build_object(
    'mode','prepare_reversible_action','api_action','player_control_fix_prepare','expected_fix','assign_primary_staff',
    'suggestion_action','player_owner_candidates','required_inputs',jsonb_build_array('owner_user_id'),'human_confirmation_required',true)
  when 'player_next_action_missing' then jsonb_build_object(
    'mode','prepare_reversible_action','api_action','player_control_fix_prepare','expected_fix','set_player_next_action',
    'required_inputs',jsonb_build_array('next_action','next_action_due'),'human_confirmation_required',true)
  when 'player_next_action_overdue' then jsonb_build_object(
    'mode','prepare_internal_work','api_action','player_service_move_prepare','human_confirmation_required',true,
    'note','Complete the existing action or deliberately set the next player action; do not silently extend an overdue date.')
  when 'career_strategy_not_operational' then jsonb_build_object(
    'mode','human_owned_workflow','api_action','career_strategy','human_confirmation_required',true,
    'note','Career objective, target markets and trade-offs must remain human-authored and player-confirmed.')
  when 'career_strategy_review_overdue' then jsonb_build_object(
    'mode','human_owned_workflow','api_action','career_strategy','human_confirmation_required',true,
    'note','Review the existing strategy with the player rather than generating a replacement automatically.')
  when 'free_agent_without_market_coverage' then jsonb_build_object(
    'mode','prepare_internal_work','api_action','career_strategy_action_prepare','human_confirmation_required',true)
  when 'contract_window_without_market_coverage' then jsonb_build_object(
    'mode','prepare_internal_work','api_action','career_strategy_action_prepare','human_confirmation_required',true)
  when 'player_request_sla_breach' then jsonb_build_object(
    'mode','resolve_player_request','api_action','player_service_card','human_confirmation_required',true)
  when 'deal_owner_missing' then jsonb_build_object(
    'mode','prepare_reversible_action','api_action','deal_control_fix_prepare','suggestion_action','deal_owner_candidates',
    'required_inputs',jsonb_build_array('owner_user_id'),'human_confirmation_required',true)
  when 'deal_next_action_missing' then jsonb_build_object(
    'mode','prepare_reversible_action','api_action','deal_control_fix_prepare','human_confirmation_required',true)
  when 'deal_next_action_overdue' then jsonb_build_object(
    'mode','prepare_reversible_action','api_action','deal_control_fix_prepare','human_confirmation_required',true,
    'note','Complete the overdue action or deliberately reset it with a new reason and timing.')
  when 'deal_origin_missing' then jsonb_build_object(
    'mode','human_owned_provenance','api_action','deal_origin_save','human_confirmation_required',true,
    'note','Origin attribution must be recorded, not inferred from the current contact route.')
  when 'negotiation_guardrails_missing' then jsonb_build_object(
    'mode','human_owned_negotiation_control','api_action','deal_guardrails_save','human_confirmation_required',true,
    'note','Commercial limits and walk-away conditions must come from authorised humans.')
  else jsonb_build_object('mode','human_review','api_action',case when p_entity_type='deal' then 'deal_war_room' else 'player_service_card' end,'human_confirmation_required',true)
end;
$function$;

create or replace function public.platform_server_service_assurance_v2(p_tenant_id uuid,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_base jsonb:=public.platform_server_service_assurance(p_tenant_id,p_limit);
  v_queue jsonb;
begin
  select coalesce(jsonb_agg(
    q.value || jsonb_build_object('action_plan',platform.assurance_action_plan(q.value->>'entity_type',q.value#>>'{breach,code}'))
    order by q.ord
  ),'[]'::jsonb)
  into v_queue
  from jsonb_array_elements(coalesce(v_base->'operating_queue','[]'::jsonb)) with ordinality q(value,ord);

  return v_base || jsonb_build_object(
    'version','v2',
    'operating_queue',v_queue,
    'action_policy',jsonb_build_object(
      'principle','Every assurance breach maps to an explicit workflow. The mapping can prepare safe internal work, but cannot invent player intent, commercial guardrails or provenance.',
      'external_side_effects_automatic',false,
      'human_owned_fields_automatic',false
    )
  );
end;
$function$;

revoke all on function public.platform_server_service_assurance_v2(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_service_assurance_v2(uuid,integer) to service_role;;
