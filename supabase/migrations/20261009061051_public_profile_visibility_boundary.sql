-- Public links read a visibility-filtered DTO through service-only endpoints.
-- Raw snapshots remain available only to their player and authorised staff.
revoke select on public.player_public_profiles from public, anon;
drop policy if exists "public profiles published anon" on public.player_public_profiles;
alter policy "public profiles authenticated read" on public.player_public_profiles
  using (private.can_view_player(player_id));

-- Keep the same public DTO at the SQL and HTTP boundaries.
create or replace function private.visible_public_player_profile(profile jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = ''
as $visibility$
declare
  result jsonb;
  hidden jsonb;
  section text;
  malformed boolean;
begin
  if profile is null or jsonb_typeof(profile) <> 'object' or profile = '{}'::jsonb then
    return null;
  end if;
  hidden := profile -> 'hidden_sections';
  malformed := coalesce(jsonb_typeof(hidden) <> 'array', true);
  if not malformed then
    select exists(select 1 from jsonb_array_elements(hidden) value where jsonb_typeof(value) <> 'string') into malformed;
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into result
    from jsonb_each(profile) where key = any(array['display_name','headline','primary_position','secondary_positions','preferred_foot','age_display','height_display','nationalities','current_status','current_club','key_stats','why_review','career_summary','profile_photo_path','hero_image_path','primary_video_url','transfermarkt_url','wyscout_url','stats_url','career_timeline','selected_videos','notable_experience','market_value_display','market_value_source_url','hidden_sections','hide_market_value','contact_email','verified_at']);
  if malformed then hidden := '["why_review","stats","summary","career","videos","experience"]'::jsonb; end if;
  result := result || jsonb_build_object('hidden_sections', hidden);
  if hidden ? 'why_review' then result := result || '{"why_review":null}'::jsonb; end if;
  if hidden ? 'stats' then result := result || '{"key_stats":[]}'::jsonb; end if;
  if hidden ? 'summary' then result := result || '{"career_summary":null}'::jsonb; end if;
  if hidden ? 'career' then result := result || '{"career_timeline":[]}'::jsonb; end if;
  if hidden ? 'videos' then result := result || '{"primary_video_url":null,"selected_videos":[]}'::jsonb; end if;
  if hidden ? 'experience' then result := result || '{"notable_experience":[]}'::jsonb; end if;
  result := result || jsonb_build_object('hide_market_value', (profile -> 'hide_market_value') is distinct from 'false'::jsonb);
  if (profile -> 'hide_market_value') is distinct from 'false'::jsonb then
    result := result || '{"market_value_display":null,"market_value_source_url":null}'::jsonb;
  end if;
  return result;
end;
$visibility$;
revoke all on function private.visible_public_player_profile(jsonb) from public, anon, authenticated;
grant execute on function private.visible_public_player_profile(jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.get_club_share(share_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'profile', private.visible_public_player_profile(jsonb_build_object(
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
    )),
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
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  limit 1;
$function$
;
revoke all on function public.get_club_share(uuid) from public, anon, authenticated;
grant execute on function public.get_club_share(uuid) to service_role;
