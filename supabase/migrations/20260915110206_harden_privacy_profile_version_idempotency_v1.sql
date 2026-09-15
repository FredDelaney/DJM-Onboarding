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
  v_effective_at timestamptz;
  v_existing platform.tenant_privacy_notice_versions%rowtype;
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
  if v_notice_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'privacy_notice_url_must_be_http_or_https';
  end if;
  if v_notice_version is null then raise exception 'notice_version_required'; end if;
  if v_contact_email is not null
    and v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'invalid_privacy_contact_email';
  end if;

  select * into v_existing
  from platform.tenant_privacy_notice_versions v
  where v.tenant_id=p_tenant_id and v.notice_version=v_notice_version;

  if found then
    if v_existing.controller_name is distinct from v_controller_name
      or v_existing.privacy_contact_email is distinct from v_contact_email
      or v_existing.privacy_notice_url is distinct from v_notice_url
      or (p_effective_at is not null and v_existing.effective_at is distinct from p_effective_at)
    then
      raise exception 'privacy_notice_version_conflict';
    end if;
    v_effective_at:=v_existing.effective_at;
  else
    v_effective_at:=coalesce(p_effective_at,pg_catalog.now());
    insert into platform.tenant_privacy_notice_versions(
      tenant_id,notice_version,controller_name,privacy_contact_email,
      privacy_notice_url,effective_at,created_by
    ) values (
      p_tenant_id,v_notice_version,v_controller_name,v_contact_email,
      v_notice_url,v_effective_at,p_user_id
    );
  end if;

  insert into platform.tenant_privacy_profiles(
    tenant_id,controller_name,privacy_contact_email,privacy_notice_url,
    notice_version,effective_at
  ) values (
    p_tenant_id,v_controller_name,v_contact_email,v_notice_url,
    v_notice_version,v_effective_at
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
    status=case
      when coalesce((v_ready->>'ready_for_player_invites')::boolean,false)
      then 'complete' else 'pending'
    end,
    completed_at=case
      when coalesce((v_ready->>'ready_for_player_invites')::boolean,false)
      then coalesce(completed_at,pg_catalog.now()) else null
    end,
    completed_by=case
      when coalesce((v_ready->>'ready_for_player_invites')::boolean,false)
      then p_user_id else null
    end,
    blocked_reason=null,
    updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id and task_key='privacy_profile';

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  ) values (
    p_tenant_id,p_user_id,'user','platform.privacy_profile.updated',
    'tenant_privacy_profile',p_tenant_id::text,v_ready,
    pg_catalog.jsonb_build_object(
      'source','agency_privacy',
      'notice_version',v_notice_version
    )
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
  v_effective_at timestamptz;
  v_existing platform.tenant_privacy_notice_versions%rowtype;
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
  if v_notice_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'privacy_notice_url_must_be_http_or_https';
  end if;
  if v_notice_version is null then raise exception 'notice_version_required'; end if;
  if v_contact_email is not null
    and v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'invalid_privacy_contact_email';
  end if;

  select * into v_existing
  from platform.tenant_privacy_notice_versions v
  where v.tenant_id=p_tenant_id and v.notice_version=v_notice_version;

  if found then
    if v_existing.controller_name is distinct from v_controller_name
      or v_existing.privacy_contact_email is distinct from v_contact_email
      or v_existing.privacy_notice_url is distinct from v_notice_url
      or (p_effective_at is not null and v_existing.effective_at is distinct from p_effective_at)
    then
      raise exception 'privacy_notice_version_conflict';
    end if;
    v_effective_at:=v_existing.effective_at;
  else
    v_effective_at:=coalesce(p_effective_at,pg_catalog.now());
    insert into platform.tenant_privacy_notice_versions(
      tenant_id,notice_version,controller_name,privacy_contact_email,
      privacy_notice_url,effective_at,created_by
    ) values (
      p_tenant_id,v_notice_version,v_controller_name,v_contact_email,
      v_notice_url,v_effective_at,p_actor_user_id
    );
  end if;

  insert into platform.tenant_privacy_profiles(
    tenant_id,controller_name,privacy_contact_email,privacy_notice_url,
    notice_version,effective_at
  ) values (
    p_tenant_id,v_controller_name,v_contact_email,v_notice_url,
    v_notice_version,v_effective_at
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
    status=case
      when coalesce((v_ready->>'ready_for_player_invites')::boolean,false)
      then 'complete' else 'pending'
    end,
    completed_at=case
      when coalesce((v_ready->>'ready_for_player_invites')::boolean,false)
      then coalesce(completed_at,pg_catalog.now()) else null
    end,
    completed_by=case
      when coalesce((v_ready->>'ready_for_player_invites')::boolean,false)
      then p_actor_user_id else null
    end,
    blocked_reason=null,
    updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id and task_key='privacy_profile';

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.privacy_profile.updated',
    'tenant_privacy_profile',p_tenant_id::text,v_ready,
    pg_catalog.jsonb_build_object(
      'source','platform_ops',
      'notice_version',v_notice_version
    )
  );

  return v_ready;
end;
$function$;

revoke all on function public.platform_server_owner_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;
revoke all on function public.platform_server_operator_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;

grant execute on function public.platform_server_owner_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.platform_server_operator_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;
