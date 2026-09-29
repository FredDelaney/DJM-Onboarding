begin;

create or replace function public.platform_server_player_profile_context(
  p_tenant_id uuid,
  p_player_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'branding',
    coalesce(
      (
        select to_jsonb(b)
        from (
          select
            tb.display_name,
            tb.short_name,
            tb.portal_name,
            tb.logo_asset,
            tb.compact_logo_asset,
            tb.primary_color,
            tb.accent_color,
            tb.support_email,
            tb.website_url,
            tb.phone
          from platform.tenant_branding tb
          where tb.tenant_id = p_tenant_id
          limit 1
        ) b
      ),
      '{}'::jsonb
    ),
    'deals',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'title', d.title,
            'organisation_id', d.organisation_id,
            'source_person_id', d.source_person_id,
            'stage', d.stage,
            'status', d.status,
            'pitch_status', d.pitch_status,
            'updated_at', d.updated_at
          )
          order by d.updated_at desc
        )
        from (
          select d.*
          from djm_os.deal_rooms d
          where d.tenant_id = p_tenant_id
            and d.player_id = p_player_id
          order by d.updated_at desc
          limit 30
        ) d
      ),
      '[]'::jsonb
    ),
    'clubs',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'country', o.country,
            'organisation_type', o.organisation_type
          )
          order by o.name
        )
        from djm_os.organisations o
        where o.tenant_id = p_tenant_id
          and (
            exists (
              select 1
              from djm_os.deal_rooms d
              where d.tenant_id = p_tenant_id
                and d.player_id = p_player_id
                and d.organisation_id = o.id
            )
            or exists (
              select 1
              from public.club_share_links s
              where s.player_id = p_player_id
                and s.organisation_id = o.id
            )
          )
      ),
      '[]'::jsonb
    )
  );
$function$;

revoke all on function public.platform_server_player_profile_context(uuid, uuid) from public;
revoke all on function public.platform_server_player_profile_context(uuid, uuid) from anon;
revoke all on function public.platform_server_player_profile_context(uuid, uuid) from authenticated;
grant execute on function public.platform_server_player_profile_context(uuid, uuid) to service_role;

commit;
