create table if not exists platform.tenant_staff_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','agent','operations','scout')),
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

create index if not exists tenant_staff_invites_tenant_idx
  on platform.tenant_staff_invites(tenant_id, created_at desc);
create index if not exists tenant_staff_invites_email_idx
  on platform.tenant_staff_invites(lower(email), created_at desc);
create index if not exists tenant_staff_invites_expiry_idx
  on platform.tenant_staff_invites(status, expires_at);
create unique index if not exists tenant_staff_invites_one_pending_idx
  on platform.tenant_staff_invites(tenant_id, lower(email))
  where status='pending';

alter table platform.tenant_staff_invites enable row level security;
revoke all on platform.tenant_staff_invites from public, anon, authenticated;

create or replace function public.platform_server_agency_team(
  p_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actor_role text;
begin
  select m.role into v_actor_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id
    and m.user_id=p_actor_user_id
    and m.status='active'
    and m.role in ('owner','admin')
  limit 1;

  if v_actor_role is null then
    raise exception 'tenant_admin_access_required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'actor_role',v_actor_role,
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,
        'role',m.role,
        'status',m.status,
        'is_primary',m.is_primary,
        'joined_at',m.joined_at,
        'email',u.email,
        'display_name',coalesce(
          nullif(trim(p.display_name),''),
          nullif(trim(u.raw_user_meta_data->>'full_name'),''),
          nullif(split_part(coalesce(u.email,''),'@',1),''),
          'Agency team member'
        )
      ) order by
        case m.role when 'owner' then 0 when 'admin' then 1 when 'operations' then 2 when 'agent' then 3 else 4 end,
        coalesce(p.display_name,u.email)
      )
      from platform.tenant_memberships m
      join auth.users u on u.id=m.user_id
      left join public.profiles p on p.id=m.user_id
      where m.tenant_id=p_tenant_id
        and m.status='active'
        and m.role in ('owner','admin','agent','operations','scout')
    ),'[]'::jsonb),
    'invites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,
        'email',i.email,
        'role',i.role,
        'status',case
          when i.status='pending' and i.expires_at<=now() then 'expired'
          else i.status
        end,
        'expires_at',i.expires_at,
        'created_at',i.created_at
      ) order by i.created_at desc)
      from platform.tenant_staff_invites i
      where i.tenant_id=p_tenant_id
        and i.status='pending'
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.platform_server_create_staff_invite(
  p_tenant_id uuid,
  p_email text,
  p_role text,
  p_actor_user_id uuid,
  p_expires_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_email text:=lower(trim(p_email));
  v_role text:=lower(trim(p_role));
  v_actor_role text;
  v_token text;
  v_token_hash text;
  v_invite platform.tenant_staff_invites%rowtype;
  v_tenant platform.tenants%rowtype;
  v_branding platform.tenant_branding%rowtype;
begin
  select m.role into v_actor_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id
    and m.user_id=p_actor_user_id
    and m.status='active'
    and m.role in ('owner','admin')
  limit 1;

  if v_actor_role is null then
    raise exception 'tenant_admin_access_required' using errcode='42501';
  end if;

  if v_role not in ('admin','agent','operations','scout') then
    raise exception 'invalid_staff_role';
  end if;

  if v_role='admin' and v_actor_role<>'owner' then
    raise exception 'owner_access_required_for_admin_invite' using errcode='42501';
  end if;

  select * into v_tenant
  from platform.tenants
  where id=p_tenant_id and status='active';

  if not found then
    raise exception 'tenant_not_available';
  end if;

  if v_email='' or length(v_email)>320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'invalid_staff_email';
  end if;

  if p_expires_hours<1 or p_expires_hours>720 then
    raise exception 'invalid_invite_expiry';
  end if;

  if exists(
    select 1
    from platform.tenant_memberships m
    join auth.users u on u.id=m.user_id
    where m.tenant_id=p_tenant_id
      and m.status='active'
      and lower(u.email)=v_email
  ) then
    raise exception 'member_already_active';
  end if;

  update platform.tenant_staff_invites
  set status='expired',updated_at=now()
  where tenant_id=p_tenant_id
    and lower(email)=v_email
    and status='pending'
    and expires_at<=now();

  update platform.tenant_staff_invites
  set status='revoked',revoked_at=now(),updated_at=now()
  where tenant_id=p_tenant_id
    and lower(email)=v_email
    and status='pending';

  v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');

  insert into platform.tenant_staff_invites(
    tenant_id,email,role,token_hash,status,expires_at,created_by,metadata
  )
  values(
    p_tenant_id,v_email,v_role,v_token_hash,'pending',
    now()+make_interval(hours=>p_expires_hours),p_actor_user_id,
    jsonb_build_object('source','agency_team_settings','version','v1')
  )
  returning * into v_invite;

  select * into v_branding
  from platform.tenant_branding
  where tenant_id=p_tenant_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  )
  values(
    p_tenant_id,p_actor_user_id,'user','agency.staff_invite.created',
    'tenant_staff_invite',v_invite.id::text,
    jsonb_build_object('email',v_email,'role',v_role,'status','pending','expires_at',v_invite.expires_at),
    jsonb_build_object('source','agency_team_settings')
  );

  return jsonb_build_object(
    'invite_id',v_invite.id,
    'tenant_id',p_tenant_id,
    'tenant_slug',v_tenant.slug,
    'agency_name',coalesce(v_branding.display_name,v_tenant.legal_name,v_tenant.slug),
    'email',v_email,
    'role',v_role,
    'status','pending',
    'expires_at',v_invite.expires_at,
    'token',v_token,
    'invite_path','/workspace/join/'||v_token
  );
