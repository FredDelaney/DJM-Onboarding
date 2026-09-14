alter function platform.evaluate_agency_action_outcome(uuid) rename to evaluate_agency_action_outcome_core_v6;

create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_commitment platform.agency_commitments%rowtype;
  v_current jsonb;
  v_baseline jsonb;
  v_step_type text;
  v_operational text:='pending';
  v_downstream text:='pending';
  v_key text:='negotiation_outcome_pending';
  v_window_end timestamptz;
  v_first_observed timestamptz:=null;
  v_baseline_score integer:=0;
  v_current_score integer:=0;
  v_baseline_factor integer:=0;
  v_current_factor integer:=0;
  v_threshold integer:=70;
  v_factor_key text;
  v_evidence jsonb:='{}'::jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;

  if v_p.action_type<>'create_negotiation_task' then
    return platform.evaluate_agency_action_outcome_core_v6(p_proposal_id);
  end if;

  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';
  v_step_type:=v_p.proposed_payload->>'negotiation_step_type';
  v_baseline:=coalesce(v_p.proposed_payload->'baseline_negotiation_readiness','{}'::jsonb);
  begin v_baseline_score:=coalesce((v_baseline->>'score')::integer,0); exception when others then v_baseline_score:=0; end;

  v_factor_key:=case v_step_type
    when 'verify_authority_record' then 'representation_record'
    when 'verify_player_contract_position' then 'player_contract_position'
    when 'verify_registration_case' then 'registration_readiness'
    when 'complete_commercial_terms' then 'commercial_terms_clarity'
    when 'assemble_document_pack' then 'document_readiness'
    else null end;
  v_threshold:=case v_step_type
    when 'verify_registration_case' then 65
    when 'complete_commercial_terms' then 80
    else 70 end;
  if v_factor_key is not null then
    begin v_baseline_factor:=coalesce((v_baseline->'factors'->v_factor_key->>'score')::integer,0); exception when others then v_baseline_factor:=0; end;
  end if;

  if v_p.status='undone' then
    v_operational:='cancelled'; v_downstream:='cancelled'; v_key:='action_undone';
  elsif v_p.status='failed' then
    v_operational:='failed'; v_downstream:='not_applicable'; v_key:='execution_failed';
  elsif v_p.status<>'applied' then
    v_operational:='pending'; v_downstream:='not_applicable'; v_key:='not_applied';
  else
    select * into v_commitment from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_commitment.status='completed' then 'completed' when v_commitment.status='cancelled' then 'cancelled' else 'pending' end;
    v_current:=public.platform_server_negotiation_readiness(v_p.tenant_id,v_p.target_id);
    begin v_current_score:=coalesce((v_current->>'score')::integer,0); exception when others then v_current_score:=0; end;
    if v_factor_key is not null then
      begin v_current_factor:=coalesce((v_current->'factors'->v_factor_key->>'score')::integer,0); exception when others then v_current_factor:=0; end;
    end if;

    if v_factor_key is not null and v_baseline_factor<v_threshold and v_current_factor>=v_threshold then
      v_downstream:='positive'; v_key:='negotiation_gap_cleared'; v_first_observed:=now();
    elsif v_factor_key is not null and v_current_factor>=v_baseline_factor+15 then
      v_downstream:='positive'; v_key:='negotiation_factor_materially_improved'; v_first_observed:=now();
    elsif v_current_score>=v_baseline_score+10 then
      v_downstream:='positive'; v_key:='negotiation_readiness_materially_improved'; v_first_observed:=now();
    elsif v_operational='completed' then
      v_downstream:='neutral'; v_key:='negotiation_task_completed_without_gap_resolution';
    elsif now()>=v_window_end then
      v_downstream:='neutral'; v_key:='negotiation_gap_not_resolved_in_window';
    else
      v_downstream:='pending'; v_key:='negotiation_outcome_pending';
    end if;
  end if;

  v_evidence:=jsonb_build_object(
    'deal_room_id',v_p.target_id,'negotiation_step_type',v_step_type,'factor_key',v_factor_key,'threshold',v_threshold,
    'baseline_score',v_baseline_score,'current_score',v_current_score,
    'baseline_factor_score',v_baseline_factor,'current_factor_score',v_current_factor,
    'commitment_status',v_commitment.status,'task_id',v_commitment.task_id,
    'success_definition','Negotiation-preparation work succeeds only when the targeted recorded factor or overall readiness materially improves. Task completion alone is not downstream success.'
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
    'proposal_id',v_p.id,'action_type',v_p.action_type,'negotiation_step_type',v_step_type,'operational_state',v_operational,
    'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first_observed,'evidence',v_evidence
  );
end;
$$;
;
