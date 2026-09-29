alter table public.profiles
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists locale text not null default 'en-GB',
  add column if not exists timezone text not null default 'UTC';

alter table public.profiles
  drop constraint if exists profiles_job_title_length_check;
alter table public.profiles
  add constraint profiles_job_title_length_check
  check (job_title is null or char_length(job_title) <= 120);

alter table public.profiles
  drop constraint if exists profiles_phone_length_check;
alter table public.profiles
  add constraint profiles_phone_length_check
  check (phone is null or char_length(phone) <= 50);

create table if not exists platform.tenant_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  from_plan_key text references platform.plan_catalog(plan_key) on delete restrict,
  requested_plan_key text not null references platform.plan_catalog(plan_key) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','cancelled','completed')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists tenant_plan_change_requests_tenant_status_idx
  on platform.tenant_plan_change_requests(tenant_id, status, requested_at desc);

create unique index if not exists tenant_plan_change_requests_one_pending_idx
  on platform.tenant_plan_change_requests(tenant_id)
  where status = 'pending';

alter table platform.tenant_plan_change_requests enable row level security;
revoke all on platform.tenant_plan_change_requests from public, anon, authenticated;
grant select, insert, update on platform.tenant_plan_change_requests to service_role;

comment on table platform.tenant_plan_change_requests is
  'Owner-initiated commercial plan changes. Payment details stay with the external billing provider.';

create or replace function public.platform_server_account_billing_update(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_billing_email text,
  p_invoice_currency text,
  p_tax_country text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text:=nullif(lower(pg_catalog.btrim(p_billing_email)),'');
  v_currency text:=upper(pg_catalog.btrim(coalesce(p_invoice_currency,'EUR')));
  v_country text:=nullif(upper(pg_catalog.btrim(coalesce(p_tax_country,''))),'');
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id
      and m.role='owner' and m.status='active'
  ) then raise exception 'tenant_owner_access_required'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'invalid_billing_email'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_invoice_currency'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$'
    then raise exception 'invalid_tax_country'; end if;

  select to_jsonb(b) into v_before
  from platform.billing_accounts b where b.tenant_id=p_tenant_id;

  insert into platform.billing_accounts(
    tenant_id,status,billing_email,invoice_currency,tax_country,metadata
  ) values (
    p_tenant_id,'active',v_email,v_currency,v_country,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (tenant_id) do update set
    billing_email=excluded.billing_email,
    invoice_currency=excluded.invoice_currency,
    tax_country=excluded.tax_country,
    metadata=coalesce(platform.billing_accounts.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at=now();

  select to_jsonb(b) into v_after
  from platform.billing_accounts b where b.tenant_id=p_tenant_id;
  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','account.billing.updated',
    'billing_account',p_tenant_id::text,coalesce(v_before,'{}'::jsonb),v_after,
    jsonb_build_object('source','account_control_centre')
  );

  return v_after;
end;
$function$;

revoke all on function public.platform_server_account_billing_update(
  uuid,uuid,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.platform_server_account_billing_update(
  uuid,uuid,text,text,text,jsonb
) to service_role;

create or replace function public.platform_server_account_plan_request(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_requested_plan_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current text;
  v_requested text:=lower(pg_catalog.btrim(coalesce(p_requested_plan_key,'')));
  v_request platform.tenant_plan_change_requests%rowtype;
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id
      and m.role='owner' and m.status='active'
  ) then raise exception 'tenant_owner_access_required'; end if;

  select a.plan_key into v_current
  from platform.tenant_plan_assignments a
  where a.tenant_id=p_tenant_id and a.status in ('trialing','active')
  order by a.effective_from desc limit 1;

  if not exists(
    select 1 from platform.plan_catalog p
    where p.plan_key=v_requested and p.status='active'
  ) then raise exception 'invalid_requested_plan'; end if;
  if v_requested=coalesce(v_current,'') then raise exception 'plan_already_active'; end if;
  if exists(
    select 1 from platform.tenant_plan_change_requests r
    where r.tenant_id=p_tenant_id and r.status='pending'
  ) then raise exception 'plan_change_already_pending'; end if;

  insert into platform.tenant_plan_change_requests(
    tenant_id,requested_by_user_id,from_plan_key,requested_plan_key
  ) values (p_tenant_id,p_actor_user_id,v_current,v_requested)
  returning * into v_request;
  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','account.plan_change.requested',
    'tenant_plan_change_request',v_request.id::text,
    jsonb_build_object('plan_key',v_current),to_jsonb(v_request),
    jsonb_build_object('source','account_control_centre')
  );

  return to_jsonb(v_request);
end;
$function$;

revoke all on function public.platform_server_account_plan_request(
  uuid,uuid,text
) from public,anon,authenticated;
grant execute on function public.platform_server_account_plan_request(
  uuid,uuid,text
) to service_role;

create or replace function public.platform_server_account_plan_request_cancel(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before platform.tenant_plan_change_requests%rowtype;
  v_after platform.tenant_plan_change_requests%rowtype;
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id
      and m.role='owner' and m.status='active'
  ) then raise exception 'tenant_owner_access_required'; end if;

  select * into v_before
  from platform.tenant_plan_change_requests r
  where r.id=p_request_id and r.tenant_id=p_tenant_id and r.status='pending'
  for update;
  if not found then raise exception 'pending_plan_change_not_found'; end if;

  update platform.tenant_plan_change_requests
  set status='cancelled',resolved_at=now()
  where id=p_request_id
  returning * into v_after;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','account.plan_change.cancelled',
    'tenant_plan_change_request',p_request_id::text,to_jsonb(v_before),to_jsonb(v_after),
    jsonb_build_object('source','account_control_centre')
  );

  return to_jsonb(v_after);
end;
$function$;

revoke all on function public.platform_server_account_plan_request_cancel(
  uuid,uuid,uuid
) from public,anon,authenticated;
grant execute on function public.platform_server_account_plan_request_cancel(
  uuid,uuid,uuid
) to service_role;
