alter function public.platform_server_pursuit_readiness(uuid,uuid,uuid) rename to platform_server_pursuit_readiness_core;

create or replace function public.platform_server_pursuit_readiness(p_tenant_id uuid, p_club_need_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_core jsonb;
  v_match_id uuid;
  v_need_health jsonb;
  v_player_health jsonb;
  v_floor integer;
  v_mode text;
  v_evidence_state text;
begin
  v_core:=public.platform_server_pursuit_readiness_core(p_tenant_id,p_club_need_id,p_player_id);
  begin v_match_id:=(v_core->>'player_match_id')::uuid; exception when others then v_match_id:=null; end;

  v_need_health:=platform.command_evidence_health_v2(
    p_tenant_id,
    jsonb_build_object(
      'source_type','club_need','source_id',p_club_need_id,'club_need_id',p_club_need_id,'player_id',p_player_id,
      'command_type','Review player match for live club need','evidence',jsonb_build_object('match_id',v_match_id)
    )
  );
  v_player_health:=platform.command_evidence_health_v2(
    p_tenant_id,
    jsonb_build_object(
      'source_type','player','source_id',p_player_id,'player_id',p_player_id,'command_type','Player review required','evidence','{}'::jsonb
    )
  );

  v_floor:=least(coalesce((v_need_health->>'score')::integer,0),coalesce((v_player_health->>'score')::integer,0));
  v_evidence_state:=case when v_floor>=80 then 'strong' when v_floor>=65 then 'usable' when v_floor>=45 then 'verify_first' else 'weak' end;
  v_mode:=case
    when coalesce((v_need_health->>'score')::integer,0)<65 then 'validate_demand_evidence_first'
    when coalesce((v_player_health->>'score')::integer,0)<65 then 'verify_player_evidence_first'
    when v_core->>'readiness_state'='strong_pursuit' then 'ready_for_human_review'
    when v_core->>'readiness_state'='credible_pursuit' then 'improve_bottleneck_then_review'
    when v_core->>'readiness_state'='conditional_pursuit' then 'conditional_review'
    else 'do_not_prioritise_without_change'
  end;

  return v_core || jsonb_build_object(
    'pursuit_operating_mode',v_mode,
    'evidence_health',jsonb_build_object(
      'score_floor',v_floor,
      'state',v_evidence_state,
      'club_demand',v_need_health,
      'player_record',v_player_health,
      'principle','Pursuit readiness and evidence health remain separate. A strong player-club fit can still require evidence validation before a pitch.'
    )
  );
end;
$$;

create or replace function public.platform_server_pursuit_board(p_tenant_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,20),50));
  v_items jsonb;
  v_total integer;
  v_ready integer;
  v_validate integer;
begin
  with matches as (
    select pm.club_need_id,pm.player_id
    from djm_os.player_matches pm
    join djm_os.club_needs n on n.id=pm.club_need_id and n.tenant_id=p_tenant_id and n.status='active'
    where pm.tenant_id=p_tenant_id and pm.status in ('suggested','review','shortlisted')
  ), readiness as (
    select public.platform_server_pursuit_readiness(p_tenant_id,m.club_need_id,m.player_id) as item from matches m
  ), ranked as (
    select item,row_number() over(order by (item->>'readiness_score')::numeric desc,item->'club'->>'name',item->'player'->>'name') as rank
    from readiness
  )
  select coalesce(jsonb_agg(item||jsonb_build_object('rank',rank) order by rank),'[]'::jsonb),count(*)::integer,
         count(*) filter(where item->>'pursuit_operating_mode'='ready_for_human_review')::integer,
         count(*) filter(where item->>'pursuit_operating_mode' in ('validate_demand_evidence_first','verify_player_evidence_first'))::integer
  into v_items,v_total,v_ready,v_validate
  from ranked
  where rank<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,
    'summary',jsonb_build_object(
      'pursuit_count',jsonb_array_length(v_items),
      'strong_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='strong_pursuit'),
      'credible_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='credible_pursuit'),
      'conditional_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='conditional_pursuit'),
      'weak_or_blocked_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='weak_or_blocked'),
      'ready_for_human_review_count',coalesce(v_ready,0),
      'evidence_validation_required_count',coalesce(v_validate,0)
    ),
    'interpretation','Ranks recorded player-club matches by pursuit readiness while separately exposing whether the evidence is strong enough for human pitch review. It is not probability of transfer.'
  );
end;
$$;

revoke all on function public.platform_server_pursuit_readiness_core(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_pursuit_readiness(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_pursuit_board(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_pursuit_readiness_core(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_pursuit_readiness(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_pursuit_board(uuid,integer) to service_role;;
