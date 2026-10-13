begin;

-- Presentation choices are separate from the player's factual record. Existing
-- free-text key_stats remain available to old profiles; new AI selections use
-- source references that the server validates before publication.
alter table public.player_cv_settings
  add column if not exists selected_stat_refs jsonb not null default '[]'::jsonb,
  add column if not exists selected_video_id uuid references public.player_videos(id) on delete set null;

alter table public.player_cv_settings
  add constraint player_cv_settings_selected_stat_refs_shape
  check (
    jsonb_typeof(selected_stat_refs) = 'array'
    and jsonb_array_length(selected_stat_refs) <= 6
  );

create or replace function private.validate_player_cv_profile_selections()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_item jsonb;
begin
  if jsonb_typeof(new.selected_stat_refs) <> 'array' then
    raise exception 'selected_stat_refs_must_be_an_array';
  end if;
  for v_item in select value from jsonb_array_elements(new.selected_stat_refs) loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'invalid_selected_stat_ref';
    end if;
    if (v_item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z][a-z0-9_]*$' then
      raise exception 'invalid_selected_stat_ref';
    end if;
  end loop;
  if new.selected_video_id is not null
     and not exists (
       select 1 from public.player_videos v
       where v.id = new.selected_video_id and v.player_id = new.player_id
     ) then
    raise exception 'selected_video_must_belong_to_player';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_player_cv_profile_selections on public.player_cv_settings;
create trigger validate_player_cv_profile_selections
before insert or update of selected_stat_refs, selected_video_id, player_id
on public.player_cv_settings
for each row execute function private.validate_player_cv_profile_selections();

-- A version is a presentation snapshot, not another player record. Drafts can
-- be edited; an approved version is immutable so a sent club link stays stable.
create table public.player_profile_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id),
  player_id uuid not null references public.players(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('general', 'club')),
  -- Target IDs are validated on write. Keeping their historical UUIDs allows
  -- target records to be erased without rewriting an approved snapshot.
  organisation_id uuid,
  source_person_id uuid,
  deal_room_id uuid,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  presentation jsonb not null default '{}'::jsonb,
  stat_sources jsonb not null default '[]'::jsonb,
  master_player_updated_at timestamptz not null,
  master_data_fingerprint text not null check (length(master_data_fingerprint) between 1 and 256),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, player_id),
  check (
    (profile_kind = 'general' and organisation_id is null and source_person_id is null and deal_room_id is null)
    or (profile_kind = 'club' and organisation_id is not null)
  ),
  check (status = 'draft' or (approved_by is not null and approved_at is not null))
);

create index player_profile_versions_player_created_idx
  on public.player_profile_versions(tenant_id, player_id, created_at desc);
create index player_profile_versions_club_idx
  on public.player_profile_versions(tenant_id, organisation_id, player_id, created_at desc)
  where profile_kind = 'club';

alter table public.player_profile_versions enable row level security;
revoke all on public.player_profile_versions from public, anon, authenticated;
grant select, insert, update, delete on public.player_profile_versions to service_role;

