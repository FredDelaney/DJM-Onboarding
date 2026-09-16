create or replace function public.platform_server_tenant_privacy_readiness(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with profile as (
  select
    p.tenant_id,
    nullif(pg_catalog.btrim(p.controller_name),'') controller_name,
    nullif(pg_catalog.btrim(p.privacy_contact_email),'') privacy_contact_email,
    nullif(pg_catalog.btrim(p.privacy_notice_url),'') privacy_notice_url,
    nullif(pg_catalog.btrim(p.notice_version),'') notice_version,
    p.effective_at,
    p.updated_at
  from platform.tenant_privacy_profiles p
  where p.tenant_id=p_tenant_id
), readiness as (
  select
    p.*,
    (p.controller_name is not null) controller_configured,
    (p.privacy_notice_url is not null and p.notice_version is not null) notice_configured,
    (p.effective_at<=pg_catalog.now()) notice_effective
  from profile p
)
select case
  when not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then null
  when not exists(select 1 from readiness) then
    pg_catalog.jsonb_build_object(
      'configured',false,
      'ready_for_player_invites',false,
      'next_step','configure_controller',
      'profile',null
    )
  else (
    select pg_catalog.jsonb_build_object(
      'configured',true,
      'controller_configured',r.controller_configured,
      'notice_configured',r.notice_configured,
      'notice_effective',r.notice_effective,
      'ready_for_player_invites',(
        r.controller_configured and r.notice_configured and r.notice_effective
      ),
      'next_step',case
        when not r.controller_configured then 'configure_controller'
        when not r.notice_configured then 'add_privacy_notice'
        when not r.notice_effective then 'activate_privacy_notice'
        else 'ready'
      end,
      'profile',pg_catalog.jsonb_build_object(
        'controllerName',r.controller_name,
        'contactEmail',r.privacy_contact_email,
        'noticeUrl',r.privacy_notice_url,
        'noticeVersion',r.notice_version,
        'effectiveAt',r.effective_at,
        'updatedAt',r.updated_at
      )
    )
    from readiness r
  )
end;
$function$;

create or replace function public.platform_server_owner_privacy_profile(
  p_tenant_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id
      and m.user_id=p_user_id
      and m.role='owner'
      and m.status='active'
  ) then
    raise exception 'tenant_owner_access_required';
  end if;

  return public.platform_server_tenant_privacy_readiness(p_tenant_id);
end;
$function$;

create or replace function public.platform_server_owner_update_privacy_profile(
  p_tenant_id uuid,
  p_user_id uuid,
  p_controller_name text,
  p_privacy_contact_email text,
  p_privacy_notice_url text,
  p_notice_version text,
  p_effective_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_controller_name text:=nullif(pg_catalog.btrim(p_controller_name),'');
  v_contact_email text:=nullif(pg_catalog.lower(pg_catalog.btrim(p_privacy_contact_email)),'');
  v_notice_url text:=nullif(pg_catalog.btrim(p_privacy_notice_url),'');
  v_notice_version text:=nullif(pg_catalog.btrim(p_notice_version),'');
  v_effective_at timestamptz:=coalesce(p_effective_at,pg_catalog.now());
  v_ready jsonb;
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id
      and m.user_id=p_user_id
      and m.role='owner'
      and m.status='active'
  ) then
    raise exception 'tenant_owner_access_required';
  end if;

  if v_controller_name is null then raise exception 'controller_name_required'; end if;
  if v_notice_url is null then raise exception 'privacy_notice_url_required'; end if;
  if v_notice_version is null then raise exception 'notice_version_required'; end if;

  insert into platform.tenant_privacy_profiles(
    tenant_id,controller_name,privacy_contact_email,privacy_notice_url,notice_version,effective_at
  ) values (
    p_tenant_id,v_controller_name,v_contact_email,v_notice_url,v_notice_version,v_effective_at
  )
  on conflict(tenant_id) do update set
    controller_name=excluded.controller_name,
    privacy_contact_email=excluded.privacy_contact_email,
    privacy_notice_url=excluded.privacy_notice_url,
    notice_version=excluded.notice_version,
    effective_at=excluded.effective_at,
    updated_at=pg_catalog.now();

  insert into platform.tenant_onboarding_tasks(
    tenant_id,task_key,category,title,description,required,sort_order
  ) values (
    p_tenant_id,'privacy_profile','privacy','Configure privacy profile',
    'Set the agency privacy controller identity and the current player-facing privacy notice.',
    true,35
  )
  on conflict(tenant_id,task_key) do update set
    category=excluded.category,
    title=excluded.title,
    description=excluded.description,
    required=excluded.required,
    sort_order=excluded.sort_order,
    updated_at=pg_catalog.now();

  v_ready:=public.platform_server_tenant_privacy_readiness(p_tenant_id);

  update platform.tenant_onboarding_tasks
  set
    status=case when coalesce((v_ready->>'ready_for_player_invites')::boolean,false) then 'complete' else 'pending' end,
    completed_at=case when coalesce((v_ready->>'ready_for_player_invites')::boolean,false) then coalesce(completed_at,pg_catalog.now()) else null end,
    completed_by=case when coalesce((v_ready->>'ready_for_player_invites')::boolean,false) then p_user_id else null end,
    blocked_reason=null,
    updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id and task_key='privacy_profile';

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_user_id,'user','platform.privacy_profile.updated',
    'tenant_privacy_profile',p_tenant_id::text,v_ready,
    pg_catalog.jsonb_build_object('source','agency_privacy')
  );

  return v_ready;