end;
$function$;

create or replace function public.platform_server_revoke_staff_invite(
  p_tenant_id uuid,
  p_invite_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_role text;
  v_invite platform.tenant_staff_invites%rowtype;
begin
  select m.role into v_actor_role
  from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id
    and m.user_id=p_actor_user_id
    and m.status='active'
    and m.role in ('owner','admin')
  limit 1;

  if v_actor_role is null then
    raise exception 'tenant_admin_access_required' using errcode='42501';
  end if;

  update platform.tenant_staff_invites
  set status='revoked',revoked_at=now(),updated_at=now()
  where id=p_invite_id
    and tenant_id=p_tenant_id
    and status='pending'
  returning * into v_invite;

  if not found then
    raise exception 'pending_staff_invite_not_found';
  end if;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  )
  values(
    p_tenant_id,p_actor_user_id,'user','agency.staff_invite.revoked',
    'tenant_staff_invite',v_invite.id::text,
    jsonb_build_object('email',v_invite.email,'role',v_invite.role,'status','revoked'),
    jsonb_build_object('source','agency_team_settings')
  );

  return jsonb_build_object('invite_id',v_invite.id,'status','revoked');
end;
$function$;

create or replace function public.platform_server_update_staff_member(
  p_tenant_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_role text;
  v_target_role text;
  v_role text:=lower(trim(p_role));
begin
  if p_target_user_id=p_actor_user_id then
    raise exception 'cannot_change_own_agency_role';
  end if;

  select m.role into v_actor_role
  from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id
    and m.user_id=p_actor_user_id
    and m.status='active'
    and m.role in ('owner','admin')
  limit 1;

  if v_actor_role is null then
    raise exception 'tenant_admin_access_required' using errcode='42501';
  end if;

  select m.role into v_target_role
  from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id
    and m.user_id=p_target_user_id
    and m.status='active'
  for update;

  if v_target_role is null then
    raise exception 'active_staff_member_not_found';
  end if;

  if v_target_role='owner' then
    raise exception 'owner_role_managed_separately';
  end if;

  if v_target_role='admin' and v_actor_role<>'owner' then
    raise exception 'owner_access_required_to_manage_admin' using errcode='42501';
  end if;

  if v_role not in ('admin','agent','operations','scout') then
    raise exception 'invalid_staff_role';
  end if;

  if v_role='admin' and v_actor_role<>'owner' then
    raise exception 'owner_access_required_to_grant_admin' using errcode='42501';
  end if;

  update platform.tenant_memberships
  set role=v_role,updated_at=now()
  where tenant_id=p_tenant_id
    and user_id=p_target_user_id
    and status='active';

  perform private.platform_server_ensure_team_member(p_target_user_id);

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  )
  values(
    p_tenant_id,p_actor_user_id,'user','agency.staff_member.role_changed',
    'tenant_membership',p_target_user_id::text,
    jsonb_build_object('role',v_target_role),
    jsonb_build_object('role',v_role,'status','active'),
    jsonb_build_object('source','agency_team_settings')
  );

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'user_id',p_target_user_id,
    'role',v_role,
    'status','active'
  );