create or replace function private.protect_player_profile_version()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_key text;
  v_item jsonb;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    -- Allow player erasure to cascade; block ordinary deletion of an approved
    -- presentation while its master player still exists.
    if old.status = 'approved' and exists (
      select 1 from public.players p where p.id = old.player_id
    ) then
      raise exception 'approved_player_profile_version_is_immutable';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      raise exception 'approved_player_profile_version_is_immutable';
    end if;
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.player_id is distinct from old.player_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'player_profile_version_identity_is_immutable';
    end if;
    new.updated_at := now();
  end if;

  select p.tenant_id into v_tenant_id
  from public.players p where p.id = new.player_id;
  if v_tenant_id is null or v_tenant_id is distinct from new.tenant_id then
    raise exception 'player_profile_version_tenant_mismatch';
  end if;

  if new.organisation_id is not null and not exists (
    select 1 from djm_os.organisations o
    where o.id = new.organisation_id and o.tenant_id = new.tenant_id
  ) then
    raise exception 'player_profile_version_club_mismatch';
  end if;
  if new.source_person_id is not null and not exists (
    select 1 from djm_os.people pe
    where pe.id = new.source_person_id and pe.tenant_id = new.tenant_id
  ) then
    raise exception 'player_profile_version_contact_mismatch';
  end if;
  if new.deal_room_id is not null and not exists (
    select 1 from djm_os.deal_rooms d
    where d.id = new.deal_room_id
      and d.tenant_id = new.tenant_id
      and d.player_id = new.player_id
      and d.organisation_id = new.organisation_id
  ) then
    raise exception 'player_profile_version_opportunity_mismatch';
  end if;

  if jsonb_typeof(new.presentation) <> 'object'
     or length(new.presentation::text) > 120000 then
    raise exception 'invalid_player_profile_presentation';
  end if;
  if jsonb_typeof(new.stat_sources) <> 'array'
     or jsonb_array_length(new.stat_sources) > 12 then
    raise exception 'invalid_player_profile_stat_sources';
  end if;
  for v_key in select jsonb_object_keys(new.presentation) loop
    if v_key not in (
      'display_name', 'headline', 'primary_position', 'secondary_positions',
      'preferred_foot', 'age_display', 'height_display', 'nationalities',
      'current_status', 'current_club', 'key_stats', 'why_review',
      'career_summary', 'profile_photo_path', 'hero_image_path',
      'primary_video_url', 'transfermarkt_url', 'wyscout_url', 'stats_url',
      'career_timeline', 'selected_videos', 'notable_experience',
      'market_value_display', 'market_value_source_url', 'hidden_sections',
      'hide_market_value', 'contact_email', 'verified_at', 'section_order'
    ) then
      raise exception 'unsupported_player_profile_presentation_field: %', v_key;
    end if;
  end loop;
  foreach v_key in array array[
    'secondary_positions', 'nationalities', 'key_stats', 'career_timeline',
    'selected_videos', 'notable_experience', 'hidden_sections', 'section_order'
  ] loop
    if new.presentation ? v_key
       and jsonb_typeof(new.presentation -> v_key) <> 'array' then
      raise exception 'invalid_player_profile_presentation_array: %', v_key;
    end if;
  end loop;
  if new.presentation ? 'hide_market_value'
     and jsonb_typeof(new.presentation -> 'hide_market_value') <> 'boolean' then
    raise exception 'invalid_player_profile_market_value_visibility';
  end if;
  foreach v_key in array array[
    'display_name', 'headline', 'primary_position', 'preferred_foot',
    'age_display', 'height_display', 'current_status', 'current_club',
    'why_review', 'career_summary', 'profile_photo_path', 'hero_image_path',
    'primary_video_url', 'transfermarkt_url', 'wyscout_url', 'stats_url',
    'market_value_display', 'market_value_source_url', 'contact_email',
    'verified_at'
  ] loop
    if new.presentation ? v_key
       and jsonb_typeof(new.presentation -> v_key) not in ('string', 'null') then
      raise exception 'invalid_player_profile_presentation_text: %', v_key;
    end if;
  end loop;
  foreach v_key in array array[
    'secondary_positions', 'nationalities', 'notable_experience',
    'hidden_sections', 'section_order'
  ] loop
    if new.presentation ? v_key then
      for v_item in select value from jsonb_array_elements(new.presentation -> v_key) loop
        if jsonb_typeof(v_item) <> 'string' then
          raise exception 'invalid_player_profile_presentation_list_item: %', v_key;
        end if;
      end loop;
    end if;
  end loop;
  if new.presentation ? 'key_stats' then
    if jsonb_array_length(new.presentation -> 'key_stats') > 12 then
      raise exception 'too_many_player_profile_stats';
    end if;
    for v_item in select value from jsonb_array_elements(new.presentation -> 'key_stats') loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'invalid_player_profile_stat';
      end if;
      if nullif(trim(v_item ->> 'label'), '') is null
         or nullif(trim(v_item ->> 'value'), '') is null
         or exists (
           select 1 from jsonb_object_keys(v_item) k
           where k not in ('label', 'value')
         ) then
        raise exception 'invalid_player_profile_stat';
      end if;
    end loop;
  end if;
  if new.presentation ? 'selected_videos' then
    for v_item in select value from jsonb_array_elements(new.presentation -> 'selected_videos') loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'invalid_player_profile_video';
      end if;
      if exists (
           select 1 from jsonb_object_keys(v_item) k
           where k not in ('title', 'url', 'video_type')
         ) then
        raise exception 'invalid_player_profile_video';
      end if;
    end loop;
  end if;
  if new.presentation ? 'career_timeline' then
    for v_item in select value from jsonb_array_elements(new.presentation -> 'career_timeline') loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'invalid_player_profile_career_entry';
      end if;
      if exists (
           select 1 from jsonb_object_keys(v_item) k
           where k not in (
             'club_name', 'country', 'league', 'season_label', 'start_date',
             'end_date', 'appearances', 'starts', 'minutes', 'goals', 'assists',
             'source_name', 'source_url', 'source_reviewed_at', 'sort_order',
             'is_international'
           )
         ) then
        raise exception 'invalid_player_profile_career_entry';
      end if;
    end loop;
  end if;

  if new.status = 'approved' then
    if nullif(trim(new.presentation ->> 'display_name'), '') is null
       or nullif(trim(new.presentation ->> 'primary_position'), '') is null then
      raise exception 'approved_player_profile_identity_required';
    end if;
    if coalesce(jsonb_array_length(new.presentation -> 'key_stats'), 0)
       <> jsonb_array_length(new.stat_sources) then
      raise exception 'player_profile_stat_sources_required';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_player_profile_version on public.player_profile_versions;
