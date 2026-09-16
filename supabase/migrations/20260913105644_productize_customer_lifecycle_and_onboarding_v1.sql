create table if not exists platform.tenant_customer_lifecycle (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  stage text not null default 'onboarding',
  onboarding_status text not null default 'not_started',
  lead_source text,
  sales_owner_name text,
  account_owner_name text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  contracted_at timestamptz,
  go_live_at timestamptz,
  churned_at timestamptz,
  contracted_monthly_cents integer,
  contract_currency text not null default 'EUR',
  annual_commitment boolean not null default false,
  founding_customer boolean not null default false,
  cancellation_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_customer_lifecycle_stage_check
    check (stage in ('internal','demo','trial','onboarding','live','at_risk','paused','churned')),
  constraint tenant_customer_lifecycle_onboarding_status_check
    check (onboarding_status in ('not_started','in_progress','blocked','complete')),
  constraint tenant_customer_lifecycle_price_check
    check (contracted_monthly_cents is null or contracted_monthly_cents >= 0),
  constraint tenant_customer_lifecycle_currency_check
    check (contract_currency ~ '^[A-Z]{3}$'),
  constraint tenant_customer_lifecycle_trial_dates_check
    check (trial_ends_at is null or trial_started_at is null or trial_ends_at >= trial_started_at),
  constraint tenant_customer_lifecycle_go_live_check
    check (go_live_at is null or contracted_at is null or go_live_at >= contracted_at)
);

alter table platform.tenant_customer_lifecycle enable row level security;
revoke all on platform.tenant_customer_lifecycle from public, anon, authenticated;

drop trigger if exists tenant_customer_lifecycle_touch_updated_at on platform.tenant_customer_lifecycle;
create trigger tenant_customer_lifecycle_touch_updated_at
before update on platform.tenant_customer_lifecycle
for each row execute function platform.touch_updated_at();

create table if not exists platform.tenant_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  task_key text not null,
  category text not null,
  title text not null,
  description text,
  status text not null default 'pending',
  required boolean not null default true,
  sort_order integer not null default 100,
  blocked_reason text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_onboarding_tasks_key_format_check
    check (task_key ~ '^[a-z][a-z0-9_]*$'),
  constraint tenant_onboarding_tasks_status_check
    check (status in ('pending','in_progress','blocked','complete','waived')),
  constraint tenant_onboarding_tasks_unique_key unique (tenant_id, task_key)
);

alter table platform.tenant_onboarding_tasks enable row level security;
revoke all on platform.tenant_onboarding_tasks from public, anon, authenticated;

create index if not exists tenant_onboarding_tasks_tenant_status_idx
  on platform.tenant_onboarding_tasks (tenant_id, status, required, sort_order);

drop trigger if exists tenant_onboarding_tasks_touch_updated_at on platform.tenant_onboarding_tasks;
create trigger tenant_onboarding_tasks_touch_updated_at
before update on platform.tenant_onboarding_tasks
for each row execute function platform.touch_updated_at();

