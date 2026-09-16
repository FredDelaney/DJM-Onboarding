create or replace function public.platform_server_learning_center(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actions jsonb; v_markets jsonb; v_routes jsonb; v_pitches jsonb;
  v_active_players integer:=0; v_approved_strategies integer:=0; v_confirmed_strategies integer:=0;
  v_active_deals integer:=0; v_closed_deals integer:=0; v_attributed_active integer:=0;
  v_resolved_outcomes integer:=0; v_usable_plays integer:=0; v_sent_pitches integer:=0; v_pitch_responses integer:=0;
  v_state text; v_next jsonb;
begin
  if not exists(select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_found'; end if;
  v_actions:=public.platform_server_agency_learning_v2(p_tenant_id,365);
  v_markets:=public.platform_server_market_learning(p_tenant_id,730);
  v_routes:=public.platform_server_route_learning(p_tenant_id,730);
  v_pitches:=public.platform_server_pitch_learning(p_tenant_id,365);
  select count(*) into v_active_players from public.players p where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive');
  select count(*) filter(where s.status='approved'),count(*) filter(where s.status='approved' and s.confirmation_status='confirmed')
    into v_approved_strategies,v_confirmed_strategies from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.status in ('draft','approved');
  select count(*) filter(where d.status='active'),count(*) filter(where d.status in ('won','lost')) into v_active_deals,v_closed_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id;
  select count(*) into v_attributed_active from djm_os.deal_rooms d join platform.deal_origin_attributions a on a.tenant_id=d.tenant_id and a.deal_room_id=d.id and a.confirmation_status='confirmed' where d.tenant_id=p_tenant_id and d.status='active';
  begin v_resolved_outcomes:=coalesce((v_actions#>>'{summary,resolved_outcomes}')::int,0); exception when others then v_resolved_outcomes:=0; end;
  begin v_usable_plays:=coalesce((v_actions#>>'{summary,usable_plays}')::int,0); exception when others then v_usable_plays:=0; end;
  begin v_sent_pitches:=coalesce((v_pitches#>>'{coverage,sent_pitches}')::int,0); exception when others then v_sent_pitches:=0; end;
  begin v_pitch_responses:=coalesce((v_pitches#>>'{coverage,explicit_responses}')::int,0); exception when others then v_pitch_responses:=0; end;
  if v_usable_plays>0 or v_closed_deals>=20 then v_state:='decision_support_building';
  elsif v_resolved_outcomes>=10 or v_closed_deals>=8 then v_state:='early_learning';
  else v_state:='collecting_foundations'; end if;
  v_next:=case
    when v_active_deals>v_attributed_active then jsonb_build_object('action','complete_deal_origin_attribution','reason','Some active deals do not have confirmed origin provenance, so route effectiveness cannot be learned safely.','missing_count',v_active_deals-v_attributed_active)
    when v_active_players>v_confirmed_strategies then jsonb_build_object('action','complete_player_career_strategies','reason','Some active players do not yet have approved, player-confirmed career strategy records.','missing_count',v_active_players-v_confirmed_strategies)
    when v_resolved_outcomes<10 then jsonb_build_object('action','keep_evaluating_interventions','reason','Fewer than 10 resolved action outcomes exist. Keep executing and evaluating work without forcing conclusions.','resolved_outcomes',v_resolved_outcomes)
    when v_closed_deals<8 then jsonb_build_object('action','preserve_closed_deal_outcomes','reason','There are not yet enough won/lost deals for decision-grade closing comparisons.','closed_deals',v_closed_deals)
    else jsonb_build_object('action','review_emerging_evidence','reason','Core provenance is in place. Review emerging evidence without auto-changing policy.') end;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'maturity_state',v_state,'next_learning_action',v_next,
    'data_flywheel',jsonb_build_object(
      'active_players',v_active_players,'approved_career_strategies',v_approved_strategies,'player_confirmed_career_strategies',v_confirmed_strategies,
      'active_deals',v_active_deals,'active_deals_with_confirmed_origin',v_attributed_active,'closed_deals',v_closed_deals,'resolved_action_outcomes',v_resolved_outcomes,'usable_intervention_plays',v_usable_plays,
      'sent_pitches',v_sent_pitches,'explicit_pitch_responses',v_pitch_responses
    ),
    'intervention_learning',v_actions,'market_learning',v_markets,'origin_route_learning',v_routes,'pitch_learning',v_pitches,
    'principle','Capture provenance first, measure outcomes second, and only convert patterns into decision support when the evidence clears explicit thresholds.',
    'truth_contract',jsonb_build_object('policy','No learning layer automatically changes agency policy.','causality','Observed patterns remain associations unless stronger causal evidence exists.','small_samples','The system prefers no recommendation to a confident-looking conclusion from weak evidence.','pitch','Pitch views and share-link responses remain observational evidence and never become automatic transfer decisions.')
  );
end;
$function$;

revoke all on function public.platform_server_learning_center(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_learning_center(uuid) to service_role;;
