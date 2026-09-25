create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
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
      'market_value_display', pp.market_value_display,
      'market_value_source_url', pp.market_value_source_url,
      'hidden_sections', pp.hidden_sections,
      'hide_market_value', pp.hide_market_value,
      'contact_email', pp.contact_email,
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
$function$;

create or replace function public.track_club_share_view(share_token uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  share_row public.club_share_links%rowtype;
  v_tenant_id uuid;
  v_first_open boolean;
begin
  select s.*
  into share_row
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  for update of s;

  if share_row.id is null then
    return false;
  end if;

  select p.tenant_id
  into v_tenant_id
  from public.players p
  where p.id = share_row.player_id;

  v_first_open := coalesce(share_row.view_count, 0) = 0;

  insert into public.club_share_views(share_id)
  values (share_row.id);

  update public.club_share_links
  set
    view_count = view_count + 1,
    last_viewed_at = now(),
    pitch_status = case
      when pitch_status in ('draft', 'ready', 'sent') then 'opened'
      else pitch_status
    end
  where id = share_row.id;

  if share_row.opportunity_id is not null then
    update djm_os.deal_rooms
    set
      pitch_status = 'opened',
      next_action_text = case
        when v_first_open
          and nullif(trim(coalesce(next_action_text, '')), '') is null
          then 'Follow up after Player Profile opened'
        else next_action_text
      end,
      next_action_at = case
        when v_first_open and next_action_at is null
          then now() + interval '1 day'
        else next_action_at
      end,
      updated_at = now()
    where id = share_row.opportunity_id
      and tenant_id = v_tenant_id;
  end if;

  if v_first_open then
    insert into djm_os.events(
      tenant_id,
      event_type,
      player_id,
      payload,
      source,
      confidence,
      occurred_at
    )
    values(
      v_tenant_id,
      'PLAYER_PROFILE_OPENED',
      share_row.player_id,
      jsonb_build_object(
        'share_id', share_row.id,
        'deal_room_id', share_row.opportunity_id,
        'organisation_id', share_row.organisation_id
      ),
      'club_share',
      1,
      now()
    );
  end if;

  return true;
end;
$function$;

revoke all on function public.get_club_share(uuid)
  from public, anon, authenticated;
revoke all on function public.track_club_share_view(uuid)
  from public, anon, authenticated;

grant execute on function public.get_club_share(uuid)
  to service_role;
grant execute on function public.track_club_share_view(uuid)
  to service_role;