create or replace function public.platform_server_seed_customer_lifecycle(
  p_tenant_id uuid,
  p_stage text default null,
  p_trial_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant platform.tenants%rowtype;
  v_stage text;
  v_trial_days integer := coalesce(p_trial_days, 14);
  v_is_internal boolean := false;
  v_is_synthetic boolean := false;
  v_ai_required boolean := false;
  v_billing_required boolean := true;
begin
  select * into v_tenant from platform.tenants where id = p_tenant_id;
  if not found then raise exception 'tenant_not_found'; end if;

  if v_trial_days not between 1 and 90 then raise exception 'invalid_trial_days'; end if;

  v_is_internal := coalesce((v_tenant.metadata->>'internal_tenant')::boolean, false);
  v_is_synthetic := coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean, false);
  v_stage := coalesce(
    nullif(lower(trim(p_stage)), ''),
    case when v_is_internal then 'internal' when v_is_synthetic then 'demo' else 'onboarding' end
  );

  if v_stage not in ('internal','demo','trial','onboarding','live','at_risk','paused','churned') then
    raise exception 'invalid_customer_stage';
  end if;

  select exists (
    select 1
    from platform.tenant_plan_assignments pa
    join platform.plan_features pf on pf.plan_key = pa.plan_key
    where pa.tenant_id = p_tenant_id
      and pa.status = 'active'
      and pf.feature_key = 'ai_assistant'
      and pf.enabled
  ) into v_ai_required;

  select not exists (
    select 1 from platform.tenant_plan_assignments pa
    where pa.tenant_id = p_tenant_id
      and pa.status = 'active'
      and pa.billing_mode = 'internal'
  ) into v_billing_required;

  insert into platform.tenant_customer_lifecycle(
    tenant_id, stage, onboarding_status,
    trial_started_at, trial_ends_at,
    founding_customer, metadata
  ) values (
    p_tenant_id,
    v_stage,
    case when v_stage = 'internal' then 'complete' else 'not_started' end,
    case when v_stage = 'trial' then now() else null end,
    case when v_stage = 'trial' then now() + make_interval(days => v_trial_days) else null end,
    false,
    jsonb_build_object('seeded_by','platform_server_seed_customer_lifecycle')
  )
  on conflict (tenant_id) do update set
    stage = case
      when p_stage is not null and trim(p_stage) <> '' then excluded.stage
      else platform.tenant_customer_lifecycle.stage
    end,
    trial_started_at = case
      when p_stage = 'trial' and platform.tenant_customer_lifecycle.trial_started_at is null then now()
      else platform.tenant_customer_lifecycle.trial_started_at
    end,
    trial_ends_at = case
      when p_stage = 'trial' and platform.tenant_customer_lifecycle.trial_ends_at is null then now() + make_interval(days => v_trial_days)
      else platform.tenant_customer_lifecycle.trial_ends_at
    end,
    updated_at = now();

  insert into platform.tenant_onboarding_tasks(
    tenant_id, task_key, category, title, description, required, sort_order
  )
  select p_tenant_id, x.task_key, x.category, x.title, x.description, x.required, x.sort_order
  from (values
    ('agency_profile','workspace','Agency profile','Confirm the agency identity, workspace name and core settings.',true,10),
    ('branding','branding','Brand the workspace','Add the agency brand, colours, support details and player-facing identity.',true,20),
    ('owner_access','team','Activate an owner or admin','Make sure at least one accountable owner or administrator can access the workspace.',true,30),
    ('player_import','players','Add the first players','Import or create the first active player records.',true,40),
    ('staff_invites','team','Invite the working team','Add the agents, scouts or operations staff who will use the workspace.',false,50),
    ('player_portal','players','Launch the player experience','Connect at least one player to the branded player-facing workspace.',true,60),
    ('first_tell_djm','intelligence','Capture the first Tell DJM update','Prove the AI capture loop with a real agency update.',v_ai_required,70),
    ('first_opportunity','workspace','Create the first opportunity','Create a live player opportunity or club need and put it into the workflow.',true,80),
    ('billing_ready','commercial','Confirm billing','Confirm the billing account and payment route for the customer.',v_billing_required,90),
    ('custom_domain','branding','Connect the custom domain','Verify the agency domain when custom-domain branding is part of the rollout.',false,100)
  ) as x(task_key,category,title,description,required,sort_order)
  on conflict (tenant_id, task_key) do update set
    category = excluded.category,
    title = excluded.title,
    description = excluded.description,
    required = excluded.required,
    sort_order = excluded.sort_order,
    updated_at = now();

  if v_stage = 'internal' then
    update platform.tenant_onboarding_tasks
    set status = 'waived', completed_at = coalesce(completed_at, now()), updated_at = now()
    where tenant_id = p_tenant_id and status not in ('complete','waived');
  end if;

  return jsonb_build_object(
    'tenant_id', p_tenant_id,
    'stage', (select l.stage from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id),
    'task_count', (select count(*) from platform.tenant_onboarding_tasks ot where ot.tenant_id=p_tenant_id)
  );
end;
$function$;

