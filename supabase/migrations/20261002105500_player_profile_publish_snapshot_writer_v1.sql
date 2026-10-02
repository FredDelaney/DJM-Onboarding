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
  if v_mode in ('draft_edit','publish','publish_snapshot','unpublish') then
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
    elsif v_mode='publish_snapshot' then
      if (
        to_jsonb(new)-array[
          'published','published_at','display_name','headline','primary_position',
          'secondary_positions','preferred_foot','age_display','height_display',
          'nationalities','current_status','current_club','key_stats','why_review',
          'career_summary','profile_photo_path','primary_video_url','transfermarkt_url',
          'wyscout_url','stats_url','contact_email','career_timeline','selected_videos',
          'notable_experience','market_value_display','market_value_source_url',
          'hidden_sections','hide_market_value','verified_at','updated_at'
        ]::text[]
      ) is distinct from (
        to_jsonb(old)-array[
          'published','published_at','display_name','headline','primary_position',
          'secondary_positions','preferred_foot','age_display','height_display',
          'nationalities','current_status','current_club','key_stats','why_review',
          'career_summary','profile_photo_path','primary_video_url','transfermarkt_url',
          'wyscout_url','stats_url','contact_email','career_timeline','selected_videos',
          'notable_experience','market_value_display','market_value_source_url',
          'hidden_sections','hide_market_value','verified_at','updated_at'
        ]::text[]
      ) then
        raise exception 'Tenant dossier publish snapshot attempted an unexpected field change';
      end if;

      if new.published is not true
         or new.published_at is null
         or new.verified_at is null then
        raise exception 'Tenant dossier publish snapshot must leave the profile published and verified';
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

