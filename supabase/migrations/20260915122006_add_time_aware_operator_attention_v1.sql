create or replace function public.platform_server_customer_attention(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_stage text;
  v_trial_ends_at timestamptz;
  v_trial_hours integer;
  v_owner_count integer:=0;
  v_invite_sent_at timestamptz;
  v_invite_opened_at timestamptz;
  v_invite_expires_at timestamptz;
  v_orchestration jsonb;
  v_intervention jsonb;
  v_tracking jsonb;
  v_intervention_key text;
  v_responsible_party text;
  v_follow_up_at timestamptz;
  v_last_contact_at timestamptz;
  v_contact_count integer:=0;
  v_last_evidence_at timestamptz;
  v_age_hours integer;
  v_now timestamptz:=pg_catalog.now();
begin
  select
    coalesce(l.stage,case when coalesce((t.metadata->>'internal_tenant')::boolean,false) then 'internal' else 'onboarding' end),
    l.trial_ends_at,
    coalesce((select count(*)::int from platform.tenant_memberships m where m.tenant_id=t.id and m.status='active' and m.role='owner'),0)
  into v_stage,v_trial_ends_at,v_owner_count
  from platform.tenants t
  left join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  where t.id=p_tenant_id;

  if not found then return null; end if;

  if v_trial_ends_at is not null then
    v_trial_hours:=ceil(extract(epoch from (v_trial_ends_at-v_now))/3600.0)::int;
  end if;

  select i.first_sent_at,i.first_opened_at,i.expires_at
  into v_invite_sent_at,v_invite_opened_at,v_invite_expires_at
  from platform.tenant_owner_invites i
  where i.tenant_id=p_tenant_id
    and i.status='pending'
    and i.expires_at>v_now
  order by i.created_at desc
  limit 1;

  v_orchestration:=public.platform_server_customer_intervention_orchestration(p_tenant_id);
  v_intervention:=v_orchestration->'intervention';
  v_tracking:=v_orchestration->'tracking';
  v_intervention_key:=coalesce(v_intervention->>'key','monitor_customer');
  v_responsible_party:=coalesce(v_intervention->>'responsible_party','redream');
  v_contact_count:=coalesce((v_tracking->>'contact_count')::int,0);
  v_follow_up_at:=nullif(v_tracking->>'follow_up_at','')::timestamptz;
  v_last_contact_at:=nullif(v_tracking->>'last_contact_at','')::timestamptz;

  select max(nullif(m->>'completed_at','')::timestamptz)
  into v_last_evidence_at
  from jsonb_array_elements(coalesce(public.platform_server_customer_activation(p_tenant_id)->'milestones','[]'::jsonb)) m
  where coalesce((m->>'complete')::boolean,false);

  if v_last_evidence_at is null then
    select coalesce(l.created_at,t.created_at)
    into v_last_evidence_at
    from platform.tenants t
    left join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
    where t.id=p_tenant_id;
  end if;

  if v_last_evidence_at is not null then
    v_age_hours:=floor(extract(epoch from (v_now-v_last_evidence_at))/3600.0)::int;
  end if;

  if v_stage in ('internal','churned','paused') then
    return jsonb_build_object(
      'requires_action',false,'state','none','sort_rank',999,'source','none',
      'label','No customer action due','why_now','No external customer intervention is due.',
      'responsible_party','redream','due_at',null,'waiting_until',null
    );
  end if;

  if v_follow_up_at is not null and v_follow_up_at<=v_now then
    return jsonb_build_object(
      'requires_action',true,'state','overdue','sort_rank',5,'source','follow_up',
      'label','Follow-up overdue','why_now','A recorded customer follow-up is due or overdue.',
      'responsible_party','redream','due_at',v_follow_up_at,'waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_intervention_key='resolve_customer_issue' then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',7,'source','incident',
      'label','Resolve customer issue','why_now','A major or critical customer incident is unresolved.',
      'responsible_party','redream','due_at',v_now,'waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_stage='trial' and v_trial_hours is not null and v_trial_hours<0 then
    return jsonb_build_object(
      'requires_action',true,'state','overdue','sort_rank',8,'source','trial',
      'label','Trial decision overdue','why_now','The customer trial has expired without a recorded continuation decision.',
      'responsible_party','redream','due_at',v_trial_ends_at,'waiting_until',null,
      'trial_hours_left',v_trial_hours,'intervention_key',v_intervention_key
    );
  end if;

  if v_stage='trial' and v_trial_hours is not null and v_trial_hours<=24 then
    return jsonb_build_object(
      'requires_action',true,'state','today','sort_rank',10,'source','trial',
      'label','Trial decision due','why_now','The trial ends within 24 hours.',
      'responsible_party','redream','due_at',v_trial_ends_at,'waiting_until',null,
      'trial_hours_left',v_trial_hours,'intervention_key',v_intervention_key
    );
  end if;

  if v_owner_count=0 and v_invite_expires_at is not null and v_invite_sent_at is null then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',12,'source','owner_invite',
      'label','Send owner invitation','why_now','A secure owner invitation exists but has not been recorded as sent.',
      'responsible_party','redream','due_at',v_now,'waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_owner_count=0 and v_invite_opened_at is not null and v_invite_opened_at<=v_now-interval '12 hours' then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',14,'source','owner_invite',
      'label','Owner activation stalled','why_now','The owner opened the secure invitation more than 12 hours ago but has not activated access.',
      'responsible_party','redream','due_at',v_invite_opened_at+interval '12 hours','waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_owner_count=0 and v_invite_sent_at is not null and v_invite_opened_at is null and v_invite_sent_at<=v_now-interval '48 hours' then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',16,'source','owner_invite',
      'label','Owner invitation unopened','why_now','The owner invitation has been waiting unopened for more than 48 hours.',
      'responsible_party','redream','due_at',v_invite_sent_at+interval '48 hours','waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_follow_up_at is not null and v_follow_up_at>v_now then
    return jsonb_build_object(
      'requires_action',false,
      'state',case when v_follow_up_at<=v_now+interval '24 hours' then 'scheduled_today' else 'scheduled' end,
      'sort_rank',80,'source','follow_up',
      'label','Follow-up scheduled','why_now','A deliberate follow-up is already scheduled, so no earlier operator action is due.',
      'responsible_party','redream','due_at',v_follow_up_at,'waiting_until',v_follow_up_at,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_stage='trial' and v_trial_hours is not null and v_trial_hours<=72 then
    return jsonb_build_object(
      'requires_action',true,'state','soon','sort_rank',20,'source','trial',
      'label','Trial conversion window','why_now','The trial ends within three days and needs a deliberate conversion or extension plan.',
      'responsible_party','redream','due_at',v_trial_ends_at,'waiting_until',null,
      'trial_hours_left',v_trial_hours,'intervention_key',v_intervention_key
    );
  end if;

  if not coalesce((v_orchestration->>'available')::boolean,false) then
    return jsonb_build_object(
      'requires_action',false,'state','none','sort_rank',999,'source','none',
      'label','No intervention due','why_now','No evidence-derived customer intervention is currently due.',
      'responsible_party','redream','due_at',null,'waiting_until',null
    );
  end if;

  if v_responsible_party='redream' then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',30,'source','intervention',
      'label',coalesce(v_intervention->>'label','ReDream action'),
      'why_now',coalesce(v_intervention->>'why','A ReDream-owned customer intervention is ready to act on.'),
      'responsible_party','redream','due_at',v_now,'waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_responsible_party='agency_owner' and v_contact_count=0 then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',35,'source','customer_contact',
      'label','Contact agency owner','why_now','The next evidence-derived step belongs to the agency, but no outreach has been recorded for this intervention.',
      'responsible_party','redream','due_at',v_now,'waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_responsible_party='agency_owner' and v_last_contact_at is not null and v_last_contact_at<=v_now-interval '48 hours' then
    return jsonb_build_object(
      'requires_action',true,'state','now','sort_rank',40,'source','customer_contact',
      'label','Agency follow-up due','why_now','The agency owns the next step and more than 48 hours have passed since the last recorded contact without a scheduled follow-up.',
      'responsible_party','redream','due_at',v_last_contact_at+interval '48 hours','waiting_until',null,
      'intervention_key',v_intervention_key
    );
  end if;

  if v_stage in ('demo','onboarding','trial') and v_age_hours is not null and v_age_hours>=72 then
    return jsonb_build_object(
      'requires_action',true,'state','stalled','sort_rank',45,'source','activation_stall',
      'label','Activation stalled','why_now','No new activation milestone has been observed for at least 72 hours.',
      'responsible_party','redream','due_at',v_last_evidence_at+interval '72 hours','waiting_until',null,
      'age_hours',v_age_hours,'intervention_key',v_intervention_key
    );
  end if;

  return jsonb_build_object(
    'requires_action',false,'state','waiting','sort_rank',90,'source','customer_wait',
    'label','Waiting on agency','why_now','The agency owns the next step and recent outreach is already recorded.',
    'responsible_party','agency_owner','due_at',null,
    'waiting_until',case when v_last_contact_at is null then null else v_last_contact_at+interval '48 hours' end,
    'intervention_key',v_intervention_key
  );
end;
$function$;

create or replace function public.platform_server_operator_portfolio()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with customers as (
  select t.id,
    public.platform_server_customer_health(t.id)
      || jsonb_build_object(
        'activation_journey',public.platform_server_customer_activation(t.id),
        'go_live_readiness',public.platform_server_customer_go_live_readiness(t.id),
        'operator_intervention',public.platform_server_customer_intervention(t.id),
        'attention',public.platform_server_customer_attention(t.id)
      ) health
  from platform.tenants t
), rows as (
  select id,health,
    health->>'stage' stage,
    health->>'health_band' health_band,
    coalesce((health->'operator_intervention'->>'priority')::int,999) intervention_priority,
    coalesce((health->'attention'->>'sort_rank')::int,999) attention_rank,
    coalesce((health->'attention'->>'requires_action')::boolean,false) requires_action,
    health->'attention'->>'state' attention_state,
    health->'attention'->>'source' attention_source,
    health->'attention'->>'responsible_party' attention_responsible_party,
    nullif(health->'attention'->>'due_at','')::timestamptz attention_due_at,
    coalesce((health->'commercial'->>'contracted_monthly_cents')::bigint,0) contracted_monthly_cents,
    coalesce((health->'commercial'->>'ai_cost_micros_30d')::bigint,0) ai_cost_micros_30d,
    coalesce(jsonb_array_length(health->'expansion_signals'),0) expansion_count,
    (health->>'trial_days_left')::int trial_days_left,
    coalesce((health->'go_live_readiness'->>'ready')::boolean,false) launch_ready,
    coalesce((health->'go_live_readiness'->>'readiness_pct')::int,0) launch_readiness_pct
  from customers
)
select jsonb_build_object(
  'summary',jsonb_build_object(
    'total_tenants',count(*),
    'external_customers',count(*) filter(where stage<>'internal'),
    'active_trials',count(*) filter(where stage='trial' and (trial_days_left is null or trial_days_left>=0)),
    'trials_expiring_7d',count(*) filter(where stage='trial' and trial_days_left between 0 and 7),
    'onboarding_customers',count(*) filter(where stage='onboarding'),
    'live_customers',count(*) filter(where stage='live'),
    'at_risk_customers',count(*) filter(where health_band in ('risk','critical') and stage<>'internal'),
    'expansion_candidates',count(*) filter(where expansion_count>0 and stage<>'internal'),
    'contracted_mrr_cents',coalesce(sum(contracted_monthly_cents) filter(where stage in ('trial','onboarding','live','at_risk')),0),
    'ai_cost_micros_30d',coalesce(sum(ai_cost_micros_30d),0),
    'customers_needing_action',count(*) filter(where requires_action and stage<>'internal'),
    'due_now',count(*) filter(where requires_action and stage<>'internal'),
    'followups_due',count(*) filter(where requires_action and attention_source='follow_up' and stage<>'internal'),
    'trials_urgent',count(*) filter(where requires_action and attention_source='trial' and stage<>'internal'),
    'stalled_activation',count(*) filter(where requires_action and attention_source='activation_stall' and stage<>'internal'),
    'waiting_on_agency',count(*) filter(where not requires_action and attention_state in ('waiting','scheduled','scheduled_today') and stage<>'internal'),
    'redream_actions',count(*) filter(where requires_action and stage<>'internal' and attention_responsible_party='redream'),
    'customer_actions',count(*) filter(where not requires_action and stage<>'internal' and attention_responsible_party='agency_owner'),
    'launch_ready',count(*) filter(where stage<>'internal' and launch_ready),
    'launch_blocked',count(*) filter(where stage<>'internal' and not launch_ready),
    'launch_readiness_avg',coalesce(round(avg(launch_readiness_pct) filter(where stage<>'internal')),0),
    'first_value_ready',count(*) filter(where stage<>'internal' and coalesce((health->'activation_journey'->>'first_value_ready')::boolean,false)),
    'activation_score_avg',coalesce(round(avg((health->'activation_journey'->>'score')::numeric) filter(where stage<>'internal')),0)
  ),
  'agenda',coalesce((
    select jsonb_agg(x.health order by x.attention_rank,x.attention_due_at nulls last,(x.health->>'display_name'))
    from (
      select * from rows
      where stage<>'internal' and requires_action
      order by attention_rank,attention_due_at nulls last,(health->>'display_name')
      limit 10
    ) x
  ),'[]'::jsonb),
  'customers',coalesce(jsonb_agg(
    health order by
      case stage when 'trial' then 1 when 'onboarding' then 2 when 'demo' then 3 when 'at_risk' then 4 when 'live' then 5 when 'internal' then 6 else 7 end,
      attention_rank,
      (health->>'display_name')
  ),'[]'::jsonb)
) from rows;
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

revoke all on function public.platform_server_customer_attention(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_portfolio() from public,anon,authenticated;
revoke all on function public.platform_server_operator_customer_detail(uuid) from public,anon,authenticated;

grant execute on function public.platform_server_customer_attention(uuid) to service_role;
grant execute on function public.platform_server_operator_portfolio() to service_role;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
