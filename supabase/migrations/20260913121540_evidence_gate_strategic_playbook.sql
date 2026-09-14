create or replace function platform.strategic_play_evidence_health(p_tenant_id uuid, p_play jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_evidence jsonb:=coalesce(p_play->'evidence','{}'::jsonb);
  v_pursuit jsonb:=v_evidence->'pursuit';
  v_id uuid;
  v_health jsonb;
  v_floor integer;
begin
  if v_pursuit is not null and v_pursuit<>'null'::jsonb and v_pursuit ? 'evidence_health' then
    v_floor:=coalesce((v_pursuit->'evidence_health'->>'score_floor')::integer,0);
    return jsonb_build_object(
      'score',v_floor,
      'state',coalesce(v_pursuit->'evidence_health'->>'state',case when v_floor>=80 then 'strong' when v_floor>=65 then 'usable' when v_floor>=45 then 'verify_first' else 'weak' end),
      'operating_mode',case when v_floor>=65 then 'normal' else 'verify_first' end,
      'external_decision_ready',v_floor>=65,
      'source','pursuit_evidence_floor',
      'detail',v_pursuit->'evidence_health'
    );
  end if;

  begin v_id:=nullif(v_evidence->>'deal_room_id','')::uuid; exception when others then v_id:=null; end;
  if v_id is not null then
    return platform.command_evidence_health_v2(p_tenant_id,jsonb_build_object('source_type','deal_room','source_id',v_id,'command_type','Strategic deal play','evidence',v_evidence));
  end if;

  begin v_id:=nullif(v_evidence->>'club_need_id','')::uuid; exception when others then v_id:=null; end;
  if v_id is not null then
    return platform.command_evidence_health_v2(p_tenant_id,jsonb_build_object('source_type','club_need','source_id',v_id,'club_need_id',v_id,'command_type','Strategic club-need play','evidence',v_evidence));
  end if;

  return jsonb_build_object('score',70,'state','usable','operating_mode','normal','external_decision_ready',true,'source','no_specific_evidence_subject','verify_reasons',jsonb_build_array('no_specific_evidence_subject'));
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
begin
  v_core:=public.platform_server_agency_playbook_core(p_tenant_id,20);

  with plays as (
    select x.value as play,x.ordinality,
           platform.strategic_play_evidence_health(p_tenant_id,x.value) as health
    from jsonb_array_elements(coalesce(v_core->'plays','[]'::jsonb)) with ordinality x(value,ordinality)
  ), gated as (
    select play || jsonb_build_object(
      'evidence_health',health,
      'play_type',case
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('pitch_now','strengthen_access_before_pitch','validate_demand_before_pitch','review_pursuit') then 'validate_evidence_before_pitch'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type'='source_for_confirmed_need' then 'verify_need_before_sourcing'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') then 'verify_deal_evidence_first'
        else play->>'play_type' end,
      'recommended_action',case
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('pitch_now','strengthen_access_before_pitch','validate_demand_before_pitch','review_pursuit') then 'Verify the underlying club-demand and player evidence before spending the pitch.'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type'='source_for_confirmed_need' then 'Verify that the club requirement is still live before allocating sourcing time.'
        when coalesce((health->>'score')::integer,0)<65 and play->>'play_type' in ('protect_live_deal','remove_deal_blocker','maintain_deal_momentum') then 'Verify the stale or weak deal facts before making the next commercial move.'
        else play->>'recommended_action' end,
      'original_play_type',play->>'play_type',
      'evidence_gate',case when coalesce((health->>'score')::integer,0)<65 then 'verify_first' else 'ready' end
    ) as play,
    ordinality
    from plays
  )
  select coalesce(jsonb_agg(play order by ordinality),'[]'::jsonb),count(*)::integer,
         count(*) filter(where play->>'play_type'='pitch_now')::integer,
         count(*) filter(where play->>'play_type'='strengthen_access_before_pitch')::integer,
         count(*) filter(where play->>'play_type'='source_for_confirmed_need')::integer,
         count(*) filter(where play->>'play_type' in ('protect_live_deal','remove_deal_blocker'))::integer,
         count(*) filter(where play->>'evidence_gate'='verify_first')::integer
  into v_all,v_total,v_pitch,v_access,v_source,v_deal,v_verify
  from gated;

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb)
  into v_visible
  from jsonb_array_elements(v_all) with ordinality x(value,ordinality)
  where x.ordinality<=v_limit;

  return v_core || jsonb_build_object(
    'plays',v_visible,
    'summary',jsonb_build_object(
      'play_count',v_total,'total_play_count',v_total,'visible_play_count',jsonb_array_length(v_visible),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_visible),0),
      'pitch_now_count',v_pitch,'access_first_count',v_access,'source_need_count',v_source,'deal_protection_count',v_deal,
      'evidence_validation_required_count',v_verify,'summary_scope','all_ranked_plays'
    ),
    'evidence_policy',jsonb_build_object(
      'verify_first_threshold',65,
      'principle','Strategic priority is preserved, but weak evidence changes the play from act-now to verify-first.'
    )
  );
end;
$$;

revoke all on function platform.strategic_play_evidence_health(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_agency_playbook(uuid,integer) from public,anon,authenticated;
grant execute on function platform.strategic_play_evidence_health(uuid,jsonb) to service_role;
grant execute on function public.platform_server_agency_playbook(uuid,integer) to service_role;;
