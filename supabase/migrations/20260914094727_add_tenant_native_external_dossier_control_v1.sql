create or replace function private.enforce_public_profile_tenant_contact()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant_id uuid;
  v_support_email text;
  v_internal boolean:=false;
begin
  select p.tenant_id into v_tenant_id from public.players p where p.id=new.player_id;
  if v_tenant_id is null then raise exception 'player_not_found'; end if;
  select nullif(trim(b.support_email),''), coalesce((t.metadata->>'internal_tenant')::boolean,false)
  into v_support_email,v_internal
  from platform.tenants t left join platform.tenant_branding b on b.tenant_id=t.id
  where t.id=v_tenant_id;
  if not v_internal and lower(coalesce(new.contact_email,''))='jesse.edge@djmsports.com' then
    raise exception 'tenant_contact_email_required';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_public_profile_tenant_contact on public.player_public_profiles;
create trigger enforce_public_profile_tenant_contact
before insert or update on public.player_public_profiles
for each row execute function private.enforce_public_profile_tenant_contact();

create or replace function private.protect_public_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  safety_unpublish boolean;
  v_mode text:=coalesce(pg_catalog.current_setting('djm.internal_tenant_dossier_mode',true),'');
  v_tenant_setting text:=coalesce(pg_catalog.current_setting('djm.internal_tenant_dossier_tenant',true),'');
  v_row_tenant uuid;
