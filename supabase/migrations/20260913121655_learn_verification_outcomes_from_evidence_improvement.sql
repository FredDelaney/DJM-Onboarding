alter function platform.evaluate_agency_action_outcome(uuid) rename to evaluate_agency_action_outcome_core_v1;

create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_commitment platform.agency_commitments%rowtype;
  v_baseline jsonb;
  v_current jsonb;
  v_baseline_score integer:=0;
  v_current_score integer:=0;
  v_operational text:='pending';
  v_downstream text:='pending';
  v_key text:='verification_outcome_pending';
  v_window_end timestamptz;
  v_first_observed timestamptz;
  v_evidence jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'create_verification_task' then
    return platform.evaluate_agency_action_outcome_core_v1(p_proposal_id);
  end if;

  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';
  v_baseline:=coalesce(v_p.proposed_payload->'evidence_health','{}'::jsonb);
  begin v_baseline_score:=coalesce((v_baseline->>'score')::integer,0); exception when others then v_baseline_score:=0; end;

  if v_p.status='undone' then
    v_operational:='cancelled'; v_downstream:='cancelled'; v_key:='action_undone';
  elsif v_p.status='failed' then
    v_operational:='failed'; v_downstream:='not_applicable'; v_key:='execution_failed';
  elsif v_p.status<>'applied' then
    v_operational:='pending'; v_downstream:='not_applicable'; v_key:='not_applied';
  else
    select * into v_commitment from platform.agency_commitments where proposal_id=v_p.id;
    v_operational:=case when v_commitment.status='completed' then 'completed' when v_commitment.status='cancelled' then 'cancelled' else 'pending' end;

    if v_p.target_type='deal_room' then
      v_current:=platform.command_evidence_health_v2(v_p.tenant_id,jsonb_build_object('source_type','deal_room','source_id',v_p.target_id,'command_type','Verification outcome','evidence','{}'::jsonb));
    elsif v_p.target_type='club_need' then
      v_current:=platform.command_evidence_health_v2(v_p.tenant_id,jsonb_build_object('source_type','club_need','source_id',v_p.target_id,'club_need_id',v_p.target_id,'command_type','Verification outcome','evidence','{}'::jsonb));
    elsif v_p.target_type='player' then
      v_current:=platform.command_evidence_health_v2(v_p.tenant_id,jsonb_build_object('source_type','player','source_id',v_p.target_id,'player_id',v_p.target_id,'command_type','Verification outcome','evidence','{}'::jsonb));
    else
      v_current:=v_baseline;
    end if;
    begin v_current_score:=coalesce((v_current->>'score')::integer,0); exception when others then v_current_score:=0; end;

    if v_baseline_score<65 and v_current_score>=65 then
      v_downstream:='positive'; v_key:='evidence_gate_cleared'; v_first_observed:=now();
    elsif v_current_score>=v_baseline_score+10 then
      v_downstream:='positive'; v_key:='evidence_materially_improved'; v_first_observed:=now();
    elsif v_operational='completed' then
      v_downstream:='neutral'; v_key:='verification_completed_without_evidence_improvement';
    elsif now()>=v_window_end then
      v_downstream:='neutral'; v_key:='evidence_not_improved_in_window';
    else
      v_downstream:='pending'; v_key:='verification_outcome_pending';
    end if;
  end if;

  v_evidence:=jsonb_build_object(
    'target_type',v_p.target_type,'target_id',v_p.target_id,
    'baseline_evidence_health',v_baseline,'current_evidence_health',coalesce(v_current,'{}'::jsonb),
    'baseline_score',v_baseline_score,'current_score',v_current_score,'score_delta',v_current_score-v_baseline_score,
    'gate_cleared',v_baseline_score<65 and v_current_score>=65,
    'commitment_status',v_commitment.status,'task_id',v_commitment.task_id
  );

  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence)
  values(v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first_observed,now(),v_evidence)
  on conflict (proposal_id) do update set
    operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,
    evaluation_window_end=excluded.evaluation_window_end,
    first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),
    last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first_observed;

  return jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,
    'evaluation_window_end',v_window_end,'first_observed_at',v_first_observed,'evidence',v_evidence);
end;
$$;

create or replace function public.platform_server_evaluate_action_outcomes(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p record;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_checked integer:=0;
  v_failed integer:=0;
begin
  if not exists(select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_found'; end if;
  for v_p in
    select p.id from platform.agency_action_proposals p
    where p.tenant_id=p_tenant_id and p.created_at>=now()-interval '180 days' and p.status in ('applied','undone','failed')
    order by p.created_at desc
  loop
    begin
      v_result:=platform.evaluate_agency_action_outcome(v_p.id);
      v_results:=v_results||jsonb_build_array(v_result); v_checked:=v_checked+1;
    exception when others then
      v_failed:=v_failed+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('proposal_id',v_p.id,'error',left(sqlerrm,500)));
    end;
  end loop;
  return jsonb_build_object('tenant_id',p_tenant_id,'checked',v_checked,'failed',v_failed,'evaluated_at',now(),'results',v_results);
end;
$$;

revoke all on function platform.evaluate_agency_action_outcome_core_v1(uuid) from public,anon,authenticated;
revoke all on function platform.evaluate_agency_action_outcome(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_evaluate_action_outcomes(uuid) from public,anon,authenticated;
grant execute on function platform.evaluate_agency_action_outcome_core_v1(uuid) to service_role;
grant execute on function platform.evaluate_agency_action_outcome(uuid) to service_role;
grant execute on function public.platform_server_evaluate_action_outcomes(uuid) to service_role;;