create or replace function public.platform_server_publish_player_profile_snapshot(
  p_tenant_id uuid,
  p_player_id uuid,
  p_actor_user_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player public.players%rowtype;
  v_before public.player_public_profiles%rowtype;
  v_after public.player_public_profiles%rowtype;
  v_contact text;
  v_display text;
  v_slug text;
  v_snapshot jsonb:=coalesce(p_snapshot,'{}'::jsonb);
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id=m.tenant_id
     and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'tenant_dossier_publish_access_required';
  end if;

  select p.* into v_player
  from public.players p
  where p.id=p_player_id
    and p.tenant_id=p_tenant_id;

  if not found then raise exception 'player_not_found'; end if;
  if v_player.verification_status<>'verified' or v_player.verified_at is null then
    raise exception 'verified_player_required';
  end if;
  if nullif(trim(v_player.primary_position),'') is null then
    raise exception 'primary_position_required';
  end if;

  if jsonb_typeof(v_snapshot)<>'object' then
    raise exception 'invalid_profile_snapshot';
  end if;
  if length(v_snapshot::text)>120000 then
    raise exception 'profile_snapshot_too_large';
  end if;
  if exists(
    select 1 from jsonb_object_keys(v_snapshot) k
    where k not in (
      'headline','key_stats','why_review','career_summary','primary_video_url',
      'career_timeline','selected_videos','notable_experience','market_value_display',
      'market_value_source_url','hidden_sections','hide_market_value'
    )
  ) then
    raise exception 'unsupported_profile_snapshot_field';
  end if;
  if v_snapshot ? 'key_stats' and jsonb_typeof(v_snapshot->'key_stats')<>'array' then raise exception 'key_stats_must_be_array'; end if;
  if v_snapshot ? 'career_timeline' and jsonb_typeof(v_snapshot->'career_timeline')<>'array' then raise exception 'career_timeline_must_be_array'; end if;
  if v_snapshot ? 'selected_videos' and jsonb_typeof(v_snapshot->'selected_videos')<>'array' then raise exception 'selected_videos_must_be_array'; end if;
  if v_snapshot ? 'notable_experience' and jsonb_typeof(v_snapshot->'notable_experience')<>'array' then raise exception 'notable_experience_must_be_array'; end if;
  if v_snapshot ? 'hidden_sections' and jsonb_typeof(v_snapshot->'hidden_sections')<>'array' then raise exception 'hidden_sections_must_be_array'; end if;

  select nullif(trim(b.support_email),'') into v_contact
  from platform.tenant_branding b
  where b.tenant_id=p_tenant_id;
  if v_contact is null then raise exception 'tenant_support_email_required'; end if;

  v_display:=coalesce(
    nullif(trim(v_player.preferred_name),''),
    nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),
    'Player'
  );

  select pp.* into v_before
  from public.player_public_profiles pp
  where pp.player_id=p_player_id;

  v_slug:=coalesce(
    nullif(v_before.public_slug,''),
    trim(both '-' from regexp_replace(lower(v_display),'[^a-z0-9]+','-','g'))||'-'||left(replace(p_player_id::text,'-',''),5)
  );
  if left(v_slug,1)='-' or v_slug='' then
    v_slug:='player-'||left(replace(p_player_id::text,'-',''),8);
  end if;

  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant',p_tenant_id::text,true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','publish_snapshot',true);

  insert into public.player_public_profiles as pp(
    player_id,public_slug,published,display_name,headline,primary_position,
    secondary_positions,preferred_foot,age_display,height_display,nationalities,
    current_status,current_club,key_stats,why_review,career_summary,
    profile_photo_path,primary_video_url,transfermarkt_url,wyscout_url,stats_url,
    contact_email,published_at,career_timeline,selected_videos,notable_experience,
    market_value_display,market_value_source_url,hidden_sections,hide_market_value,
    verified_at
  ) values (
    p_player_id,
    v_slug,
    true,
    v_display,
    nullif(left(trim(v_snapshot->>'headline'),220),''),
    v_player.primary_position,
    coalesce(v_player.secondary_positions,'{}'::text[]),
    v_player.preferred_foot,
    case when v_player.date_of_birth is null then null else extract(year from age(current_date,v_player.date_of_birth))::int::text end,
    case when v_player.height_cm is null then null else v_player.height_cm::text||' cm' end,
    coalesce(v_player.nationalities,'{}'::text[]),
    v_player.contract_status,
    v_player.current_club,
    coalesce(v_snapshot->'key_stats','[]'::jsonb),
    nullif(left(trim(v_snapshot->>'why_review'),1200),''),
    nullif(left(trim(v_snapshot->>'career_summary'),3000),''),
    v_player.profile_photo_path,
    nullif(left(trim(v_snapshot->>'primary_video_url'),1500),''),
    v_player.transfermarkt_url,
    v_player.wyscout_url,
    v_player.stats_url,
    v_contact,
    coalesce(v_before.published_at,pg_catalog.now()),
    coalesce(v_snapshot->'career_timeline','[]'::jsonb),
    coalesce(v_snapshot->'selected_videos','[]'::jsonb),
    coalesce(v_snapshot->'notable_experience','[]'::jsonb),
    case when coalesce((v_snapshot->>'hide_market_value')::boolean,true)=false then nullif(left(trim(v_snapshot->>'market_value_display'),120),'') else null end,
    case when coalesce((v_snapshot->>'hide_market_value')::boolean,true)=false then nullif(left(trim(v_snapshot->>'market_value_source_url'),1500),'') else null end,
    case when v_snapshot ? 'hidden_sections' then array(select jsonb_array_elements_text(v_snapshot->'hidden_sections')) else '{}'::text[] end,
    coalesce((v_snapshot->>'hide_market_value')::boolean,true),
    v_player.verified_at
  )
  on conflict(player_id) do update set
    published=true,
    display_name=excluded.display_name,
    headline=excluded.headline,
    primary_position=excluded.primary_position,
    secondary_positions=excluded.secondary_positions,
    preferred_foot=excluded.preferred_foot,
    age_display=excluded.age_display,
    height_display=excluded.height_display,
    nationalities=excluded.nationalities,
    current_status=excluded.current_status,
    current_club=excluded.current_club,
    key_stats=excluded.key_stats,
    why_review=excluded.why_review,
    career_summary=excluded.career_summary,
    profile_photo_path=excluded.profile_photo_path,
    primary_video_url=excluded.primary_video_url,
    transfermarkt_url=excluded.transfermarkt_url,
    wyscout_url=excluded.wyscout_url,
    stats_url=excluded.stats_url,
    contact_email=excluded.contact_email,
    published_at=coalesce(pp.published_at,excluded.published_at),
    career_timeline=excluded.career_timeline,
    selected_videos=excluded.selected_videos,
    notable_experience=excluded.notable_experience,
    market_value_display=excluded.market_value_display,
    market_value_source_url=excluded.market_value_source_url,
    hidden_sections=excluded.hidden_sections,
    hide_market_value=excluded.hide_market_value,
    verified_at=excluded.verified_at
  returning * into v_after;

  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','',true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant','',true);

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    before_state,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','player_profile.published',
    'player_public_profile',p_player_id::text,
    coalesce(to_jsonb(v_before),'{}'::jsonb),to_jsonb(v_after),
    jsonb_build_object('source','player_profile_publish_snapshot')
  );

  return jsonb_build_object('ok',true,'published',true,'profile',to_jsonb(v_after));
end;
$function$;

revoke all on function public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb) to service_role;
