create or replace function public.platform_server_public_invite_preflight(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, platform, pg_catalog
as $function$
  select jsonb_build_object(
    'valid', (i.status = 'pending' and i.expires_at > now()),
    'email', i.email,
    'expires_at', i.expires_at,
    'full_name', coalesce(
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), ''),
      nullif(pg_catalog.btrim(p.preferred_name), ''),
      'Player'
    ),
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
    )
  )
  from public.player_invites i
  join public.players p on p.id = i.player_id
  left join platform.tenant_branding b on b.tenant_id = p.tenant_id
  where i.token = p_token
  limit 1;
$function$;

revoke all on function public.platform_server_public_invite_preflight(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_public_invite_preflight(uuid) to service_role;;
