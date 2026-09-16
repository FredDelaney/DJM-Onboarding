create table if not exists platform.tenant_privacy_notice_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  notice_version text not null,
  controller_name text not null,
  privacy_contact_email text,
  privacy_notice_url text not null,
  effective_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, notice_version)
);

create index if not exists tenant_privacy_notice_versions_tenant_idx
  on platform.tenant_privacy_notice_versions(tenant_id, effective_at desc);

create index if not exists tenant_privacy_notice_versions_created_by_idx
  on platform.tenant_privacy_notice_versions(created_by);

alter table platform.tenant_privacy_notice_versions enable row level security;
revoke all on platform.tenant_privacy_notice_versions from public, anon, authenticated;

alter table public.player_privacy_acceptances
  add column if not exists tenant_id uuid references platform.tenants(id) on delete restrict,
  add column if not exists notice_controller_name text,
  add column if not exists notice_url text,
  add column if not exists notice_effective_at timestamptz,
  add column if not exists notice_mode text;

create index if not exists player_privacy_acceptances_tenant_idx
  on public.player_privacy_acceptances(tenant_id, accepted_at desc);

update public.player_privacy_acceptances a
set tenant_id = p.tenant_id
from public.players p
where p.id = a.player_id
  and a.tenant_id is null;

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
    (
      p.privacy_notice_url is not null
      and p.privacy_notice_url ~* '^https?://[^[:space:]]+$'
      and p.notice_version is not null
    ) notice_configured,
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
  if v_notice_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'privacy_notice_url_must_be_http_or_https';
  end if;
  if v_notice_version is null then raise exception 'notice_version_required'; end if;
  if v_contact_email is not null
    and v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'invalid_privacy_contact_email';
  end if;

  if exists(
    select 1
    from platform.tenant_privacy_notice_versions v
    where v.tenant_id=p_tenant_id
      and v.notice_version=v_notice_version
      and (
        v.controller_name is distinct from v_controller_name
        or v.privacy_contact_email is distinct from v_contact_email
        or v.privacy_notice_url is distinct from v_notice_url
        or v.effective_at is distinct from v_effective_at
      )
  ) then
    raise exception 'privacy_notice_version_conflict';
  end if;

  insert into platform.tenant_privacy_notice_versions(
    tenant_id,notice_version,controller_name,privacy_contact_email,
    privacy_notice_url,effective_at,created_by
  ) values (
    p_tenant_id,v_notice_version,v_controller_name,v_contact_email,
    v_notice_url,v_effective_at,p_user_id
  ) on conflict(tenant_id,notice_version) do nothing;

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
  if v_notice_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'privacy_notice_url_must_be_http_or_https';
  end if;
  if v_notice_version is null then raise exception 'notice_version_required'; end if;
  if v_contact_email is not null
    and v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'invalid_privacy_contact_email';
  end if;

  if exists(
    select 1
    from platform.tenant_privacy_notice_versions v
    where v.tenant_id=p_tenant_id
      and v.notice_version=v_notice_version
      and (
        v.controller_name is distinct from v_controller_name
        or v.privacy_contact_email is distinct from v_contact_email
        or v.privacy_notice_url is distinct from v_notice_url
        or v.effective_at is distinct from v_effective_at
      )
  ) then
    raise exception 'privacy_notice_version_conflict';
  end if;

  insert into platform.tenant_privacy_notice_versions(
    tenant_id,notice_version,controller_name,privacy_contact_email,
    privacy_notice_url,effective_at,created_by
  ) values (
    p_tenant_id,v_notice_version,v_controller_name,v_contact_email,
    v_notice_url,v_effective_at,p_actor_user_id
  ) on conflict(tenant_id,notice_version) do nothing;

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

