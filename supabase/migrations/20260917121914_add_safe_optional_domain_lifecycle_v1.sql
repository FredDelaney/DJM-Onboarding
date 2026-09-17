create or replace function public.platform_server_operator_domain_control(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with current_plan as (
  select a.plan_key
  from platform.tenant_plan_assignments a
  where a.tenant_id=p_tenant_id and a.status in ('trialing','active')
  order by a.effective_from desc
  limit 1
), entitlement as (
  select exists(
    select 1 from current_plan cp
    join platform.plan_features pf on pf.plan_key=cp.plan_key
    where pf.feature_key='custom_domain' and pf.enabled
  ) custom_domain_enabled
), domains as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'hostname',d.hostname,
    'domain_type',d.domain_type,
    'status',d.status,
    'is_primary',d.is_primary,
    'verified_at',d.verified_at,
    'created_at',d.created_at,
    'metadata',d.metadata
  ) order by case when d.is_primary then 0 when d.domain_type='platform_subdomain' then 1 else 2 end,d.created_at),'[]'::jsonb) items,
  count(*) filter(where d.domain_type='platform_subdomain' and d.status='verified')::int verified_platform_domains,
  count(*) filter(where d.domain_type='custom' and d.status='verified')::int verified_custom_domains,
  count(*) filter(where d.domain_type='custom' and d.status in ('pending','verifying'))::int pending_custom_domains,
  max(d.hostname) filter(where d.is_primary and d.status='verified') primary_hostname,
  max(d.hostname) filter(where d.domain_type='platform_subdomain' and d.status='verified') platform_hostname
  from platform.tenant_domains d
  where d.tenant_id=p_tenant_id
)
select jsonb_build_object(
  'tenant_id',p_tenant_id,
  'plan_key',(select plan_key from current_plan),
  'custom_domain_enabled',(select custom_domain_enabled from entitlement),
  'custom_domain_optional',true,
  'workspace_ready',(coalesce(domains.verified_platform_domains,0)+coalesce(domains.verified_custom_domains,0))>0,
  'platform_hostname',domains.platform_hostname,
  'primary_hostname',domains.primary_hostname,
  'verified_platform_domains',coalesce(domains.verified_platform_domains,0),
  'verified_custom_domains',coalesce(domains.verified_custom_domains,0),
  'pending_custom_domains',coalesce(domains.pending_custom_domains,0),
  'domains',domains.items,
  'truth_contract',jsonb_build_object(
    'default_address','Every agency should receive a ReDream-managed workspace address once the ReDream base domain is configured.',
    'custom_domain','A customer-owned custom domain is optional and never required to use or launch the workspace.',
    'primary_switch','A custom domain can become primary only after provider verification; the ReDream-managed address remains a fallback.'
  )
) from domains;
$function$;

create or replace function public.platform_server_operator_assign_platform_domain(
  p_tenant_id uuid,
  p_base_domain text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_slug text;
  v_base text := regexp_replace(lower(trim(coalesce(p_base_domain,''))), '^\.+|\.+$', '', 'g');
  v_hostname text;
  v_existing platform.tenant_domains%rowtype;
  v_make_primary boolean := false;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then raise exception 'platform_operator_access_required'; end if;

  select t.slug into v_slug
  from platform.tenants t
  where t.id=p_tenant_id;
  if v_slug is null then raise exception 'tenant_not_found'; end if;

  if v_base='' or char_length(v_base)>190
    or v_base !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    or v_base like '%.vercel.app'
    or v_base like '%.supabase.co'
    or position('..' in v_base)>0
  then raise exception 'invalid_platform_base_domain'; end if;

  v_hostname := v_slug || '.' || v_base;

  select * into v_existing
  from platform.tenant_domains d
  where d.tenant_id=p_tenant_id and d.domain_type='platform_subdomain'
  order by d.created_at asc
  limit 1;

  if found then
    if v_existing.hostname<>v_hostname then
      raise exception 'platform_domain_already_assigned:%',v_existing.hostname;
    end if;
    return to_jsonb(v_existing);
  end if;

  if exists(select 1 from platform.tenant_domains d where lower(d.hostname)=v_hostname) then
    raise exception 'hostname_already_registered';
  end if;

  v_make_primary := not exists(
    select 1 from platform.tenant_domains d
    where d.tenant_id=p_tenant_id and d.status='verified' and d.is_primary
  );

  insert into platform.tenant_domains(
    tenant_id,hostname,domain_type,status,is_primary,verified_at,metadata
  ) values (
    p_tenant_id,v_hostname,'platform_subdomain','verified',v_make_primary,pg_catalog.now(),
    jsonb_build_object(
      'managed_by','redream',
      'managed_platform_domain',true,
      'base_domain',v_base,
      'created_by',p_actor_user_id,
      'created_from','platform_ops'
    )
  ) returning * into v_existing;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.domain.platform_assigned','tenant_domain',v_existing.id::text,
    to_jsonb(v_existing),jsonb_build_object('source','platform_ops')
  );

  return to_jsonb(v_existing);