create trigger protect_player_profile_version
before insert or update or delete on public.player_profile_versions
for each row execute function private.protect_player_profile_version();

alter table public.club_share_links
  add column if not exists profile_version_id uuid;
alter table public.club_share_links
  add constraint club_share_links_profile_version_player_fk
  foreign key (profile_version_id, player_id)
  references public.player_profile_versions(id, player_id);
create index club_share_links_profile_version_idx
  on public.club_share_links(profile_version_id)
  where profile_version_id is not null;

create or replace function private.validate_club_share_profile_version()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_version public.player_profile_versions%rowtype;
  v_tenant_id uuid;
  v_deleted_target boolean := false;
begin
  if tg_op = 'UPDATE' and old.profile_version_id is not null then
    if new.profile_version_id is distinct from old.profile_version_id
       or new.player_id is distinct from old.player_id then
      raise exception 'shared_player_profile_target_is_immutable';
    end if;
    if new.organisation_id is distinct from old.organisation_id then
      if new.organisation_id is not null or exists (
        select 1 from djm_os.organisations o where o.id = old.organisation_id
      ) then
        raise exception 'shared_player_profile_target_is_immutable';
      end if;
      v_deleted_target := true;
    end if;
    if new.source_person_id is distinct from old.source_person_id then
      if new.source_person_id is not null or exists (
        select 1 from djm_os.people pe where pe.id = old.source_person_id
      ) then
        raise exception 'shared_player_profile_target_is_immutable';
      end if;
      v_deleted_target := true;
    end if;
    if new.opportunity_id is distinct from old.opportunity_id then
      if new.opportunity_id is not null or exists (
        select 1 from djm_os.deal_rooms d where d.id = old.opportunity_id
      ) then
        raise exception 'shared_player_profile_target_is_immutable';
      end if;
      v_deleted_target := true;
    end if;
    -- Existing target FKs set their columns NULL on deletion. The link stays
    -- bound to its approved version but the public RPC will make it unavailable.
    if v_deleted_target then return new; end if;
  end if;

  if new.profile_version_id is null then return new; end if;

  select v.* into v_version
  from public.player_profile_versions v
  where v.id = new.profile_version_id
    and v.status = 'approved';
  if not found or v_version.player_id is distinct from new.player_id then
    raise exception 'approved_player_profile_version_required';
  end if;
  select p.tenant_id into v_tenant_id
  from public.players p where p.id = new.player_id;
  if v_tenant_id is null or v_version.tenant_id is distinct from v_tenant_id then
    raise exception 'shared_player_profile_tenant_mismatch';
  end if;
  if v_version.profile_kind = 'club'
     and v_version.organisation_id is distinct from new.organisation_id then
    raise exception 'shared_player_profile_club_mismatch';
  end if;
  if v_version.source_person_id is not null
     and v_version.source_person_id is distinct from new.source_person_id then
    raise exception 'shared_player_profile_contact_mismatch';
  end if;
  if v_version.deal_room_id is not null
     and v_version.deal_room_id is distinct from new.opportunity_id then
    raise exception 'shared_player_profile_opportunity_mismatch';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_club_share_profile_version on public.club_share_links;
create trigger validate_club_share_profile_version
before insert or update of profile_version_id, player_id, organisation_id,
  source_person_id, opportunity_id on public.club_share_links
for each row execute function private.validate_club_share_profile_version();

