create or replace function public.platform_server_player_workspaces(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'available',true,
  'user_id',p_user_id,
  'workspaces',coalesce(jsonb_agg(jsonb_build_object(
    'tenant_id',p.tenant_id,
    'tenant_slug',t.slug,
    'portal_hostname',(select d.hostname from platform.tenant_domains d
      where d.tenant_id=p.tenant_id and d.status='verified'
      order by d.is_primary desc,d.created_at,d.id limit 1),
    'player_id',p.id,
    'player_name',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player'),
    'football_status',p.football_status,
    'agency',jsonb_build_object(
      'display_name',coalesce(b.portal_name,b.display_name,t.slug),
      'short_name',b.short_name,
      'logo_asset',b.logo_asset,
      'compact_logo_asset',b.compact_logo_asset,
      'primary_color',b.primary_color,
      'secondary_color',b.secondary_color,
      'accent_color',b.accent_color,
      'support_email',b.support_email,
      'website_url',b.website_url
    )
  ) order by coalesce(b.portal_name,b.display_name,t.slug)) filter(where p.id is not null),'[]'::jsonb)
)
from public.players p
join platform.tenants t on t.id=p.tenant_id and t.status='active'
left join platform.tenant_branding b on b.tenant_id=p.tenant_id
where p.user_id=p_user_id and p.archived_at is null and p.football_status<>'retired';$$;
revoke all on function public.platform_server_player_workspaces(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_workspaces(uuid) to service_role;
notify pgrst,'reload schema';
