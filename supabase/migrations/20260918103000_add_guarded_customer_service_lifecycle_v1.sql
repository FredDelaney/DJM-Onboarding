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
      'billing_account',(select to_jsonb(x) from (
        select ba.status,ba.billing_email,ba.invoice_currency,ba.tax_country,
          ba.external_customer_reference,ba.payment_provider,ba.updated_at
        from platform.billing_accounts ba
        where ba.tenant_id=p_tenant_id
      ) x),
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

create or replace function public.platform_server_operator_set_customer_service_state(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_state text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current_stage text;
  v_target_state text:=lower(trim(coalesce(p_state,'')));
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  perform 1 from platform.tenants t where t.id=p_tenant_id for update;
  if not found then raise exception 'tenant_not_found'; end if;

  select l.stage into v_current_stage
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id
  for update;

  if v_current_stage is null then raise exception 'customer_lifecycle_not_found'; end if;
  if v_target_state not in ('live','at_risk','paused','churned') then
    raise exception 'invalid_customer_service_state';
  end if;

  if v_current_stage=v_target_state then
    return jsonb_build_object(
      'completed',true,
      'idempotent',true,
      'state',v_current_stage,
      'customer',public.platform_server_operator_customer_detail(p_tenant_id)
    );
  end if;

  if not (
    (v_current_stage='live' and v_target_state in ('at_risk','paused','churned'))
    or (v_current_stage='at_risk' and v_target_state in ('live','paused','churned'))
    or (v_current_stage='paused' and v_target_state in ('live','churned'))
  ) then
    raise exception 'customer_service_state_transition_not_allowed';
  end if;

  if v_target_state in ('paused','churned') and v_reason is null then
    raise exception 'customer_service_state_reason_required';
  end if;

  select jsonb_build_object(
    'stage',l.stage,
    'tenant_status',t.status,
    'billing_status',ba.status,
    'plan_key',pa.plan_key,
    'plan_status',pa.status,
    'churned_at',l.churned_at,
    'cancellation_reason',l.cancellation_reason
  ) into v_before
  from platform.tenants t
  join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  left join platform.billing_accounts ba on ba.tenant_id=t.id
  left join lateral (
    select a.plan_key,a.status
    from platform.tenant_plan_assignments a
    where a.tenant_id=t.id and a.status in ('trialing','active')
    order by a.effective_from desc
    limit 1
  ) pa on true
  where t.id=p_tenant_id;

  if v_target_state='at_risk' then
    update platform.tenant_customer_lifecycle
    set stage='at_risk',
        metadata=jsonb_set(
          metadata,
          '{service_state}',
          jsonb_build_object(
            'state','at_risk',
            'reason',v_reason,
            'changed_at',now(),
            'changed_by',p_actor_user_id
          ),
          true
        ),
        updated_at=now()
    where tenant_id=p_tenant_id;

    update platform.tenants
    set status='active',updated_at=now()
    where id=p_tenant_id;

  elsif v_target_state='paused' then
    update platform.tenant_customer_lifecycle
    set stage='paused',
        metadata=jsonb_set(
          metadata,
          '{service_state}',
          jsonb_build_object(
            'state','paused',
            'reason',v_reason,
            'changed_at',now(),
            'changed_by',p_actor_user_id
          ),
          true
        ),
        updated_at=now()
    where tenant_id=p_tenant_id;

    update platform.tenants
    set status='suspended',updated_at=now()
    where id=p_tenant_id;

    update platform.billing_accounts
    set status='on_hold',updated_at=now()
    where tenant_id=p_tenant_id and status='active';

  elsif v_target_state='live' then
    update platform.tenant_customer_lifecycle
    set stage='live',
        churned_at=null,
        metadata=jsonb_set(
          metadata,
          '{service_state}',
          jsonb_build_object(
            'state','live',
            'reason',v_reason,
            'changed_at',now(),
            'changed_by',p_actor_user_id
          ),
          true
        ),
        updated_at=now()
    where tenant_id=p_tenant_id;

    update platform.tenants
    set status='active',updated_at=now()
    where id=p_tenant_id;

    update platform.billing_accounts
    set status='active',updated_at=now()
    where tenant_id=p_tenant_id and status='on_hold';

  elsif v_target_state='churned' then
    update platform.tenant_customer_lifecycle
    set stage='churned',
        churned_at=coalesce(churned_at,now()),
        cancellation_reason=v_reason,
        metadata=jsonb_set(
          metadata,
          '{service_state}',
          jsonb_build_object(
            'state','churned',
            'reason',v_reason,
            'changed_at',now(),
            'changed_by',p_actor_user_id
          ),
          true
        ),
        updated_at=now()
    where tenant_id=p_tenant_id;

    update platform.tenants
    set status='closed',updated_at=now()
    where id=p_tenant_id;

    update platform.billing_accounts
    set status='cancelled',updated_at=now()
    where tenant_id=p_tenant_id and status<>'internal';

    update platform.tenant_plan_assignments
    set status='ended',
        effective_until=coalesce(effective_until,now()),
        updated_at=now()
    where tenant_id=p_tenant_id and status in ('trialing','active');
  end if;

  select jsonb_build_object(
    'stage',l.stage,
    'tenant_status',t.status,
    'billing_status',ba.status,
    'plan_key',pa.plan_key,
    'plan_status',pa.status,
    'churned_at',l.churned_at,
    'cancellation_reason',l.cancellation_reason
  ) into v_after
  from platform.tenants t
  join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  left join platform.billing_accounts ba on ba.tenant_id=t.id
  left join lateral (
    select a.plan_key,a.status
    from platform.tenant_plan_assignments a
    where a.tenant_id=t.id
    order by a.effective_from desc
    limit 1
  ) pa on true
  where t.id=p_tenant_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.customer.service_state_changed',
    'tenant',p_tenant_id::text,v_before,v_after,
    jsonb_build_object('source','platform_ops','reason',v_reason)
  );

  return jsonb_build_object(
    'completed',true,
    'idempotent',false,
    'state',v_target_state,
    'customer',public.platform_server_operator_customer_detail(p_tenant_id)
  );
end;
$function$;

revoke all on function public.platform_server_operator_set_customer_service_state(uuid,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.platform_server_operator_set_customer_service_state(uuid,uuid,text,text)
to service_role;
