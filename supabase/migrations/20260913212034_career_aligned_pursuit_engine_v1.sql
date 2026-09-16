create or replace function public.platform_server_career_aligned_pursuit_board(p_tenant_id uuid,p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_board jsonb;
  v_item jsonb;
  v_player_id uuid;
  v_country text;
  v_s platform.player_career_strategies%rowtype;
  v_gate text;
  v_reason text;
  v_action jsonb;
  v_targets jsonb;
  v_avoids jsonb;
  v_target_count integer;
  v_window_start date;
  v_window_end date;
  v_open jsonb:='[]'::jsonb;
  v_review jsonb:='[]'::jsonb;
  v_hold jsonb:='[]'::jsonb;
  v_open_count integer:=0;
  v_review_count integer:=0;
  v_hold_count integer:=0;
begin
  v_board:=public.platform_server_pursuit_board(p_tenant_id,greatest(1,least(coalesce(p_limit,20),100)));
  for v_item in select value from jsonb_array_elements(coalesce(v_board->'items','[]'::jsonb))
  loop
    begin v_player_id:=(v_item#>>'{player,player_id}')::uuid; exception when others then v_player_id:=null; end;
    v_country:=nullif(trim(v_item#>>'{club,country}'),'');
    v_s:=null;
    if v_player_id is not null then
      select * into v_s from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=v_player_id and s.status in ('draft','approved') order by case when s.status='approved' then 0 else 1 end,s.version desc limit 1;
    end if;
    v_targets:=case when v_s.id is null then '[]'::jsonb else coalesce(v_s.strategy->'target_markets','[]'::jsonb) end;
    v_avoids:=case when v_s.id is null then '[]'::jsonb else coalesce(v_s.strategy->'avoid_markets','[]'::jsonb) end;
    select count(*) into v_target_count from jsonb_array_elements_text(v_targets);
    v_window_start:=null; v_window_end:=null;
    begin v_window_start:=nullif(v_s.strategy#>>'{target_window,start_date}','')::date; exception when others then v_window_start:=null; end;
    begin v_window_end:=nullif(v_s.strategy#>>'{target_window,end_date}','')::date; exception when others then v_window_end:=null; end;

    if v_s.id is null then
      v_gate:='hold_strategy_missing';
      v_reason:='The football pursuit exists, but no human-owned career strategy is recorded for the player.';
      v_action:=jsonb_build_object('action_type','define_career_strategy','instruction','Agree the player career strategy before treating this pursuit as career-approved external action.','requires_human_input',true);
      v_hold_count:=v_hold_count+1;
    elsif v_s.status<>'approved' then
      v_gate:='hold_strategy_not_approved';
      v_reason:='The current career strategy is still a draft.';
      v_action:=jsonb_build_object('action_type','complete_strategy_approval','instruction','Complete player confirmation and internal approval before advancing on the basis of the career plan.','requires_human_input',true);
      v_hold_count:=v_hold_count+1;
    elsif v_s.confirmation_status<>'confirmed' then
      v_gate:='hold_player_confirmation_missing';
      v_reason:='The strategy is not currently confirmed by the player.';
      v_action:=jsonb_build_object('action_type','confirm_strategy_with_player','instruction','Confirm the current strategy with the player before treating this pursuit as aligned.','requires_human_input',true);
      v_hold_count:=v_hold_count+1;
    elsif v_s.review_due_at is not null and v_s.review_due_at<current_date then
      v_gate:='review_strategy_overdue';
      v_reason:='The strategy review date has passed, so the pursuit needs a current player-strategy check.';
      v_action:=jsonb_build_object('action_type','review_career_strategy','instruction','Review the strategy with the player before escalating external activity.','requires_human_input',true);
      v_review_count:=v_review_count+1;
    elsif v_window_start is not null and current_date<v_window_start then
      v_gate:='review_outside_target_window';
      v_reason:='The pursuit is earlier than the player-confirmed target move window.';
      v_action:=jsonb_build_object('action_type','review_timing_exception','instruction','Confirm whether this is a deliberate early-window exception.','requires_human_input',true);
      v_review_count:=v_review_count+1;
    elsif v_window_end is not null and current_date>v_window_end then
      v_gate:='review_outside_target_window';
      v_reason:='The recorded target move window has ended.';
      v_action:=jsonb_build_object('action_type','review_career_strategy','instruction','Refresh the player strategy before progressing a pursuit outside the agreed window.','requires_human_input',true);
      v_review_count:=v_review_count+1;
    elsif v_country is not null and exists(select 1 from jsonb_array_elements_text(v_avoids) x where lower(trim(x))=lower(v_country)) then
      v_gate:='hold_explicit_market_conflict';
      v_reason:='The club is in a market explicitly recorded as avoided in the approved player strategy.';
      v_action:=jsonb_build_object('action_type','review_market_exception','instruction','Do not advance externally until the player/agency deliberately approves an exception or revises the strategy.','requires_human_input',true);
      v_hold_count:=v_hold_count+1;
    elsif v_target_count=0 then
      v_gate:='review_target_markets_unspecified';
      v_reason:='The approved strategy does not specify target markets, so geographic alignment cannot be confirmed.';
      v_action:=jsonb_build_object('action_type','review_market_fit','instruction','Human review required because target markets are not explicit.','requires_human_input',true);
      v_review_count:=v_review_count+1;
    elsif v_country is not null and exists(select 1 from jsonb_array_elements_text(v_targets) x where lower(trim(x))=lower(v_country)) then
      v_gate:='open_aligned';
      v_reason:='The pursuit is inside the approved, player-confirmed target market and current move window.';
      v_action:=jsonb_build_object('action_type','use_pursuit_readiness','instruction','Proceed to human review using the existing football, commercial, registration and access readiness.','requires_human_input',false);
      v_open_count:=v_open_count+1;
    else
      v_gate:='review_outside_target_market';
      v_reason:='The pursuit sits outside the player-confirmed target markets but is not explicitly prohibited.';
      v_action:=jsonb_build_object('action_type','review_market_exception','instruction','Confirm whether this opportunity justifies an exception before external escalation.','requires_human_input',true);
      v_review_count:=v_review_count+1;
    end if;

    v_item:=v_item || jsonb_build_object(
      'career_strategy_gate',jsonb_build_object(
        'state',v_gate,'reason',v_reason,'next_action',v_action,
        'strategy_status',case when v_s.id is null then 'missing' else v_s.status end,
        'player_confirmation',case when v_s.id is null then 'missing' else v_s.confirmation_status end,
        'review_due_at',case when v_s.id is null then null else to_jsonb(v_s.review_due_at) end,
        'target_markets',v_targets,'avoid_markets',v_avoids,
        'target_window',case when v_s.id is null then null else v_s.strategy->'target_window' end
      )
    );
    if v_gate like 'open_%' then v_open:=v_open||jsonb_build_array(v_item);
    elsif v_gate like 'review_%' then v_review:=v_review||jsonb_build_array(v_item);
    else v_hold:=v_hold||jsonb_build_array(v_item); end if;
  end loop;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'items',v_open||v_review||v_hold,
    'summary',jsonb_build_object('pursuit_count',v_open_count+v_review_count+v_hold_count,'career_aligned_open',v_open_count,'human_exception_review',v_review_count,'career_strategy_hold',v_hold_count),
    'principle','Pursuit readiness and player career alignment remain separate. A strong football fit cannot silently override an approved player strategy.',
    'truth_contract',jsonb_build_object(
      'career_strategy','Only human-authored, approved and player-confirmed strategy fields create an open career-alignment gate.',
      'football_fit','Career alignment does not alter the underlying football/commercial/registration/access readiness score.',
      'exceptions','An outside-market opportunity is not automatically rejected unless it conflicts with an explicit avoid-market rule. Human exceptions remain possible.',
      'club_profile','Free-text target club profile is not machine-interpreted as a hard gate because doing so would invent meaning beyond the recorded fields.'
    )
  );
end;$$;

revoke all on function public.platform_server_career_aligned_pursuit_board(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_career_aligned_pursuit_board(uuid,integer) to service_role;;
