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
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  if v_status not in ('pending','verifying','verified','disabled') then
    raise exception 'invalid_domain_status';
  end if;

  select * into v_before
  from platform.tenant_domains d
  where d.id=p_domain_id
  for update;

  if not found then
    raise exception 'domain_not_found';
  end if;

  if v_before.domain_type<>'custom' then
    raise exception 'provider_state_only_for_custom_domain';
  end if;

  if not (
    lower(coalesce(v_before.metadata->>'provider',''))='vercel'
    or lower(coalesce(v_before.metadata->>'created_from',''))='platform_ops'
  ) then
    raise exception 'custom_domain_not_provider_managed';
  end if;

  update platform.tenant_domains
  set status=v_status,
      verified_at=case
        when v_status='verified'
          then coalesce(verified_at,pg_catalog.now())
        else verified_at
      end,
      is_primary=case
        when v_status='disabled' then false
        else is_primary
      end,
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'provider',
          'vercel',
          'provider_checked_at',
          pg_catalog.now()
        )
        || jsonb_build_object(
          'provider_state',
          coalesce(p_provider_state,'{}'::jsonb)
        ),
      updated_at=pg_catalog.now()
  where id=p_domain_id
  returning * into v_after;

  insert into platform.audit_events(
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  ) values (
    v_after.tenant_id,
    p_actor_user_id,
    'user',
    'platform.domain.provider_state_recorded',
    'tenant_domain',
    v_after.id::text,
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object(
      'source',
      'platform_ops',
      'provider',
      'vercel'
    )
  );

  return to_jsonb(v_after);
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
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  select * into v_before
  from platform.tenant_domains d
  where d.id=p_domain_id
    and d.tenant_id=p_tenant_id
  for update;

  if not found then
    raise exception 'domain_not_found';
  end if;

  if v_before.domain_type<>'custom' then
    raise exception 'cannot_disable_platform_domain_here';
  end if;

  if not (
    lower(coalesce(v_before.metadata->>'provider',''))='vercel'
    or lower(coalesce(v_before.metadata->>'created_from',''))='platform_ops'
  ) then
    raise exception 'custom_domain_not_provider_managed';
  end if;

  update platform.tenant_domains
  set status='disabled',
      is_primary=false,
      updated_at=pg_catalog.now(),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'disabled_at',
          pg_catalog.now(),
          'disabled_by',
          p_actor_user_id
        )
  where id=p_domain_id
  returning * into v_after;

  if v_before.is_primary then
    select d.id into v_fallback_id
    from platform.tenant_domains d
    where d.tenant_id=p_tenant_id
      and d.status='verified'
      and d.id<>p_domain_id
    order by
      case when d.domain_type='platform_subdomain' then 0 else 1 end,
      d.verified_at desc nulls last,
      d.created_at asc
    limit 1;

    if v_fallback_id is not null then
      update platform.tenant_domains
      set is_primary=true,
          updated_at=pg_catalog.now()
      where id=v_fallback_id;
    end if;
  end if;

  insert into platform.audit_events(
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  ) values (
    v_after.tenant_id,
    p_actor_user_id,
    'user',
    'platform.domain.custom_disabled',
    'tenant_domain',
    v_after.id::text,
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object(
      'source',
      'platform_ops'
    )
  );

  return to_jsonb(v_after);
end;
$function$;


revoke all on function
  public.platform_server_operator_record_domain_provider_state(
    uuid,text,jsonb,uuid
  )
from public,anon,authenticated;

revoke all on function
  public.platform_server_operator_disable_custom_domain(
    uuid,uuid,uuid
  )
from public,anon,authenticated;

grant execute on function
  public.platform_server_operator_record_domain_provider_state(
    uuid,text,jsonb,uuid
  )
to service_role;

grant execute on function
  public.platform_server_operator_disable_custom_domain(
    uuid,uuid,uuid
  )
to service_role;