end;
$function$;

create or replace function public.platform_server_operator_update_privacy_profile(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_controller_name text,
  p_privacy_contact_email text,
  p_privacy_notice_url text,
  p_notice_version text,
  p_effective_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_controller_name text:=nullif(pg_catalog.btrim(p_controller_name),'');
  v_contact_email text:=nullif(pg_catalog.lower(pg_catalog.btrim(p_privacy_contact_email)),'');
  v_notice_url text:=nullif(pg_catalog.btrim(p_privacy_notice_url),'');
  v_notice_version text:=nullif(pg_catalog.btrim(p_notice_version),'');
  v_effective_at timestamptz:=coalesce(p_effective_at,pg_catalog.now());
  v_ready jsonb;
begin
  if not exists(
    select 1 from platform.platform_admins
    where user_id=p_actor_user_id and status='active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  if not exists(select 1 from platform.tenants where id=p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;
  if v_controller_name is null then raise exception 'controller_name_required'; end if;
  if v_notice_url is null then raise exception 'privacy_notice_url_required'; end if;
  if v_notice_version is null then raise exception 'notice_version_required'; end if;

  insert into platform.tenant_privacy_profiles(
    tenant_id,controller_name,privacy_contact_email,privacy_notice_url,notice_version,effective_at
  ) values (
    p_tenant_id,v_controller_name,v_contact_email,v_notice_url,v_notice_version,v_effective_at
  )
  on conflict(tenant_id) do update set
    controller_name=excluded.controller_name,
    privacy_contact_email=excluded.privacy_contact_email,
    privacy_notice_url=excluded.privacy_notice_url,
    notice_version=excluded.notice_version,
    effective_at=excluded.effective_at,
    updated_at=pg_catalog.now();

  insert into platform.tenant_onboarding_tasks(
    tenant_id,task_key,category,title,description,required,sort_order
  ) values (
    p_tenant_id,'privacy_profile','privacy','Configure privacy profile',
    'Set the agency privacy controller identity and the current player-facing privacy notice.',
    true,35
  )
  on conflict(tenant_id,task_key) do update set
    category=excluded.category,
    title=excluded.title,
    description=excluded.description,
    required=excluded.required,
    sort_order=excluded.sort_order,
    updated_at=pg_catalog.now();

  v_ready:=public.platform_server_tenant_privacy_readiness(p_tenant_id);

  update platform.tenant_onboarding_tasks
  set
    status=case when coalesce((v_ready->>'ready_for_player_invites')::boolean,false) then 'complete' else 'pending' end,
    completed_at=case when coalesce((v_ready->>'ready_for_player_invites')::boolean,false) then coalesce(completed_at,pg_catalog.now()) else null end,
    completed_by=case when coalesce((v_ready->>'ready_for_player_invites')::boolean,false) then p_actor_user_id else null end,
    blocked_reason=null,
    updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id and task_key='privacy_profile';

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.privacy_profile.updated',
    'tenant_privacy_profile',p_tenant_id::text,v_ready,
    pg_catalog.jsonb_build_object('source','platform_ops')
  );

  return v_ready;
end;
$function$;

create or replace function public.platform_server_seed_customer_lifecycle(
  p_tenant_id uuid,
  p_stage text default null,
  p_trial_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant platform.tenants%rowtype;
  v_stage text;
  v_trial_days integer:=coalesce(p_trial_days,14);
  v_is_internal boolean:=false;
  v_is_synthetic boolean:=false;
  v_ai_required boolean:=false;
  v_billing_required boolean:=true;
begin
  select * into v_tenant from platform.tenants where id=p_tenant_id;
  if not found then raise exception 'tenant_not_found'; end if;
  if v_trial_days not between 1 and 90 then raise exception 'invalid_trial_days'; end if;

  v_is_internal:=coalesce((v_tenant.metadata->>'internal_tenant')::boolean,false);
  v_is_synthetic:=coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);
  v_stage:=coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_stage)),''),
    case when v_is_internal then 'internal' when v_is_synthetic then 'demo' else 'onboarding' end
  );

  if v_stage not in ('internal','demo','trial','onboarding','live','at_risk','paused','churned') then
    raise exception 'invalid_customer_stage';
  end if;

  select exists(
    select 1
    from platform.tenant_plan_assignments pa
    join platform.plan_features pf on pf.plan_key=pa.plan_key
    where pa.tenant_id=p_tenant_id
      and pa.status='active'
      and pf.feature_key='ai_assistant'
      and pf.enabled
  ) into v_ai_required;

  select not exists(
    select 1 from platform.tenant_plan_assignments pa
    where pa.tenant_id=p_tenant_id
      and pa.status='active'
      and pa.billing_mode='internal'
  ) into v_billing_required;

  insert into platform.tenant_customer_lifecycle(
    tenant_id,stage,onboarding_status,trial_started_at,trial_ends_at,founding_customer,metadata
  ) values (
    p_tenant_id,
    v_stage,
    case when v_stage='internal' then 'complete' else 'not_started' end,
    case when v_stage='trial' then pg_catalog.now() else null end,
    case when v_stage='trial' then pg_catalog.now()+make_interval(days=>v_trial_days) else null end,
    false,
    pg_catalog.jsonb_build_object('seeded_by','platform_server_seed_customer_lifecycle')
  )
  on conflict(tenant_id) do update set
    stage=case when p_stage is not null and pg_catalog.btrim(p_stage)<>'' then excluded.stage else platform.tenant_customer_lifecycle.stage end,
    trial_started_at=case when p_stage='trial' and platform.tenant_customer_lifecycle.trial_started_at is null then pg_catalog.now() else platform.tenant_customer_lifecycle.trial_started_at end,
    trial_ends_at=case when p_stage='trial' and platform.tenant_customer_lifecycle.trial_ends_at is null then pg_catalog.now()+make_interval(days=>v_trial_days) else platform.tenant_customer_lifecycle.trial_ends_at end,
    updated_at=pg_catalog.now();

  insert into platform.tenant_onboarding_tasks(
    tenant_id,task_key,category,title,description,required,sort_order
  )
  select p_tenant_id,x.task_key,x.category,x.title,x.description,x.required,x.sort_order
  from(values
    ('agency_profile','workspace','Agency profile','Confirm the agency identity, workspace name and core settings.',true,10),
    ('branding','branding','Brand the workspace','Add the agency brand, colours, support details and player-facing identity.',true,20),
    ('owner_access','team','Activate an owner or admin','Make sure at least one accountable owner or administrator can access the workspace.',true,30),
    ('privacy_profile','privacy','Configure privacy profile','Set the agency privacy controller identity and the current player-facing privacy notice.',not v_is_internal,35),
    ('player_import','players','Add the first players','Import or create the first active player records.',true,40),
    ('staff_invites','team','Invite the working team','Add the agents, scouts or operations staff who will use the workspace.',false,50),
    ('player_portal','players','Launch the player experience','Connect at least one player to the branded player-facing workspace.',true,60),
    ('first_tell_djm','intelligence','Capture the first Tell DJM update','Prove the AI capture loop with a real agency update.',v_ai_required,70),
    ('first_opportunity','workspace','Create the first opportunity','Create a live player opportunity or club need and put it into the workflow.',true,80),
    ('billing_ready','commercial','Confirm billing','Confirm the billing account and payment route for the customer.',v_billing_required,90),
    ('custom_domain','branding','Connect the custom domain','Verify the agency domain when custom-domain branding is part of the rollout.',false,100)
  ) as x(task_key,category,title,description,required,sort_order)
  on conflict(tenant_id,task_key) do update set
    category=excluded.category,
    title=excluded.title,
    description=excluded.description,
    required=excluded.required,
    sort_order=excluded.sort_order,
    updated_at=pg_catalog.now();

  if v_stage='internal' then
    update platform.tenant_onboarding_tasks
    set status='waived',
        completed_at=coalesce(completed_at,pg_catalog.now()),
        updated_at=pg_catalog.now()
    where tenant_id=p_tenant_id and status not in ('complete','waived');
  end if;

  return pg_catalog.jsonb_build_object(
    'tenant_id',p_tenant_id,
    'stage',(select l.stage from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id),
    'task_count',(select count(*) from platform.tenant_onboarding_tasks ot where ot.tenant_id=p_tenant_id)
  );
