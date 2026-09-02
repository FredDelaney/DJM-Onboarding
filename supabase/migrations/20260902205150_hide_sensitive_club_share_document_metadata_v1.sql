create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_catalog'
as $function$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'pitch_message', s.pitch_message,
    'target_club', o.name,
    'profile', jsonb_build_object(
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
      'verified_at', pp.verified_at
    ),
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
  left join djm_os.organisations o on o.id = s.organisation_id
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  limit 1;
$function$;
