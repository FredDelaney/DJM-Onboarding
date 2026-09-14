alter function public.platform_server_network_coverage(uuid) rename to platform_server_network_coverage_core_v1;

create or replace function public.platform_server_network_coverage(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_core jsonb;
  v_clubs jsonb;
  v_intro_available integer:=0;
  v_strong_intro_weak_direct integer:=0;
begin
  v_core:=public.platform_server_network_coverage_core_v1(p_tenant_id);

  with clubs as (
    select c.value as club,c.ordinality,
           public.platform_server_introduction_routes(p_tenant_id,(c.value->>'organisation_id')::uuid,3) as intro
    from jsonb_array_elements(coalesce(v_core->'clubs','[]'::jsonb)) with ordinality c(value,ordinality)
  ), enriched as (
    select club || jsonb_build_object(
      'introduction_context',intro,
      'network_option_state',case
        when coalesce((club->'best_route'->>'route_score')::integer,0)>=75 and coalesce((club->>'route_count')::integer,0)>=2 then 'strong_direct_with_redundancy'
        when coalesce((club->'best_route'->>'route_score')::integer,0)>=75 then 'strong_direct_single_threaded'
        when coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 'strong_introduction_available'
        when coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=65 then 'usable_introduction_available'
        when coalesce((club->'best_route'->>'route_score')::integer,0)>=60 then 'direct_route_usable'
        else 'access_development_required' end,
      'recommended_network_action',case
        when coalesce((club->'best_route'->>'route_score')::integer,0)<75 and coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80
          then intro->'best_route'->>'recommended_action'
        else club->>'recommended_network_action' end
    ) as club,ordinality,intro
    from clubs
  )
  select coalesce(jsonb_agg(club order by ordinality),'[]'::jsonb),
         count(*) filter(where coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=65)::integer,
         count(*) filter(where coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 and coalesce((club->'best_route'->>'route_score')::integer,0)<60)::integer
  into v_clubs,v_intro_available,v_strong_intro_weak_direct
  from enriched;

  return v_core || jsonb_build_object(
    'clubs',v_clubs,
    'summary',coalesce(v_core->'summary','{}'::jsonb)||jsonb_build_object(
      'clubs_with_introduction_option',v_intro_available,
      'strong_introduction_where_direct_access_is_weak',v_strong_intro_weak_direct
    ),
    'network_principle','Direct access and introduction access remain separate. A strong introduction improves the route strategy but does not rewrite direct relationship strength.'
  );
end;
$$;

create or replace function public.platform_server_agency_playbook(p_tenant_id uuid, p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_core jsonb;
  v_all jsonb;
  v_visible jsonb;
  v_total integer;
  v_pitch integer;
  v_access integer;
  v_source integer;
  v_deal integer;
  v_verify integer;
  v_intro integer;
begin
  v_core:=public.platform_server_agency_playbook_core(p_tenant_id,20);

  with plays as (
    select x.value as play,x.ordinality,
           platform.strategic_play_evidence_health(p_tenant_id,x.value) as health,
           coalesce((x.value->'evidence'->'pursuit'->'access_strategy'->>'best_introduction_score')::integer,0) as intro_score,
           x.value->'evidence'->'pursuit'->'introduction_context'->'best_route' as intro_route,
           x.value->'evidence'->'pursuit'->>'pursuit_operating_mode' as pursuit_mode
    from jsonb_array_elements(coalesce(v_core->'plays','[]'::jsonb)) with ordinality x(value,ordinality)
  ), gated as (
    select play || jsonb_build_object(
      'evidence_health',health,
      'introduction_context',case when intro_route is null then null else intro_route end,
      'play_type',case
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('pitch_now','strengthen_access_before_pitch','validate_demand_before_pitch','review_pursuit') then 'validate_evidence_before_pitch'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type'='source_for_confirmed_need' then 'verify_need_before_sourcing'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') then 'verify_deal_evidence_first'
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type'='strengthen_access_before_pitch' and pursuit_mode='use_warm_introduction_then_review' and intro_score>=80 then 'use_warm_introduction_before_pitch'
        else play->>'play_type' end,
      'recommended_action',case
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('pitch_now','strengthen_access_before_pitch','validate_demand_before_pitch','review_pursuit') then 'Verify the underlying club-demand and player evidence before spending the pitch.'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type'='source_for_confirmed_need' then 'Verify that the club requirement is still live before allocating sourcing time.'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') then 'Verify the stale or weak deal facts before making the next commercial move.'
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type'='strengthen_access_before_pitch' and pursuit_mode='use_warm_introduction_then_review' and intro_score>=80
          then coalesce(intro_route->>'recommended_action','Use the strongest recorded warm introduction route.')||' Then reassess the player pitch.'
        else play->>'recommended_action' end,
      'original_play_type',play->>'play_type',
      'evidence_gate',case when coalesce((health->>'score')::integer,0)<65 then 'verify_first' else 'ready' end,
      'access_route_mode',case when pursuit_mode='use_warm_introduction_then_review' and intro_score>=80 then 'warm_introduction' else 'direct_or_develop' end
    ) as play,ordinality
    from plays
  )
  select coalesce(jsonb_agg(play order by ordinality),'[]'::jsonb),count(*)::integer,
         count(*) filter(where play->>'play_type'='pitch_now')::integer,
         count(*) filter(where play->>'play_type'='strengthen_access_before_pitch')::integer,
         count(*) filter(where play->>'play_type'='source_for_confirmed_need')::integer,
         count(*) filter(where play->>'play_type' in ('protect_live_deal','remove_deal_blocker'))::integer,
         count(*) filter(where play->>'evidence_gate'='verify_first')::integer,
         count(*) filter(where play->>'play_type'='use_warm_introduction_before_pitch')::integer
  into v_all,v_total,v_pitch,v_access,v_source,v_deal,v_verify,v_intro
  from gated;

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_visible
  from jsonb_array_elements(v_all) with ordinality x(value,ordinality) where x.ordinality<=v_limit;

  return v_core || jsonb_build_object(
    'plays',v_visible,
    'summary',jsonb_build_object(
      'play_count',v_total,'total_play_count',v_total,'visible_play_count',jsonb_array_length(v_visible),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_visible),0),
      'pitch_now_count',v_pitch,'access_first_count',v_access,'source_need_count',v_source,'deal_protection_count',v_deal,
      'warm_introduction_play_count',v_intro,'evidence_validation_required_count',v_verify,'summary_scope','all_ranked_plays'),
    'evidence_policy',jsonb_build_object('verify_first_threshold',65,'principle','Strategic priority is preserved, but weak evidence changes the play from act-now to verify-first.'),
    'access_policy',jsonb_build_object('principle','A warm introduction can change the recommended access tactic but never overwrites the recorded direct-access score.')
  );
end;
$$;

revoke all on function public.platform_server_network_coverage_core_v1(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_network_coverage(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_agency_playbook(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_network_coverage_core_v1(uuid) to service_role;
grant execute on function public.platform_server_network_coverage(uuid) to service_role;
grant execute on function public.platform_server_agency_playbook(uuid,integer) to service_role;;
