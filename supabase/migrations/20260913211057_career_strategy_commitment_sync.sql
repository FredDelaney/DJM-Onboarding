create or replace function platform.sync_commitment_from_proposal()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_task djm_os.tasks%rowtype;
  v_status text;
  v_task_actions text[]:=array['create_search_task','create_player_task','create_relationship_task','create_verification_task','create_introduction_task','create_deal_blocker_task','create_deal_decision_task','create_negotiation_task','create_player_service_task','create_career_strategy_task'];
begin
  if new.action_type=any(v_task_actions) and new.status='applied' and new.result_target_id is not null then
    select * into v_task from djm_os.tasks where id=new.result_target_id and tenant_id=new.tenant_id;
    if found then
      v_status:=case when v_task.status='completed' then 'completed' when v_task.due_at is not null and v_task.due_at<now() then 'overdue' else 'active' end;
      insert into platform.agency_commitments(tenant_id,proposal_id,command_id,task_id,owner_user_id,status,due_at,completed_at,metadata)
      values(new.tenant_id,new.id,new.command_id,v_task.id,coalesce(new.approved_by,new.requested_by),v_status,v_task.due_at,v_task.completed_at,
        jsonb_build_object(
          'action_type',new.action_type,'source','agency_os','target_type',new.target_type,'target_id',new.target_id,'task_title',v_task.title,'task_source',v_task.source,
          'verification_task',new.action_type='create_verification_task','deal_control_task',new.action_type in ('create_deal_blocker_task','create_deal_decision_task'),
          'negotiation_task',new.action_type='create_negotiation_task','player_service_task',new.action_type='create_player_service_task','career_strategy_task',new.action_type='create_career_strategy_task',
          'service_move_type',new.proposed_payload->>'service_move_type','strategy_action_type',new.proposed_payload->>'strategy_action_type',
          'deal_room_id',new.proposed_payload->>'deal_room_id','deal_step_type',new.proposed_payload->>'deal_step_type','negotiation_step_type',new.proposed_payload->>'negotiation_step_type','target_gap',new.proposed_payload->>'target_gap'
        ))
      on conflict (proposal_id) do update set task_id=excluded.task_id,owner_user_id=excluded.owner_user_id,status=excluded.status,due_at=excluded.due_at,completed_at=excluded.completed_at,metadata=platform.agency_commitments.metadata||excluded.metadata,updated_at=now();
    end if;
  elsif new.action_type=any(v_task_actions) and new.status='undone' then
    update platform.agency_commitments set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancelled_by_undo',true,'cancelled_at',now()) where proposal_id=new.id and status<>'cancelled';
  end if;
  return new;
end;$$;;