-- Keep the existing General share projection exactly as it was. A link bound
-- to an approved version returns only that approved presentation snapshot.
-- Its private source references, fingerprint and AI work are never projected.
create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'pitch_message', s.pitch_message,
    'target_club', o.name,
    'agency', jsonb_build_object(
      'display_name', b.display_name,
      'short_name', b.short_name,
      'portal_name', b.portal_name,
      'logo_asset', b.logo_asset,
      'compact_logo_asset', b.compact_logo_asset,
      'light_logo_asset', b.light_logo_asset,
      'primary_color', b.primary_color,
      'secondary_color', b.secondary_color,
      'accent_color', b.accent_color,
      'support_email', b.support_email,
      'website_url', b.website_url,
      'phone', b.phone
    ),
    'profile', case when s.profile_version_id is null then
      jsonb_build_object(
        'display_name', pp.display_name,
        'headline', pp.headline,
        'primary_position', pp.primary_position,
        'secondary_positions', pp.secondary_positions,
        'preferred_foot', pp.preferred_foot,
        'age_display', pp.age_display,
        'height_display', pp.height_display,
        'nationalities', pp.nationalities,
        'current_status', pp.current_status,
        'current_club', pp.current_club,
        'key_stats', pp.key_stats,
        'why_review', pp.why_review,
        'career_summary', pp.career_summary,
        'profile_photo_path', pp.profile_photo_path,
        'hero_image_path', pp.hero_image_path,
        'primary_video_url', pp.primary_video_url,
        'transfermarkt_url', pp.transfermarkt_url,
        'wyscout_url', pp.wyscout_url,
        'stats_url', pp.stats_url,
        'career_timeline', pp.career_timeline,
        'selected_videos', pp.selected_videos,
        'notable_experience', pp.notable_experience,
        'market_value_display', pp.market_value_display,
        'market_value_source_url', pp.market_value_source_url,
        'hidden_sections', pp.hidden_sections,
        'hide_market_value', pp.hide_market_value,
        'contact_email', pp.contact_email,
        'verified_at', pp.verified_at
      )
    else
      jsonb_build_object(
        'display_name', v.presentation -> 'display_name',
        'headline', v.presentation -> 'headline',
        'primary_position', v.presentation -> 'primary_position',
        'secondary_positions', v.presentation -> 'secondary_positions',
        'preferred_foot', v.presentation -> 'preferred_foot',
        'age_display', v.presentation -> 'age_display',
        'height_display', v.presentation -> 'height_display',
        'nationalities', v.presentation -> 'nationalities',
        'current_status', v.presentation -> 'current_status',
        'current_club', v.presentation -> 'current_club',
        'key_stats', v.presentation -> 'key_stats',
        'why_review', v.presentation -> 'why_review',
        'career_summary', v.presentation -> 'career_summary',
        'profile_photo_path', v.presentation -> 'profile_photo_path',
        'hero_image_path', v.presentation -> 'hero_image_path',
        'primary_video_url', v.presentation -> 'primary_video_url',
        'transfermarkt_url', v.presentation -> 'transfermarkt_url',
        'wyscout_url', v.presentation -> 'wyscout_url',
        'stats_url', v.presentation -> 'stats_url',
        'career_timeline', v.presentation -> 'career_timeline',
        'selected_videos', v.presentation -> 'selected_videos',
        'notable_experience', v.presentation -> 'notable_experience',
        'market_value_display', v.presentation -> 'market_value_display',
        'market_value_source_url', v.presentation -> 'market_value_source_url',
        'hidden_sections', v.presentation -> 'hidden_sections',
        'hide_market_value', v.presentation -> 'hide_market_value',
        'contact_email', v.presentation -> 'contact_email',
        'verified_at', v.presentation -> 'verified_at',
        'section_order', v.presentation -> 'section_order'
      )
    end,
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'title', d.title,
          'document_type', d.document_type,
          'created_at', d.created_at
        )
        order by d.created_at desc
      )
      from public.player_documents d
      where d.player_id = s.player_id
        and d.club_shareable = true
        and lower(trim(coalesce(d.document_type, ''))) not in (
          'passport', 'visa', 'id', 'medical', 'contract', 'agreement'
        )
    ), '[]'::jsonb)
  )
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  left join platform.tenant_branding b on b.tenant_id = p.tenant_id
  left join djm_os.organisations o
    on o.id = s.organisation_id
   and o.tenant_id = p.tenant_id
  left join public.player_profile_versions v
    on v.id = s.profile_version_id
   and v.status = 'approved'
   and v.player_id = s.player_id
   and v.tenant_id = p.tenant_id
   and (v.profile_kind = 'general' or v.organisation_id = s.organisation_id)
   and (v.source_person_id is null or v.source_person_id = s.source_person_id)
   and (v.deal_room_id is null or v.deal_room_id = s.opportunity_id)
   and (v.profile_kind = 'general' or o.id is not null)
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and (s.profile_version_id is null or v.id is not null)
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  limit 1;
$function$;

