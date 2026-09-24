-- Tenant parity: make player-domain authorisation agency-scoped.
-- Legacy djm_os tables remain physical compatibility storage only.

create or replace function private.user_is_player_tenant_admin(
  p_player_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.players p
    where p.id=p_player_id
      and private.user_is_tenant_admin(p.tenant_id,p_user_id)
  );
$$;

revoke all on function private.user_is_player_tenant_admin(uuid,uuid) from public;
grant execute on function private.user_is_player_tenant_admin(uuid,uuid)
  to authenticated,service_role;

create or replace function private.can_view_sensitive_player(
  target_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.user_is_player_tenant_admin(target_player_id)
    or exists (
      select 1
      from public.players p
      where p.id=target_player_id
        and p.user_id=auth.uid()
    )
    or (
      private.can_staff_view_player(target_player_id)
      and exists (
        select 1
        from public.staff_player_access a
        where a.player_id=target_player_id
          and a.staff_user_id=auth.uid()
          and a.can_edit=true
      )
    );
$$;

revoke all on function private.can_view_sensitive_player(uuid) from public;
grant execute on function private.can_view_sensitive_player(uuid)
  to authenticated,service_role;

-- Agreements
drop policy if exists "admins delete agreements" on public.player_agreements;
drop policy if exists "admins insert agreements" on public.player_agreements;
drop policy if exists "admins update agreements" on public.player_agreements;
drop policy if exists "agreements view" on public.player_agreements;
drop policy if exists "tenant admins delete agreements" on public.player_agreements;
drop policy if exists "tenant admins insert agreements" on public.player_agreements;
drop policy if exists "tenant admins update agreements" on public.player_agreements;
drop policy if exists "agreements tenant aware view" on public.player_agreements;

create policy "tenant admins delete agreements"
on public.player_agreements
for delete to authenticated
using (private.user_is_player_tenant_admin(player_id));

create policy "tenant admins insert agreements"
on public.player_agreements
for insert to authenticated
with check (private.user_is_player_tenant_admin(player_id));

create policy "tenant admins update agreements"
on public.player_agreements
for update to authenticated
using (private.user_is_player_tenant_admin(player_id))
with check (private.user_is_player_tenant_admin(player_id));

create policy "agreements tenant aware view"
on public.player_agreements
for select to authenticated
using (
  private.user_is_player_tenant_admin(player_id)
  or (
    visible_to_player
    and exists (
      select 1
      from public.players p
      where p.id=player_agreements.player_id
        and p.user_id=auth.uid()
    )
  )
);

-- Player invitations
drop policy if exists "admins delete invites" on public.player_invites;
drop policy if exists "admins insert invites" on public.player_invites;
drop policy if exists "admins read invites" on public.player_invites;
drop policy if exists "admins update invites" on public.player_invites;
drop policy if exists "tenant admins delete invites" on public.player_invites;
drop policy if exists "tenant admins insert invites" on public.player_invites;
drop policy if exists "tenant admins read invites" on public.player_invites;
drop policy if exists "tenant admins update invites" on public.player_invites;

create policy "tenant admins delete invites"
on public.player_invites
for delete to authenticated
using (
  player_id is not null
  and private.user_is_player_tenant_admin(player_id)
);

create policy "tenant admins insert invites"
on public.player_invites
for insert to authenticated
with check (
  player_id is not null
  and private.user_is_player_tenant_admin(player_id)
);

create policy "tenant admins read invites"
on public.player_invites
for select to authenticated
using (
  player_id is not null
  and private.user_is_player_tenant_admin(player_id)
);

create policy "tenant admins update invites"
on public.player_invites
for update to authenticated
using (
  player_id is not null
  and private.user_is_player_tenant_admin(player_id)
)
with check (
  player_id is not null
  and private.user_is_player_tenant_admin(player_id)
);

-- Public player profiles. Published anonymous read remains unchanged.
drop policy if exists "admins delete public profiles" on public.player_public_profiles;
drop policy if exists "admins insert public profiles" on public.player_public_profiles;
drop policy if exists "admins update public profiles" on public.player_public_profiles;
drop policy if exists "tenant admins delete public profiles" on public.player_public_profiles;
drop policy if exists "tenant admins insert public profiles" on public.player_public_profiles;
drop policy if exists "tenant admins update public profiles" on public.player_public_profiles;

create policy "tenant admins delete public profiles"
on public.player_public_profiles
for delete to authenticated
using (private.user_is_player_tenant_admin(player_id));

create policy "tenant admins insert public profiles"
on public.player_public_profiles
for insert to authenticated
with check (private.user_is_player_tenant_admin(player_id));

create policy "tenant admins update public profiles"
on public.player_public_profiles
for update to authenticated
using (private.user_is_player_tenant_admin(player_id))
with check (private.user_is_player_tenant_admin(player_id));

-- Player requests
drop policy if exists "admins delete requests" on public.player_requests;
drop policy if exists "requests insert" on public.player_requests;
drop policy if exists "requests update" on public.player_requests;
drop policy if exists "requests view" on public.player_requests;
drop policy if exists "tenant admins delete requests" on public.player_requests;
drop policy if exists "requests tenant aware insert" on public.player_requests;
drop policy if exists "requests tenant aware update" on public.player_requests;
drop policy if exists "requests tenant aware view" on public.player_requests;

create policy "tenant admins delete requests"
on public.player_requests
for delete to authenticated
using (private.user_is_player_tenant_admin(player_id));

create policy "requests tenant aware insert"
on public.player_requests
for insert to authenticated
with check (
  private.user_is_player_tenant_admin(player_id)
  or (
    request_type='message'
    and status='open'
    and due_at is null
    and created_by is null
    and completed_at is null
    and message is null
    and player_reply is not null
    and exists (
      select 1
      from public.players p
      where p.id=player_requests.player_id
        and p.user_id=auth.uid()
    )
  )
);

create policy "requests tenant aware update"
on public.player_requests
for update to authenticated
using (
  private.user_is_player_tenant_admin(player_id)
  or (
    request_type not in ('message','signal')
    and private.can_view_sensitive_player(player_id)
  )
)
with check (
  private.user_is_player_tenant_admin(player_id)
  or (
    request_type not in ('message','signal')
    and private.can_view_sensitive_player(player_id)
  )
);

create policy "requests tenant aware view"
on public.player_requests
for select to authenticated
using (
  private.user_is_player_tenant_admin(player_id)
  or (
    request_type<>'signal'
    and private.can_view_sensitive_player(player_id)
  )
);

-- Staff-to-player access
drop policy if exists "admins delete staff access" on public.staff_player_access;
drop policy if exists "admins insert staff access" on public.staff_player_access;
drop policy if exists "admins update staff access" on public.staff_player_access;
drop policy if exists "staff can read own access" on public.staff_player_access;
drop policy if exists "tenant admins delete staff access" on public.staff_player_access;
drop policy if exists "tenant admins insert staff access" on public.staff_player_access;
drop policy if exists "tenant admins update staff access" on public.staff_player_access;

create policy "tenant admins delete staff access"
on public.staff_player_access
for delete to authenticated
using (private.user_is_player_tenant_admin(player_id));

create policy "tenant admins insert staff access"
on public.staff_player_access
for insert to authenticated
with check (
  private.user_is_player_tenant_admin(player_id)
  and private.user_has_staff_tenant_access(
    (select p.tenant_id from public.players p where p.id=player_id),
    staff_user_id
  )
);

create policy "tenant admins update staff access"
on public.staff_player_access
for update to authenticated
using (private.user_is_player_tenant_admin(player_id))
with check (
  private.user_is_player_tenant_admin(player_id)
  and private.user_has_staff_tenant_access(
    (select p.tenant_id from public.players p where p.id=player_id),
    staff_user_id
  )
);

create policy "staff can read own access"
on public.staff_player_access
for select to authenticated
using (
  staff_user_id=auth.uid()
  or private.user_is_player_tenant_admin(player_id)
);

-- A public profile always uses the owning tenant's configured support contact.
create or replace function private.enforce_public_profile_tenant_contact()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant_id uuid;
  v_support_email text;
begin
  select p.tenant_id
  into v_tenant_id
  from public.players p
  where p.id=new.player_id;

  if v_tenant_id is null then
    raise exception 'player_not_found';
  end if;

  select nullif(trim(b.support_email),'')
  into v_support_email
  from platform.tenant_branding b
  where b.tenant_id=v_tenant_id;

  if v_support_email is null then
    raise exception 'tenant_support_email_required';
  end if;

  if lower(trim(coalesce(new.contact_email,'')))<>lower(v_support_email) then
    raise exception 'tenant_contact_email_must_match_brand';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_public_profile_tenant_contact() from public;

-- Club-share approval is controlled by the player's tenant admins.
create or replace function private.protect_document_club_share_approval()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player_id uuid;
begin
  v_player_id:=case
    when tg_op='INSERT' then new.player_id
    else old.player_id
  end;

  if tg_op='INSERT' then
    if coalesce(new.club_shareable,false)
       and not private.user_is_player_tenant_admin(v_player_id)
       and coalesce(auth.jwt()->>'role','')<>'service_role' then
      raise exception 'Only agency owners or admins can approve documents for club sharing';
    end if;
  elsif tg_op='UPDATE' then
    if new.club_shareable is distinct from old.club_shareable
       and not private.user_is_player_tenant_admin(v_player_id)
       and coalesce(auth.jwt()->>'role','')<>'service_role' then
      raise exception 'Only agency owners or admins can change club sharing approval';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_document_club_share_approval() from public;

-- Player request protection follows the player's agency, not a global admin role.
create or replace function private.protect_player_request_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.user_is_player_tenant_admin(old.player_id) then
    if new.id is distinct from old.id
       or new.player_id is distinct from old.player_id
       or new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.request_type is distinct from old.request_type
       or new.due_at is distinct from old.due_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change agency request fields';
    end if;

    if new.status is distinct from old.status
       and new.status<>'completed' then
      raise exception 'Players may only complete an agency request';
    end if;

    if new.completed_at is distinct from old.completed_at
       and not (
         new.status='completed'
         and old.status is distinct from 'completed'
       ) then
      raise exception 'Completion time is managed by the player workspace';
    end if;
  end if;

  new.updated_at:=now();

  if new.status='completed'
     and old.status is distinct from 'completed' then
    new.completed_at:=now();
  end if;

  return new;
end;
$$;

revoke all on function private.protect_player_request_fields() from public;

-- System-owned player fields are editable only by admins of that player's tenant.
create or replace function private.protect_player_system_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is not null
     and not private.user_is_tenant_admin(old.tenant_id) then
    if new.current_competition_id is distinct from old.current_competition_id
       or new.current_season_label is distinct from old.current_season_label
       or new.current_season_start is distinct from old.current_season_start
       or new.football_provider_ids is distinct from old.football_provider_ids
       or new.transfermarkt_market_value is distinct from old.transfermarkt_market_value
       or new.transfermarkt_market_value_currency is distinct from old.transfermarkt_market_value_currency
       or new.transfermarkt_value_verified_at is distinct from old.transfermarkt_value_verified_at then
      raise exception 'Not permitted to change system-owned player fields';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_player_system_fields() from public;

-- Protected public-profile fields follow the player's tenant admin membership.
create or replace function private.protect_public_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  safety_unpublish boolean;
  v_mode text:=coalesce(
    pg_catalog.current_setting('djm.internal_tenant_dossier_mode',true),
    ''
  );
  v_tenant_setting text:=coalesce(
    pg_catalog.current_setting('djm.internal_tenant_dossier_tenant',true),
    ''
  );
  v_row_tenant uuid;
begin
  if v_mode in ('draft_edit','publish','unpublish') then
    select p.tenant_id
    into v_row_tenant
    from public.players p
    where p.id=old.player_id;

    if v_row_tenant is null
       or v_tenant_setting=''
       or v_row_tenant::text<>v_tenant_setting then
      raise exception 'Tenant dossier write context mismatch';
    end if;

    if v_mode='draft_edit' then
      if (
        to_jsonb(new)-array[
          'headline','why_review','career_summary','profile_photo_path',
          'hero_image_path','primary_video_url','selected_videos',
          'notable_experience','market_value_display',
          'market_value_source_url','hidden_sections','hide_market_value',
          'contact_email','updated_at'
        ]::text[]
      ) is distinct from (
        to_jsonb(old)-array[
          'headline','why_review','career_summary','profile_photo_path',
          'hero_image_path','primary_video_url','selected_videos',
          'notable_experience','market_value_display',
          'market_value_source_url','hidden_sections','hide_market_value',
          'contact_email','updated_at'
        ]::text[]
      ) then
        raise exception 'Tenant dossier draft edit attempted an unexpected field change';
      end if;

      if old.published or new.published then
        raise exception 'unpublish_before_edit';
      end if;

      return new;
    elsif v_mode='publish' then
      if (
        to_jsonb(new)-array[
          'published','published_at','verified_at','contact_email','updated_at'
        ]::text[]
      ) is distinct from (
        to_jsonb(old)-array[
          'published','published_at','verified_at','contact_email','updated_at'
        ]::text[]
      ) then
        raise exception 'Tenant dossier publish attempted an unexpected field change';
      end if;

      return new;
    elsif v_mode='unpublish' then
      if (
        to_jsonb(new)-array['published','updated_at']::text[]
      ) is distinct from (
        to_jsonb(old)-array['published','updated_at']::text[]
      ) then
        raise exception 'Tenant dossier unpublish attempted an unexpected field change';
      end if;

      return new;
    end if;
  end if;

  if not private.user_is_player_tenant_admin(old.player_id) then
    safety_unpublish:=(
      old.published=true
      and new.published=false
      and new.player_id is not distinct from old.player_id
      and new.public_slug is not distinct from old.public_slug
      and new.published_at is not distinct from old.published_at
      and new.contact_email is not distinct from old.contact_email
      and new.market_value_display is not distinct from old.market_value_display
      and new.market_value_source_url is not distinct from old.market_value_source_url
      and new.hidden_sections is not distinct from old.hidden_sections
      and new.hide_market_value is not distinct from old.hide_market_value
      and new.verified_at is not distinct from old.verified_at
    );

    if not safety_unpublish and (
      new.player_id is distinct from old.player_id
      or new.public_slug is distinct from old.public_slug
      or new.published is distinct from old.published
      or new.published_at is distinct from old.published_at
      or new.contact_email is distinct from old.contact_email
      or new.market_value_display is distinct from old.market_value_display
      or new.market_value_source_url is distinct from old.market_value_source_url
      or new.hidden_sections is distinct from old.hidden_sections
      or new.hide_market_value is distinct from old.hide_market_value
      or new.verified_at is distinct from old.verified_at
    ) then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_public_profile_admin_fields() from public;

-- Core player protected fields use the row tenant, not public.profiles.role.
create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  internal_player_service boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_player_service',true),'')='on';
  internal_user_link boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_user_link',true),'')='on';
  internal_career_change boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_career_change',true),'')='on';
  internal_demo_verification boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_demo_verification',true),'')='on';
  tenant_admin boolean:=private.user_is_tenant_admin(old.tenant_id);
begin
  if internal_demo_verification then
    if not exists(
      select 1
      from platform.tenants t
      where t.id=old.tenant_id
        and coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false)=true
    ) then
      raise exception 'Synthetic demo verification maintenance is restricted to synthetic tenants';
    end if;

    if (
      to_jsonb(new)-array['verified_at','updated_at']::text[]
    ) is distinct from (
      to_jsonb(old)-array['verified_at','updated_at']::text[]
    ) then
      raise exception 'Synthetic demo verification maintenance attempted an unexpected player-field change';
    end if;

    if old.verification_status<>'verified'
       or new.verification_status<>'verified'
       or new.verified_at is null then
      raise exception 'Synthetic demo verification maintenance may only complete a missing verified_at timestamp';
    end if;

    return new;
  end if;

  if internal_player_service then
    if (
      to_jsonb(new)-array['next_action','next_action_due','updated_at']::text[]
    ) is distinct from (
      to_jsonb(old)-array['next_action','next_action_due','updated_at']::text[]
    ) then
      raise exception 'Internal player service write attempted an unexpected player-field change';
    end if;

    return new;
  end if;

  if internal_career_change then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.preferred_name is distinct from old.preferred_name
       or new.date_of_birth is distinct from old.date_of_birth
       or new.nationalities is distinct from old.nationalities
       or new.height_cm is distinct from old.height_cm
       or new.preferred_foot is distinct from old.preferred_foot
       or new.primary_position is distinct from old.primary_position
       or new.secondary_positions is distinct from old.secondary_positions
       or new.current_club is distinct from old.current_club
       or new.current_league is distinct from old.current_league
       or new.current_country is distinct from old.current_country
       or new.contract_status is distinct from old.contract_status
       or new.contract_expiry is distinct from old.contract_expiry
       or new.football_status is distinct from old.football_status
       or new.transfermarkt_url is distinct from old.transfermarkt_url
       or new.wyscout_url is distinct from old.wyscout_url
       or new.stats_url is distinct from old.stats_url
       or new.instagram_url is distinct from old.instagram_url
       or new.profile_photo_path is distinct from old.profile_photo_path
       or new.onboarding_status is distinct from old.onboarding_status
       or new.created_at is distinct from old.created_at
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.current_season_label is distinct from old.current_season_label
       or new.current_season_start is distinct from old.current_season_start then
      raise exception 'Internal career review attempted an unexpected player-field change';
    end if;

    return new;
  end if;

  if internal_user_link then
    if new.id is distinct from old.id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at
       or (old.user_id is not null and new.user_id is distinct from old.user_id)
       or (
         new.onboarding_status is distinct from old.onboarding_status
         and not (
           old.onboarding_status='not_started'
           and new.onboarding_status='in_progress'
         )
       ) then
      raise exception 'Internal player link attempted an unexpected protected-field change';
    end if;

    return new;
  end if;

  if not tenant_admin then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected player fields';
    end if;
  end if;

  if old.verification_status='verified' and (
    new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.preferred_name is distinct from old.preferred_name
    or new.date_of_birth is distinct from old.date_of_birth
    or new.nationalities is distinct from old.nationalities
    or new.height_cm is distinct from old.height_cm
    or new.preferred_foot is distinct from old.preferred_foot
    or new.primary_position is distinct from old.primary_position
    or new.secondary_positions is distinct from old.secondary_positions
    or new.current_club is distinct from old.current_club
    or new.current_league is distinct from old.current_league
    or new.current_country is distinct from old.current_country
    or new.contract_status is distinct from old.contract_status
    or new.contract_expiry is distinct from old.contract_expiry
    or new.football_status is distinct from old.football_status
    or new.transfermarkt_url is distinct from old.transfermarkt_url
    or new.wyscout_url is distinct from old.wyscout_url
    or new.stats_url is distinct from old.stats_url
    or new.profile_photo_path is distinct from old.profile_photo_path
  ) then
    new.verification_status:='reviewing';
    new.verified_at:=null;
    new.review_required_at:=pg_catalog.now();
    new.review_reason:=case
      when tenant_admin then 'Agency updated verified football information'
      else 'Player updated verified football information'
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_player_admin_fields() from public;

