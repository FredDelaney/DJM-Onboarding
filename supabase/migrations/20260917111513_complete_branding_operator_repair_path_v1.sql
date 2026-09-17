create or replace function public.platform_server_operator_update_branding(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_branding jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_branding jsonb := coalesce(p_branding,'{}'::jsonb);
  v_logo_asset text;
  v_compact_logo_asset text;
  v_light_logo_asset text;
  v_favicon_asset text;
  v_primary_color text;
  v_secondary_color text;
  v_accent_color text;
  v_after jsonb;
begin
  if pg_catalog.jsonb_typeof(v_branding)<>'object' then
    raise exception 'branding_must_be_object';
  end if;

  v_logo_asset :=
    nullif(pg_catalog.btrim(v_branding->>'logo_asset'),'');
  v_compact_logo_asset :=
    nullif(pg_catalog.btrim(v_branding->>'compact_logo_asset'),'');
  v_light_logo_asset :=
    nullif(pg_catalog.btrim(v_branding->>'light_logo_asset'),'');
  v_favicon_asset :=
    nullif(pg_catalog.btrim(v_branding->>'favicon_asset'),'');
  v_primary_color :=
    nullif(pg_catalog.btrim(v_branding->>'primary_color'),'');
  v_secondary_color :=
    nullif(pg_catalog.btrim(v_branding->>'secondary_color'),'');
  v_accent_color :=
    nullif(pg_catalog.btrim(v_branding->>'accent_color'),'');

  if v_branding ? 'logo_asset'
    and v_logo_asset is not null
    and not (
      (
        pg_catalog.left(v_logo_asset,1)='/'
        and pg_catalog.left(v_logo_asset,2)<>'//'
      )
      or pg_catalog.lower(pg_catalog.left(v_logo_asset,8))='https://'
    )
  then
    raise exception 'invalid_logo_asset';
  end if;

  if v_branding ? 'compact_logo_asset'
    and v_compact_logo_asset is not null
    and not (
      (
        pg_catalog.left(v_compact_logo_asset,1)='/'
        and pg_catalog.left(v_compact_logo_asset,2)<>'//'
      )
      or pg_catalog.lower(pg_catalog.left(v_compact_logo_asset,8))='https://'
    )
  then
    raise exception 'invalid_compact_logo_asset';
  end if;

  if v_branding ? 'light_logo_asset'
    and v_light_logo_asset is not null
    and not (
      (
        pg_catalog.left(v_light_logo_asset,1)='/'
        and pg_catalog.left(v_light_logo_asset,2)<>'//'
      )
      or pg_catalog.lower(pg_catalog.left(v_light_logo_asset,8))='https://'
    )
  then
    raise exception 'invalid_light_logo_asset';
  end if;

  if v_branding ? 'favicon_asset'
    and v_favicon_asset is not null
    and not (
      (
        pg_catalog.left(v_favicon_asset,1)='/'
        and pg_catalog.left(v_favicon_asset,2)<>'//'
      )
      or pg_catalog.lower(pg_catalog.left(v_favicon_asset,8))='https://'
    )
  then
    raise exception 'invalid_favicon_asset';
  end if;

  if v_primary_color is not null
    and v_primary_color !~* '^#[0-9a-f]{6}$'
  then
    raise exception 'invalid_primary_color';
  end if;

  if v_secondary_color is not null
    and v_secondary_color !~* '^#[0-9a-f]{6}$'
  then
    raise exception 'invalid_secondary_color';
  end if;

  if v_accent_color is not null
    and v_accent_color !~* '^#[0-9a-f]{6}$'
  then
    raise exception 'invalid_accent_color';
  end if;

  update platform.tenant_branding
  set
    display_name=coalesce(
      nullif(pg_catalog.btrim(v_branding->>'display_name'),''),
      display_name
    ),
    short_name=coalesce(
      nullif(pg_catalog.btrim(v_branding->>'short_name'),''),
      short_name
    ),
    portal_name=coalesce(
      nullif(pg_catalog.btrim(v_branding->>'portal_name'),''),
      portal_name
    ),
    logo_asset=
      case
        when v_branding ? 'logo_asset' then v_logo_asset
        else logo_asset
      end,
    compact_logo_asset=
      case
        when v_branding ? 'compact_logo_asset'
          then v_compact_logo_asset
        else compact_logo_asset
      end,
    light_logo_asset=
      case
        when v_branding ? 'light_logo_asset'
          then v_light_logo_asset
        else light_logo_asset
      end,
    favicon_asset=
      case
        when v_branding ? 'favicon_asset' then v_favicon_asset
        else favicon_asset
      end,
    primary_color=coalesce(v_primary_color,primary_color),
    secondary_color=coalesce(v_secondary_color,secondary_color),
    accent_color=coalesce(v_accent_color,accent_color),
    support_email=
      case
        when v_branding ? 'support_email'
          then nullif(
            pg_catalog.lower(
              pg_catalog.btrim(v_branding->>'support_email')
            ),
            ''
          )
        else support_email
      end,
    website_url=
      case
        when v_branding ? 'website_url'
          then nullif(
            pg_catalog.btrim(v_branding->>'website_url'),
            ''
          )
        else website_url
      end,
    updated_at=pg_catalog.now()
  where tenant_id=p_tenant_id;

  if not found then
    raise exception 'tenant_branding_not_found';
  end if;

  select pg_catalog.jsonb_build_object(
    'display_name',display_name,
    'short_name',short_name,
    'portal_name',portal_name,
    'logo_asset',logo_asset,
    'compact_logo_asset',compact_logo_asset,
    'light_logo_asset',light_logo_asset,
    'favicon_asset',favicon_asset,
    'primary_color',primary_color,
    'secondary_color',secondary_color,
    'accent_color',accent_color,
    'support_email',support_email,
    'website_url',website_url
  )
  into v_after
  from platform.tenant_branding
  where tenant_id=p_tenant_id;

  insert into platform.audit_events(
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values(
    p_tenant_id,
    p_actor_user_id,
    'user',
    'platform.branding.updated',
    'tenant_branding',
    p_tenant_id::text,
    v_after,
    pg_catalog.jsonb_build_object(
      'source',
      'platform_ops'
    )
  );

  return v_after;
end;
$function$;