revoke all on function public.get_club_share(uuid) from public, anon, authenticated;
grant execute on function public.get_club_share(uuid) to service_role;
revoke all on function public.track_club_share_view(uuid) from public, anon, authenticated;
grant execute on function public.track_club_share_view(uuid) to service_role;

-- A deliberately narrow context feed for preparing a club presentation. It
-- supplies recorded club/need facts without relationship notes or deal terms.
create or replace function public.platform_server_player_profile_club_context(
  p_tenant_id uuid,
  p_player_id uuid,
  p_organisation_id uuid,
  p_deal_room_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_org djm_os.organisations%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_need djm_os.club_needs%rowtype;
begin
  if not exists (
    select 1 from public.players p
    where p.id = p_player_id and p.tenant_id = p_tenant_id
  ) then
    raise exception 'player_not_found_in_tenant';
  end if;

  select o.* into v_org
  from djm_os.organisations o
  where o.id = p_organisation_id and o.tenant_id = p_tenant_id;
  if not found then raise exception 'club_not_found_in_tenant'; end if;

  if p_deal_room_id is not null then
    select d.* into v_deal
    from djm_os.deal_rooms d
    where d.id = p_deal_room_id
      and d.tenant_id = p_tenant_id
      and d.player_id = p_player_id
      and d.organisation_id = p_organisation_id;
    if not found then raise exception 'opportunity_not_found_for_player_and_club'; end if;
  end if;

  -- A linked need takes precedence. Never substitute another need when a
  -- selected opportunity's linked requirement is stale or unconfirmed.
  if v_deal.club_need_id is not null then
    select n.* into v_need
    from djm_os.club_needs n
    where n.id = v_deal.club_need_id
      and n.tenant_id = p_tenant_id
      and n.organisation_id = p_organisation_id
      and n.status = 'active'
      and n.confirmed_at is not null
      and (n.expires_at is null or n.expires_at > now());
  elsif p_deal_room_id is null then
    select n.* into v_need
    from djm_os.club_needs n
    where n.tenant_id = p_tenant_id
      and n.organisation_id = p_organisation_id
      and n.status = 'active'
      and n.confirmed_at is not null
      and (n.expires_at is null or n.expires_at > now())
    order by n.confirmed_at desc, n.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'organisation', jsonb_build_object(
      'id', v_org.id,
      'name', v_org.name,
      'league_name', v_org.league_name
    ),
    'deal', case when v_deal.id is null then null else jsonb_build_object(
      'id', v_deal.id,
      'title', v_deal.title
    ) end,
    'club_need', case when v_need.id is null then null else jsonb_build_object(
      'id', v_need.id,
      'title', v_need.title,
      'position', v_need.position,
      'confirmed_at', v_need.confirmed_at,
      'expires_at', v_need.expires_at
    ) end
  );
end;
$function$;

revoke all on function public.platform_server_player_profile_club_context(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.platform_server_player_profile_club_context(uuid,uuid,uuid,uuid)
  to service_role;

-- Reuse the existing per-tenant AI permission. Preparation remains available
-- through deterministic evidence selection when AI is disabled.
create or replace function public.platform_server_player_profile_ai_access(
  p_tenant_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.user_has_staff_tenant_access(p_tenant_id, p_user_id)
    and exists (
      select 1 from djm_os.tell_djm_permissions p
      where p.tenant_id = p_tenant_id
        and p.user_id = p_user_id
        and p.is_enabled = true
        and p.permission_scope = 'full'
    )
    and exists (
      select 1 from djm_os.tell_djm_settings s
      where s.id = 1 and s.is_live = true
    );
$function$;
revoke all on function public.platform_server_player_profile_ai_access(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.platform_server_player_profile_ai_access(uuid,uuid)
  to service_role;

commit;
