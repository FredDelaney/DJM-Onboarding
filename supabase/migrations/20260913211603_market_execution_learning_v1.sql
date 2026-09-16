create or replace function public.platform_server_market_learning(p_tenant_id uuid,p_window_days integer default 730)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_days integer:=greatest(90,least(coalesce(p_window_days,730),1460));
  v_tenant platform.tenants%rowtype;
  v_markets jsonb;
  v_total integer:=0;
  v_policy_eligible boolean:=false;
begin
  select * into v_tenant from platform.tenants where id=p_tenant_id and status='active';
  if not found then raise exception 'tenant_not_found'; end if;
  v_policy_eligible:=not coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);

  with deal_base as (
    select d.id,d.status,d.stage,d.created_at,d.closed_at,o.country,
      greatest(
        case d.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end,
        coalesce((select max(case s.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
                  from platform.deal_state_snapshots s where s.tenant_id=d.tenant_id and s.deal_room_id=d.id),0)
      ) as max_stage_rank
    from djm_os.deal_rooms d
    join djm_os.organisations o on o.id=d.organisation_id and o.tenant_id=d.tenant_id
    where d.tenant_id=p_tenant_id
      and d.created_at>=now()-make_interval(days=>v_days)
      and nullif(trim(o.country),'') is not null
  ), stats as (
    select country,
      count(*)::integer as deal_count,
      count(*) filter(where max_stage_rank>=3)::integer as serious_interest_count,
      count(*) filter(where max_stage_rank>=4)::integer as negotiation_count,
      count(*) filter(where max_stage_rank>=5)::integer as offer_count,
      count(*) filter(where status='won')::integer as won_count,
      count(*) filter(where status='lost')::integer as lost_count,
      count(*) filter(where status in ('won','lost'))::integer as resolved_count,
      count(*) filter(where status='active')::integer as active_count,
      count(*) filter(where status='paused')::integer as paused_count
    from deal_base group by country
  ), rates as (
    select s.*,
      serious_interest_count::numeric/nullif(deal_count,0) as serious_rate,
      won_count::numeric/nullif(resolved_count,0) as win_rate,
      case when deal_count<10 then 'insufficient' when deal_count<25 then 'emerging' else 'usable' end as funnel_evidence_state,
      case when resolved_count<8 then 'insufficient' when resolved_count<20 then 'emerging' else 'usable' end as close_evidence_state
    from stats s
  ), intervals as (
    select r.*,
      case when deal_count=0 then null else greatest(0::numeric,
        ((serious_rate+3.8416/(2*deal_count))/(1+3.8416/deal_count)) -
        (1.96*sqrt((serious_rate*(1-serious_rate)+3.8416/(4*deal_count))/deal_count)/(1+3.8416/deal_count))
      ) end as serious_low,
      case when deal_count=0 then null else least(1::numeric,
        ((serious_rate+3.8416/(2*deal_count))/(1+3.8416/deal_count)) +
        (1.96*sqrt((serious_rate*(1-serious_rate)+3.8416/(4*deal_count))/deal_count)/(1+3.8416/deal_count))
      ) end as serious_high,
      case when resolved_count=0 then null else greatest(0::numeric,
        ((win_rate+3.8416/(2*resolved_count))/(1+3.8416/resolved_count)) -
        (1.96*sqrt((win_rate*(1-win_rate)+3.8416/(4*resolved_count))/resolved_count)/(1+3.8416/resolved_count))
      ) end as win_low,
      case when resolved_count=0 then null else least(1::numeric,
        ((win_rate+3.8416/(2*resolved_count))/(1+3.8416/resolved_count)) +
        (1.96*sqrt((win_rate*(1-win_rate)+3.8416/(4*resolved_count))/resolved_count)/(1+3.8416/resolved_count))
      ) end as win_high
    from rates r
  ), interpreted as (
    select i.*,
      case
        when not v_policy_eligible then 'synthetic_demo_only'
        when funnel_evidence_state<>'usable' and close_evidence_state<>'usable' then 'keep_learning'
        when funnel_evidence_state='usable' and serious_low>=0.55 and close_evidence_state='usable' and win_low>=0.50 then 'strong_market_candidate'
        when funnel_evidence_state='usable' and serious_high<=0.45 and close_evidence_state='usable' and win_high<=0.40 then 'weak_market_candidate'
        when funnel_evidence_state='usable' and serious_low>=0.55 and close_evidence_state<>'usable' then 'strong_interest_market_close_evidence_immature'
        when close_evidence_state='usable' and win_low>=0.50 and funnel_evidence_state<>'usable' then 'promising_close_market_funnel_evidence_immature'
        else 'mixed_no_policy_change'
      end as recommendation
    from intervals i
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'market',country,
    'deal_count',deal_count,
    'active_count',active_count,
    'paused_count',paused_count,
    'serious_interest_count',serious_interest_count,
    'negotiation_count',negotiation_count,
    'offer_count',offer_count,
    'resolved_count',resolved_count,
    'won_count',won_count,
    'lost_count',lost_count,
    'funnel_evidence_state',funnel_evidence_state,
    'close_evidence_state',close_evidence_state,
    'raw_serious_interest_rate',round(serious_rate,4),
    'decision_serious_interest_rate',case when deal_count>=10 then round(serious_rate,4) else null end,
    'serious_interest_wilson_95',case when deal_count>=10 then jsonb_build_object('low',round(serious_low,4),'high',round(serious_high,4)) else null end,
    'raw_resolved_win_rate',case when resolved_count=0 then null else round(win_rate,4) end,
    'decision_resolved_win_rate',case when resolved_count>=8 then round(win_rate,4) else null end,
    'resolved_win_wilson_95',case when resolved_count>=8 then jsonb_build_object('low',round(win_low,4),'high',round(win_high,4)) else null end,
    'recommendation',recommendation,
    'policy_change_allowed',false
  ) order by deal_count desc,country),'[]'::jsonb),coalesce(sum(deal_count),0)::integer
  into v_markets,v_total from interpreted;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'window_days',v_days,'total_recorded_deals',v_total,'markets',v_markets,
    'evidence_policy',jsonb_build_object(
      'serious_interest_definition','Recorded deal reached Interest stage or beyond.',
      'funnel_rate_minimum_sample',10,
      'funnel_usable_sample',25,
      'resolved_win_rate_minimum_sample',8,
      'resolved_win_usable_sample',20,
      'confidence_interval','95% Wilson score interval',
      'automatic_policy_changes',false,
      'synthetic_results_can_change_production_policy',false
    ),
    'truth_contract',jsonb_build_object(
      'market_quality','Observed agency history in a country is not proof that the market is objectively good or bad.',
      'selection_bias','Agency targeting choices influence the sample. This is not a randomised comparison between countries.',
      'serious_interest','Stage progression measures recorded deal movement, not club commitment or transfer probability.',
      'win_rate','Win rate uses only recorded won/lost deals and excludes active or paused deals.',
      'recommendations','Market candidates are prompts for human portfolio review, never automatic geographic strategy changes.'
    )
  );
end;$$;

revoke all on function public.platform_server_market_learning(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_market_learning(uuid,integer) to service_role;;