create or replace function public.platform_server_public_invite_preflight(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select pg_catalog.jsonb_build_object(
    'valid',(
      i.status='pending'
      and i.expires_at>pg_catalog.now()
      and t.status='active'
    ),
    'can_activate',(
      i.status='pending'
      and i.expires_at>pg_catalog.now()
      and t.status='active'
      and (
        (
          nullif(pg_catalog.btrim(pr.controller_name),'') is not null
          and nullif(pg_catalog.btrim(pr.privacy_notice_url),'')
            ~* '^https?://[^[:space:]]+$'
          and nullif(pg_catalog.btrim(pr.notice_version),'') is not null
          and pr.effective_at<=pg_catalog.now()
        )
        or coalesce((t.metadata->>'internal_tenant')::boolean,false)
      )
    ),
    'email',i.email,
    'expires_at',i.expires_at,
    'full_name',coalesce(
      nullif(
        pg_catalog.btrim(pg_catalog.concat_ws(' ',p.first_name,p.last_name)),
        ''
      ),
      nullif(pg_catalog.btrim(p.preferred_name),''),
      'Player'
    ),
    'agency',pg_catalog.jsonb_build_object(
      'display_name',b.display_name,
      'short_name',b.short_name,
      'portal_name',b.portal_name,
      'logo_asset',b.logo_asset,
      'compact_logo_asset',b.compact_logo_asset,
      'light_logo_asset',b.light_logo_asset,
      'primary_color',b.primary_color,
      'secondary_color',b.secondary_color,
      'accent_color',b.accent_color,
      'support_email',b.support_email,
      'website_url',b.website_url,
      'phone',b.phone
    ),
    'privacy',case
      when (
        nullif(pg_catalog.btrim(pr.controller_name),'') is not null
        and nullif(pg_catalog.btrim(pr.privacy_notice_url),'')
          ~* '^https?://[^[:space:]]+$'
        and nullif(pg_catalog.btrim(pr.notice_version),'') is not null
        and pr.effective_at<=pg_catalog.now()
      ) then pg_catalog.jsonb_build_object(
        'ready',true,
        'mode','tenant',
        'controllerName',pr.controller_name,
        'contactEmail',pr.privacy_contact_email,
        'noticeUrl',pr.privacy_notice_url,
        'noticeVersion',pr.notice_version,
        'effectiveAt',pr.effective_at
      )
      when coalesce((t.metadata->>'internal_tenant')::boolean,false) then
        pg_catalog.jsonb_build_object(
          'ready',true,
          'mode','legacy_internal',
          'controllerName',coalesce(
            b.legal_name,b.display_name,t.legal_name,'Agency'
          ),
          'contactEmail',b.support_email,
          'noticeUrl','/privacy',
          'noticeVersion','2026-09-02',
          'effectiveAt',null
        )
      else pg_catalog.jsonb_build_object(
        'ready',false,
        'mode','blocked',
        'controllerName',coalesce(
          b.legal_name,b.display_name,t.legal_name,'Agency'
        ),
        'contactEmail',b.support_email,
        'noticeUrl',null,
        'noticeVersion',null,
        'effectiveAt',null,
        'reason','agency_privacy_not_configured'
      )
    end
  )
  from public.player_invites i
  join public.players p on p.id=i.player_id
  join platform.tenants t on t.id=p.tenant_id
  left join platform.tenant_branding b on b.tenant_id=p.tenant_id
  left join platform.tenant_privacy_profiles pr on pr.tenant_id=p.tenant_id
  where i.token=p_token
  limit 1;
$function$;

create or replace function public.platform_server_complete_player_invite_acceptance(
  p_token uuid,
  p_email text,
  p_user_id uuid,
  p_notice_version text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invite public.player_invites%rowtype;
  v_player public.players%rowtype;
  v_tenant platform.tenants%rowtype;
  v_branding platform.tenant_branding%rowtype;
  v_privacy platform.tenant_privacy_profiles%rowtype;
  v_email text:=lower(trim(p_email));
  v_profile_ready boolean:=false;
  v_is_internal boolean:=false;
  v_expected_version text;
  v_controller_name text;
  v_notice_url text;
  v_notice_effective_at timestamptz;
  v_notice_mode text;
begin
  if p_token is null
    or p_user_id is null
    or v_email=''
    or nullif(trim(p_notice_version),'') is null
  then
    raise exception 'acceptance_inputs_required';
  end if;

  select * into v_invite
  from public.player_invites pi
  where pi.token=p_token
  for update;

  if not found
    or v_invite.status<>'pending'
    or v_invite.expires_at<=now()
    or lower(v_invite.email)<>v_email
  then
    raise exception 'player_invite_invalid_or_expired';
  end if;

  select * into v_player
  from public.players p
  where p.id=v_invite.player_id
  for update;

  if not found then raise exception 'invited_player_not_found'; end if;

  select * into v_tenant
  from platform.tenants t
  where t.id=v_player.tenant_id;

  if not found or v_tenant.status<>'active' then
    raise exception 'invited_tenant_not_active';
  end if;

  select * into v_branding
  from platform.tenant_branding b
  where b.tenant_id=v_player.tenant_id;

  select * into v_privacy
  from platform.tenant_privacy_profiles pr
  where pr.tenant_id=v_player.tenant_id;

  v_profile_ready:=found
    and nullif(trim(v_privacy.controller_name),'') is not null
    and nullif(trim(v_privacy.privacy_notice_url),'')
      ~* '^https?://[^[:space:]]+$'
    and nullif(trim(v_privacy.notice_version),'') is not null
    and v_privacy.effective_at<=now();

  v_is_internal:=coalesce(
    (v_tenant.metadata->>'internal_tenant')::boolean,
    false
  );

  if v_profile_ready then
    v_expected_version:=trim(v_privacy.notice_version);
    v_controller_name:=trim(v_privacy.controller_name);
    v_notice_url:=trim(v_privacy.privacy_notice_url);
    v_notice_effective_at:=v_privacy.effective_at;
    v_notice_mode:='tenant';
  elsif v_is_internal then
    v_expected_version:='2026-09-02';
    v_controller_name:=coalesce(
      v_branding.legal_name,
      v_branding.display_name,
      v_tenant.legal_name,
      'Agency'
    );
    v_notice_url:='/privacy';
    v_notice_effective_at:=null;
    v_notice_mode:='legacy_internal';
  else
    raise exception 'tenant_privacy_not_ready';
  end if;

  if trim(p_notice_version)<>v_expected_version then
    raise exception 'privacy_notice_version_mismatch';
  end if;

  if v_player.user_id is not null and v_player.user_id<>p_user_id then
    raise exception 'player_already_linked_to_another_user';
  end if;

  if exists(
    select 1 from public.players p
    where p.user_id=p_user_id and p.id<>v_player.id
  ) then
    raise exception 'auth_user_already_linked_to_another_player';
  end if;

  update public.players
  set
    user_id=p_user_id,
    onboarding_status=case
      when onboarding_status='not_started' then 'in_progress'
      else onboarding_status
    end
  where id=v_player.id;

  update public.player_invites
  set status='accepted',
      accepted_at=coalesce(p_accepted_at,now())
  where id=v_invite.id;

  update public.player_invites
  set status='revoked'
  where player_id=v_player.id
    and id<>v_invite.id
    and status='pending';

  insert into public.player_privacy_acceptances(
    player_id,user_id,notice_version,accepted_at,accepted_via,
    tenant_id,notice_controller_name,notice_url,notice_effective_at,notice_mode
  ) values (
    v_player.id,p_user_id,v_expected_version,
    coalesce(p_accepted_at,now()),'player_invite',
    v_player.tenant_id,v_controller_name,v_notice_url,
    v_notice_effective_at,v_notice_mode
  )
  on conflict(user_id,notice_version) do update set
    player_id=excluded.player_id,
    accepted_at=excluded.accepted_at,
    accepted_via=excluded.accepted_via,
    tenant_id=excluded.tenant_id,
    notice_controller_name=excluded.notice_controller_name,
    notice_url=excluded.notice_url,
    notice_effective_at=excluded.notice_effective_at,
    notice_mode=excluded.notice_mode;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  ) values (
    v_player.tenant_id,p_user_id,'user','player_portal.invite_accepted',
    'player',v_player.id::text,
    jsonb_build_object(
      'user_id',p_user_id,
      'invite_id',v_invite.id,
      'notice_version',v_expected_version,
      'notice_controller_name',v_controller_name,
      'notice_url',v_notice_url,
      'notice_mode',v_notice_mode
    ),
    jsonb_build_object(
      'player_id',v_player.id,
      'privacy_notice_version',v_expected_version
    )
  );

  return jsonb_build_object(
    'completed',true,
    'tenant_id',v_player.tenant_id,
    'player_id',v_player.id,
    'user_id',p_user_id,
    'invite_id',v_invite.id,
    'privacy_notice_version',v_expected_version,
    'privacy_notice_mode',v_notice_mode,
    'truth_contract',jsonb_build_object(
      'linkage',
      'Acceptance links exactly the player record referenced by the validated invite token.',
      'privacy',
      'The active tenant privacy notice version is validated server-side and persisted with an evidence snapshot.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_tenant_privacy_readiness(uuid)
  from public,anon,authenticated;
revoke all on function public.platform_server_owner_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;
revoke all on function public.platform_server_operator_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) from public,anon,authenticated;
revoke all on function public.platform_server_public_invite_preflight(uuid)
  from public,anon,authenticated;
revoke all on function public.platform_server_complete_player_invite_acceptance(
  uuid,text,uuid,text,timestamptz
) from public,anon,authenticated;

grant execute on function public.platform_server_tenant_privacy_readiness(uuid)
  to service_role;
grant execute on function public.platform_server_owner_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.platform_server_operator_update_privacy_profile(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.platform_server_public_invite_preflight(uuid)
  to service_role;
grant execute on function public.platform_server_complete_player_invite_acceptance(
  uuid,text,uuid,text,timestamptz
) to service_role;