end;
$function$;

create or replace function public.platform_server_operator_add_custom_domain(
  p_tenant_id uuid,
  p_hostname text,
  p_actor_user_id uuid,
  p_reserved_base_domain text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hostname text := regexp_replace(split_part(lower(trim(coalesce(p_hostname,''))), ':', 1), '\.$', '');
  v_reserved_base text := regexp_replace(lower(trim(coalesce(p_reserved_base_domain,''))), '^\.+|\.+$', '', 'g');
  v_plan_key text;
  v_row platform.tenant_domains%rowtype;
  v_label text;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then raise exception 'platform_operator_access_required'; end if;

  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  select a.plan_key into v_plan_key
  from platform.tenant_plan_assignments a
  where a.tenant_id=p_tenant_id and a.status in ('trialing','active')
  order by a.effective_from desc
  limit 1;

  if v_plan_key is null or not exists(
    select 1 from platform.plan_features pf
    where pf.plan_key=v_plan_key and pf.feature_key='custom_domain' and pf.enabled
  ) then raise exception 'custom_domain_not_in_plan'; end if;

  if v_hostname='' or char_length(v_hostname)>253
     or v_hostname like '%/%' or v_hostname like '% %'
     or v_hostname !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
     or position('..' in v_hostname)>0
     or v_hostname like '%.vercel.app'
     or v_hostname like '%.supabase.co'
  then raise exception 'invalid_custom_domain'; end if;

  if v_reserved_base<>'' and (
    v_hostname=v_reserved_base or
    v_hostname like '%.' || v_reserved_base
  ) then raise exception 'managed_redream_domain_not_custom'; end if;

  foreach v_label in array string_to_array(v_hostname,'.') loop
    if char_length(v_label)<1 or char_length(v_label)>63
       or v_label !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
    then raise exception 'invalid_custom_domain'; end if;
  end loop;

  if array_length(string_to_array(v_hostname,'.'),1)<2 then
    raise exception 'invalid_custom_domain';
  end if;

  select * into v_row
  from platform.tenant_domains d
  where lower(d.hostname)=v_hostname
  limit 1;

  if found then
    if v_row.tenant_id<>p_tenant_id or v_row.domain_type<>'custom' then
      raise exception 'hostname_already_registered';
    end if;

    if v_row.status='disabled' then
      update platform.tenant_domains
      set status='pending',is_primary=false,verified_at=null,updated_at=pg_catalog.now(),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'reactivated_at',pg_catalog.now(),
            'reactivated_by',p_actor_user_id,
            'provider','vercel'
          )
      where id=v_row.id
      returning * into v_row;

      insert into platform.audit_events(
        tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
      ) values (
        p_tenant_id,p_actor_user_id,'user','platform.domain.custom_reactivated','tenant_domain',v_row.id::text,
        to_jsonb(v_row),jsonb_build_object('source','platform_ops')
      );
    end if;

    return to_jsonb(v_row);
  end if;

  insert into platform.tenant_domains(
    tenant_id,hostname,domain_type,status,is_primary,metadata
  ) values (
    p_tenant_id,v_hostname,'custom','pending',false,
    jsonb_build_object(
      'provider','vercel',
      'requested_by',p_actor_user_id,
      'requested_at',pg_catalog.now(),
      'created_from','platform_ops'
    )
  ) returning * into v_row;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.domain.custom_requested','tenant_domain',v_row.id::text,
    to_jsonb(v_row),jsonb_build_object('source','platform_ops')
  );

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.platform_server_operator_record_domain_provider_state(
  p_domain_id uuid,
  p_status text,
  p_provider_state jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_before platform.tenant_domains%rowtype;
  v_after platform.tenant_domains%rowtype;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then raise exception 'platform_operator_access_required'; end if;

  if v_status not in ('pending','verifying','verified','disabled') then
    raise exception 'invalid_domain_status';
  end if;

  select * into v_before
  from platform.tenant_domains d
  where d.id=p_domain_id
  for update;
  if not found then raise exception 'domain_not_found'; end if;
  if v_before.domain_type<>'custom' then raise exception 'provider_state_only_for_custom_domain'; end if;

  update platform.tenant_domains
  set status=v_status,
      verified_at=case when v_status='verified' then coalesce(verified_at,pg_catalog.now()) else verified_at end,
      is_primary=case when v_status='disabled' then false else is_primary end,
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object('provider','vercel','provider_checked_at',pg_catalog.now())
        || jsonb_build_object('provider_state',coalesce(p_provider_state,'{}'::jsonb)),
      updated_at=pg_catalog.now()
  where id=p_domain_id
  returning * into v_after;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata
  ) values (
    v_after.tenant_id,p_actor_user_id,'user','platform.domain.provider_state_recorded','tenant_domain',v_after.id::text,
    to_jsonb(v_before),to_jsonb(v_after),jsonb_build_object('source','platform_ops','provider','vercel')
  );

  return to_jsonb(v_after);
