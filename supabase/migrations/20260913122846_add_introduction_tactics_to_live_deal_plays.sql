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
  v_deal_intro integer;
begin
  v_core:=public.platform_server_agency_playbook_core(p_tenant_id,20);

  with raw_plays as (
    select x.value as play,x.ordinality,
           platform.strategic_play_evidence_health(p_tenant_id,x.value) as health,
           case
             when nullif(x.value->'evidence'->>'organisation_id','') is not null then (x.value->'evidence'->>'organisation_id')::uuid
             when nullif(x.value->'evidence'->'pursuit'->'club'->>'organisation_id','') is not null then (x.value->'evidence'->'pursuit'->'club'->>'organisation_id')::uuid
             when nullif(x.value->'evidence'->'access'->'organisation'->>'organisation_id','') is not null then (x.value->'evidence'->'access'->'organisation'->>'organisation_id')::uuid
             else null end as organisation_id,
           coalesce((x.value->'evidence'->'pursuit'->'access_strategy'->>'best_introduction_score')::integer,0) as pursuit_intro_score,
           x.value->'evidence'->'pursuit'->'introduction_context'->'best_route' as pursuit_intro_route,
           x.value->'evidence'->'pursuit'->>'pursuit_operating_mode' as pursuit_mode,
           coalesce((x.value->'evidence'->'access'->'best_route'->>'route_score')::integer,
                    (x.value->'evidence'->'pursuit'->'access_strategy'->>'direct_access_score')::integer,0) as direct_score
    from jsonb_array_elements(coalesce(v_core->'plays','[]'::jsonb)) with ordinality x(value,ordinality)
  ), with_intro as (
    select r.*,
           case when r.organisation_id is not null then public.platform_server_introduction_routes(p_tenant_id,r.organisation_id,3)
                else jsonb_build_object('routes','[]'::jsonb,'route_count',0,'best_route',null) end as club_intro
    from raw_plays r
  ), plays as (
    select *,
           coalesce((club_intro->'best_route'->>'introduction_score')::integer,pursuit_intro_score,0) as intro_score,
           coalesce(club_intro->'best_route',pursuit_intro_route) as intro_route
    from with_intro
  ), gated as (
    select play || jsonb_build_object(
      'evidence_health',health,
      'introduction_context',case when intro_route is null or intro_route='null'::jsonb then null else intro_route end,
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
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') and direct_score<60 and intro_score>=80
          then coalesce(play->>'recommended_action','Set the next deal action.')||' Access tactic: '||coalesce(intro_route->>'recommended_action','Use the strongest recorded warm introduction route.')
        else play->>'recommended_action' end,
      'recommended_sequence',case
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') and direct_score<60 and intro_score>=80
          then jsonb_build_array(
            jsonb_build_object('step',1,'action','protect_deal','instruction',coalesce(play->>'recommended_action','Set the next deal action.')),
            jsonb_build_object('step',2,'action','use_warm_introduction','instruction',coalesce(intro_route->>'recommended_action','Use the strongest recorded warm introduction route.'))
          )
        else null end,
      'original_play_type',play->>'play_type',
      'evidence_gate',case when coalesce((health->>'score')::integer,0)<65 then 'verify_first' else 'ready' end,
      'access_route_mode',case
        when coalesce((health->>'score')::integer,0)>=65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') and direct_score<60 and intro_score>=80 then 'warm_introduction_available_for_deal'
        when pursuit_mode='use_warm_introduction_then_review' and intro_score>=80 then 'warm_introduction'
        else 'direct_or_develop' end,
      'access_strategy',jsonb_build_object(
        'direct_access_score',direct_score,
        'best_introduction_score',intro_score,
        'introduction_advantage_points',intro_score-direct_score,
        'best_introduction_route',case when intro_route is null or intro_route='null'::jsonb then null else intro_route end
      )
    ) as play,ordinality
    from plays
  )
  select coalesce(jsonb_agg(play order by ordinality),'[]'::jsonb),count(*)::integer,
         count(*) filter(where play->>'play_type'='pitch_now')::integer,
         count(*) filter(where play->>'play_type'='strengthen_access_before_pitch')::integer,
         count(*) filter(where play->>'play_type'='source_for_confirmed_need')::integer,
         count(*) filter(where play->>'play_type' in ('protect_live_deal','remove_deal_blocker'))::integer,
         count(*) filter(where play->>'evidence_gate'='verify_first')::integer,
         count(*) filter(where play->>'play_type'='use_warm_introduction_before_pitch')::integer,
         count(*) filter(where play->>'access_route_mode'='warm_introduction_available_for_deal')::integer
  into v_all,v_total,v_pitch,v_access,v_source,v_deal,v_verify,v_intro,v_deal_intro
  from gated;

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_visible
  from jsonb_array_elements(v_all) with ordinality x(value,ordinality) where x.ordinality<=v_limit;

  return v_core || jsonb_build_object(
    'plays',v_visible,
    'summary',jsonb_build_object(
      'play_count',v_total,'total_play_count',v_total,'visible_play_count',jsonb_array_length(v_visible),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_visible),0),
      'pitch_now_count',v_pitch,'access_first_count',v_access,'source_need_count',v_source,'deal_protection_count',v_deal,
      'warm_introduction_play_count',v_intro,'deal_plays_with_warm_introduction_option',v_deal_intro,
      'evidence_validation_required_count',v_verify,'summary_scope','all_ranked_plays'),
    'evidence_policy',jsonb_build_object('verify_first_threshold',65,'principle','Strategic priority is preserved, but weak evidence changes the play from act-now to verify-first.'),
    'access_policy',jsonb_build_object('principle','A warm introduction can change the recommended access tactic but never overwrites the recorded direct-access score.')
  );
end;
$$;

revoke all on function public.platform_server_agency_playbook(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_playbook(uuid,integer) to service_role;;
