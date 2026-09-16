create or replace function public.platform_server_agency_brief(
  p_tenant_id uuid,
  p_window_hours integer default 24,
  p_decision_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hours integer := coalesce(p_window_hours,24);
  v_limit integer := coalesce(p_decision_limit,5);
  v_home jsonb;
  v_attention jsonb;
  v_value jsonb;
  v_autonomy jsonb;
  v_pulse jsonb;
  v_headline text;
  v_subheadline text;
  v_decisions jsonb;
  v_movements jsonb;
  v_commercial jsonb;
  v_player_service jsonb;
  v_market jsonb;
  v_intelligence jsonb;
  v_next_sequence jsonb;
begin
  if v_hours not between 1 and 168 then raise exception 'invalid_window_hours'; end if;
  if v_limit not between 1 and 12 then raise exception 'invalid_decision_limit'; end if;
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  v_home := public.platform_server_agency_home(p_tenant_id,v_limit);
  v_attention := coalesce(v_home->'attention','{}'::jsonb);
  v_value := coalesce(v_home->'value_proof_30d','{}'::jsonb);
  v_autonomy := public.platform_server_autonomy_policy(p_tenant_id);
  v_pulse := public.platform_server_agency_pulse(p_tenant_id);

  v_headline := case coalesce(v_attention->>'status','clear')
    when 'critical_attention' then 'Critical agency decisions need attention'
    when 'attention_needed' then 'Priority agency decisions need movement'
    when 'normal' then 'Agency operations are under control'
    else 'No urgent operating issues detected'
  end;

  v_subheadline := case
    when coalesce((v_attention->>'critical_count')::integer,0) > 0 then
      (v_attention->>'critical_count')||' critical and '||coalesce(v_attention->>'high_count','0')||' high-priority items are currently open.'
    when coalesce((v_attention->>'high_count')::integer,0) > 0 then
      (v_attention->>'high_count')||' high-priority items are currently open.'
    when coalesce((v_attention->>'visible_signals')::integer,0) > 0 then
      (v_attention->>'visible_signals')||' lower-priority operating items are visible.'
    else 'The command engine has no current items requiring attention.'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',x.ordinality,
    'command_id',x.value->>'command_id',
    'title',x.value->>'title',
    'command_type',x.value->>'command_type',
    'category',x.value->>'category',
    'priority_score',(x.value->>'priority_score')::integer,
    'priority_band',x.value->>'priority_band',
    'why_now',x.value->>'why_now',
    'recommended_action',x.value->>'recommended_action',
    'actionability',x.value->'actionability',
    'evidence',x.value->'evidence'
  ) order by x.ordinality),'[]'::jsonb)
  into v_decisions
  from jsonb_array_elements(coalesce(v_attention->'commands','[]'::jsonb)) with ordinality x(value,ordinality);

  with events as (
    select *
    from platform.agency_pulse_events e
    where e.tenant_id=p_tenant_id
      and e.event_type='changed'
      and e.created_at >= now()-make_interval(hours=>v_hours)
    order by e.created_at desc
  ), expanded as (
    select e.created_at,'new'::text as movement_type,c.value as command from events e cross join lateral jsonb_array_elements(e.new_commands) c
    union all
    select e.created_at,'escalated',c.value from events e cross join lateral jsonb_array_elements(e.escalated_commands) c
    union all
    select e.created_at,'resolved',c.value from events e cross join lateral jsonb_array_elements(e.resolved_commands) c
    union all
    select e.created_at,'deescalated',c.value from events e cross join lateral jsonb_array_elements(e.deescalated_commands) c
  ), normalised as (
    select
      created_at,
      movement_type,
      coalesce(command->>'command_id',command->'command'->>'command_id') as command_id,
      coalesce(command->>'title',command->'command'->>'title') as title,
      coalesce(command->>'command_type',command->'command'->>'command_type') as command_type,
      command
    from expanded
  ), latest as (
    select distinct on (command_id,movement_type)
      command_id,movement_type,title,command_type,created_at,command
    from normalised
    where command_id is not null
    order by command_id,movement_type,created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'movement_type',movement_type,
    'command_id',command_id,
    'title',title,
    'command_type',command_type,
    'occurred_at',created_at,
    'detail',command
  ) order by created_at desc),'[]'::jsonb)
  into v_movements
  from latest;

  with active_deals as (
    select
      coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,
      count(*)::integer as active_deals,
      coalesce(sum(d.expected_commission),0) as expected_commission,
      coalesce(sum(d.expected_commission * coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0) as weighted_commission,
      count(*) filter(where d.next_action_at is null or d.next_action_at<now())::integer as deals_needing_next_action,
      count(*) filter(where d.primary_blocker is not null and trim(d.primary_blocker)<>'')::integer as deals_with_blockers
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active'
    group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
  )
  select jsonb_build_object(
    'by_currency',coalesce(jsonb_agg(jsonb_build_object(
      'currency',currency,
      'active_deals',active_deals,
      'expected_commission',expected_commission,
      'weighted_commission',round(weighted_commission,2),
      'deals_needing_next_action',deals_needing_next_action,
      'deals_with_blockers',deals_with_blockers
    ) order by currency),'[]'::jsonb),
    'active_deal_count',coalesce((select sum(active_deals) from active_deals),0),
    'deals_needing_next_action',coalesce((select sum(deals_needing_next_action) from active_deals),0)
  ) into v_commercial
  from active_deals;

  select jsonb_build_object(
    'active_players',count(*) filter(where p.football_status in ('active','free_agent','loan')),
    'urgent_or_high_priority',count(*) filter(where p.agency_priority in ('urgent','high')),
    'overdue_next_actions',count(*) filter(where p.next_action_due is not null and p.next_action_due<current_date),
    'actions_due_today',count(*) filter(where p.next_action_due=current_date),
    'contracts_expiring_120d',count(*) filter(where p.contract_expiry between current_date and current_date+120),
    'free_agents',count(*) filter(where p.football_status='free_agent'),
    'records_requiring_review',count(*) filter(where p.review_required_at is not null and p.review_required_at<=now())
  ) into v_player_service
  from public.players p
  where p.tenant_id=p_tenant_id;

  select jsonb_build_object(
    'active_confirmed_needs',count(*) filter(where n.status='active' and n.need_type='confirmed'),
    'active_predicted_needs',count(*) filter(where n.status='active' and n.need_type='predicted'),
    'confirmed_needs_without_match',count(*) filter(where n.status='active' and n.need_type='confirmed' and not exists(
      select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=n.id and pm.status in ('suggested','review','shortlisted')
    )),
    'needs_with_suggested_match',count(*) filter(where n.status='active' and exists(
      select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=n.id and pm.status in ('suggested','review','shortlisted')
    )),
    'needs_expiring_7d',count(*) filter(where n.status='active' and n.expires_at is not null and n.expires_at<=now()+interval '7 days')
  ) into v_market
  from djm_os.club_needs n
  where n.tenant_id=p_tenant_id;

  select jsonb_build_object(
    'captures_waiting_for_input',count(*) filter(where c.status='needs_input'),
    'captures_failed',count(*) filter(where c.status='failed'),
    'captures_completed_30d',count(*) filter(where c.status='done' and coalesce(c.completed_at,c.processed_at,c.created_at)>=now()-interval '30 days'),
    'actions_applied_30d',(select count(*) from djm_os.tell_djm_actions a where a.tenant_id=p_tenant_id and a.status='applied' and coalesce(a.applied_at,a.created_at)>=now()-interval '30 days'),
    'ai_events_30d',coalesce((v_value->'ai'->>'events')::integer,0),
    'estimated_ai_cost_micros_30d',coalesce((v_value->'ai'->>'estimated_cost_micros')::bigint,0)
  ) into v_intelligence
  from djm_os.captures c
  where c.tenant_id=p_tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'step',x.ordinality,
    'command_id',x.value->>'command_id',
    'title',x.value->>'title',
    'do',x.value->>'recommended_action',
    'why',x.value->>'why_now',
    'action_mode',x.value->'actionability'->>'mode',
    'cta',x.value->'actionability'->>'cta',
    'risk_level',x.value->'actionability'->>'risk_level'
  ) order by x.ordinality),'[]'::jsonb)
  into v_next_sequence
  from jsonb_array_elements(coalesce(v_attention->'commands','[]'::jsonb)) with ordinality x(value,ordinality)
  where x.ordinality<=3;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'window_hours',v_hours,
    'headline',v_headline,
    'subheadline',v_subheadline,
    'operating_status',v_attention->>'status',
    'top_decisions',v_decisions,
    'next_best_sequence',v_next_sequence,
    'movement',jsonb_build_object(
      'events',v_movements,
      'new_count',(select count(*) from jsonb_array_elements(v_movements) e where e.value->>'movement_type'='new'),
      'resolved_count',(select count(*) from jsonb_array_elements(v_movements) e where e.value->>'movement_type'='resolved'),
      'escalated_count',(select count(*) from jsonb_array_elements(v_movements) e where e.value->>'movement_type'='escalated'),
      'deescalated_count',(select count(*) from jsonb_array_elements(v_movements) e where e.value->>'movement_type'='deescalated')
    ),
    'commercial',v_commercial,
    'player_service',v_player_service,
    'market',v_market,
    'intelligence',v_intelligence,
    'autonomy',v_autonomy,
    'pulse',v_pulse,
    'value_proof_30d',v_value,
    'truth_contract',jsonb_build_object(
      'priorities','deterministic_rule_engine',
      'commercial_values','database_records_only',
      'ai_cost','metered_usage_ledger',
      'estimated_time_savings',case when coalesce((v_value->'customer_baseline_estimate'->>'enabled')::boolean,false) then 'customer_configured_baseline' else 'not_shown_without_customer_baseline' end,
      'llm_required_for_facts',false
    )
  );
end;
$function$;

revoke all on function public.platform_server_agency_brief(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_brief(uuid,integer,integer) to service_role;;