end;
$function$;

create or replace function public.platform_server_remove_staff_member(
  p_tenant_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_role text;
  v_target_role text;
begin
  if p_target_user_id=p_actor_user_id then
    raise exception 'cannot_remove_own_agency_access';
  end if;

  select m.role into v_actor_role
  from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id
    and m.user_id=p_actor_user_id
    and m.status='active'
    and m.role in ('owner','admin')
  limit 1;

  if v_actor_role is null then
    raise exception 'tenant_admin_access_required' using errcode='42501';
  end if;

  select m.role into v_target_role
  from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id
    and m.user_id=p_target_user_id
    and m.status='active'
  for update;

  if v_target_role is null then
    raise exception 'active_staff_member_not_found';
  end if;

  if v_target_role='owner' then
    raise exception 'owner_role_managed_separately';
  end if;

  if v_target_role='admin' and v_actor_role<>'owner' then
    raise exception 'owner_access_required_to_manage_admin' using errcode='42501';
  end if;

  update platform.tenant_memberships
  set status='ended',ended_at=now(),is_primary=false,updated_at=now()
  where tenant_id=p_tenant_id
    and user_id=p_target_user_id
    and status='active';

  update djm_os.team_members tm
  set
    is_active=exists(
      select 1
      from platform.tenant_memberships m
      join platform.tenants t on t.id=m.tenant_id and t.status='active'
      where m.user_id=p_target_user_id
        and m.status='active'
        and m.role in ('owner','admin','agent','operations','scout')
    ),
    updated_at=now()
  where tm.user_id=p_target_user_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  )
  values(
    p_tenant_id,p_actor_user_id,'user','agency.staff_member.removed',
    'tenant_membership',p_target_user_id::text,
    jsonb_build_object('role',v_target_role,'status','active'),
    jsonb_build_object('role',v_target_role,'status','ended'),
    jsonb_build_object('source','agency_team_settings')
  );

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'user_id',p_target_user_id,
    'role',v_target_role,
    'status','ended'
  );
end;
$function$;