begin
  if v_mode in ('draft_edit','publish','unpublish') then
    select p.tenant_id into v_row_tenant from public.players p where p.id=old.player_id;
    if v_row_tenant is null or v_tenant_setting='' or v_row_tenant::text<>v_tenant_setting then
      raise exception 'Tenant dossier write context mismatch';
    end if;
    if v_mode='draft_edit' then
      if (to_jsonb(new) - array['headline','why_review','career_summary','profile_photo_path','hero_image_path','primary_video_url','selected_videos','notable_experience','market_value_display','market_value_source_url','hidden_sections','hide_market_value','contact_email','updated_at']::text[])
         is distinct from
         (to_jsonb(old) - array['headline','why_review','career_summary','profile_photo_path','hero_image_path','primary_video_url','selected_videos','notable_experience','market_value_display','market_value_source_url','hidden_sections','hide_market_value','contact_email','updated_at']::text[]) then
        raise exception 'Tenant dossier draft edit attempted an unexpected field change';
      end if;
      if old.published or new.published then raise exception 'unpublish_before_edit'; end if;
      return new;
    elsif v_mode='publish' then
      if (to_jsonb(new) - array['published','published_at','verified_at','contact_email','updated_at']::text[])
         is distinct from
         (to_jsonb(old) - array['published','published_at','verified_at','contact_email','updated_at']::text[]) then
        raise exception 'Tenant dossier publish attempted an unexpected field change';
      end if;
      return new;
    elsif v_mode='unpublish' then
      if (to_jsonb(new) - array['published','updated_at']::text[])
         is distinct from
         (to_jsonb(old) - array['published','updated_at']::text[]) then
        raise exception 'Tenant dossier unpublish attempted an unexpected field change';
      end if;
      return new;
    end if;
  end if;

  if not private.is_admin() then
    safety_unpublish := (
      old.published=true and new.published=false
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
$function$;

create or replace function public.platform_server_external_dossier_command(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_limit int:=greatest(1,least(coalesce(p_limit,100),250));
  v_pitch jsonb;
  v_items jsonb;
  v_summary jsonb;
  v_contact text;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;
  select nullif(trim(b.support_email),'') into v_contact from platform.tenant_branding b where b.tenant_id=p_tenant_id;
  v_pitch:=public.platform_server_pitch_readiness_command(p_tenant_id,100);

  with pitch as (
    select (x->'player'->>'player_id')::uuid player_id,
           x->>'pitch_readiness_state' pitch_state,
           x#>>'{career_gate,state}' career_state
    from jsonb_array_elements(coalesce(v_pitch->'items','[]'::jsonb)) x
  ), base as (
    select p.id,p.first_name,p.last_name,p.preferred_name,p.current_club,p.primary_position,p.football_status,p.agency_priority,
           p.verification_status,p.verified_at,
           pp.player_id is not null has_profile,coalesce(pp.published,false) published,pp.verified_at profile_verified_at,
           pp.public_slug,pp.contact_email,pp.headline,pp.career_summary,pp.profile_photo_path,pp.primary_video_url,
           pp.transfermarkt_url,pp.wyscout_url,pp.stats_url,pp.why_review,
           (select count(*) from pitch q where q.player_id=p.id and q.career_state like 'open_%' and q.pitch_state<>'ready_to_prepare_pitch')::int blocking_pursuits
    from public.players p
    left join public.player_public_profiles pp on pp.player_id=p.id
    where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
  ), classified as (
    select b.*,
      case
        when b.verification_status is distinct from 'verified' or b.verified_at is null then 'player_verification_required'
        when not b.has_profile then 'dossier_missing'
        when not b.published then 'dossier_unpublished'
        when b.profile_verified_at is null or b.profile_verified_at is distinct from b.verified_at then 'dossier_verification_stale'
        else 'share_safe'
      end share_state,
      (select coalesce(jsonb_agg(v order by ord),'[]'::jsonb) from (values
        (1,'headline',b.headline is null or trim(b.headline)=''),
        (2,'career_summary',b.career_summary is null or trim(b.career_summary)=''),
        (3,'profile_photo',b.profile_photo_path is null or trim(b.profile_photo_path)=''),
        (4,'primary_video',b.primary_video_url is null or trim(b.primary_video_url)=''),
        (5,'why_review',b.why_review is null or trim(b.why_review)=''),
        (6,'external_reference',coalesce(nullif(trim(b.transfermarkt_url),''),nullif(trim(b.wyscout_url),''),nullif(trim(b.stats_url),'')) is null)
      ) a(ord,v,missing) where missing) advisories
    from base b
  ), ranked as (
    select c.*,
      row_number() over(order by (c.blocking_pursuits>0) desc,
        case c.share_state when 'player_verification_required' then 1 when 'dossier_missing' then 2 when 'dossier_unpublished' then 3 when 'dossier_verification_stale' then 4 else 5 end,
        case c.agency_priority when 'high' then 1 when 'medium' then 2 else 3 end,
        coalesce(c.preferred_name,c.first_name||' '||c.last_name)) rn
    from classified c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank',rn,
      'player',jsonb_build_object('player_id',id,'name',coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)),'current_club',current_club,'primary_position',primary_position,'football_status',football_status,'agency_priority',agency_priority),
      'share_state',share_state,
      'blocking_pursuits',blocking_pursuits,
      'safety',jsonb_build_object('player_verification_status',verification_status,'player_verified_at',verified_at,'profile_exists',has_profile,'published',published,'profile_verified_at',profile_verified_at,'contact_email',contact_email,'public_slug',public_slug),
      'presentation_advisories',advisories,
      'next_action',case share_state
        when 'player_verification_required' then jsonb_build_object('action','verify_player','instruction','Complete the human player verification workflow before external sharing.')
        when 'dossier_missing' then jsonb_build_object('action','create_dossier_draft','instruction','Create the tenant-branded club dossier draft from verified internal player data.')
        when 'dossier_unpublished' then jsonb_build_object('action','review_then_publish','instruction','Review the draft presentation and publish only when the agency is comfortable sharing it externally.')
        when 'dossier_verification_stale' then jsonb_build_object('action','republish_after_verification','instruction','Re-publish the dossier against the current verified player record before sharing.')
        else jsonb_build_object('action','ready_for_club_share','instruction','The dossier passes the recorded external-share safety controls.') end
    ) order by rn),'[]'::jsonb) into v_items
  from ranked where rn<=v_limit;

  select jsonb_build_object(
    'active_players',count(*),
    'share_safe',count(*) filter(where share_state='share_safe'),
    'player_verification_required',count(*) filter(where share_state='player_verification_required'),
    'dossier_missing',count(*) filter(where share_state='dossier_missing'),
    'dossier_unpublished',count(*) filter(where share_state='dossier_unpublished'),
    'dossier_verification_stale',count(*) filter(where share_state='dossier_verification_stale'),
    'players_blocking_open_pursuits',count(*) filter(where blocking_pursuits>0)
  ) into v_summary
  from (
    select p.id,
      case when p.verification_status is distinct from 'verified' or p.verified_at is null then 'player_verification_required'
           when pp.player_id is null then 'dossier_missing'
           when not coalesce(pp.published,false) then 'dossier_unpublished'
           when pp.verified_at is null or pp.verified_at is distinct from p.verified_at then 'dossier_verification_stale'
           else 'share_safe' end share_state,
      (select count(*) from jsonb_array_elements(coalesce(v_pitch->'items','[]'::jsonb)) x where x#>>'{player,player_id}'=p.id::text and x#>>'{career_gate,state}' like 'open_%' and x->>'pitch_readiness_state'<>'ready_to_prepare_pitch')::int blocking_pursuits
    from public.players p left join public.player_public_profiles pp on pp.player_id=p.id
    where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
  ) s;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'tenant_contact_email',v_contact,'summary',v_summary,'items',v_items,
    'truth_contract',jsonb_build_object(
      'safety','Share safety is based on recorded verification, dossier existence, publication and verification alignment. It is not a judgement of player quality.',
      'presentation','Missing headline, imagery, video or source links are presentation advisories and do not silently become hard football or commercial gates.',
      'publication','Publishing remains a human agency decision. The command never publishes a player automatically.',
      'contact','External dossier contact identity is tenant-scoped; white-label tenants must not inherit DJM contact details.'));