end;
$function$;

insert into platform.tenant_onboarding_tasks(
  tenant_id,task_key,category,title,description,status,required,sort_order
)
select
  t.id,
  'privacy_profile',
  'privacy',
  'Configure privacy profile',
  'Set the agency privacy controller identity and the current player-facing privacy notice.',
  case when coalesce((t.metadata->>'internal_tenant')::boolean,false) then 'waived' else 'pending' end,
  not coalesce((t.metadata->>'internal_tenant')::boolean,false),
  35
from platform.tenants t
on conflict(tenant_id,task_key) do update set
  category=excluded.category,
  title=excluded.title,
  description=excluded.description,
  required=excluded.required,
  sort_order=excluded.sort_order,
  updated_at=pg_catalog.now();

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

revoke all on function public.platform_server_tenant_privacy_readiness(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_owner_privacy_profile(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_owner_update_privacy_profile(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.platform_server_operator_update_privacy_profile(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.platform_server_seed_customer_lifecycle(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.platform_server_operator_customer_detail(uuid) from public,anon,authenticated;

grant execute on function public.platform_server_tenant_privacy_readiness(uuid) to service_role;
grant execute on function public.platform_server_owner_privacy_profile(uuid,uuid) to service_role;
grant execute on function public.platform_server_owner_update_privacy_profile(uuid,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.platform_server_operator_update_privacy_profile(uuid,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.platform_server_seed_customer_lifecycle(uuid,text,integer) to service_role;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
