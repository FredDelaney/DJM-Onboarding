create or replace function public.platform_server_pitch_learning(p_tenant_id uuid,p_window_days integer default 365)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_days integer:=greatest(30,least(coalesce(p_window_days,365),1460));
  v_tenant platform.tenants%rowtype;
  v_policy_eligible boolean:=false;
  v_markets jsonb:='[]'::jsonb;
  v_total_sent integer:=0;
  v_total_responses integer:=0;
begin
  select * into v_tenant from platform.tenants where id=p_tenant_id and status='active';
  if not found then raise exception 'tenant_not_found'; end if;
  v_policy_eligible:=not coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);

  with base as (
    select s.id,s.sent_at,s.view_count,o.country,r.response_type
    from public.club_share_links s
    join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
    left join djm_os.organisations o on o.id=s.organisation_id and o.tenant_id=p_tenant_id
    left join platform.club_pitch_responses r on r.share_id=s.id and r.tenant_id=p_tenant_id
    where s.sent_at is not null and s.sent_at>=now()-make_interval(days=>v_days)
  ) select count(*),count(*) filter(where response_type is not null) into v_total_sent,v_total_responses from base;

  with base as (
    select coalesce(nullif(trim(o.country),''),'Unknown') market,s.id,s.view_count,r.response_type
    from public.club_share_links s
    join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
    left join djm_os.organisations o on o.id=s.organisation_id and o.tenant_id=p_tenant_id
    left join platform.club_pitch_responses r on r.share_id=s.id and r.tenant_id=p_tenant_id
    where s.sent_at is not null and s.sent_at>=now()-make_interval(days=>v_days)
  ), stats as (
    select market,
      count(*)::int sent_count,
      count(*) filter(where coalesce(view_count,0)>0)::int opened_count,
      count(*) filter(where response_type is not null)::int explicit_response_count,
      count(*) filter(where response_type in ('request_conversation','request_information'))::int positive_response_count,
      count(*) filter(where response_type in ('not_now','decline'))::int negative_response_count
    from base group by market
  ), rates as (
    select s.*,
      explicit_response_count::numeric/nullif(sent_count,0) response_rate,
      positive_response_count::numeric/nullif(explicit_response_count,0) positive_rate,
      case when sent_count<10 then 'insufficient' when sent_count<25 then 'emerging' else 'usable' end response_evidence_state,
      case when explicit_response_count<8 then 'insufficient' when explicit_response_count<20 then 'emerging' else 'usable' end positive_evidence_state
    from stats s
  ), intervals as (
    select r.*,
      case when sent_count=0 then null else greatest(0::numeric,((response_rate+3.8416/(2*sent_count))/(1+3.8416/sent_count))-(1.96*sqrt((response_rate*(1-response_rate)+3.8416/(4*sent_count))/sent_count)/(1+3.8416/sent_count))) end response_low,
      case when sent_count=0 then null else least(1::numeric,((response_rate+3.8416/(2*sent_count))/(1+3.8416/sent_count))+(1.96*sqrt((response_rate*(1-response_rate)+3.8416/(4*sent_count))/sent_count)/(1+3.8416/sent_count))) end response_high,
      case when explicit_response_count=0 then null else greatest(0::numeric,((positive_rate+3.8416/(2*explicit_response_count))/(1+3.8416/explicit_response_count))-(1.96*sqrt((positive_rate*(1-positive_rate)+3.8416/(4*explicit_response_count))/explicit_response_count)/(1+3.8416/explicit_response_count))) end positive_low,
      case when explicit_response_count=0 then null else least(1::numeric,((positive_rate+3.8416/(2*explicit_response_count))/(1+3.8416/explicit_response_count))+(1.96*sqrt((positive_rate*(1-positive_rate)+3.8416/(4*explicit_response_count))/explicit_response_count)/(1+3.8416/explicit_response_count))) end positive_high
    from rates r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'market',market,'sent_count',sent_count,'opened_count',opened_count,'explicit_response_count',explicit_response_count,'positive_response_count',positive_response_count,'negative_response_count',negative_response_count,
    'response_evidence_state',response_evidence_state,'positive_response_evidence_state',positive_evidence_state,
    'decision_explicit_response_rate',case when sent_count>=10 then round(response_rate,4) else null end,
    'explicit_response_wilson_95',case when sent_count>=10 then jsonb_build_object('low',round(response_low,4),'high',round(response_high,4)) else null end,
    'decision_positive_share_of_explicit_responses',case when explicit_response_count>=8 then round(positive_rate,4) else null end,
    'positive_response_wilson_95',case when explicit_response_count>=8 then jsonb_build_object('low',round(positive_low,4),'high',round(positive_high,4)) else null end,
    'recommendation',case
      when not v_policy_eligible then 'synthetic_demo_only'
      when response_evidence_state='usable' and response_low>=0.50 and positive_evidence_state='usable' and positive_low>=0.55 then 'stronger_pitch_market_signal'
      when response_evidence_state='usable' and response_high<=0.25 then 'weaker_pitch_response_signal'
      else 'keep_learning_or_mixed' end,
    'policy_change_allowed',false
  ) order by sent_count desc,market),'[]'::jsonb) into v_markets from intervals;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'window_days',v_days,'generated_at',now(),
    'coverage',jsonb_build_object('sent_pitches',v_total_sent,'explicit_responses',v_total_responses,'sent_without_explicit_response',greatest(v_total_sent-v_total_responses,0)),
    'markets',v_markets,
    'evidence_policy',jsonb_build_object('response_minimum_sent',10,'response_usable_sent',25,'positive_minimum_responses',8,'positive_usable_responses',20,'confidence_interval','95% Wilson score interval','automatic_policy_changes',false),
    'truth_contract',jsonb_build_object(
      'unanswered','A sent pitch without an explicit response is unresolved, not a rejection.',
      'opens','Page opens are displayed as telemetry but do not enter positive-response calculations.',
      'identity','Explicit share responses come from a holder of the pitch link; responder identity is self-asserted unless separately verified.',
      'causality','Observed response patterns do not prove a pitch format, market or route caused the response.',
      'selection_bias','Different players, clubs, markets and agents receive different pitches, so comparisons remain observational.',
      'policy','Learning can inform humans but cannot automatically change market strategy or pitch policy.')
  );
end;
$function$;

revoke all on function public.platform_server_pitch_learning(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_pitch_learning(uuid,integer) to service_role;;
