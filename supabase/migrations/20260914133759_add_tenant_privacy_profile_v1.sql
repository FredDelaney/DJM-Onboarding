create table if not exists platform.tenant_privacy_profiles (
  tenant_id uuid primary key
    references platform.tenants(id)
    on delete cascade,

  controller_name text not null,
  privacy_contact_email text,
  privacy_notice_url text,
  notice_version text not null,
  effective_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenant_privacy_profiles_controller_name_check
    check (
      char_length(pg_catalog.btrim(controller_name)) between 2 and 200
    ),

  constraint tenant_privacy_profiles_contact_email_check
    check (
      privacy_contact_email is null
      or (
        char_length(pg_catalog.btrim(privacy_contact_email)) between 3 and 320
        and pg_catalog.strpos(privacy_contact_email, '@') > 1
      )
    ),

  constraint tenant_privacy_profiles_notice_url_check
    check (
      privacy_notice_url is null
      or privacy_notice_url ~* '^https?://'
    ),

  constraint tenant_privacy_profiles_notice_version_check
    check (
      char_length(pg_catalog.btrim(notice_version)) between 1 and 100
    )
);

comment on table platform.tenant_privacy_profiles is
  'Tenant-configured privacy/controller profile. This stores configured identity and notice details and does not itself determine legal controller status.';

comment on column platform.tenant_privacy_profiles.controller_name is
  'Controller identity configured for this tenant privacy notice.';

alter table platform.tenant_privacy_profiles
  enable row level security;

revoke all privileges
  on table platform.tenant_privacy_profiles
  from public, anon, authenticated, service_role;

drop trigger if exists tenant_privacy_profiles_touch_updated_at
  on platform.tenant_privacy_profiles;

create trigger tenant_privacy_profiles_touch_updated_at
before update on platform.tenant_privacy_profiles
for each row
execute function platform.touch_updated_at();

create or replace function public.platform_server_public_invite_preflight(
  p_token uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'valid', (
      i.status = 'pending'
      and i.expires_at > pg_catalog.now()
    ),

    'email', i.email,

    'expires_at', i.expires_at,

    'full_name', coalesce(
      nullif(
        pg_catalog.btrim(
          pg_catalog.concat_ws(' ', p.first_name, p.last_name)
        ),
        ''
      ),
      nullif(pg_catalog.btrim(p.preferred_name), ''),
      'Player'
    ),

    'agency', pg_catalog.jsonb_build_object(
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

    'privacy',
    case
      when pr.tenant_id is null then null
      else pg_catalog.jsonb_build_object(
        'controllerName', pr.controller_name,
        'contactEmail', pr.privacy_contact_email,
        'noticeUrl', pr.privacy_notice_url,
        'noticeVersion', pr.notice_version,
        'effectiveAt', pr.effective_at
      )
    end
  )
  from public.player_invites i
  join public.players p
    on p.id = i.player_id
  left join platform.tenant_branding b
    on b.tenant_id = p.tenant_id
  left join platform.tenant_privacy_profiles pr
    on pr.tenant_id = p.tenant_id
  where i.token = p_token
  limit 1;
$function$;

revoke all
  on function public.platform_server_public_invite_preflight(uuid)
  from public;

revoke execute
  on function public.platform_server_public_invite_preflight(uuid)
  from anon, authenticated;

grant execute
  on function public.platform_server_public_invite_preflight(uuid)
  to service_role;