create or replace function public.platform_server_public_staff_invite_preflight(
  p_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_token text:=trim(p_token);
  v_hash text;
  v_invite platform.tenant_staff_invites%rowtype;
  v_tenant platform.tenants%rowtype;
  v_branding platform.tenant_branding%rowtype;
begin
  if v_token='' or length(v_token)<>64 or v_token !~ '^[0-9a-fA-F]{64}$' then
    return null;
  end if;

  v_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');

  select * into v_invite
  from platform.tenant_staff_invites
  where token_hash=v_hash
    and status='pending'
    and expires_at>now();

  if not found then return null; end if;

  select * into v_tenant
  from platform.tenants
  where id=v_invite.tenant_id and status='active';

  if not found then return null; end if;

  select * into v_branding
  from platform.tenant_branding
  where tenant_id=v_invite.tenant_id;

  return jsonb_build_object(
    'invite_id',v_invite.id,
    'email',v_invite.email,
    'role',v_invite.role,
    'expires_at',v_invite.expires_at,
    'tenant',jsonb_build_object(
      'id',v_tenant.id,
      'slug',v_tenant.slug,
      'status',v_tenant.status
    ),
    'branding',jsonb_build_object(
      'display_name',coalesce(v_branding.display_name,v_tenant.legal_name,v_tenant.slug),
      'short_name',v_branding.short_name,
      'portal_name',v_branding.portal_name,
      'primary_color',v_branding.primary_color,
      'secondary_color',v_branding.secondary_color,
      'accent_color',v_branding.accent_color,
      'support_email',v_branding.support_email,
      'website_url',v_branding.website_url
    )
  );
end;
$function$;

create or replace function public.platform_server_complete_staff_invite(
  p_token text,
  p_email text,
  p_user_id uuid,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text:=trim(p_token);
  v_email text:=lower(trim(p_email));
  v_hash text;
  v_invite platform.tenant_staff_invites%rowtype;
  v_auth_email text;
  v_existing platform.tenant_memberships%rowtype;
  v_primary boolean:=false;
begin
  if v_token='' or length(v_token)<>64 or v_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'invalid_staff_invite';
  end if;

  v_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');

  select * into v_invite
  from platform.tenant_staff_invites
  where token_hash=v_hash
  for update;

  if not found or v_invite.status<>'pending' or v_invite.expires_at<=now() then
    raise exception 'invalid_staff_invite';
  end if;

  if lower(v_invite.email)<>v_email then
    raise exception 'staff_invite_email_mismatch';
  end if;

  select lower(email) into v_auth_email
  from auth.users
  where id=p_user_id;

  if v_auth_email is null or v_auth_email<>v_email then
    raise exception 'auth_user_email_mismatch';
  end if;

  if not exists(
    select 1 from platform.tenants
    where id=v_invite.tenant_id and status='active'
  ) then
    raise exception 'tenant_not_available';
  end if;

  select * into v_existing
  from platform.tenant_memberships
  where tenant_id=v_invite.tenant_id
    and user_id=p_user_id
  for update;

  if found and v_existing.status='active' and v_existing.role='player' then
    raise exception 'player_membership_role_conflict';
  end if;

  v_primary:=not exists(
    select 1
    from platform.tenant_memberships
    where user_id=p_user_id
      and status='active'
      and is_primary=true
  );

  insert into platform.tenant_memberships(
    tenant_id,user_id,role,status,is_primary,metadata
  )
  values(
    v_invite.tenant_id,p_user_id,v_invite.role,'active',v_primary,
    jsonb_build_object('accepted_via_staff_invite',true)
  )
  on conflict(tenant_id,user_id) do update
    set
      role=excluded.role,
      status='active',
      is_primary=case
        when platform.tenant_memberships.is_primary then true
        else excluded.is_primary
      end,
      ended_at=null,
      metadata=platform.tenant_memberships.metadata||excluded.metadata,
      updated_at=now();

  update platform.tenant_staff_invites
  set
    status='accepted',
    accepted_by=p_user_id,
    accepted_at=p_accepted_at,
    updated_at=now()
  where id=v_invite.id;

  perform private.platform_server_ensure_team_member(p_user_id);

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  )
  values(
    v_invite.tenant_id,p_user_id,'user','agency.staff_invite.accepted',
    'tenant_membership',p_user_id::text,
    jsonb_build_object('role',v_invite.role,'status','active','email',v_email),
    jsonb_build_object('source','staff_invite','invite_id',v_invite.id)
  );

  return jsonb_build_object(
    'ok',true,
    'tenant_id',v_invite.tenant_id,
    'user_id',p_user_id,
    'role',v_invite.role
  );
end;
$function$;

revoke all on function public.platform_server_agency_team(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.platform_server_create_staff_invite(uuid,text,text,uuid,integer)
  from public,anon,authenticated;
revoke all on function public.platform_server_revoke_staff_invite(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.platform_server_update_staff_member(uuid,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.platform_server_remove_staff_member(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.platform_server_public_staff_invite_preflight(text)
  from public,anon,authenticated;
revoke all on function public.platform_server_complete_staff_invite(text,text,uuid,timestamptz)
  from public,anon,authenticated;

grant execute on function public.platform_server_agency_team(uuid,uuid) to service_role;
grant execute on function public.platform_server_create_staff_invite(uuid,text,text,uuid,integer) to service_role;
grant execute on function public.platform_server_revoke_staff_invite(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_update_staff_member(uuid,uuid,text,uuid) to service_role;
grant execute on function public.platform_server_remove_staff_member(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_public_staff_invite_preflight(text) to service_role;
grant execute on function public.platform_server_complete_staff_invite(text,text,uuid,timestamptz) to service_role;
