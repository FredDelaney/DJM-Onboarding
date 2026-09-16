create or replace function public.platform_server_refresh_customer_onboarding(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_required_total integer;
  v_required_done integer;
  v_optional_done integer;
  v_percentage integer;
  v_status text;
begin
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;
  if not exists (select 1 from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id) then
    perform public.platform_server_seed_customer_lifecycle(p_tenant_id, null, 14);
  end if;

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='agency_profile' and ot.status not in ('complete','waived')
    and exists (select 1 from platform.tenants t join platform.tenant_branding b on b.tenant_id=t.id join platform.tenant_settings s on s.tenant_id=t.id where t.id=p_tenant_id and nullif(trim(t.legal_name),'') is not null and nullif(trim(b.display_name),'') is not null);

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='branding' and ot.status not in ('complete','waived')
    and exists (select 1 from platform.tenant_branding b where b.tenant_id=p_tenant_id and nullif(trim(b.display_name),'') is not null and nullif(trim(b.portal_name),'') is not null);

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='owner_access' and ot.status not in ('complete','waived')
    and exists (select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin'));

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='player_import' and ot.status not in ('complete','waived')
    and exists (select 1 from public.players p where p.tenant_id=p_tenant_id);

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='staff_invites' and ot.status not in ('complete','waived')
    and (select count(*) from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role <> 'player') >= 2;

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='player_portal' and ot.status not in ('complete','waived')
    and exists (select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role='player');

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='first_tell_djm' and ot.status not in ('complete','waived')
    and exists (select 1 from platform.ai_usage_events a where a.tenant_id=p_tenant_id and a.feature_key='ai_assistant' and a.status in ('success','succeeded'));

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='first_opportunity' and ot.status not in ('complete','waived')
    and (exists (select 1 from public.player_opportunities po where po.tenant_id=p_tenant_id) or exists (select 1 from djm_os.club_needs cn where cn.tenant_id=p_tenant_id));

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='billing_ready' and ot.status not in ('complete','waived')
    and (exists (select 1 from platform.tenant_plan_assignments pa where pa.tenant_id=p_tenant_id and pa.status='active' and pa.billing_mode='internal') or exists (select 1 from platform.billing_accounts ba where ba.tenant_id=p_tenant_id and ba.status='active'));

  update platform.tenant_onboarding_tasks ot set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id and ot.task_key='custom_domain' and ot.status not in ('complete','waived')
    and exists (select 1 from platform.tenant_domains d where d.tenant_id=p_tenant_id and d.domain_type='custom' and d.status in ('verified','active'));

  select count(*) filter (where required), count(*) filter (where required and status in ('complete','waived')), count(*) filter (where not required and status in ('complete','waived'))
  into v_required_total, v_required_done, v_optional_done
  from platform.tenant_onboarding_tasks where tenant_id=p_tenant_id;

  v_percentage := case when v_required_total=0 then 100 else round((v_required_done::numeric / v_required_total::numeric) * 100)::integer end;
  v_status := case when v_required_done=v_required_total then 'complete' when exists (select 1 from platform.tenant_onboarding_tasks ot where ot.tenant_id=p_tenant_id and ot.required and ot.status='blocked') then 'blocked' when v_required_done>0 then 'in_progress' else 'not_started' end;

  update platform.tenant_customer_lifecycle set onboarding_status=v_status, updated_at=now() where tenant_id=p_tenant_id;
  return jsonb_build_object('tenant_id',p_tenant_id,'status',v_status,'percentage',v_percentage,'required_total',v_required_total,'required_complete',v_required_done,'optional_complete',v_optional_done);
end;
$function$;

revoke all on function public.platform_server_refresh_customer_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_refresh_customer_onboarding(uuid) to service_role;

create or replace function public.platform_server_trial_scorecard(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ai_in_plan boolean := false;
  v_owner_active boolean := false;
  v_player_loaded boolean := false;
  v_player_portal boolean := false;
  v_tell_djm_used boolean := false;
  v_market_workflow boolean := false;
  v_team_collaboration boolean := false;
  v_brand_ready boolean := false;
  v_custom_domain boolean := false;
  v_stage text;
  v_status text;
  v_trial_success boolean;
  v_value jsonb;
begin
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;
  perform public.platform_server_refresh_customer_onboarding(p_tenant_id);
  select l.stage into v_stage from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id;
  select exists (select 1 from platform.tenant_plan_assignments pa join platform.plan_features pf on pf.plan_key=pa.plan_key where pa.tenant_id=p_tenant_id and pa.status='active' and pf.feature_key='ai_assistant' and pf.enabled) into v_ai_in_plan;
  select exists (select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin')) into v_owner_active;
  select exists (select 1 from public.players p where p.tenant_id=p_tenant_id) into v_player_loaded;
  select exists (select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role='player') into v_player_portal;
  select exists (select 1 from platform.ai_usage_events a where a.tenant_id=p_tenant_id and a.feature_key='ai_assistant' and a.status in ('success','succeeded')) into v_tell_djm_used;
  select exists (select 1 from public.player_opportunities o where o.tenant_id=p_tenant_id) or exists (select 1 from djm_os.club_needs n where n.tenant_id=p_tenant_id) into v_market_workflow;
  select (select count(*) from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role <> 'player') >= 2 into v_team_collaboration;
  select exists (select 1 from platform.tenant_branding b where b.tenant_id=p_tenant_id and nullif(trim(b.display_name),'') is not null and nullif(trim(b.portal_name),'') is not null) into v_brand_ready;
  select exists (select 1 from platform.tenant_domains d where d.tenant_id=p_tenant_id and d.domain_type='custom' and d.status in ('verified','active')) into v_custom_domain;
  v_trial_success := v_owner_active and v_player_loaded and v_player_portal and v_market_workflow and (not v_ai_in_plan or v_tell_djm_used);
  v_status := case when v_trial_success then 'full_value_seen' when v_owner_active and v_player_loaded and (v_market_workflow or (v_ai_in_plan and v_tell_djm_used)) then 'value_seen' when v_owner_active and v_player_loaded then 'activated' else 'not_activated' end;
  v_value := public.platform_server_value_proof(p_tenant_id,30);
  return jsonb_build_object('tenant_id',p_tenant_id,'customer_stage',v_stage,'status',v_status,'trial_success',v_trial_success,'core_milestones',jsonb_build_object('brand_ready',v_brand_ready,'owner_active',v_owner_active,'player_data_loaded',v_player_loaded,'player_portal_live',v_player_portal,'tell_djm_used',case when v_ai_in_plan then v_tell_djm_used else null end,'market_workflow_used',v_market_workflow),'expansion_signals',jsonb_build_object('team_collaboration',v_team_collaboration,'custom_domain_live',v_custom_domain),'success_definition',jsonb_build_object('owner_active',true,'player_data_loaded',true,'player_portal_live',true,'market_workflow_used',true,'tell_djm_required',v_ai_in_plan),'value_proof_30d',v_value);
end;
$function$;

revoke all on function public.platform_server_trial_scorecard(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_trial_scorecard(uuid) to service_role;;
