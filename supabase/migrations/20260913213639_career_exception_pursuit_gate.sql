create or replace function public.platform_server_career_pursuit_gate(
  p_tenant_id uuid,
  p_player_match_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_match djm_os.player_matches%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_org djm_os.organisations%rowtype;
  v_s platform.player_career_strategies%rowtype;
  v_e platform.player_career_exceptions%rowtype;
  v_targets jsonb:='[]'::jsonb;
  v_avoids jsonb:='[]'::jsonb;
  v_target_count integer:=0;
  v_window_start date;
  v_window_end date;
  v_gate text;
  v_reason text;
  v_action jsonb;
  v_conflict text:=null;
  v_exception_state text:='missing';
begin
  select * into v_match from djm_os.player_matches pm where pm.id=p_player_match_id and pm.tenant_id=p_tenant_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;
  select * into v_need from djm_os.club_needs n where n.id=v_match.club_need_id and n.tenant_id=p_tenant_id;
  if not found then raise exception 'club_need_not_found_for_tenant'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_need.organisation_id and o.tenant_id=p_tenant_id;
  if not found then raise exception 'organisation_not_found_for_tenant'; end if;

  select * into v_s from platform.player_career_strategies s
  where s.tenant_id=p_tenant_id and s.player_id=v_match.player_id and s.status in ('draft','approved')
  order by case when s.status='approved' then 0 else 1 end,s.version desc limit 1;

  select * into v_e from platform.player_career_exceptions e
  where e.tenant_id=p_tenant_id and e.player_match_id=p_player_match_id and e.status in ('draft','confirmed','approved')
  order by e.created_at desc limit 1;
  if found then
    v_exception_state:=case when v_e.expires_at<current_date then 'expired' when v_e.status='approved' and v_e.confirmation_status='confirmed' then 'approved' when v_e.status='confirmed' and v_e.confirmation_status='confirmed' then 'awaiting_internal_approval' else 'awaiting_player_confirmation' end;
  end if;

  if v_s.id is not null then
    v_targets:=coalesce(v_s.strategy->'target_markets','[]'::jsonb);
    v_avoids:=coalesce(v_s.strategy->'avoid_markets','[]'::jsonb);
    select count(*) into v_target_count from jsonb_array_elements_text(v_targets);
    begin v_window_start:=nullif(v_s.strategy#>>'{target_window,start_date}','')::date; exception when others then v_window_start:=null; end;
    begin v_window_end:=nullif(v_s.strategy#>>'{target_window,end_date}','')::date; exception when others then v_window_end:=null; end;
  end if;

  if v_s.id is null then
    v_gate:='hold_strategy_missing'; v_reason:='The football pursuit exists, but no human-owned career strategy is recorded for the player.';
    v_action:=jsonb_build_object('action_type','define_career_strategy','instruction','Agree the player career strategy before treating this pursuit as career-approved external action.','requires_human_input',true);
  elsif v_s.status<>'approved' then
    v_gate:='hold_strategy_not_approved'; v_reason:='The current career strategy is still a draft.';
    v_action:=jsonb_build_object('action_type','complete_strategy_approval','instruction','Complete player confirmation and internal approval before advancing on the basis of the career plan.','requires_human_input',true);
  elsif v_s.confirmation_status<>'confirmed' then
    v_gate:='hold_player_confirmation_missing'; v_reason:='The strategy is not currently confirmed by the player.';
    v_action:=jsonb_build_object('action_type','confirm_strategy_with_player','instruction','Confirm the current strategy with the player before treating this pursuit as aligned.','requires_human_input',true);
  elsif v_s.review_due_at is not null and v_s.review_due_at<current_date then
    v_gate:='review_strategy_overdue'; v_reason:='The strategy review date has passed, so the pursuit needs a current player-strategy check.';
    v_action:=jsonb_build_object('action_type','review_career_strategy','instruction','Review the strategy with the player before escalating external activity.','requires_human_input',true);
  else
    if v_window_start is not null and current_date<v_window_start then v_conflict:='outside_target_window_early';
    elsif v_window_end is not null and current_date>v_window_end then v_conflict:='outside_target_window_late';
    elsif v_org.country is not null and exists(select 1 from jsonb_array_elements_text(v_avoids) x where lower(trim(x))=lower(v_org.country)) then v_conflict:='explicit_avoid_market';
    elsif v_target_count=0 then v_conflict:='target_markets_unspecified';
    elsif v_org.country is not null and exists(select 1 from jsonb_array_elements_text(v_targets) x where lower(trim(x))=lower(v_org.country)) then v_conflict:=null;
    else v_conflict:='outside_target_market';
    end if;

    if v_conflict is null then
      v_gate:='open_aligned'; v_reason:='The pursuit is inside the approved, player-confirmed target market and current move window.';
      v_action:=jsonb_build_object('action_type','use_pursuit_readiness','instruction','Proceed to human review using the existing football, commercial, registration and access readiness.','requires_human_input',false);
    elsif v_exception_state='approved' then
      v_gate:='open_approved_exception';
      v_reason:='This pursuit sits outside the normal career-strategy gate, but a player-confirmed and owner/admin-approved exception is active for this specific pursuit.';
      v_action:=jsonb_build_object('action_type','use_pursuit_readiness_with_exception','instruction','Proceed to human review under the approved exception. Keep the underlying career strategy unchanged.','requires_human_input',false);
    elsif v_exception_state='awaiting_internal_approval' then
      v_gate:='review_exception_awaiting_approval'; v_reason:='The player has confirmed an exception, but owner/admin approval is still required.';
      v_action:=jsonb_build_object('action_type','approve_career_exception','instruction','Owner/admin approval is required before external escalation.','requires_human_input',true);
    elsif v_exception_state='awaiting_player_confirmation' then
      v_gate:='review_exception_awaiting_player_confirmation'; v_reason:='A career exception draft exists, but the player has not confirmed it.';
      v_action:=jsonb_build_object('action_type','confirm_career_exception','instruction','Record the player confirmation before internal approval.','requires_human_input',true);
    elsif v_conflict='explicit_avoid_market' then
      v_gate:='hold_explicit_market_conflict'; v_reason:='The club is in a market explicitly recorded as avoided in the approved player strategy.';
      v_action:=jsonb_build_object('action_type','create_career_exception','instruction','Do not advance externally unless the player confirms a specific exception and owner/admin approves it.','requires_human_input',true);
    elsif v_conflict in ('outside_target_window_early','outside_target_window_late') then
      v_gate:='review_outside_target_window';
      v_reason:=case when v_conflict='outside_target_window_early' then 'The pursuit is earlier than the player-confirmed target move window.' else 'The recorded target move window has ended.' end;
      v_action:=jsonb_build_object('action_type','create_career_exception','instruction','Create and confirm a pursuit-specific timing exception or refresh the career strategy.','requires_human_input',true);
    elsif v_conflict='target_markets_unspecified' then
      v_gate:='review_target_markets_unspecified'; v_reason:='The approved strategy does not specify target markets, so geographic alignment cannot be confirmed.';
      v_action:=jsonb_build_object('action_type','review_market_fit','instruction','Human review required because target markets are not explicit.','requires_human_input',true);
    else
      v_gate:='review_outside_target_market'; v_reason:='The pursuit sits outside the player-confirmed target markets but is not explicitly prohibited.';
      v_action:=jsonb_build_object('action_type','create_career_exception','instruction','Create a pursuit-specific exception if the player deliberately wants to explore this route.','requires_human_input',true);
    end if;
  end if;

  return jsonb_build_object(
    'state',v_gate,'reason',v_reason,'next_action',v_action,
    'player_id',v_match.player_id,'player_match_id',p_player_match_id,
    'strategy_status',case when v_s.id is null then 'missing' else v_s.status end,
    'player_confirmation',case when v_s.id is null then 'missing' else v_s.confirmation_status end,
    'review_due_at',case when v_s.id is null then null else to_jsonb(v_s.review_due_at) end,
    'target_markets',v_targets,'avoid_markets',v_avoids,
    'target_window',case when v_s.id is null then null else v_s.strategy->'target_window' end,
    'conflict_type',v_conflict,
    'exception',case when v_e.id is null then null else jsonb_build_object('id',v_e.id,'state',v_exception_state,'status',v_e.status,'reason',v_e.reason,'confirmation_status',v_e.confirmation_status,'expires_at',v_e.expires_at,'approved_at',v_e.approved_at) end,
    'truth_contract',jsonb_build_object('exception_scope','An approved exception opens only this pursuit and does not rewrite the underlying career strategy.')
  );
end;
$function$;

create or replace function public.platform_server_career_aligned_pursuit_board(p_tenant_id uuid,p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
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

revoke all on function public.platform_server_career_pursuit_gate(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_career_aligned_pursuit_board(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_career_pursuit_gate(uuid,uuid) to service_role;
grant execute on function public.platform_server_career_aligned_pursuit_board(uuid,integer) to service_role;;
