create or replace function public.platform_server_deal_war_room_v2(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  select public.platform_server_deal_war_room(p_tenant_id,p_deal_room_id)
         || jsonb_build_object(
              'ageing',public.platform_server_deal_ageing(p_tenant_id,p_deal_room_id),
              'decision_pressure',public.platform_server_deal_decision_pressure(p_tenant_id,p_deal_room_id)
            );
$$;

create or replace function public.platform_server_deal_portfolio_v2(p_tenant_id uuid,p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
  v_all jsonb;
  v_visible jsonb;
  v_total integer:=0;
begin
  with rooms as (
    select d.id from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active'
  ), war as (
    select public.platform_server_deal_war_room_v2(p_tenant_id,r.id) item from rooms r
  ), ranked as (
    select item,row_number() over(order by coalesce((item->'attention'->>'score')::integer,0) desc,coalesce((item->'deal'->>'expected_commission')::numeric,0) desc,item->'deal'->>'title') rank
    from war
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,
    'deal_room_id',item->'deal'->>'deal_room_id','title',item->'deal'->>'title','stage',item->'deal'->>'stage',
    'probability',(item->'deal'->>'probability')::integer,'expected_commission',(item->'deal'->>'expected_commission')::numeric,
    'weighted_commission',(item->'deal'->>'weighted_commission')::numeric,'currency',item->'deal'->>'currency',
    'organisation',item->'organisation'->>'name','player',item->'player'->>'name',
    'attention_score',(item->'attention'->>'score')::integer,
    'control_score',(item->'control_health'->>'score')::integer,'control_state',item->'control_health'->>'state',
    'momentum_score',(item->'momentum'->>'momentum_score')::integer,'momentum_state',item->'momentum'->>'state',
    'rescue_state',item->'rescue'->>'state','rescue_reason',item->'rescue'->>'reason',
    'evidence_score',(item->'evidence_health'->>'score')::integer,'evidence_state',item->'evidence_health'->>'state',
    'direct_access_score',(item->'control_health'->'factors'->'access_execution'->>'direct_access_score')::integer,
    'best_introduction_score',(item->'control_health'->'factors'->'access_execution'->>'best_introduction_score')::integer,
    'observed_days_in_stage',(item->'ageing'->>'observed_days_in_current_stage')::numeric,
    'stage_history_mode',item->'ageing'->>'history_mode',
    'decision_pressure_state',item->'decision_pressure'->>'state',
    'observed_review_due_at',item->'decision_pressure'->>'observed_review_due_at',
    'primary_blocker',item->'deal'->>'primary_blocker','next_decision',item->'deal'->>'next_decision',
    'next_best_move',item->'next_best_move','next_control_fix',item->'next_control_fix','control_gaps',item->'control_health'->'gaps'
  ) order by rank),'[]'::jsonb),count(*)::integer
  into v_all,v_total from ranked;

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_visible
  from jsonb_array_elements(v_all) with ordinality x(value,ordinality) where x.ordinality<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'deals',v_visible,
    'summary',jsonb_build_object(
      'active_deals',v_total,'visible_deals',jsonb_array_length(v_visible),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_visible),0),
      'controlled_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'control_state'='controlled'),
      'fragile_or_exposed_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'control_state' in ('fragile','exposed')),
      'progressing_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'momentum_state'='progressing'),
      'cooling_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'momentum_state' in ('busy_but_cooling','cooling')),
      'stalled_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'momentum_state' in ('stalled','busy_not_moving','stalled_or_uncontrolled')),
      'stage_reviews_due',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'decision_pressure_state' in ('stage_review_due','stage_review_due_but_progressing','force_decision_due')),
      'stage_reviews_approaching',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'decision_pressure_state'='review_approaching'),
      'commercial_rescue_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'rescue_state'='commercial_rescue'),
      'momentum_recovery_deals',(select count(*) from jsonb_array_elements(v_all) x where x.value->>'rescue_state'='momentum_recovery'),
      'evidence_blocked_deals',(select count(*) from jsonb_array_elements(v_all) x where coalesce((x.value->>'evidence_score')::integer,0)<65),
      'deals_with_strong_introduction_option',(select count(*) from jsonb_array_elements(v_all) x where coalesce((x.value->>'direct_access_score')::integer,0)<60 and coalesce((x.value->>'best_introduction_score')::integer,0)>=80),
      'commercial_exposure_by_currency',(
        select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',weighted_commission) order by currency),'[]'::jsonb)
        from (
          select coalesce(nullif(x.value->>'currency',''),'UNKNOWN') currency,count(*)::integer active_deals,
                 coalesce(sum((x.value->>'expected_commission')::numeric),0) expected_commission,
                 coalesce(sum((x.value->>'weighted_commission')::numeric),0) weighted_commission
          from jsonb_array_elements(v_all) x group by coalesce(nullif(x.value->>'currency',''),'UNKNOWN')
        ) c
      )
    ),
    'operating_policy',public.platform_server_deal_operating_policy(p_tenant_id),
    'principle','Attention decides where to focus; control shows process quality; momentum shows movement; decision pressure applies the tenant operating policy to observed history. None is a success probability.'
  );
end;
$$;

revoke execute on function public.platform_server_deal_war_room_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_war_room_v2(uuid,uuid) to service_role;
revoke execute on function public.platform_server_deal_portfolio_v2(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_portfolio_v2(uuid,integer) to service_role;;