revoke all on function public.platform_server_seed_customer_lifecycle(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.platform_server_seed_customer_lifecycle(uuid,text,integer) to service_role;

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
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  if not exists (select 1 from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id) then
    perform public.platform_server_seed_customer_lifecycle(p_tenant_id, null, 14);
  end if;

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='agency_profile'
    and ot.status not in ('complete','waived')
    and exists (
      select 1 from platform.tenants t
      join platform.tenant_branding b on b.tenant_id=t.id
      join platform.tenant_settings s on s.tenant_id=t.id
      where t.id=p_tenant_id and nullif(trim(t.legal_name),'') is not null and nullif(trim(b.display_name),'') is not null
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='branding'
    and ot.status not in ('complete','waived')
    and exists (
      select 1 from platform.tenant_branding b
      where b.tenant_id=p_tenant_id and nullif(trim(b.display_name),'') is not null and nullif(trim(b.portal_name),'') is not null
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='owner_access'
    and ot.status not in ('complete','waived')
    and exists (
      select 1 from platform.tenant_memberships m
      where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin')
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='player_import'
    and ot.status not in ('complete','waived')
    and exists (select 1 from public.players p where p.tenant_id=p_tenant_id);

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='staff_invites'
    and ot.status not in ('complete','waived')
    and (select count(*) from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role <> 'player') >= 2;

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='player_portal'
    and ot.status not in ('complete','waived')
    and exists (
      select 1 from platform.tenant_memberships m
      where m.tenant_id=p_tenant_id and m.status='active' and m.role='player'
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='first_tell_djm'
    and ot.status not in ('complete','waived')
    and exists (
      select 1 from platform.ai_usage_events a
      where a.tenant_id=p_tenant_id and a.feature_key='ai_assistant' and a.status='success'
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='first_opportunity'
    and ot.status not in ('complete','waived')
    and (
      exists (select 1 from public.player_opportunities po where po.tenant_id=p_tenant_id)
      or exists (select 1 from djm_os.club_needs cn where cn.tenant_id=p_tenant_id)
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='billing_ready'
    and ot.status not in ('complete','waived')
    and (
      exists (select 1 from platform.tenant_plan_assignments pa where pa.tenant_id=p_tenant_id and pa.status='active' and pa.billing_mode='internal')
      or exists (select 1 from platform.billing_accounts ba where ba.tenant_id=p_tenant_id and ba.status='active')
    );

  update platform.tenant_onboarding_tasks ot
  set status='complete', completed_at=coalesce(ot.completed_at,now()), blocked_reason=null, updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='custom_domain'
    and ot.status not in ('complete','waived')
    and exists (
      select 1 from platform.tenant_domains d
      where d.tenant_id=p_tenant_id and d.domain_type='custom' and d.status in ('verified','active')
    );

  select
    count(*) filter (where required),
    count(*) filter (where required and status in ('complete','waived')),
    count(*) filter (where not required and status in ('complete','waived'))
  into v_required_total, v_required_done, v_optional_done
  from platform.tenant_onboarding_tasks
  where tenant_id=p_tenant_id;

  v_percentage := case when v_required_total=0 then 100 else round((v_required_done::numeric / v_required_total::numeric) * 100)::integer end;
  v_status := case
    when v_required_done = v_required_total then 'complete'
    when exists (select 1 from platform.tenant_onboarding_tasks ot where ot.tenant_id=p_tenant_id and ot.required and ot.status='blocked') then 'blocked'
    when v_required_done > 0 then 'in_progress'
    else 'not_started'
  end;

  update platform.tenant_customer_lifecycle
  set onboarding_status=v_status, updated_at=now()
  where tenant_id=p_tenant_id;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'status',v_status,
    'percentage',v_percentage,
    'required_total',v_required_total,
    'required_complete',v_required_done,
    'optional_complete',v_optional_done
  );
end;
$function$;

revoke all on function public.platform_server_refresh_customer_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_refresh_customer_onboarding(uuid) to service_role;

create or replace function public.platform_server_customer_snapshot(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot jsonb;
begin
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  perform public.platform_server_refresh_customer_onboarding(p_tenant_id);

  select jsonb_build_object(
    'tenant', jsonb_build_object(
      'id',t.id,'slug',t.slug,'legal_name',t.legal_name,'status',t.status,'tenant_type',t.tenant_type
    ),
    'lifecycle', jsonb_build_object(
      'stage',l.stage,'onboarding_status',l.onboarding_status,'lead_source',l.lead_source,
      'sales_owner_name',l.sales_owner_name,'account_owner_name',l.account_owner_name,
      'trial_started_at',l.trial_started_at,'trial_ends_at',l.trial_ends_at,
      'contracted_at',l.contracted_at,'go_live_at',l.go_live_at,'churned_at',l.churned_at,
      'contracted_monthly_cents',l.contracted_monthly_cents,'contract_currency',l.contract_currency,
      'annual_commitment',l.annual_commitment,'founding_customer',l.founding_customer
    ),
    'plan', jsonb_build_object(
      'key',pc.plan_key,'name',pc.display_name,'list_monthly_price_cents',pc.monthly_price_cents,
      'currency',pc.price_currency,'price_is_from',pc.price_is_from,'limits',pc.limits,
      'billing_mode',pa.billing_mode
    ),
    'workspace', jsonb_build_object(
      'active_staff',(select count(*) from platform.tenant_memberships m where m.tenant_id=t.id and m.status='active' and m.role <> 'player'),
      'active_player_members',(select count(*) from platform.tenant_memberships m where m.tenant_id=t.id and m.status='active' and m.role='player'),
      'players',(select count(*) from public.players p where p.tenant_id=t.id),
      'opportunities',(select count(*) from public.player_opportunities po where po.tenant_id=t.id),
      'verified_custom_domains',(select count(*) from platform.tenant_domains d where d.tenant_id=t.id and d.domain_type='custom' and d.status in ('verified','active'))
    ),
    'usage_30d', jsonb_build_object(
      'ai_events',(select count(*) from platform.ai_usage_events a where a.tenant_id=t.id and a.occurred_at >= now()-interval '30 days'),
      'estimated_ai_cost_micros',coalesce((select sum(a.estimated_cost_micros) from platform.ai_usage_events a where a.tenant_id=t.id and a.occurred_at >= now()-interval '30 days'),0)
    ),
    'onboarding', jsonb_build_object(
      'percentage',case when count(*) filter (where ot.required)=0 then 100 else round((count(*) filter (where ot.required and ot.status in ('complete','waived'))::numeric / count(*) filter (where ot.required)::numeric)*100)::integer end,
      'required_remaining',count(*) filter (where ot.required and ot.status not in ('complete','waived')),
      'blockers',coalesce(jsonb_agg(jsonb_build_object('task_key',ot.task_key,'title',ot.title,'status',ot.status) order by ot.sort_order) filter (where ot.required and ot.status not in ('complete','waived')),'[]'::jsonb),
      'tasks',coalesce(jsonb_agg(jsonb_build_object('task_key',ot.task_key,'category',ot.category,'title',ot.title,'status',ot.status,'required',ot.required,'sort_order',ot.sort_order) order by ot.sort_order),'[]'::jsonb)
    ),
    'ready_to_go_live', count(*) filter (where ot.required and ot.status not in ('complete','waived')) = 0,
    'commercial_summary', public.platform_server_commercial_summary(t.id)
  ) into v_snapshot
  from platform.tenants t
  join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
  left join platform.tenant_plan_assignments pa on pa.tenant_id=t.id and pa.status='active'
  left join platform.plan_catalog pc on pc.plan_key=pa.plan_key
  left join platform.tenant_onboarding_tasks ot on ot.tenant_id=t.id
  where t.id=p_tenant_id
  group by t.id,t.slug,t.legal_name,t.status,t.tenant_type,
    l.stage,l.onboarding_status,l.lead_source,l.sales_owner_name,l.account_owner_name,
    l.trial_started_at,l.trial_ends_at,l.contracted_at,l.go_live_at,l.churned_at,
    l.contracted_monthly_cents,l.contract_currency,l.annual_commitment,l.founding_customer,
    pc.plan_key,pc.display_name,pc.monthly_price_cents,pc.price_currency,pc.price_is_from,pc.limits,pa.billing_mode;

  return v_snapshot;
end;
$function$;

revoke all on function public.platform_server_customer_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_customer_snapshot(uuid) to service_role;

create or replace function public.platform_server_provision_customer(
  p_slug text,
  p_display_name text,
  p_plan_key text,
  p_hostname text default null,
  p_domain_type text default 'platform_subdomain',
  p_tenant_type text default 'agency',
  p_legal_name text default null,
  p_billing_mode text default 'manual',
  p_owner_user_id uuid default null,
  p_branding jsonb default '{}'::jsonb,
  p_settings jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null,
  p_customer_stage text default 'onboarding',
  p_trial_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provision jsonb;
  v_tenant_id uuid;
begin
  v_provision := public.platform_server_provision_tenant(
    p_slug,p_display_name,p_plan_key,p_hostname,p_domain_type,p_tenant_type,p_legal_name,
    p_billing_mode,p_owner_user_id,p_branding,p_settings,p_metadata,p_actor_user_id
  );
  v_tenant_id := (v_provision->>'tenant_id')::uuid;
  perform public.platform_server_seed_customer_lifecycle(v_tenant_id,p_customer_stage,p_trial_days);
  return v_provision || jsonb_build_object(
    'customer', public.platform_server_customer_snapshot(v_tenant_id)
  );
end;
$function$;

revoke all on function public.platform_server_provision_customer(text,text,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.platform_server_provision_customer(text,text,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb,uuid,text,integer) to service_role;

select public.platform_server_seed_customer_lifecycle(
  t.id,
  case
    when coalesce((t.metadata->>'internal_tenant')::boolean,false) then 'internal'
    when coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false) then 'demo'
    else 'onboarding'
  end,
  14
)
from platform.tenants t;

select public.platform_server_refresh_customer_onboarding(t.id)
from platform.tenants t;

insert into platform.audit_events(tenant_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
select
  t.id,'system','customer_lifecycle.initialized','tenant',t.id::text,
  jsonb_build_object('stage',l.stage,'onboarding_status',l.onboarding_status),
  jsonb_build_object('migration','productize_customer_lifecycle_and_onboarding_v1')
from platform.tenants t
join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
where not exists (
  select 1 from platform.audit_events a
  where a.tenant_id=t.id and a.action='customer_lifecycle.initialized'
);;
