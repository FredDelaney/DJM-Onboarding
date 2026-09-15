create table if not exists platform.tenant_owner_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(email) between 3 and 320),
  check (length(token_hash) = 64)
);

create index if not exists tenant_owner_invites_tenant_idx
  on platform.tenant_owner_invites(tenant_id, created_at desc);
create index if not exists tenant_owner_invites_email_idx
  on platform.tenant_owner_invites(lower(email), created_at desc);
create index if not exists tenant_owner_invites_expiry_idx
  on platform.tenant_owner_invites(status, expires_at);
create unique index if not exists tenant_owner_invites_one_pending_idx
  on platform.tenant_owner_invites(tenant_id, lower(email))
  where status = 'pending';

alter table platform.tenant_owner_invites enable row level security;
revoke all on platform.tenant_owner_invites from public, anon, authenticated;

create or replace function public.platform_server_operator_create_owner_invite(
  p_tenant_id uuid,
  p_email text,
  p_actor_user_id uuid,
  p_expires_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(trim(p_email));
  v_token text;
  v_token_hash text;
  v_invite platform.tenant_owner_invites%rowtype;
  v_tenant platform.tenants%rowtype;
  v_branding platform.tenant_branding%rowtype;
begin
  if not exists (
    select 1 from platform.platform_admins
    where user_id = p_actor_user_id and status = 'active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  select * into v_tenant from platform.tenants where id = p_tenant_id;
  if not found then raise exception 'tenant_not_found'; end if;
  if v_tenant.status in ('closed','suspended') then raise exception 'tenant_not_invitable'; end if;

  if v_email = '' or length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'invalid_owner_email';
  end if;

  if p_expires_hours < 1 or p_expires_hours > 720 then
    raise exception 'invalid_invite_expiry';
  end if;

  if exists (
    select 1
    from platform.tenant_memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant_id
      and m.role = 'owner'
      and m.status = 'active'
      and lower(u.email) = v_email
  ) then
    raise exception 'owner_already_attached';
  end if;

  update platform.tenant_owner_invites
  set status = 'expired', updated_at = now()
  where tenant_id = p_tenant_id
    and lower(email) = v_email
    and status = 'pending'
    and expires_at <= now();

  update platform.tenant_owner_invites
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where tenant_id = p_tenant_id
    and lower(email) = v_email
    and status = 'pending';

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into platform.tenant_owner_invites(
    tenant_id,email,token_hash,status,expires_at,created_by,metadata
  ) values (
    p_tenant_id,v_email,v_token_hash,'pending',now() + make_interval(hours => p_expires_hours),p_actor_user_id,
    jsonb_build_object('source','platform_ops','version','v1')
  ) returning * into v_invite;

  update platform.tenant_customer_lifecycle
  set owner_contact_email = v_email, updated_at = now()
  where tenant_id = p_tenant_id;

  select * into v_branding from platform.tenant_branding where tenant_id = p_tenant_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.owner_invite.created','tenant_owner_invite',v_invite.id::text,
    jsonb_build_object('email',v_email,'status','pending','expires_at',v_invite.expires_at),
    jsonb_build_object('source','platform_ops')
  );

  return jsonb_build_object(
    'invite_id',v_invite.id,
    'tenant_id',p_tenant_id,
    'tenant_slug',v_tenant.slug,
    'agency_name',coalesce(v_branding.display_name,v_tenant.legal_name,v_tenant.slug),
    'portal_name',coalesce(v_branding.portal_name,v_branding.short_name,v_branding.display_name),
    'email',v_email,
    'status','pending',
    'expires_at',v_invite.expires_at,
    'token',v_token,
    'invite_path','/platform/join/' || v_token
  );
end;
$function$;

create or replace function public.platform_server_operator_revoke_owner_invite(
  p_invite_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invite platform.tenant_owner_invites%rowtype;
begin
  if not exists (
    select 1 from platform.platform_admins
    where user_id = p_actor_user_id and status = 'active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  update platform.tenant_owner_invites
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_invite_id and status = 'pending'
  returning * into v_invite;

  if not found then raise exception 'pending_owner_invite_not_found'; end if;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    v_invite.tenant_id,p_actor_user_id,'user','platform.owner_invite.revoked','tenant_owner_invite',v_invite.id::text,
    jsonb_build_object('email',v_invite.email,'status','revoked'),
    jsonb_build_object('source','platform_ops')
  );

  return jsonb_build_object('invite_id',v_invite.id,'tenant_id',v_invite.tenant_id,'status','revoked');
end;
$function$;

create or replace function public.platform_server_public_owner_invite_preflight(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_token text := trim(p_token);
  v_hash text;
  v_invite platform.tenant_owner_invites%rowtype;
  v_tenant platform.tenants%rowtype;
  v_branding platform.tenant_branding%rowtype;
  v_plan jsonb;
begin
  if v_token = '' or length(v_token) <> 64 or v_token !~ '^[0-9a-fA-F]{64}$' then
    return null;
  end if;

  v_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  select * into v_invite
  from platform.tenant_owner_invites
  where token_hash = v_hash
    and status = 'pending'
    and expires_at > now();
  if not found then return null; end if;

  select * into v_tenant from platform.tenants where id = v_invite.tenant_id and status in ('provisioning','active');
  if not found then return null; end if;

  select * into v_branding from platform.tenant_branding where tenant_id = v_invite.tenant_id;
  select jsonb_build_object('plan_key',a.plan_key,'status',a.status)
    into v_plan
  from platform.tenant_plan_assignments a
  where a.tenant_id = v_invite.tenant_id and a.status in ('trialing','active')
  order by a.effective_from desc
  limit 1;

  return jsonb_build_object(
    'invite_id',v_invite.id,
    'email',v_invite.email,
    'expires_at',v_invite.expires_at,
    'tenant',jsonb_build_object('id',v_tenant.id,'slug',v_tenant.slug,'status',v_tenant.status),
    'branding',jsonb_build_object(
      'display_name',coalesce(v_branding.display_name,v_tenant.legal_name,v_tenant.slug),
      'short_name',v_branding.short_name,
      'portal_name',v_branding.portal_name,
      'primary_color',v_branding.primary_color,
      'secondary_color',v_branding.secondary_color,
      'accent_color',v_branding.accent_color,
      'support_email',v_branding.support_email,
      'website_url',v_branding.website_url
    ),
    'plan',coalesce(v_plan,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.platform_server_complete_owner_invite(
  p_token text,
  p_email text,
  p_user_id uuid,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text := trim(p_token);
  v_email text := lower(trim(p_email));
  v_hash text;
  v_invite platform.tenant_owner_invites%rowtype;
  v_auth_email text;
  v_hostname text;
  v_slug text;
  v_portal_name text;
begin
  if v_token = '' or length(v_token) <> 64 or v_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'invalid_owner_invite';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  select * into v_invite
  from platform.tenant_owner_invites
  where token_hash = v_hash
  for update;

  if not found or v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    raise exception 'invalid_owner_invite';
  end if;
  if lower(v_invite.email) <> v_email then raise exception 'owner_invite_email_mismatch'; end if;

  select lower(email) into v_auth_email from auth.users where id = p_user_id;
  if v_auth_email is null or v_auth_email <> v_email then raise exception 'auth_user_email_mismatch'; end if;

  if not exists (
    select 1 from platform.tenants
    where id = v_invite.tenant_id and status in ('provisioning','active')
  ) then
    raise exception 'tenant_not_available';
  end if;

  update platform.tenant_memberships
  set is_primary = false, updated_at = now()
  where user_id = p_user_id and tenant_id <> v_invite.tenant_id and status = 'active' and is_primary;

  insert into platform.tenant_memberships(tenant_id,user_id,role,status,is_primary,metadata)
  values(v_invite.tenant_id,p_user_id,'owner','active',true,jsonb_build_object('accepted_via_owner_invite',true))
  on conflict (tenant_id,user_id) do update
    set role='owner',status='active',is_primary=true,ended_at=null,
        metadata=platform.tenant_memberships.metadata || excluded.metadata,updated_at=now();

  update platform.tenant_owner_invites
  set status='accepted',accepted_by=p_user_id,accepted_at=p_accepted_at,updated_at=now()
  where id=v_invite.id;

  update platform.tenant_onboarding_tasks
  set status='complete',completed_at=coalesce(completed_at,p_accepted_at),completed_by=p_user_id,blocked_reason=null,updated_at=now()
  where tenant_id=v_invite.tenant_id and task_key='owner_access';

  update platform.tenant_customer_lifecycle
  set owner_contact_email=v_email,
      onboarding_status=case when onboarding_status='not_started' then 'in_progress' else onboarding_status end,
      updated_at=now()
  where tenant_id=v_invite.tenant_id;

  select t.slug,coalesce(b.portal_name,b.short_name,b.display_name,t.legal_name,t.slug)
    into v_slug,v_portal_name
  from platform.tenants t
  left join platform.tenant_branding b on b.tenant_id=t.id
  where t.id=v_invite.tenant_id;

  select d.hostname into v_hostname
  from platform.tenant_domains d
  where d.tenant_id=v_invite.tenant_id and d.status='verified'
  order by d.is_primary desc,d.created_at asc
  limit 1;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    v_invite.tenant_id,p_user_id,'user','platform.owner_invite.accepted','tenant_membership',p_user_id::text,
    jsonb_build_object('role','owner','status','active','email',v_email),
    jsonb_build_object('source','owner_invite','invite_id',v_invite.id)
  );

  return jsonb_build_object(
    'ok',true,
    'tenant_id',v_invite.tenant_id,
    'tenant_slug',v_slug,
    'portal_name',v_portal_name,
    'hostname',v_hostname,
    'user_id',p_user_id,
    'role','owner'
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
  select case when exists(select 1 from platform.tenants t0 where t0.id = p_tenant_id) then
    jsonb_build_object(
      'tenant', (
        select to_jsonb(x) from (
          select t.id,t.slug,t.tenant_type,t.status,t.legal_name,t.metadata,t.created_at,t.updated_at
          from platform.tenants t where t.id=p_tenant_id
        ) x
      ),
      'branding', (
        select to_jsonb(x) from (
          select b.* from platform.tenant_branding b where b.tenant_id=p_tenant_id
        ) x
      ),
      'lifecycle', (
        select to_jsonb(x) from (
          select l.* from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id
        ) x
      ),
      'plan', (
        select to_jsonb(x) from (
          select a.plan_key,a.status,a.billing_mode,a.effective_from,a.effective_until,a.configuration
          from platform.tenant_plan_assignments a
          where a.tenant_id=p_tenant_id and a.status in ('trialing','active')
          order by a.effective_from desc
          limit 1
        ) x
      ),
      'domains', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.created_at)
        from (
          select d.id,d.hostname,d.domain_type,d.status,d.is_primary,d.verified_at,d.created_at
          from platform.tenant_domains d
          where d.tenant_id=p_tenant_id
        ) x
      ),'[]'::jsonb),
      'owner_invites', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.created_at desc)
        from (
          select i.id,i.email,
            case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end as status,
            i.expires_at,i.accepted_by,i.accepted_at,i.revoked_at,i.created_by,i.created_at
          from platform.tenant_owner_invites i
          where i.tenant_id=p_tenant_id
          order by i.created_at desc
          limit 20
        ) x
      ),'[]'::jsonb),
      'onboarding_tasks', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.sort_order)
        from (
          select o.task_key,o.category,o.title,o.description,o.status,o.required,o.sort_order,o.blocked_reason,o.completed_at
          from platform.tenant_onboarding_tasks o
          where o.tenant_id=p_tenant_id
        ) x
      ),'[]'::jsonb),
      'memberships', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.joined_at)
        from (
          select m.user_id,m.role,m.status,m.is_primary,m.joined_at
          from platform.tenant_memberships m
          where m.tenant_id=p_tenant_id
        ) x
      ),'[]'::jsonb),
      'feature_overrides', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.feature_key)
        from (
          select e.feature_key,e.enabled,e.source,e.configuration,e.valid_from,e.valid_until,e.updated_at
          from platform.tenant_entitlements e
          where e.tenant_id=p_tenant_id
        ) x
      ),'[]'::jsonb),
      'audit', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
        from (
          select a.id,a.actor_user_id,a.actor_kind,a.action,a.entity_type,a.entity_id,a.after_state,a.metadata,a.occurred_at
          from platform.audit_events a
          where a.tenant_id=p_tenant_id
          order by a.occurred_at desc
          limit 50
        ) x
      ),'[]'::jsonb)
    )
  else null end;
$function$;

revoke all on function public.platform_server_operator_create_owner_invite(uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.platform_server_operator_revoke_owner_invite(uuid,uuid) from public, anon, authenticated;
revoke all on function public.platform_server_public_owner_invite_preflight(text) from public, anon, authenticated;
revoke all on function public.platform_server_complete_owner_invite(text,text,uuid,timestamptz) from public, anon, authenticated;

grant execute on function public.platform_server_operator_create_owner_invite(uuid,text,uuid,integer) to service_role;
grant execute on function public.platform_server_operator_revoke_owner_invite(uuid,uuid) to service_role;
grant execute on function public.platform_server_public_owner_invite_preflight(text) to service_role;
grant execute on function public.platform_server_complete_owner_invite(text,text,uuid,timestamptz) to service_role;

revoke all on function public.platform_server_operator_customer_detail(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
