create or replace function public.platform_server_reset_demo_operating_history(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_meta jsonb;
  v_tasks integer:=0;
  v_outcomes integer:=0;
  v_commitments integer:=0;
  v_feedback integer:=0;
  v_proposals integer:=0;
  v_pulse integer:=0;
  v_audit integer:=0;
  v_deal_snapshots integer:=0;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_reset_requires_synthetic_tenant'; end if;

  delete from djm_os.tasks where tenant_id=p_tenant_id and source like 'agency_os:%';
  get diagnostics v_tasks=row_count;
  delete from platform.agency_action_outcomes where tenant_id=p_tenant_id;
  get diagnostics v_outcomes=row_count;
  delete from platform.agency_commitments where tenant_id=p_tenant_id;
  get diagnostics v_commitments=row_count;
  delete from platform.agency_command_feedback where tenant_id=p_tenant_id;
  get diagnostics v_feedback=row_count;
  delete from platform.agency_action_proposals where tenant_id=p_tenant_id;
  get diagnostics v_proposals=row_count;
  delete from platform.agency_pulse_events where tenant_id=p_tenant_id;
  get diagnostics v_pulse=row_count;
  delete from platform.tenant_attention_state where tenant_id=p_tenant_id;
  delete from platform.deal_state_snapshots where tenant_id=p_tenant_id;
  get diagnostics v_deal_snapshots=row_count;
  delete from platform.audit_events
  where tenant_id=p_tenant_id and (
    action like 'agency_action.%' or action like 'deal_war_room.%' or
    metadata->>'source' in ('agency_command_engine','deal_war_room') or entity_type='agency_action'
  );
  get diagnostics v_audit=row_count;

  return jsonb_build_object('tenant_id',p_tenant_id,'reset',true,'deleted',jsonb_build_object(
    'agency_os_tasks',v_tasks,'outcomes',v_outcomes,'commitments',v_commitments,'feedback',v_feedback,
    'proposals',v_proposals,'pulse_events',v_pulse,'audit_events',v_audit,'deal_state_snapshots',v_deal_snapshots));
end;
$$;

create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reset jsonb;
  v_core jsonb;
  v_access jsonb;
  v_history jsonb;
begin
  v_reset:=public.platform_server_reset_demo_operating_history(p_tenant_id);
  v_core:=public.platform_server_seed_demo_story_core_v2(p_tenant_id);
  v_access:=public.platform_server_seed_demo_access_story(p_tenant_id);
  v_history:=public.platform_server_seed_demo_deal_history(p_tenant_id);
  return v_core || jsonb_build_object(
    'story_version','v4',
    'operating_reset',v_reset,
    'access_story',v_access,
    'deal_history',v_history,
    'deal_portfolio',public.platform_server_deal_portfolio(p_tenant_id,10),
    'executive_home',public.platform_server_agency_home_executive(p_tenant_id,5)
  );
end;
$$;

revoke execute on function public.platform_server_reset_demo_operating_history(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_reset_demo_operating_history(uuid) to service_role;
revoke execute on function public.platform_server_seed_demo_story(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_story(uuid) to service_role;;
