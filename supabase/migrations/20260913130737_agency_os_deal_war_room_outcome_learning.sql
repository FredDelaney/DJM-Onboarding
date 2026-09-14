alter function platform.evaluate_agency_action_outcome(uuid) rename to evaluate_agency_action_outcome_core_v4;

create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_commitment platform.agency_commitments%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_operational text:='pending';
  v_downstream text:='pending';
  v_key text:='outcome_pending';
  v_window_end timestamptz;
  v_first_observed timestamptz:=null;
  v_evidence jsonb:='{}'::jsonb;
  v_deal_id uuid;
  v_baseline_stage text;
  v_baseline_status text;
  v_baseline_blocker text;
  v_baseline_next_decision text;
  v_expected_owner uuid;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;

  if v_p.action_type not in ('create_deal_blocker_task','create_deal_decision_task','assign_deal_owner') then
    return platform.evaluate_agency_action_outcome_core_v4(p_proposal_id);
  end if;

  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';

  if v_p.status='undone' then
    v_operational:='cancelled'; v_downstream:='cancelled'; v_key:='action_undone';
  elsif v_p.status='failed' then
    v_operational:='failed'; v_downstream:='not_applicable'; v_key:='execution_failed';
  elsif v_p.status<>'applied' then
    v_operational:='pending'; v_downstream:='not_applicable'; v_key:='not_applied';
  elsif v_p.action_type='assign_deal_owner' then
    begin v_deal_id:=nullif(v_p.proposed_payload->>'deal_room_id','')::uuid; exception when others then v_deal_id:=v_p.target_id; end;
    begin v_expected_owner:=nullif(v_p.proposed_payload->>'owner_user_id','')::uuid; exception when others then v_expected_owner:=null; end;
    select * into v_deal from djm_os.deal_rooms d where d.id=v_deal_id and d.tenant_id=v_p.tenant_id;
    v_operational:='completed'; v_downstream:='not_applicable';
    v_key:=case when found and v_deal.owner_user_id=v_expected_owner then 'deal_owner_assigned' else 'owner_assignment_no_longer_matches' end;
    v_evidence:=jsonb_build_object('deal_room_id',v_deal_id,'expected_owner_user_id',v_expected_owner,'current_owner_user_id',v_deal.owner_user_id);
  else
    select * into v_commitment from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_commitment.status='completed' then 'completed' when v_commitment.status='cancelled' then 'cancelled' else 'pending' end;

    begin v_deal_id:=nullif(v_p.proposed_payload->>'deal_room_id','')::uuid; exception when others then v_deal_id:=null; end;
    v_baseline_stage:=v_p.proposed_payload->>'baseline_stage';
    v_baseline_status:=v_p.proposed_payload->>'baseline_status';
    v_baseline_blocker:=v_p.proposed_payload->>'baseline_blocker';
    v_baseline_next_decision:=v_p.proposed_payload->>'baseline_next_decision';
    select * into v_deal from djm_os.deal_rooms d where d.id=v_deal_id and d.tenant_id=v_p.tenant_id;

    if not found then
      v_downstream:='neutral'; v_key:='deal_no_longer_available';
    elsif v_p.action_type='create_deal_blocker_task' then
      if v_deal.status is distinct from v_baseline_status or v_deal.stage is distinct from v_baseline_stage then
        v_downstream:='positive'; v_key:='deal_progressed_after_blocker_work'; v_first_observed:=v_deal.updated_at;
      elsif v_deal.primary_blocker is distinct from v_baseline_blocker then
        v_downstream:='positive'; v_key:='blocker_changed_after_blocker_work'; v_first_observed:=v_deal.updated_at;
      elsif now()>=v_window_end then
        v_downstream:='neutral'; v_key:='blocker_unchanged_in_window';
      else
        v_downstream:='pending'; v_key:='blocker_outcome_pending';
      end if;
      v_evidence:=jsonb_build_object(
        'deal_room_id',v_deal_id,'baseline_stage',v_baseline_stage,'current_stage',v_deal.stage,
        'baseline_status',v_baseline_status,'current_status',v_deal.status,
        'baseline_blocker',v_baseline_blocker,'current_blocker',v_deal.primary_blocker,
        'commitment_status',v_commitment.status,'task_id',v_commitment.task_id,
        'success_definition','The blocker changes or clears, or the deal advances despite it. Task completion alone is not downstream success.'
      );
    elsif v_p.action_type='create_deal_decision_task' then
      if v_deal.status is distinct from v_baseline_status or v_deal.stage is distinct from v_baseline_stage then
        v_downstream:='positive'; v_key:='deal_decision_realised'; v_first_observed:=v_deal.updated_at;
      elsif v_deal.next_decision is distinct from v_baseline_next_decision then
        v_downstream:='positive'; v_key:='next_decision_redefined'; v_first_observed:=v_deal.updated_at;
      elsif now()>=v_window_end then
        v_downstream:='neutral'; v_key:='no_decision_change_in_window';
      else
        v_downstream:='pending'; v_key:='decision_outcome_pending';
      end if;
      v_evidence:=jsonb_build_object(
        'deal_room_id',v_deal_id,'baseline_stage',v_baseline_stage,'current_stage',v_deal.stage,
        'baseline_status',v_baseline_status,'current_status',v_deal.status,
        'baseline_next_decision',v_baseline_next_decision,'current_next_decision',v_deal.next_decision,
        'commitment_status',v_commitment.status,'task_id',v_commitment.task_id,
        'success_definition','The deal advances, closes/parks, or the next decision materially changes. Task completion alone is not downstream success.'
      );
    end if;
  end if;

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
    'proposal_id',v_p.id,'action_type',v_p.action_type,'operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,
    'evaluation_window_end',v_window_end,'first_observed_at',v_first_observed,'evidence',v_evidence
  );
end;
$$;

revoke execute on function platform.evaluate_agency_action_outcome(uuid) from public,anon,authenticated;
grant execute on function platform.evaluate_agency_action_outcome(uuid) to service_role;;