end;
$function$;

create or replace function public.platform_server_create_external_dossier_draft(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player public.players%rowtype;
  v_contact text;
  v_display text;
  v_slug text;
  v_row public.player_public_profiles%rowtype;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations')) then raise exception 'tenant_dossier_edit_access_required'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found'; end if;
  select nullif(trim(b.support_email),'') into v_contact from platform.tenant_branding b where b.tenant_id=p_tenant_id;
  if v_contact is null then raise exception 'tenant_support_email_required'; end if;
  select * into v_row from public.player_public_profiles pp where pp.player_id=p_player_id;
  if found then return jsonb_build_object('created',false,'existing',true,'profile',to_jsonb(v_row)); end if;
  v_display:=coalesce(nullif(trim(v_player.preferred_name),''),concat_ws(' ',v_player.first_name,v_player.last_name));
  v_slug:=trim(both '-' from regexp_replace(lower(v_display),'[^a-z0-9]+','-','g'))||'-'||left(replace(p_player_id::text,'-',''),8);
  if left(v_slug,1)='-' or v_slug='' then v_slug:='player-'||left(replace(p_player_id::text,'-',''),8); end if;
  insert into public.player_public_profiles(player_id,public_slug,published,display_name,primary_position,secondary_positions,preferred_foot,age_display,height_display,nationalities,current_status,current_club,profile_photo_path,transfermarkt_url,wyscout_url,contact_email,hide_market_value)
  values(p_player_id,v_slug,false,v_display,v_player.primary_position,coalesce(v_player.secondary_positions,'{}'::text[]),v_player.preferred_foot,
         case when v_player.date_of_birth is null then null else extract(year from age(current_date,v_player.date_of_birth))::int::text end,
         case when v_player.height_cm is null then null else v_player.height_cm::text||' cm' end,
         coalesce(v_player.nationalities,'{}'::text[]),v_player.football_status,v_player.current_club,v_player.profile_photo_path,v_player.transfermarkt_url,v_player.wyscout_url,v_contact,true)
  returning * into v_row;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','external_dossier.draft_created','player_public_profile',p_player_id::text,to_jsonb(v_row),jsonb_build_object('source','tenant_native_dossier_protocol'));
  return jsonb_build_object('created',true,'existing',false,'profile',to_jsonb(v_row),'truth_contract',jsonb_build_object('publication','The created dossier is a private draft and is not externally published.'));
end;
$function$;

create or replace function public.platform_server_update_external_dossier(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before public.player_public_profiles%rowtype;
  v_after public.player_public_profiles%rowtype;
  v_contact text;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations')) then raise exception 'tenant_dossier_edit_access_required'; end if;
  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb))<>'object' then raise exception 'invalid_patch'; end if;
  if exists(select 1 from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) k where k not in ('headline','why_review','career_summary','profile_photo_path','hero_image_path','primary_video_url','selected_videos','notable_experience','market_value_display','market_value_source_url','hidden_sections','hide_market_value')) then raise exception 'unsupported_dossier_field'; end if;
  if length(coalesce(p_patch::text,''))>30000 then raise exception 'dossier_patch_too_large'; end if;
  if p_patch ? 'selected_videos' and jsonb_typeof(p_patch->'selected_videos')<>'array' then raise exception 'selected_videos_must_be_array'; end if;
  if p_patch ? 'notable_experience' and jsonb_typeof(p_patch->'notable_experience')<>'array' then raise exception 'notable_experience_must_be_array'; end if;
  if p_patch ? 'hidden_sections' and jsonb_typeof(p_patch->'hidden_sections')<>'array' then raise exception 'hidden_sections_must_be_array'; end if;
  select pp.* into v_before from public.player_public_profiles pp join public.players p on p.id=pp.player_id where pp.player_id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'dossier_not_found'; end if;
  if v_before.published then raise exception 'unpublish_before_edit'; end if;
  select nullif(trim(b.support_email),'') into v_contact from platform.tenant_branding b where b.tenant_id=p_tenant_id;
  if v_contact is null then raise exception 'tenant_support_email_required'; end if;
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant',p_tenant_id::text,true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','draft_edit',true);
  update public.player_public_profiles pp set
    headline=case when p_patch ? 'headline' then nullif(left(trim(p_patch->>'headline'),180),'') else pp.headline end,
    why_review=case when p_patch ? 'why_review' then nullif(left(trim(p_patch->>'why_review'),1200),'') else pp.why_review end,
    career_summary=case when p_patch ? 'career_summary' then nullif(left(trim(p_patch->>'career_summary'),3000),'') else pp.career_summary end,
    profile_photo_path=case when p_patch ? 'profile_photo_path' then nullif(left(trim(p_patch->>'profile_photo_path'),1000),'') else pp.profile_photo_path end,
    hero_image_path=case when p_patch ? 'hero_image_path' then nullif(left(trim(p_patch->>'hero_image_path'),1000),'') else pp.hero_image_path end,
    primary_video_url=case when p_patch ? 'primary_video_url' then nullif(left(trim(p_patch->>'primary_video_url'),1500),'') else pp.primary_video_url end,
    selected_videos=case when p_patch ? 'selected_videos' then p_patch->'selected_videos' else pp.selected_videos end,
    notable_experience=case when p_patch ? 'notable_experience' then p_patch->'notable_experience' else pp.notable_experience end,
    market_value_display=case when p_patch ? 'market_value_display' then nullif(left(trim(p_patch->>'market_value_display'),120),'') else pp.market_value_display end,
    market_value_source_url=case when p_patch ? 'market_value_source_url' then nullif(left(trim(p_patch->>'market_value_source_url'),1500),'') else pp.market_value_source_url end,
    hidden_sections=case when p_patch ? 'hidden_sections' then array(select jsonb_array_elements_text(p_patch->'hidden_sections')) else pp.hidden_sections end,
    hide_market_value=case when p_patch ? 'hide_market_value' then coalesce((p_patch->>'hide_market_value')::boolean,pp.hide_market_value) else pp.hide_market_value end,
    contact_email=v_contact
  where pp.player_id=p_player_id returning * into v_after;
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','',true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant','',true);
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','external_dossier.draft_updated','player_public_profile',p_player_id::text,to_jsonb(v_before),to_jsonb(v_after),jsonb_build_object('source','tenant_native_dossier_protocol','patch_keys',(select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return jsonb_build_object('updated',true,'profile',to_jsonb(v_after));
end;
$function$;