end;
$function$;

create or replace function public.platform_server_operator_set_primary_domain(
  p_tenant_id uuid,
  p_domain_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target platform.tenant_domains%rowtype;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then raise exception 'platform_operator_access_required'; end if;

  select * into v_target
  from platform.tenant_domains d
  where d.id=p_domain_id and d.tenant_id=p_tenant_id
  for update;
  if not found then raise exception 'domain_not_found'; end if;
  if v_target.status<>'verified' then raise exception 'domain_must_be_verified'; end if;

  update platform.tenant_domains
  set is_primary=false,updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id and id<>p_domain_id and is_primary;

  update platform.tenant_domains
  set is_primary=true,updated_at=pg_catalog.now()
  where id=p_domain_id
  returning * into v_target;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.domain.primary_changed','tenant_domain',v_target.id::text,
    to_jsonb(v_target),jsonb_build_object('source','platform_ops')
  );

  return to_jsonb(v_target);
end;
$function$;

create or replace function public.platform_server_operator_disable_custom_domain(
  p_tenant_id uuid,
  p_domain_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before platform.tenant_domains%rowtype;
  v_after platform.tenant_domains%rowtype;
  v_fallback_id uuid;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then raise exception 'platform_operator_access_required'; end if;

  select * into v_before
  from platform.tenant_domains d
  where d.id=p_domain_id and d.tenant_id=p_tenant_id
  for update;
  if not found then raise exception 'domain_not_found'; end if;
  if v_before.domain_type<>'custom' then raise exception 'cannot_disable_platform_domain_here'; end if;

  update platform.tenant_domains
  set status='disabled',is_primary=false,updated_at=pg_catalog.now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('disabled_at',pg_catalog.now(),'disabled_by',p_actor_user_id)
  where id=p_domain_id
  returning * into v_after;

  if v_before.is_primary then
    select d.id into v_fallback_id
    from platform.tenant_domains d
    where d.tenant_id=p_tenant_id and d.status='verified' and d.id<>p_domain_id
    order by case when d.domain_type='platform_subdomain' then 0 else 1 end,d.verified_at desc nulls last,d.created_at asc
    limit 1;

    if v_fallback_id is not null then
      update platform.tenant_domains
      set is_primary=true,updated_at=pg_catalog.now()
      where id=v_fallback_id;
    end if;
  end if;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.domain.custom_disabled','tenant_domain',v_after.id::text,
    to_jsonb(v_before),to_jsonb(v_after),jsonb_build_object('source','platform_ops','fallback_domain_id',v_fallback_id)
  );

  return to_jsonb(v_after);
end;
$function$;

revoke all on function public.platform_server_operator_domain_control(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_assign_platform_domain(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_add_custom_domain(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.platform_server_operator_record_domain_provider_state(uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_set_primary_domain(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_disable_custom_domain(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.platform_server_operator_domain_control(uuid) to service_role;
grant execute on function public.platform_server_operator_assign_platform_domain(uuid,text,uuid) to service_role;
grant execute on function public.platform_server_operator_add_custom_domain(uuid,text,uuid,text) to service_role;
grant execute on function public.platform_server_operator_record_domain_provider_state(uuid,text,jsonb,uuid) to service_role;
grant execute on function public.platform_server_operator_set_primary_domain(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_operator_disable_custom_domain(uuid,uuid,uuid) to service_role;;
