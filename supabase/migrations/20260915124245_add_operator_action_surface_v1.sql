create or replace function public.platform_server_customer_action_surface(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_attention jsonb;
  v_orchestration jsonb;
  v_playbook jsonb;
  v_quick_action text;
  v_attention_source text;
  v_attention_action jsonb;
  v_evidence_action jsonb;
  v_readiness jsonb;
  v_activation jsonb;
  v_stage text;
  v_contract_cents integer;
  v_contracted_at timestamptz;
  v_plan_status text;
  v_billing_mode text;
  v_serious_incidents integer:=0;
  v_go_live_allowed boolean:=false;
  v_go_live_blocker text;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then return null; end if;

  v_attention:=public.platform_server_customer_attention(p_tenant_id);
  v_orchestration:=public.platform_server_customer_intervention_orchestration(p_tenant_id);
  v_playbook:=coalesce(v_orchestration->'playbook','{}'::jsonb);
  v_quick_action:=coalesce(v_playbook->>'quick_action','review');
  v_attention_source:=coalesce(v_attention->>'source','none');
  v_readiness:=public.platform_server_customer_go_live_readiness(p_tenant_id);
  v_activation:=public.platform_server_customer_activation(p_tenant_id);

  select
    coalesce(l.stage,'onboarding'),
    l.contracted_monthly_cents,
    l.contracted_at,
    pa.status,
    pa.billing_mode
  into v_stage,v_contract_cents,v_contracted_at,v_plan_status,v_billing_mode
  from platform.tenants t
  left join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  left join lateral (
    select a.status,a.billing_mode
    from platform.tenant_plan_assignments a
    where a.tenant_id=t.id and a.status in ('trialing','active')
    order by a.effective_from desc
    limit 1
  ) pa on true
  where t.id=p_tenant_id;

  select count(*)::int into v_serious_incidents
  from platform.operational_incidents i
  where i.tenant_id=p_tenant_id
    and i.status<>'resolved'
    and i.severity in ('major','critical');

  v_go_live_allowed:=
    coalesce((v_readiness->>'ready')::boolean,false)
    and coalesce((v_activation->>'first_value_ready')::boolean,false)
    and coalesce(v_contract_cents,0)>0
    and v_contracted_at is not null
    and v_plan_status='active'
    and coalesce(v_billing_mode,'')<>'internal'
    and v_serious_incidents=0
    and v_stage in ('demo','trial','onboarding','at_risk');

  v_go_live_blocker:=case
    when v_stage='live' then 'already_live'
    when v_stage in ('internal','paused','churned') then 'stage_not_eligible'
    when not coalesce((v_readiness->>'ready')::boolean,false) then 'launch_readiness_incomplete'
    when not coalesce((v_activation->>'first_value_ready')::boolean,false) then 'first_value_not_reached'
    when coalesce(v_contract_cents,0)<=0 or v_contracted_at is null then 'commercial_contract_required'
    when coalesce(v_plan_status,'')<>'active' then 'active_plan_required'
    when coalesce(v_billing_mode,'')='internal' then 'external_billing_required'
    when v_serious_incidents>0 then 'serious_incident_unresolved'
    else null
  end;

  v_attention_action:=case
    when not coalesce((v_attention->>'requires_action')::boolean,false) then null
    when v_attention_source in ('follow_up','customer_contact') then jsonb_build_object(
      'key','open_outreach','label','Open outreach','mode','focus','target','intervention-control'
    )
    when v_attention_source='owner_invite' then jsonb_build_object(
      'key','open_owner_access','label','Open owner access','mode','focus','target','activation-control'
    )
    when v_attention_source='trial' then jsonb_build_object(
      'key','open_commercial_review','label','Review trial decision','mode','focus','target','commercial-control'
    )
    when v_attention_source='incident' then jsonb_build_object(
      'key','open_incident_playbook','label','Open incident playbook','mode','focus','target','intervention-control'
    )
    when v_attention_source='activation_stall' then jsonb_build_object(
      'key','open_activation','label','Open activation path','mode','focus','target','activation-control'
    )
    else jsonb_build_object(
      'key','open_intervention','label','Open intervention','mode','focus','target','intervention-control'
    )
  end;

  v_evidence_action:=case v_quick_action
    when 'owner_invite' then jsonb_build_object(
      'key','owner_invite','label','Open owner access','mode','focus','target','activation-control','can_execute',false
    )
    when 'privacy' then jsonb_build_object(
      'key','privacy','label','Configure privacy','mode','focus','target','privacy-control','can_execute',false
    )
    when 'domain' then jsonb_build_object(
      'key','domain','label','Review workspace address','mode','focus','target','domain-control','can_execute',false
    )
    when 'assisted_import' then jsonb_build_object(
      'key','assisted_import','label','Prepare first player','mode','focus','target','activation-control','can_execute',false
    )
    when 'trial_conversion' then jsonb_build_object(
      'key','trial_conversion','label','Review conversion','mode','focus','target','commercial-control','can_execute',false
    )
    when 'move_to_live' then jsonb_build_object(
      'key','go_live_customer','label',case when v_go_live_allowed then 'Move agency live' else 'Review go-live blockers' end,
      'mode',case when v_go_live_allowed then 'execute' else 'focus' end,
      'target',case when v_go_live_allowed then null when v_go_live_blocker='commercial_contract_required' then 'commercial-control' else 'go-live-control' end,
      'action',case when v_go_live_allowed then 'go_live_customer' else null end,
      'can_execute',v_go_live_allowed,
      'requires_confirmation',v_go_live_allowed,
      'blocked_reason',v_go_live_blocker
    )
    when 'expansion_review' then jsonb_build_object(
      'key','expansion_review','label','Review commercial expansion','mode','focus','target','commercial-control','can_execute',false
    )
    when 'incident' then jsonb_build_object(
      'key','incident','label','Open incident playbook','mode','focus','target','intervention-control','can_execute',false
    )
    when 'team' then jsonb_build_object(
      'key','team','label','Open activation path','mode','focus','target','activation-control','can_execute',false
    )
    else jsonb_build_object(
      'key',v_quick_action,'label','Open intervention','mode','focus','target','intervention-control','can_execute',false
    )
  end;

  return jsonb_build_object(
    'attention',v_attention,
    'attention_action',v_attention_action,
    'evidence_action',v_evidence_action,
    'go_live_guard',jsonb_build_object(
      'allowed',v_go_live_allowed,
      'blocked_reason',v_go_live_blocker,
      'stage',v_stage,
      'launch_ready',coalesce((v_readiness->>'ready')::boolean,false),
      'first_value_ready',coalesce((v_activation->>'first_value_ready')::boolean,false),
      'contracted_monthly_cents',v_contract_cents,
      'contracted_at',v_contracted_at,
      'plan_status',v_plan_status,
      'billing_mode',v_billing_mode,
      'serious_incidents',v_serious_incidents
    ),
    'truth_contract',jsonb_build_object(
      'actions','Focus actions navigate to the control that can change evidence. They do not mark the blocker complete.',
      'go_live','Moving live is allowed only after launch readiness, first working value, commercial contract, active external plan and incident checks all pass.'
    )
  );
end;
$function$;

create or replace function public.platform_server_operator_go_live_customer(
  p_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_surface jsonb;
  v_before jsonb;
  v_after jsonb;
  v_stage text;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  select l.stage into v_stage
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id
  for update;

  if v_stage='live' then
    return jsonb_build_object(
      'completed',true,
      'idempotent',true,
      'customer',public.platform_server_operator_customer_detail(p_tenant_id)
    );
  end if;

  v_surface:=public.platform_server_customer_action_surface(p_tenant_id);

  if not coalesce((v_surface->'go_live_guard'->>'allowed')::boolean,false) then
    raise exception 'go_live_blocked:%',coalesce(v_surface->'go_live_guard'->>'blocked_reason','unknown');
  end if;

  select jsonb_build_object(
    'stage',l.stage,
    'onboarding_status',l.onboarding_status,
    'go_live_at',l.go_live_at,
    'contracted_at',l.contracted_at,
    'contracted_monthly_cents',l.contracted_monthly_cents
  ) into v_before
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id;

  update platform.tenant_customer_lifecycle
  set
    stage='live',
    onboarding_status='complete',
    go_live_at=coalesce(go_live_at,pg_catalog.now()),
    updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id;

  update platform.tenants
  set status='active',updated_at=pg_catalog.now()
  where id=p_tenant_id;

  select jsonb_build_object(
    'stage',l.stage,
    'onboarding_status',l.onboarding_status,
    'go_live_at',l.go_live_at,
    'contracted_at',l.contracted_at,
    'contracted_monthly_cents',l.contracted_monthly_cents
  ) into v_after
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.customer.go_live',
    'tenant',p_tenant_id::text,v_before,v_after,
    jsonb_build_object('source','platform_ops','guard',v_surface->'go_live_guard')
  );

  return jsonb_build_object(
    'completed',true,
    'idempotent',false,
    'customer',public.platform_server_operator_customer_detail(p_tenant_id)
  );
end;
$function$;

create or replace function public.platform_server_operator_customer_detail(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when exists(select 1 from platform.tenants t0 where t0.id=p_tenant_id) then
    pg_catalog.jsonb_build_object(
      'tenant',(select to_jsonb(x) from (select t.id,t.slug,t.tenant_type,t.status,t.legal_name,t.metadata,t.created_at,t.updated_at from platform.tenants t where t.id=p_tenant_id) x),
      'branding',(select to_jsonb(x) from (select b.* from platform.tenant_branding b where b.tenant_id=p_tenant_id) x),
      'lifecycle',(select to_jsonb(x) from (select l.* from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id) x),
      'plan',(select to_jsonb(x) from (select a.plan_key,a.status,a.billing_mode,a.effective_from,a.effective_until,a.configuration from platform.tenant_plan_assignments a where a.tenant_id=p_tenant_id and a.status in ('trialing','active') order by a.effective_from desc limit 1) x),
      'activation_journey',public.platform_server_customer_activation(p_tenant_id),
      'go_live_readiness',public.platform_server_customer_go_live_readiness(p_tenant_id),
      'operator_intervention',public.platform_server_customer_intervention(p_tenant_id),
      'intervention_orchestration',public.platform_server_customer_intervention_orchestration(p_tenant_id),
      'attention',public.platform_server_customer_attention(p_tenant_id),
      'action_surface',public.platform_server_customer_action_surface(p_tenant_id),
      'privacy_readiness',public.platform_server_tenant_privacy_readiness(p_tenant_id),
      'domains',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.created_at) from (select d.id,d.hostname,d.domain_type,d.status,d.is_primary,d.verified_at,d.created_at from platform.tenant_domains d where d.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'owner_invites',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select i.id,i.email,case when i.status='pending' and i.expires_at<=pg_catalog.now() then 'expired' else i.status end status,i.expires_at,i.first_sent_at,i.last_sent_at,i.send_count,i.first_opened_at,i.last_opened_at,i.open_count,i.accepted_by,i.accepted_at,i.revoked_at,i.created_by,i.created_at from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id order by i.created_at desc limit 20) x),'[]'::jsonb),
      'onboarding_tasks',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.sort_order) from (select o.task_key,o.category,o.title,o.description,o.status,o.required,o.sort_order,o.blocked_reason,o.completed_at from platform.tenant_onboarding_tasks o where o.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'memberships',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.joined_at) from (select m.user_id,m.role,m.status,m.is_primary,m.joined_at from platform.tenant_memberships m where m.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'feature_overrides',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.feature_key) from (select e.feature_key,e.enabled,e.source,e.configuration,e.valid_from,e.valid_until,e.updated_at from platform.tenant_entitlements e where e.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'audit',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select a.id,a.actor_user_id,a.actor_kind,a.action,a.entity_type,a.entity_id,a.after_state,a.metadata,a.occurred_at from platform.audit_events a where a.tenant_id=p_tenant_id order by a.occurred_at desc limit 50) x),'[]'::jsonb)
    )
  else null end;
$function$;

revoke all on function public.platform_server_customer_action_surface(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_go_live_customer(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_customer_detail(uuid) from public,anon,authenticated;

grant execute on function public.platform_server_customer_action_surface(uuid) to service_role;
grant execute on function public.platform_server_operator_go_live_customer(uuid,uuid) to service_role;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
