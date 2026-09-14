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
           (select count(*) from pitch q where q.player_id=p.id and q.pitch_state in ('player_not_verified_for_external_share','club_profile_not_published','club_profile_not_verified'))::int blocking_pursuits
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
        case c.agency_priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
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
      (select count(*) from jsonb_array_elements(coalesce(v_pitch->'items','[]'::jsonb)) x where x#>>'{player,player_id}'=p.id::text and x->>'pitch_readiness_state' in ('player_not_verified_for_external_share','club_profile_not_published','club_profile_not_verified'))::int blocking_pursuits
    from public.players p left join public.player_public_profiles pp on pp.player_id=p.id
    where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
  ) s;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'tenant_contact_email',v_contact,'summary',v_summary,'items',v_items,
    'truth_contract',jsonb_build_object(
      'safety','Share safety is based on recorded verification, dossier existence, publication and verification alignment. It is not a judgement of player quality.',
      'presentation','Missing headline, imagery, video or source links are presentation advisories and do not silently become hard football or commercial gates.',
      'publication','Publishing remains a human agency decision. The command never publishes a player automatically.',
      'progression','An existing active pitch is progression, not a dossier blocker.',
      'contact','External dossier contact identity is tenant-scoped; white-label tenants must not inherit DJM contact details.'));
end;
$function$;

revoke all on function public.platform_server_external_dossier_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_external_dossier_command(uuid,integer) to service_role;;
