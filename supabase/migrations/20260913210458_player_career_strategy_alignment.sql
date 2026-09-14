create or replace function public.platform_server_player_career_alignment(p_tenant_id uuid,p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_player public.players%rowtype;
  v_s platform.player_career_strategies%rowtype;
  v_service jsonb;
  v_target_count integer:=0;
  v_avoid_count integer:=0;
  v_active_deals integer:=0;
  v_aligned integer:=0;
  v_outside integer:=0;
  v_avoided integer:=0;
  v_deals jsonb:='[]'::jsonb;
  v_state text;
  v_attention integer:=0;
  v_next jsonb;
begin
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  select * into v_s from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status in ('draft','approved') order by case when s.status='approved' then 0 else 1 end,s.version desc limit 1;
  v_service:=public.platform_server_player_service_card(p_tenant_id,p_player_id);

  if v_s.id is not null then
    select count(*) into v_target_count from jsonb_array_elements_text(coalesce(v_s.strategy->'target_markets','[]'::jsonb));
    select count(*) into v_avoid_count from jsonb_array_elements_text(coalesce(v_s.strategy->'avoid_markets','[]'::jsonb));
  end if;

  with d as (
    select dr.id,dr.title,dr.stage,dr.probability,o.name as club,o.country,
      case
        when v_s.id is null then 'strategy_missing'
        when v_avoid_count>0 and exists(select 1 from jsonb_array_elements_text(coalesce(v_s.strategy->'avoid_markets','[]'::jsonb)) x where lower(trim(x))=lower(trim(coalesce(o.country,'')))) then 'explicit_conflict'
        when v_target_count=0 then 'target_markets_not_set'
        when exists(select 1 from jsonb_array_elements_text(coalesce(v_s.strategy->'target_markets','[]'::jsonb)) x where lower(trim(x))=lower(trim(coalesce(o.country,'')))) then 'target_market'
        else 'outside_target_markets'
      end as alignment
    from djm_os.deal_rooms dr
    left join djm_os.organisations o on o.id=dr.organisation_id and o.tenant_id=dr.tenant_id
    where dr.tenant_id=p_tenant_id and dr.player_id=p_player_id and dr.status='active'
  )
  select count(*),count(*) filter(where alignment='target_market'),count(*) filter(where alignment='outside_target_markets'),count(*) filter(where alignment='explicit_conflict'),
    coalesce(jsonb_agg(jsonb_build_object('deal_room_id',id,'title',title,'stage',stage,'probability',probability,'club',club,'country',country,'alignment',alignment) order by probability desc nulls last),'[]'::jsonb)
  into v_active_deals,v_aligned,v_outside,v_avoided,v_deals from d;

  if v_s.id is null then
    v_state:='strategy_missing'; v_attention:=v_attention+35;
    v_next:=jsonb_build_object('action_type','define_career_strategy','instruction','Create the human-owned career strategy with the player before treating market activity as strategically aligned.','requires_human_input',true);
  elsif v_s.status<>'approved' then
    v_state:='strategy_draft'; v_attention:=v_attention+25;
    v_next:=jsonb_build_object('action_type','complete_strategy_approval','instruction','Complete player confirmation and owner/admin approval before treating this as the operating career plan.','requires_human_input',true);
  elsif v_s.confirmation_status<>'confirmed' then
    v_state:='player_reconfirmation_required'; v_attention:=v_attention+30;
    v_next:=jsonb_build_object('action_type','confirm_strategy_with_player','instruction','Reconfirm the current career strategy with the player.','requires_human_input',true);
  elsif v_s.review_due_at is not null and v_s.review_due_at<current_date then
    v_state:='strategy_review_overdue'; v_attention:=v_attention+30;
    v_next:=jsonb_build_object('action_type','review_career_strategy','instruction','Review the strategy with the player because its agreed review date has passed.','requires_human_input',true);
  elsif v_avoided>0 then
    v_state:='strategic_conflict'; v_attention:=v_attention+45;
    v_next:=jsonb_build_object('action_type','review_market_exception','instruction','A live deal sits in a market explicitly recorded as avoided. Confirm whether this is a deliberate exception before advancing.','requires_human_input',true);
  elsif v_outside>0 and v_target_count>0 then
    v_state:='market_exception_review'; v_attention:=v_attention+25;
    v_next:=jsonb_build_object('action_type','review_market_exception','instruction','A live deal sits outside the recorded target markets. Confirm whether it remains strategically appropriate.','requires_human_input',true);
  elsif coalesce(v_service#>>'{career_timing,market_trigger}','') in ('free_agent','contract_critical_window') and coalesce((v_service#>>'{market_coverage,active_deals}')::int,0)=0 and coalesce((v_service#>>'{market_coverage,recorded_market_matches}')::int,0)=0 then
    v_state:='strategy_execution_gap'; v_attention:=v_attention+35;
    v_next:=jsonb_build_object('action_type','activate_market_plan','instruction','The career timing is urgent but there is no recorded market coverage. Turn the approved strategy into an active market plan.','requires_human_input',false);
  else
    v_state:='aligned_no_recorded_conflict';
    v_next:=jsonb_build_object('action_type','maintain_strategy','instruction','Keep executing the current strategy and review it on the agreed cadence.','requires_human_input',false);
  end if;

  if coalesce(v_service#>>'{career_timing,market_trigger}','')='contract_critical_window' then v_attention:=v_attention+20; end if;
  if coalesce(v_service#>>'{career_timing,market_trigger}','')='free_agent' then v_attention:=v_attention+20; end if;
  if coalesce((v_service#>>'{service_control,overdue_tasks}')::int,0)>0 or coalesce((v_service#>>'{career_timing,next_action_days}')::int,0)<0 then v_attention:=v_attention+15; end if;
  v_attention:=least(v_attention,100);

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,
    'player',jsonb_build_object('name',coalesce(nullif(trim(v_player.preferred_name),''),nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),'Player'),'football_status',v_player.football_status,'contract_status',v_player.contract_status,'contract_expiry',v_player.contract_expiry),
    'strategy_state',case when v_s.id is null then 'missing' else v_s.status end,
    'confirmation_state',case when v_s.id is null then 'missing' else v_s.confirmation_status end,
    'review_due_at',case when v_s.id is null then null else to_jsonb(v_s.review_due_at) end,
    'alignment_state',v_state,'attention_score',v_attention,'next_strategy_action',v_next,
    'career_timing',v_service->'career_timing','service_control',v_service->'service_control','market_coverage',v_service->'market_coverage',
    'market_alignment',jsonb_build_object('target_markets',case when v_s.id is null then '[]'::jsonb else coalesce(v_s.strategy->'target_markets','[]'::jsonb) end,'avoid_markets',case when v_s.id is null then '[]'::jsonb else coalesce(v_s.strategy->'avoid_markets','[]'::jsonb) end,'active_deals',v_active_deals,'aligned_deals',v_aligned,'outside_target_deals',v_outside,'explicit_conflicts',v_avoided,'deals',v_deals),
    'strategy',case when v_s.id is null then null else v_s.strategy end,
    'truth_contract',jsonb_build_object(
      'alignment','Alignment only compares recorded strategy fields with recorded market activity. It does not judge whether a market or career choice is objectively good.',
      'attention_score','Deterministic operating-attention score, not player value, transfer probability or career-outcome probability.',
      'market_activity','Only recorded deals, matches and opportunities are visible to the operating model.',
      'human_ownership','Target markets, pathways, trade-offs and objectives must come from humans; they are never inferred as player intent.'
    )
  );
end;$$;

create or replace function public.platform_server_career_strategy_command(p_tenant_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_players jsonb; v_total integer; v_missing integer; v_conflicts integer; v_review integer; v_unconfirmed integer; begin
  with cards as (
    select p.id,public.platform_server_player_career_alignment(p_tenant_id,p.id) as card
    from public.players p
    where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
  ), ranked as (
    select id,card from cards order by coalesce((card->>'attention_score')::int,0) desc,coalesce(card#>>'{player,name}','') limit greatest(1,least(coalesce(p_limit,50),200))
  )
  select coalesce(jsonb_agg(card order by coalesce((card->>'attention_score')::int,0) desc,coalesce(card#>>'{player,name}','')),'[]'::jsonb) into v_players from ranked;

  with cards as (
    select public.platform_server_player_career_alignment(p_tenant_id,p.id) as card
    from public.players p where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
  )
  select count(*),count(*) filter(where card->>'alignment_state'='strategy_missing'),count(*) filter(where card->>'alignment_state'='strategic_conflict'),count(*) filter(where card->>'alignment_state'='strategy_review_overdue'),count(*) filter(where card->>'confirmation_state' in ('unconfirmed','needs_reconfirmation'))
  into v_total,v_missing,v_conflicts,v_review,v_unconfirmed from cards;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'players',v_players,
    'summary',jsonb_build_object('active_players',v_total,'strategy_missing',v_missing,'strategic_conflicts',v_conflicts,'reviews_overdue',v_review,'player_confirmation_needed',v_unconfirmed),
    'principle','Every player should have a current human-owned career thesis, explicit review cadence and market activity that can be checked against it.',
    'truth_contract',jsonb_build_object('command','Prioritises strategy-control work, not player quality or transfer probability.','strategy','Player intent and trade-offs are recorded, never inferred.')
  );
end;$$;

revoke all on function public.platform_server_player_career_alignment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_career_strategy_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_career_alignment(uuid,uuid) to service_role;
grant execute on function public.platform_server_career_strategy_command(uuid,integer) to service_role;;