-- djm_os.team_members remains a legacy user identity registry for old foreign keys.
-- It no longer decides whether somebody is authorised for an agency.
create or replace function private.platform_server_ensure_team_member(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_display_name text;
begin
  if p_user_id is null then
    raise exception 'actor_user_id_required';
  end if;

  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id=m.tenant_id
     and t.status='active'
    where m.user_id=p_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_membership_required';
  end if;

  select coalesce(
    nullif(trim(p.display_name),''),
    nullif(trim(p.email),''),
    'Agency team member'
  )
  into v_display_name
  from public.profiles p
  where p.id=p_user_id;

  if v_display_name is null then
    select coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'),''),
      nullif(trim(u.email),''),
      'Agency team member'
    )
    into v_display_name
    from auth.users u
    where u.id=p_user_id;
  end if;

  insert into djm_os.team_members(
    user_id,
    display_name,
    is_active
  )
  values(
    p_user_id,
    coalesce(v_display_name,'Agency team member'),
    true
  )
  on conflict(user_id)
  do update set
    display_name=coalesce(
      nullif(trim(excluded.display_name),''),
      djm_os.team_members.display_name
    ),
    is_active=true,
    updated_at=now();
end;
$$;

revoke all on function private.platform_server_ensure_team_member(uuid) from public;

create or replace function djm_os.validate_player_primary_staff()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.primary_staff_user_id is not null
     and (
       new.tenant_id is null
       or not private.user_has_staff_tenant_access(
         new.tenant_id,
         new.primary_staff_user_id
       )
     ) then
    raise exception 'Assigned player owner must be active staff in this tenant';
  end if;

  return new;
end;
$$;

revoke all on function djm_os.validate_player_primary_staff() from public;
