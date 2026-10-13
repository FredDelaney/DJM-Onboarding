-- Baseline runtime definition captured read-only before the authorization migration.
CREATE OR REPLACE FUNCTION public.platform_server_action_history(p_tenant_id uuid, p_actor_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_result jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'proposal_id',p.id,'command_id',p.command_id,'command_type',p.command_type,'action_type',p.action_type,
    'risk_level',p.risk_level,'approval_mode',p.approval_mode,'status',p.status,'title',p.title,'rationale',p.rationale,
    'payload',p.proposed_payload,'result_target_type',p.result_target_type,'result_target_id',p.result_target_id,
    'verification',p.verification_json,'undo_supported',p.undo_supported,'requested_by',p.requested_by,
    'approved_by',p.approved_by,'created_at',p.created_at,'applied_at',p.applied_at,'undone_at',p.undone_at,'error_message',p.error_message
  ) order by p.created_at desc),'[]'::jsonb)
  into v_result
  from (select * from platform.agency_action_proposals where tenant_id=p_tenant_id order by created_at desc limit v_limit) p;
  return v_result;
end;
$function$
;
