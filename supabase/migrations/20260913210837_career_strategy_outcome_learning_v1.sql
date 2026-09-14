create or replace function platform.evaluate_career_strategy_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_commitment platform.agency_commitments%rowtype;
  v_type text;
  v_operational text:='pending';
  v_downstream text:='pending';
  v_key text:='career_strategy_outcome_pending';
  v_window_end timestamptz;
  v_first timestamptz:=null;
  v_card jsonb;
  v_strategy platform.player_career_strategies%rowtype;
  v_active_deals integer:=0; v_matches integer:=0; v_opps integer:=0;
  v_base_deals integer:=0; v_base_matches integer:=0; v_base_opps integer:=0; v_base_version integer:=0;
  v_base_review date;
  v_evidence jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'create_career_strategy_task' then raise exception 'not_career_strategy_action'; end if;
  v_type:=v_p.proposed_payload->>'strategy_action_type';
  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';
  begin v_base_deals:=coalesce((v_p.proposed_payload->>'baseline_active_deals')::int,0); exception when others then v_base_deals:=0; end;
  begin v_base_matches:=coalesce((v_p.proposed_payload->>'baseline_market_matches')::int,0); exception when others then v_base_matches:=0; end;
  begin v_base_opps:=coalesce((v_p.proposed_payload->>'baseline_active_opportunities')::int,0); exception when others then v_base_opps:=0; end;
  begin v_base_version:=coalesce((v_p.proposed_payload->>'baseline_strategy_version')::int,0); exception when others then v_base_version:=0; end;
  begin v_base_review:=nullif(v_p.proposed_payload->>'baseline_review_due_at','')::date; exception when others then v_base_review:=null; end;

  if v_p.status='undone' then v_operational:='cancelled'; v_downstream:='cancelled'; v_key:='action_undone';
  elsif v_p.status='failed' then v_operational:='failed'; v_downstream:='not_applicable'; v_key:='execution_failed';
  elsif v_p.status<>'applied' then v_operational:='pending'; v_downstream:='not_applicable'; v_key:='not_applied';
  else
    select * into v_commitment from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_commitment.status='completed' then 'completed' when v_commitment.status='cancelled' then 'cancelled' else 'pending' end;
    select count(*) into v_active_deals from djm_os.deal_rooms d where d.tenant_id=v_p.tenant_id and d.player_id=v_p.target_id and d.status='active';
    select count(*) into v_matches from djm_os.player_matches pm where pm.tenant_id=v_p.tenant_id and pm.player_id=v_p.target_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
    select count(*) into v_opps from public.player_opportunities po where po.tenant_id=v_p.tenant_id and po.player_id=v_p.target_id and po.stage not in ('won','lost');
    select * into v_strategy from platform.player_career_strategies s where s.tenant_id=v_p.tenant_id and s.player_id=v_p.target_id and s.status in ('draft','approved') order by s.version desc limit 1;
    v_card:=public.platform_server_player_career_alignment(v_p.tenant_id,v_p.target_id);

    if v_type='activate_market_plan' and (v_active_deals>v_base_deals or v_matches>v_base_matches or v_opps>v_base_opps) then
      v_downstream:='positive'; v_key:='career_market_coverage_increased'; v_first:=now();
    elsif v_type='activate_market_plan' and v_strategy.id is not null and v_strategy.version>v_base_version and v_strategy.status='approved' and v_strategy.confirmation_status='confirmed' and coalesce(v_card->>'alignment_state','')<>'strategy_execution_gap' then
      v_downstream:='positive'; v_key:='career_strategy_deliberately_reframed'; v_first:=now();
    elsif v_type='review_market_exception' and coalesce((v_card#>>'{market_alignment,explicit_conflicts}')::int,0)=0 and coalesce((v_card#>>'{market_alignment,outside_target_deals}')::int,0)=0 and v_strategy.status='approved' and v_strategy.confirmation_status='confirmed' then
      v_downstream:='positive'; v_key:='career_market_exception_resolved'; v_first:=now();
    elsif v_type='review_career_strategy' and v_strategy.id is not null and v_strategy.status='approved' and v_strategy.confirmation_status='confirmed' and v_strategy.review_due_at is not null and (v_base_review is null or v_strategy.review_due_at>v_base_review) then
      v_downstream:='positive'; v_key:='career_strategy_review_completed'; v_first:=now();
    elsif v_operational='completed' then
      v_downstream:='neutral'; v_key:='career_strategy_task_completed_without_operating_change';
    elsif now()>=v_window_end then
      v_downstream:='neutral'; v_key:='career_strategy_outcome_not_observed_in_window';
    else
      v_downstream:='pending'; v_key:='career_strategy_outcome_pending';
    end if;
  end if;

  v_evidence:=jsonb_build_object(
    'player_id',v_p.target_id,'strategy_action_type',v_type,'task_id',v_commitment.task_id,'commitment_status',v_commitment.status,
    'baseline_active_deals',v_base_deals,'current_active_deals',v_active_deals,'baseline_market_matches',v_base_matches,'current_market_matches',v_matches,
    'baseline_active_opportunities',v_base_opps,'current_active_opportunities',v_opps,'baseline_strategy_version',v_base_version,'current_strategy_version',coalesce(v_strategy.version,0),
    'current_strategy_status',v_strategy.status,'current_confirmation_status',v_strategy.confirmation_status,'current_alignment_state',v_card->>'alignment_state',
    'success_definition','Career strategy work succeeds only when market execution or the confirmed strategy state materially changes. Task completion alone is not downstream success.'
  );
  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence)
  values(v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first,now(),v_evidence)
  on conflict (proposal_id) do update set operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,evaluation_window_end=excluded.evaluation_window_end,first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first;
  return jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'strategy_action_type',v_type,'operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first,'evidence',v_evidence);
end;$$;

create or replace function public.platform_server_evaluate_action_outcomes(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_p record; v_result jsonb; v_results jsonb:='[]'::jsonb; v_checked integer:=0; v_failed integer:=0; begin
  if not exists(select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_found'; end if;
  for v_p in select p.id,p.action_type from platform.agency_action_proposals p where p.tenant_id=p_tenant_id and p.created_at>=now()-interval '180 days' and p.status in ('applied','undone','failed') order by p.created_at desc
  loop
    begin
      v_result:=case when v_p.action_type='create_career_strategy_task' then platform.evaluate_career_strategy_action_outcome(v_p.id) else platform.evaluate_agency_action_outcome(v_p.id) end;
      v_results:=v_results||jsonb_build_array(v_result); v_checked:=v_checked+1;
    exception when others then v_failed:=v_failed+1; v_results:=v_results||jsonb_build_array(jsonb_build_object('proposal_id',v_p.id,'error',left(sqlerrm,500)));
    end;
  end loop;
  return jsonb_build_object('tenant_id',p_tenant_id,'checked',v_checked,'failed',v_failed,'evaluated_at',now(),'results',v_results);
end;$$;

revoke all on function platform.evaluate_career_strategy_action_outcome(uuid) from public,anon,authenticated;
grant execute on function platform.evaluate_career_strategy_action_outcome(uuid) to service_role;;
