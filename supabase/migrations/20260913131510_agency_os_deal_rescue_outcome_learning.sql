alter function platform.evaluate_agency_action_outcome(uuid) rename to evaluate_agency_action_outcome_core_v5;

create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_step_type text;
  v_commitment platform.agency_commitments%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_momentum jsonb;
  v_baseline_momentum jsonb;
  v_baseline_stage text;
  v_baseline_status text;
  v_baseline_probability integer:=0;
  v_baseline_blocker text;
  v_baseline_decision text;
  v_current_probability integer:=0;
  v_baseline_positive integer:=0;
  v_current_positive integer:=0;
  v_last_forward timestamptz;
  v_operational text:='pending';
  v_downstream text:='pending';
  v_key text:='rescue_outcome_pending';
  v_window_end timestamptz;
  v_first_observed timestamptz:=null;
  v_evidence jsonb:='{}'::jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;
  v_step_type:=v_p.proposed_payload->>'deal_step_type';

  if v_p.action_type<>'create_deal_decision_task' or v_step_type not in ('recover_momentum','force_decision_or_park') then
    return platform.evaluate_agency_action_outcome_core_v5(p_proposal_id);
  end if;

  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';
  v_baseline_stage:=v_p.proposed_payload->>'baseline_stage';
  v_baseline_status:=v_p.proposed_payload->>'baseline_status';
  begin v_baseline_probability:=coalesce((v_p.proposed_payload->>'baseline_probability')::integer,0); exception when others then v_baseline_probability:=0; end;
  v_baseline_blocker:=v_p.proposed_payload->>'baseline_blocker';
  v_baseline_decision:=v_p.proposed_payload->>'baseline_next_decision';
  v_baseline_momentum:=coalesce(v_p.proposed_payload->'baseline_momentum','{}'::jsonb);
  begin v_baseline_positive:=coalesce((v_baseline_momentum->'movement'->>'positive_move_events')::integer,0); exception when others then v_baseline_positive:=0; end;

  if v_p.status='undone' then
    v_operational:='cancelled'; v_downstream:='cancelled'; v_key:='action_undone';
  elsif v_p.status='failed' then
    v_operational:='failed'; v_downstream:='not_applicable'; v_key:='execution_failed';
  elsif v_p.status<>'applied' then
    v_operational:='pending'; v_downstream:='not_applicable'; v_key:='not_applied';
  else
    select * into v_commitment from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_commitment.status='completed' then 'completed' when v_commitment.status='cancelled' then 'cancelled' else 'pending' end;
    select * into v_deal from djm_os.deal_rooms d where d.id=v_p.target_id and d.tenant_id=v_p.tenant_id;
    if not found then
      v_downstream:='neutral'; v_key:='deal_no_longer_available';
    else
      v_current_probability:=coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability,0);
      v_momentum:=public.platform_server_deal_momentum(v_p.tenant_id,v_deal.id,30);
      begin v_current_positive:=coalesce((v_momentum->'movement'->>'positive_move_events')::integer,0); exception when others then v_current_positive:=0; end;
      begin v_last_forward:=nullif(v_momentum->'movement'->>'last_forward_movement_at','')::timestamptz; exception when others then v_last_forward:=null; end;

      if v_deal.status is distinct from v_baseline_status or v_deal.stage is distinct from v_baseline_stage then
        v_downstream:='positive'; v_key:='deal_state_moved_after_rescue'; v_first_observed:=v_deal.updated_at;
      elsif v_current_probability>=v_baseline_probability+10 then
        v_downstream:='positive'; v_key:='deal_probability_materially_improved_after_rescue'; v_first_observed:=v_deal.updated_at;
      elsif v_deal.primary_blocker is distinct from v_baseline_blocker then
        v_downstream:='positive'; v_key:='blocker_changed_after_rescue'; v_first_observed:=v_deal.updated_at;
      elsif v_deal.next_decision is distinct from v_baseline_decision then
        v_downstream:='positive'; v_key:='decision_redefined_after_rescue'; v_first_observed:=v_deal.updated_at;
      elsif v_last_forward is not null and v_last_forward>coalesce(v_p.applied_at,v_p.created_at) and v_current_positive>v_baseline_positive then
        v_downstream:='positive'; v_key:='new_forward_movement_after_rescue'; v_first_observed:=v_last_forward;
      elsif v_operational='completed' then
        v_downstream:='neutral'; v_key:='rescue_task_completed_without_forward_movement';
      elsif now()>=v_window_end then
        v_downstream:='neutral'; v_key:='no_forward_movement_in_rescue_window';
      else
        v_downstream:='pending'; v_key:='rescue_outcome_pending';
      end if;
    end if;
  end if;

  v_evidence:=jsonb_build_object(
    'deal_room_id',v_p.target_id,'deal_step_type',v_step_type,
    'baseline_stage',v_baseline_stage,'current_stage',v_deal.stage,'baseline_status',v_baseline_status,'current_status',v_deal.status,
    'baseline_probability',v_baseline_probability,'current_probability',v_current_probability,
    'baseline_blocker',v_baseline_blocker,'current_blocker',v_deal.primary_blocker,
    'baseline_next_decision',v_baseline_decision,'current_next_decision',v_deal.next_decision,
    'baseline_positive_move_events',v_baseline_positive,'current_positive_move_events',v_current_positive,
    'last_forward_movement_at',v_last_forward,'commitment_status',v_commitment.status,'task_id',v_commitment.task_id,
    'success_definition','A rescue succeeds only when the deal state, probability, blocker, decision or recorded forward movement materially improves. Task completion alone is not success.'
  );

  insert into platform.agency_action_outcomes(
    tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence
  ) values(
    v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first_observed,now(),v_evidence
  )
  on conflict (proposal_id) do update set
    operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,
    evaluation_window_end=excluded.evaluation_window_end,
    first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),
    last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first_observed;

  return jsonb_build_object(
    'proposal_id',v_p.id,'action_type',v_p.action_type,'deal_step_type',v_step_type,'operational_state',v_operational,
    'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first_observed,'evidence',v_evidence
  );
end;
$$;

revoke execute on function platform.evaluate_agency_action_outcome(uuid) from public,anon,authenticated;
grant execute on function platform.evaluate_agency_action_outcome(uuid) to service_role;;
