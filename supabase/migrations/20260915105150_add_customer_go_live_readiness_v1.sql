create or replace function public.platform_server_customer_go_live_readiness(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with base as (
  select
    t.id,
    coalesce(l.stage, case when coalesce((t.metadata->>'internal_tenant')::boolean,false) then 'internal' else 'onboarding' end) stage,
    coalesce((t.metadata->>'internal_tenant')::boolean,false) is_internal,
    (select count(*)::int from platform.tenant_memberships m where m.tenant_id=t.id and m.status='active' and m.role='owner') owner_count,
    (select count(*)::int from platform.tenant_owner_invites i where i.tenant_id=t.id and i.status='pending' and i.expires_at>pg_catalog.now()) pending_owner_invites,
    (select max(i.first_sent_at) from platform.tenant_owner_invites i where i.tenant_id=t.id and i.status='pending' and i.expires_at>pg_catalog.now()) owner_invite_sent_at,
    (select max(i.first_opened_at) from platform.tenant_owner_invites i where i.tenant_id=t.id and i.status='pending' and i.expires_at>pg_catalog.now()) owner_invite_opened_at,
    (select count(*)::int from public.players p where p.tenant_id=t.id) roster_player_count,
    b.display_name,
    b.portal_name,
    b.primary_color,
    b.accent_color,
    b.support_email,
    (select d.hostname from platform.tenant_domains d where d.tenant_id=t.id and d.is_primary and d.status in ('verified','active') order by d.verified_at desc nulls last,d.created_at desc limit 1) primary_hostname,
    public.platform_server_tenant_privacy_readiness(t.id) privacy_readiness,
    l.go_live_at
  from platform.tenants t
  left join platform.tenant_branding b on b.tenant_id=t.id
  left join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  where t.id=p_tenant_id
), gates as (
  select 10 priority,'owner_access'::text gate_key,'Owner access'::text label,true required,
    (b.owner_count>0) complete,
    case when b.owner_count>0 then 'none' when b.pending_owner_invites>0 then 'agency_owner' else 'redream' end responsible_party,
    case
      when b.owner_count>0 then 'Owner access is active.'
      when b.pending_owner_invites>0 and b.owner_invite_opened_at is not null then 'The owner opened the invitation but has not activated access.'
      when b.pending_owner_invites>0 and b.owner_invite_sent_at is not null then 'The owner invitation was sent but has not been accepted.'
      when b.pending_owner_invites>0 then 'A secure owner invitation exists but still needs to be shared.'
      else 'No active owner or pending owner invitation exists.'
    end reason,
    case
      when b.owner_count>0 then 'No action required.'
      when b.pending_owner_invites>0 and b.owner_invite_opened_at is not null then 'Follow up with the owner and remove any activation blocker.'
      when b.pending_owner_invites>0 then 'Send or resend the secure owner invitation.'
      else 'Generate a secure owner invitation.'
    end operator_action
  from base b
  union all
  select 20,'brand_identity','Customer-facing brand',true,
    (nullif(pg_catalog.btrim(b.display_name),'') is not null
      and nullif(pg_catalog.btrim(b.portal_name),'') is not null
      and b.primary_color ~* '^#[0-9a-f]{6}$'
      and b.accent_color ~* '^#[0-9a-f]{6}$'
      and nullif(pg_catalog.btrim(b.support_email),'') is not null),
    'redream',
    case when nullif(pg_catalog.btrim(b.display_name),'') is null or nullif(pg_catalog.btrim(b.portal_name),'') is null then 'The customer-facing workspace identity is incomplete.'
      when b.primary_color !~* '^#[0-9a-f]{6}$' or b.accent_color !~* '^#[0-9a-f]{6}$' then 'The workspace brand colours are invalid.'
      when nullif(pg_catalog.btrim(b.support_email),'') is null then 'A customer support email is missing.'
      else 'The customer-facing brand is configured.' end,
    'Complete the agency name, portal identity, colours and support contact.'
  from base b
  union all
  select 30,'privacy_profile','Privacy and controller identity',not b.is_internal,
    (b.is_internal or coalesce((b.privacy_readiness->>'ready_for_player_invites')::boolean,false)),
    case when b.is_internal then 'none' else 'agency_owner' end,
    case when b.is_internal then 'Internal tenant uses the existing internal privacy route.'
      when coalesce((b.privacy_readiness->>'ready_for_player_invites')::boolean,false) then 'The agency controller and current privacy notice are configured.'
      else 'The agency cannot activate external player accounts until its privacy profile is current.' end,
    case when b.is_internal then 'No action required.' else 'Ask the agency owner to confirm controller identity and the current player-facing privacy notice, or assist them in ReDream.' end
  from base b
  union all
  select 40,'workspace_route','Verified workspace address',true,
    (b.primary_hostname is not null),
    'redream',
    case when b.primary_hostname is not null then 'A verified primary workspace hostname is active.' else 'No verified primary workspace hostname is available.' end,
    case when b.primary_hostname is not null then 'No action required.' else 'Connect and verify the agency workspace hostname before launch.' end
  from base b
  union all
  select 50,'first_player','First player loaded',true,
    (b.roster_player_count>0),
    'agency_owner',
    case when b.roster_player_count>0 then 'The agency roster contains at least one player.' else 'The agency has no player record yet.' end,
    case when b.roster_player_count>0 then 'No action required.' else 'Help the agency load its first real player so the workspace has immediate working value.' end
  from base b
), stats as (
  select
    b.*,
    count(*) filter(where g.required)::int required_total,
    count(*) filter(where g.required and g.complete)::int required_complete,
    coalesce(jsonb_agg(jsonb_build_object(
      'key',g.gate_key,'label',g.label,'required',g.required,'complete',g.complete,
      'responsible_party',g.responsible_party,'reason',g.reason,
      'operator_action',g.operator_action,'priority',g.priority
    ) order by g.priority),'[]'::jsonb) gates,
    coalesce(jsonb_agg(jsonb_build_object(
      'key',g.gate_key,'label',g.label,'responsible_party',g.responsible_party,
      'reason',g.reason,'operator_action',g.operator_action,'priority',g.priority
    ) order by g.priority) filter(where g.required and not g.complete),'[]'::jsonb) blockers,
    (select jsonb_build_object(
      'key',g2.gate_key,'label',g2.label,'responsible_party',g2.responsible_party,
      'reason',g2.reason,'operator_action',g2.operator_action,'priority',g2.priority
    ) from gates g2 where g2.required and not g2.complete order by g2.priority limit 1) next_blocker
  from base b
  cross join gates g
  group by b.id,b.stage,b.is_internal,b.owner_count,b.pending_owner_invites,b.owner_invite_sent_at,b.owner_invite_opened_at,b.roster_player_count,b.display_name,b.portal_name,b.primary_color,b.accent_color,b.support_email,b.primary_hostname,b.privacy_readiness,b.go_live_at
)
select jsonb_build_object(
  'ready',(required_total=required_complete),
  'status',case when required_total=required_complete then 'ready' else 'blocked' end,
  'readiness_pct',case when required_total=0 then 100 else round((required_complete::numeric/required_total::numeric)*100)::int end,
  'required_total',required_total,
  'required_complete',required_complete,
  'blocker_count',jsonb_array_length(blockers),
  'next_blocker',next_blocker,
  'gates',gates,
  'blockers',blockers,
  'primary_hostname',primary_hostname,
  'go_live_at',go_live_at
) from stats;
$function$;

create or replace function public.platform_server_customer_intervention(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_launch jsonb;
  v_activation jsonb;
  v_stage text;
  v_trial_days integer;
  v_serious_incidents integer;
  v_blocker jsonb;
  v_step text;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then return null; end if;

  select coalesce(l.stage,case when coalesce((t.metadata->>'internal_tenant')::boolean,false) then 'internal' else 'onboarding' end),
         case when l.trial_ends_at is null then null else ceil(extract(epoch from (l.trial_ends_at-pg_catalog.now()))/86400.0)::int end
  into v_stage,v_trial_days
  from platform.tenants t
  left join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  where t.id=p_tenant_id;

  select count(*)::int into v_serious_incidents
  from platform.operational_incidents i
  where i.tenant_id=p_tenant_id and i.status<>'resolved' and i.severity in ('major','critical');

  v_launch:=public.platform_server_customer_go_live_readiness(p_tenant_id);
  v_activation:=public.platform_server_customer_activation(p_tenant_id);
  v_blocker:=v_launch->'next_blocker';
  v_step:=coalesce(v_activation->>'next_step','continue_activation');

  if v_stage='internal' then
    return jsonb_build_object('key','monitor_internal','label','Monitor internal tenant','why','Internal operating tenant.','responsible_party','redream','impact','operations','priority',100,'operator_action','No customer intervention required.');
  end if;

  if v_serious_incidents>0 then
    return jsonb_build_object('key','resolve_customer_issue','label','Resolve customer issue','why','A major or critical customer incident is unresolved.','responsible_party','redream','impact','retention','priority',5,'operator_action','Resolve the incident before asking the customer to continue onboarding.');
  end if;

  if v_stage='trial' and v_trial_days is not null and v_trial_days<=2 then
    return jsonb_build_object(
      'key','rescue_trial','label','Rescue the trial now',
      'why',case when v_trial_days<0 then 'The trial has expired.' else 'The trial ends within two days.' end,
      'responsible_party','redream','impact','revenue','priority',8,
      'operator_action',case when coalesce((v_launch->>'ready')::boolean,false) then 'Contact the owner, confirm value, and decide conversion or extension today.' else 'Contact the owner today and remove the highest launch blocker before deciding conversion or extension.' end,
      'context',jsonb_build_object('trial_days_left',v_trial_days,'launch_blocker',v_blocker)
    );
  end if;

  if not coalesce((v_launch->>'ready')::boolean,false) then
    return jsonb_build_object(
      'key',coalesce(v_blocker->>'key','finish_launch_readiness'),
      'label',coalesce(v_blocker->>'label','Finish launch readiness'),
      'why',coalesce(v_blocker->>'reason','A required launch gate is incomplete.'),
      'responsible_party',coalesce(v_blocker->>'responsible_party','redream'),
      'impact','launch',
      'priority',10+coalesce((v_blocker->>'priority')::int,50),
      'operator_action',coalesce(v_blocker->>'operator_action','Remove the next launch blocker.'),
      'context',jsonb_build_object('readiness_pct',v_launch->'readiness_pct','blocker_count',v_launch->'blocker_count')
    );
  end if;

  if not coalesce((v_activation->>'first_value_ready')::boolean,false) then
    return case v_step
      when 'owner_activation' then jsonb_build_object('key',v_step,'label','Activate the agency owner','why','No active owner is attached.','responsible_party','agency_owner','impact','activation','priority',60,'operator_action','Follow up the owner activation and remove any sign-in blocker.')
      when 'load_roster' then jsonb_build_object('key',v_step,'label','Load the first player','why','The workspace is live but still has no working roster.','responsible_party','agency_owner','impact','activation','priority',61,'operator_action','Offer a short assisted import and get one real player into the workspace.')
      when 'add_club_relationship' then jsonb_build_object('key',v_step,'label','Add the first club relationship','why','The agency has players but no working club relationship recorded.','responsible_party','agency_owner','impact','activation','priority',62,'operator_action','Use one real club contact to demonstrate the relationship workflow.')
      when 'create_live_opportunity' then jsonb_build_object('key',v_step,'label','Capture one live opportunity','why','The agency has data but no live football opportunity in the workflow.','responsible_party','agency_owner','impact','activation','priority',63,'operator_action','Capture one current club requirement or player opportunity with the owner.')
      else jsonb_build_object('key',v_step,'label','Reach first working value','why','The agency has not yet completed the minimum operating loop.','responsible_party','agency_owner','impact','activation','priority',64,'operator_action','Complete the next real agency action inside the workspace.')
    end;
  end if;

  if v_stage='trial' and v_trial_days is not null and v_trial_days<=5 then
    return jsonb_build_object('key','convert_trial','label','Convert the trial','why','First value is present and the trial ends within five days.','responsible_party','redream','impact','revenue','priority',70,'operator_action','Run the conversion conversation while the value is visible.','context',jsonb_build_object('trial_days_left',v_trial_days));
  end if;

  if v_stage in ('demo','onboarding') then
    return jsonb_build_object('key','move_to_live','label','Move the agency to live','why','Launch gates and first value are complete.','responsible_party','redream','impact','revenue','priority',75,'operator_action','Confirm commercial setup and move the agency into its live operating stage.');
  end if;

  if v_stage='live' then
    return jsonb_build_object('key','expansion_review','label','Review expansion','why','The agency is live and has reached first value.','responsible_party','redream','impact','expansion','priority',85,'operator_action','Review usage, capacity and higher-value workflows before the next customer conversation.');
  end if;

  return jsonb_build_object('key','monitor_customer','label','Monitor agency','why','No immediate intervention is required.','responsible_party','redream','impact','operations','priority',100,'operator_action','No immediate intervention required.');
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
        'operator_intervention',public.platform_server_customer_intervention(t.id)
      ) health
  from platform.tenants t
), rows as (
  select id,health,
    health->>'stage' stage,
    health->>'health_band' health_band,
    coalesce((health->'operator_intervention'->>'priority')::int,999) intervention_priority,
    coalesce((health->'commercial'->>'contracted_monthly_cents')::bigint,0) contracted_monthly_cents,
    coalesce((health->'commercial'->>'ai_cost_micros_30d')::bigint,0) ai_cost_micros_30d,
    coalesce(jsonb_array_length(health->'expansion_signals'),0) expansion_count,
    (health->>'trial_days_left')::int trial_days_left,
    coalesce((health->'go_live_readiness'->>'ready')::boolean,false) launch_ready,
    coalesce((health->'go_live_readiness'->>'readiness_pct')::int,0) launch_readiness_pct,
    health->'operator_intervention'->>'responsible_party' responsible_party
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
    'customers_needing_action',count(*) filter(where intervention_priority<90 and stage<>'internal'),
    'redream_actions',count(*) filter(where intervention_priority<90 and stage<>'internal' and responsible_party='redream'),
    'customer_actions',count(*) filter(where intervention_priority<90 and stage<>'internal' and responsible_party='agency_owner'),
    'launch_ready',count(*) filter(where stage<>'internal' and launch_ready),
    'launch_blocked',count(*) filter(where stage<>'internal' and not launch_ready),
    'launch_readiness_avg',coalesce(round(avg(launch_readiness_pct) filter(where stage<>'internal')),0),
    'first_value_ready',count(*) filter(where stage<>'internal' and coalesce((health->'activation_journey'->>'first_value_ready')::boolean,false)),
    'activation_score_avg',coalesce(round(avg((health->'activation_journey'->>'score')::numeric) filter(where stage<>'internal')),0)
  ),
  'agenda',coalesce((
    select jsonb_agg(x.health order by x.intervention_priority,(x.health->>'health_score')::int asc)
    from (
      select * from rows where stage<>'internal' and intervention_priority<90
      order by intervention_priority,(health->>'health_score')::int asc limit 10
    ) x
  ),'[]'::jsonb),
  'customers',coalesce(jsonb_agg(
    health order by
      case stage when 'trial' then 1 when 'onboarding' then 2 when 'demo' then 3 when 'at_risk' then 4 when 'live' then 5 when 'internal' then 6 else 7 end,
      intervention_priority,
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

create or replace function public.platform_server_operator_set_onboarding_task(
  p_tenant_id uuid,
  p_task_key text,
  p_status text,
  p_actor_user_id uuid,
  p_blocked_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row platform.tenant_onboarding_tasks%rowtype;
  v_required_total integer;
  v_required_done integer;
  v_lifecycle_status text;
  v_evidence_managed text[]:=array['agency_profile','branding','owner_access','privacy_profile','player_import','staff_invites','player_portal','first_tell_djm','first_opportunity','billing_ready','custom_domain'];
begin
  if p_status not in ('pending','in_progress','blocked','complete','waived') then raise exception 'invalid_task_status'; end if;
  if p_task_key=any(v_evidence_managed) and p_status in ('complete','waived') then
    raise exception 'task_completion_is_evidence_managed';
  end if;

  update platform.tenant_onboarding_tasks set
    status=p_status,
    blocked_reason=case when p_status='blocked' then nullif(trim(p_blocked_reason),'') else null end,
    completed_at=null,
    completed_by=null,
    updated_at=now()
  where tenant_id=p_tenant_id and task_key=p_task_key
  returning * into v_row;
  if not found then raise exception 'onboarding_task_not_found'; end if;

  select count(*) filter(where required),count(*) filter(where required and status in ('complete','waived'))
  into v_required_total,v_required_done
  from platform.tenant_onboarding_tasks where tenant_id=p_tenant_id;

  v_lifecycle_status:=case
    when v_required_total=v_required_done then 'complete'
    when exists(select 1 from platform.tenant_onboarding_tasks where tenant_id=p_tenant_id and required and status='blocked') then 'blocked'
    when exists(select 1 from platform.tenant_onboarding_tasks where tenant_id=p_tenant_id and status in ('in_progress','complete','waived')) then 'in_progress'
    else 'not_started' end;

  update platform.tenant_customer_lifecycle set onboarding_status=v_lifecycle_status,updated_at=now() where tenant_id=p_tenant_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','platform.onboarding.task_updated','onboarding_task',p_task_key,jsonb_build_object('status',p_status,'blocked_reason',p_blocked_reason),jsonb_build_object('source','platform_ops'));

  return jsonb_build_object('tenant_id',p_tenant_id,'task_key',p_task_key,'status',p_status,'onboarding_status',v_lifecycle_status,'required_complete',v_required_done,'required_total',v_required_total);
end;
$function$;

revoke all on function public.platform_server_customer_go_live_readiness(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_customer_intervention(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_portfolio() from public,anon,authenticated;
revoke all on function public.platform_server_operator_customer_detail(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_set_onboarding_task(uuid,text,text,uuid,text) from public,anon,authenticated;

grant execute on function public.platform_server_customer_go_live_readiness(uuid) to service_role;
grant execute on function public.platform_server_customer_intervention(uuid) to service_role;
grant execute on function public.platform_server_operator_portfolio() to service_role;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
grant execute on function public.platform_server_operator_set_onboarding_task(uuid,text,text,uuid,text) to service_role;
