-- Tenant parity: DJM uses the same tenant privacy and invitation rules as every agency.
-- DJM-specific values below are tenant configuration only, never product behaviour.

do $$
declare
  v_tenant_id uuid;
begin
  select t.id into v_tenant_id
  from platform.tenants t
  where t.slug='djm-sports-management'
    and t.status='active'
  limit 1;

  if v_tenant_id is null then
    raise exception 'DJM tenant not found';
  end if;

  insert into platform.tenant_privacy_notice_versions(
    tenant_id,
    notice_version,
    controller_name,
    privacy_contact_email,
    privacy_notice_url,
    effective_at,
    created_by
  )
  values(
    v_tenant_id,
    '2026-09-02',
    'DJM Sports Management',
    'jesse.edge@djmsports.com',
    'https://app.djmsports.com/privacy',
    '2026-09-02 00:00:00+00'::timestamptz,
    null
  )
  on conflict(tenant_id,notice_version) do update set
    controller_name=excluded.controller_name,
    privacy_contact_email=excluded.privacy_contact_email,
    privacy_notice_url=excluded.privacy_notice_url,
    effective_at=excluded.effective_at;

  insert into platform.tenant_privacy_profiles(
    tenant_id,
    controller_name,
    privacy_contact_email,
    privacy_notice_url,
    notice_version,
    effective_at
  )
  values(
    v_tenant_id,
    'DJM Sports Management',
    'jesse.edge@djmsports.com',
    'https://app.djmsports.com/privacy',
    '2026-09-02',
    '2026-09-02 00:00:00+00'::timestamptz
  )
  on conflict(tenant_id) do update set
    controller_name=excluded.controller_name,
    privacy_contact_email=excluded.privacy_contact_email,
    privacy_notice_url=excluded.privacy_notice_url,
    notice_version=excluded.notice_version,
    effective_at=excluded.effective_at,
    updated_at=now();

  insert into platform.tenant_onboarding_tasks(
    tenant_id,
    task_key,
    category,
    title,
    description,
    required,
    sort_order,
    status,
    completed_at,
    blocked_reason
  )
  values(
    v_tenant_id,
    'privacy_profile',
    'privacy',
    'Configure privacy profile',
    'Set the agency privacy controller identity and the current player-facing privacy notice.',
    true,
    35,
    'complete',
    now(),
    null
  )
  on conflict(tenant_id,task_key) do update set
    category=excluded.category,
    title=excluded.title,
    description=excluded.description,
    required=excluded.required,
    sort_order=excluded.sort_order,
    status='complete',
    completed_at=coalesce(platform.tenant_onboarding_tasks.completed_at,now()),
    blocked_reason=null,
    updated_at=now();
end
$$;

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
      and nullif(pg_catalog.btrim(pr.controller_name),'') is not null
      and nullif(pg_catalog.btrim(pr.privacy_notice_url),'')
        ~* '^https?://[^[:space:]]+$'
      and nullif(pg_catalog.btrim(pr.notice_version),'') is not null
      and pr.effective_at<=pg_catalog.now()
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
  v_privacy platform.tenant_privacy_profiles%rowtype;
  v_email text:=lower(trim(p_email));
  v_profile_ready boolean:=false;
  v_expected_version text;
  v_controller_name text;
  v_notice_url text;
  v_notice_effective_at timestamptz;
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

  select * into v_privacy
  from platform.tenant_privacy_profiles pr
  where pr.tenant_id=v_player.tenant_id;

  v_profile_ready:=found
    and nullif(trim(v_privacy.controller_name),'') is not null
    and nullif(trim(v_privacy.privacy_notice_url),'')
      ~* '^https?://[^[:space:]]+$'
    and nullif(trim(v_privacy.notice_version),'') is not null
    and v_privacy.effective_at<=now();

  if not v_profile_ready then
    raise exception 'tenant_privacy_not_ready';
  end if;

  v_expected_version:=trim(v_privacy.notice_version);
  v_controller_name:=trim(v_privacy.controller_name);
  v_notice_url:=trim(v_privacy.privacy_notice_url);
  v_notice_effective_at:=v_privacy.effective_at;

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
    v_notice_effective_at,'tenant'
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
      'notice_mode','tenant'
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
    'privacy_notice_mode','tenant',
    'truth_contract',jsonb_build_object(
      'linkage',
      'Acceptance links exactly the player record referenced by the validated invite token.',
      'privacy',
      'The active tenant privacy notice version is validated server-side and persisted with an evidence snapshot.'
    )
  );
end;
$function$;

create or replace function public.create_player_invitation(
  invite_email text,
  player_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(trim(invite_email));
  v_name text := trim(coalesce(player_name,''));
  v_first text;
  v_last text;
  v_player_id uuid;
  v_token uuid;
  v_existing_user uuid;
  v_tenant uuid;
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_tenant:=private.redream_request_tenant();

  if not private.user_is_tenant_admin(v_tenant,v_uid) then
    raise exception 'Tenant owner or admin access required';
  end if;

  if not coalesce(
    (
      public.platform_server_tenant_privacy_readiness(v_tenant)
      ->>'ready_for_player_invites'
    )::boolean,
    false
  ) then
    raise exception 'tenant_privacy_not_ready';
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'A valid player email is required';
  end if;

  select p.user_id,p.id into v_existing_user,v_player_id
  from public.players p
  join public.player_private pr on pr.player_id=p.id
  where p.tenant_id=v_tenant and lower(pr.personal_email)=v_email
  order by p.created_at desc
  limit 1;

  if v_existing_user is not null then
    raise exception 'This player already has an account';
  end if;

  select pi.token,pi.player_id into v_token,v_player_id
  from public.player_invites pi
  join public.players p on p.id=pi.player_id and p.tenant_id=v_tenant
  where lower(pi.email)=v_email
    and pi.status='pending'
    and pi.expires_at>now()
  order by pi.created_at desc
  limit 1;

  if v_token is not null then
    return jsonb_build_object(
      'token',v_token,
      'player_id',v_player_id,
      'existing',true,
      'tenant_id',v_tenant
    );
  end if;

  if v_player_id is null then
    v_first:=nullif(split_part(v_name,' ',1),'');
    v_last:=nullif(trim(substr(v_name,length(coalesce(v_first,''))+1)),'');
    insert into public.players(
      first_name,last_name,preferred_name,onboarding_status,agency_priority,tenant_id
    )
    values(
      v_first,
      v_last,
      coalesce(v_first,split_part(v_email,'@',1)),
      'not_started',
      'normal',
      v_tenant
    )
    returning id into v_player_id;

    insert into public.player_private(player_id,personal_email)
    values(v_player_id,v_email);

    insert into public.player_cv_settings(player_id)
    values(v_player_id)
    on conflict(player_id) do nothing;
  end if;

  insert into public.player_invites(email,player_id,invited_by)
  values(v_email,v_player_id,v_uid)
  returning token into v_token;

  return jsonb_build_object(
    'token',v_token,
    'player_id',v_player_id,
    'existing',false,
    'tenant_id',v_tenant
  );
end;
$function$;
