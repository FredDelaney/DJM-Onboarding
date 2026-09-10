alter table platform.plan_catalog
  add column if not exists monthly_price_cents integer,
  add column if not exists price_currency text not null default 'EUR',
  add column if not exists price_is_from boolean not null default false;

alter table platform.plan_catalog
  drop constraint if exists plan_catalog_monthly_price_check,
  add constraint plan_catalog_monthly_price_check
    check (monthly_price_cents is null or monthly_price_cents >= 0),
  drop constraint if exists plan_catalog_price_currency_check,
  add constraint plan_catalog_price_currency_check
    check (price_currency ~ '^[A-Z]{3}$');

update platform.plan_catalog
set monthly_price_cents = case plan_key
      when 'agency' then 14900
      when 'pro' then 39900
      when 'elite' then 79900
      when 'enterprise' then 150000
      else monthly_price_cents
    end,
    price_currency = 'EUR',
    price_is_from = (plan_key = 'enterprise'),
    updated_at = now()
where plan_key in ('agency','pro','elite','enterprise');

create or replace function public.platform_server_provision_tenant(
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
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_display_name text := trim(coalesce(p_display_name,''));
  v_plan_key text := lower(trim(coalesce(p_plan_key,'')));
  v_hostname text;
  v_tenant_id uuid;
  v_domain_status text;
  v_timezone text := coalesce(nullif(trim(p_settings->>'timezone'),''),'UTC');
  v_locale text := coalesce(nullif(trim(p_settings->>'locale'),''),'en-GB');
  v_currency text := upper(coalesce(nullif(trim(p_settings->>'default_currency'),''),'EUR'));
  v_ai_budget bigint;
  v_ai_hard_limit boolean := true;
  v_support_email text := nullif(trim(p_branding->>'support_email'),'');
  v_tax_country text := nullif(upper(trim(p_settings->>'tax_country')),'');
  v_initial_credits numeric(20,6) := 0;
  v_credit_unlimited boolean := false;
begin
  if v_display_name = '' then
    raise exception 'display_name_required';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 63 then
    raise exception 'invalid_tenant_slug';
  end if;

  if jsonb_typeof(coalesce(p_branding,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_settings,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'configuration_must_be_json_objects';
  end if;

  if p_tenant_type not in ('agency','sports_management','scouting_company','consultancy','club','other') then
    raise exception 'invalid_tenant_type';
  end if;

  if p_domain_type not in ('platform_subdomain','custom') then
    raise exception 'invalid_domain_type';
  end if;

  if p_billing_mode not in ('internal','manual','invoice','stripe') then
    raise exception 'invalid_billing_mode';
  end if;

  if not exists (
    select 1 from platform.plan_catalog pc
    where pc.plan_key = v_plan_key and pc.status = 'active'
  ) then
    raise exception 'active_plan_not_found';
  end if;

  if exists (select 1 from platform.tenants t where t.slug = v_slug) then
    raise exception 'tenant_slug_already_exists';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    raise exception 'invalid_timezone';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency';
  end if;

  if v_tax_country is not null and v_tax_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_tax_country';
  end if;

  if p_settings ? 'ai_monthly_budget_micros' and p_settings->>'ai_monthly_budget_micros' is not null then
    v_ai_budget := (p_settings->>'ai_monthly_budget_micros')::bigint;
    if v_ai_budget < 0 then raise exception 'invalid_ai_budget'; end if;
  end if;

  if p_settings ? 'ai_hard_limit' then
    v_ai_hard_limit := (p_settings->>'ai_hard_limit')::boolean;
  end if;

  if p_settings ? 'initial_credits' then
    v_initial_credits := (p_settings->>'initial_credits')::numeric;
    if v_initial_credits < 0 then raise exception 'invalid_initial_credits'; end if;
  end if;

  if p_settings ? 'credits_unlimited' then
    v_credit_unlimited := (p_settings->>'credits_unlimited')::boolean;
  end if;

  if p_billing_mode <> 'internal' and v_credit_unlimited then
    raise exception 'unlimited_credits_require_internal_billing';
  end if;

  if p_owner_user_id is not null and not exists (
    select 1 from auth.users u where u.id = p_owner_user_id
  ) then
    raise exception 'owner_user_not_found';
  end if;

  if p_hostname is not null and trim(p_hostname) <> '' then
    v_hostname := regexp_replace(split_part(lower(trim(p_hostname)), ':', 1), '\.$', '');

    if char_length(v_hostname) < 1 or char_length(v_hostname) > 253 or v_hostname ~ '\s' then
      raise exception 'invalid_hostname';
    end if;

    if exists (
      select 1 from platform.tenant_domains d where lower(d.hostname) = v_hostname
    ) then
      raise exception 'hostname_already_registered';
    end if;

    if p_domain_type = 'custom' and not exists (
      select 1
      from platform.plan_features pf
      where pf.plan_key = v_plan_key
        and pf.feature_key = 'custom_domain'
        and pf.enabled
    ) then
      raise exception 'custom_domain_not_in_plan';
    end if;
  end if;

  insert into platform.tenants(slug,tenant_type,status,legal_name,metadata)
  values(
    v_slug,
    p_tenant_type,
    'provisioning',
    coalesce(nullif(trim(p_legal_name),''),v_display_name),
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('provisioned_by','platform_server_provision_tenant')
  )
  returning id into v_tenant_id;

  insert into platform.tenant_branding(
    tenant_id,display_name,short_name,legal_name,portal_name,
    logo_asset,compact_logo_asset,light_logo_asset,favicon_asset,
    primary_color,secondary_color,accent_color,
    support_email,website_url,phone,metadata
  ) values (
    v_tenant_id,
    v_display_name,
    coalesce(nullif(trim(p_branding->>'short_name'),''),v_display_name),
    coalesce(nullif(trim(p_legal_name),''),v_display_name),
    coalesce(nullif(trim(p_branding->>'portal_name'),''),v_display_name || ' Player'),
    nullif(trim(p_branding->>'logo_asset'),''),
    nullif(trim(p_branding->>'compact_logo_asset'),''),
    nullif(trim(p_branding->>'light_logo_asset'),''),
    nullif(trim(p_branding->>'favicon_asset'),''),
    coalesce(nullif(trim(p_branding->>'primary_color'),''),'#0F172A'),
    coalesce(nullif(trim(p_branding->>'secondary_color'),''),'#FFFFFF'),
    coalesce(nullif(trim(p_branding->>'accent_color'),''),'#2563EB'),
    v_support_email,
    nullif(trim(p_branding->>'website_url'),''),
    nullif(trim(p_branding->>'phone'),''),
    coalesce(p_branding->'metadata','{}'::jsonb)
  );

  insert into platform.tenant_settings(
    tenant_id,locale,timezone,default_currency,data_region,
    ai_monthly_budget_micros,ai_hard_limit,retention_policy,
    notification_defaults,configuration
  ) values (
    v_tenant_id,
    v_locale,
    v_timezone,
    v_currency,
    nullif(trim(p_settings->>'data_region'),''),
    v_ai_budget,
    v_ai_hard_limit,
    coalesce(p_settings->'retention_policy','{}'::jsonb),
    coalesce(p_settings->'notification_defaults','{}'::jsonb),
    coalesce(p_settings->'configuration','{}'::jsonb)
  );

  insert into platform.tenant_plan_assignments(
    tenant_id,plan_key,status,billing_mode,configuration
  ) values (
    v_tenant_id,
    v_plan_key,
    'active',
    p_billing_mode,
    jsonb_build_object('provisioned_at',now())
  );

  insert into platform.billing_accounts(
    tenant_id,status,billing_email,invoice_currency,tax_country,payment_provider,metadata
  ) values (
    v_tenant_id,
    case when p_billing_mode='internal' then 'internal' else 'active' end,
    coalesce(nullif(trim(p_settings->>'billing_email'),''),v_support_email),
    v_currency,
    v_tax_country,
    case when p_billing_mode='stripe' then 'stripe' else null end,
    jsonb_build_object('billing_mode',p_billing_mode)
  );

  insert into platform.credit_wallets(
    tenant_id,wallet_key,balance,is_unlimited,status,metadata
  ) values (
    v_tenant_id,
    'platform_credits',
    v_initial_credits,
    v_credit_unlimited,
    'active',
    jsonb_build_object('created_during_provisioning',true)
  );

  if p_owner_user_id is not null then
    insert into platform.tenant_memberships(
      tenant_id,user_id,role,status,is_primary,metadata
    ) values (
      v_tenant_id,p_owner_user_id,'owner','active',true,
      jsonb_build_object('created_during_provisioning',true)
    );
  end if;

  if v_hostname is not null then
    v_domain_status := case when p_domain_type='platform_subdomain' then 'verified' else 'pending' end;

    insert into platform.tenant_domains(
      tenant_id,hostname,domain_type,status,is_primary,verified_at,metadata
    ) values (
      v_tenant_id,
      v_hostname,
      p_domain_type,
      v_domain_status,
      true,
      case when v_domain_status='verified' then now() else null end,
      jsonb_build_object('created_during_provisioning',true)
    );
  end if;

  update platform.tenants
  set status='active', updated_at=now()
  where id=v_tenant_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    v_tenant_id,
    p_actor_user_id,
    case when p_actor_user_id is null then 'system' else 'user' end,
    'tenant.provisioned',
    'tenant',
    v_tenant_id::text,
    jsonb_build_object(
      'slug',v_slug,
      'display_name',v_display_name,
      'plan_key',v_plan_key,
      'hostname',v_hostname,
      'domain_status',v_domain_status,
      'billing_mode',p_billing_mode
    ),
    jsonb_build_object('source','platform_server_provision_tenant')
  );

  return jsonb_build_object(
    'tenant_id',v_tenant_id,
    'slug',v_slug,
    'status','active',
    'plan_key',v_plan_key,
    'hostname',v_hostname,
    'domain_status',v_domain_status,
    'owner_user_id',p_owner_user_id,
    'runtime_version',(select rv.version from platform.tenant_runtime_versions rv where rv.tenant_id=v_tenant_id)
  );
end;
$function$;

revoke all on function public.platform_server_provision_tenant(text,text,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_provision_tenant(text,text,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb,uuid) to service_role;
