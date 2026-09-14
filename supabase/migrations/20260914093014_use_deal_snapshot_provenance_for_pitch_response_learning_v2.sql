create or replace function public.platform_server_evaluate_pitch_response_action(
  p_tenant_id uuid,
  p_proposal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_o platform.agency_action_outcomes%rowtype;
  v_task djm_os.tasks%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_baseline_stage text;
  v_baseline_next timestamptz;
  v_stage_improved boolean:=false;
  v_next_improved boolean:=false;
  v_operational text;
  v_downstream text;
  v_key text;
  v_rank_base int:=0;
  v_rank_now int:=0;
  v_post_snapshot platform.deal_state_snapshots%rowtype;
begin
  select * into v_p from platform.agency_action_proposals a where a.id=p_proposal_id and a.tenant_id=p_tenant_id;
  if not found or v_p.action_type<>'review_pitch_response' then raise exception 'pitch_response_proposal_not_found'; end if;
  select * into v_o from platform.agency_action_outcomes o where o.proposal_id=v_p.id and o.tenant_id=p_tenant_id for update;
  if not found then raise exception 'pitch_response_outcome_not_found'; end if;
  select * into v_task from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=p_tenant_id;
  v_operational:=case when v_p.status='undone' then 'cancelled' when v_task.id is null then 'failed' when v_task.status='completed' then 'completed' else 'pending' end;

  if nullif(v_p.proposed_payload->>'deal_room_id','') is not null then
    select * into v_deal from djm_os.deal_rooms d where d.id=(v_p.proposed_payload->>'deal_room_id')::uuid and d.tenant_id=p_tenant_id;
    v_baseline_stage:=v_p.before_json#>>'{deal,stage}';
    if nullif(v_p.before_json#>>'{deal,next_action_at}','') is not null then v_baseline_next:=(v_p.before_json#>>'{deal,next_action_at}')::timestamptz; end if;
    v_rank_base:=case v_baseline_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
    v_rank_now:=case v_deal.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
    v_stage_improved:=v_rank_now>v_rank_base;

    select * into v_post_snapshot
    from platform.deal_state_snapshots s
    where s.tenant_id=p_tenant_id
      and s.deal_room_id=v_deal.id
      and s.observed_at>=coalesce(v_p.applied_at,v_p.created_at)
    order by s.observed_at desc
    limit 1;

    v_next_improved:=v_post_snapshot.id is not null
      and v_post_snapshot.next_action_at is not null
      and (v_baseline_next is null or v_post_snapshot.next_action_at is distinct from v_baseline_next);
  end if;

  if v_p.status='undone' then v_downstream:='cancelled'; v_key:='pitch_response_action_undone';
  elsif v_stage_improved then v_downstream:='positive'; v_key:='deal_stage_advanced_after_pitch_response';
  elsif v_next_improved then v_downstream:='positive'; v_key:='deal_next_action_control_improved_after_pitch_response';
  elsif now()>=v_o.evaluation_window_end then v_downstream:='neutral'; v_key:='no_recorded_deal_progress_within_evaluation_window';
  else v_downstream:='pending'; v_key:=null; end if;

  update platform.agency_action_outcomes set operational_state=v_operational,downstream_state=v_downstream,outcome_key=v_key,last_evaluated_at=now(),
    first_observed_at=case when v_downstream in ('positive','neutral','negative') then coalesce(first_observed_at,now()) else first_observed_at end,
    evidence=evidence||jsonb_build_object(
      'task_status',v_task.status,
      'stage_improved',v_stage_improved,
      'next_action_improved',v_next_improved,
      'current_deal_stage',v_deal.stage,
      'current_next_action_at',v_deal.next_action_at,
      'post_intervention_snapshot_id',v_post_snapshot.id,
      'post_intervention_snapshot_at',v_post_snapshot.observed_at
    ),updated_at=now()
  where id=v_o.id returning * into v_o;
  return jsonb_build_object('outcome',to_jsonb(v_o),'truth_contract',jsonb_build_object(
    'task','Task completion alone does not create a positive commercial outcome.',
    'positive','Positive requires a post-intervention deal-state snapshot showing stage advancement or a changed recorded next action.',
    'provenance','Next-action improvement is proven from the deal-state snapshot ledger rather than a generic row updated_at timestamp.',
    'neutral','Neutral after seven days means DJM did not record the defined downstream improvement inside the evaluation window; it does not prove the human response was poor.'
  ));
end;
$function$;

revoke all on function public.platform_server_evaluate_pitch_response_action(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_evaluate_pitch_response_action(uuid,uuid) to service_role;;