create or replace function public.platform_server_publish_external_dossier(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before public.player_public_profiles%rowtype;
  v_after public.player_public_profiles%rowtype;
  v_contact text;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin')) then raise exception 'tenant_dossier_publish_access_required'; end if;
  if not exists(select 1 from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id and p.verification_status='verified' and p.verified_at is not null) then raise exception 'verified_player_required'; end if;
  select pp.* into v_before from public.player_public_profiles pp join public.players p on p.id=pp.player_id where pp.player_id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'dossier_not_found'; end if;
  select nullif(trim(b.support_email),'') into v_contact from platform.tenant_branding b where b.tenant_id=p_tenant_id;
  if v_contact is null then raise exception 'tenant_support_email_required'; end if;
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant',p_tenant_id::text,true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','publish',true);
  update public.player_public_profiles pp set published=true,published_at=coalesce(pp.published_at,now()),contact_email=v_contact where pp.player_id=p_player_id returning * into v_after;
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','',true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant','',true);
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','external_dossier.published','player_public_profile',p_player_id::text,to_jsonb(v_before),to_jsonb(v_after),jsonb_build_object('source','tenant_native_dossier_protocol'));
  return jsonb_build_object('published',true,'profile',to_jsonb(v_after),'truth_contract',jsonb_build_object('publication','Publication records agency approval to make the verified club-facing dossier externally available.'));
end;
$function$;

create or replace function public.platform_server_unpublish_external_dossier(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_before public.player_public_profiles%rowtype; v_after public.player_public_profiles%rowtype; begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin')) then raise exception 'tenant_dossier_publish_access_required'; end if;
  select pp.* into v_before from public.player_public_profiles pp join public.players p on p.id=pp.player_id where pp.player_id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'dossier_not_found'; end if;
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant',p_tenant_id::text,true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','unpublish',true);
  update public.player_public_profiles pp set published=false where pp.player_id=p_player_id returning * into v_after;
  perform pg_catalog.set_config('djm.internal_tenant_dossier_mode','',true);
  perform pg_catalog.set_config('djm.internal_tenant_dossier_tenant','',true);
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','external_dossier.unpublished','player_public_profile',p_player_id::text,to_jsonb(v_before),to_jsonb(v_after),jsonb_build_object('source','tenant_native_dossier_protocol'));
  return jsonb_build_object('unpublished',true,'profile',to_jsonb(v_after));
end;
$function$;

revoke all on function public.platform_server_external_dossier_command(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_create_external_dossier_draft(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_update_external_dossier(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_publish_external_dossier(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_unpublish_external_dossier(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_external_dossier_command(uuid,integer) to service_role;
grant execute on function public.platform_server_create_external_dossier_draft(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_update_external_dossier(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.platform_server_publish_external_dossier(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_unpublish_external_dossier(uuid,uuid,uuid) to service_role;;
