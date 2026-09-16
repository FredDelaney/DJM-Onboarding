create or replace function public.platform_server_revenue_command(p_tenant_id uuid,p_limit integer default 12)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with active_deals as (
  select d.*,
         coalesce(d.probability,d.manual_probability,d.model_probability,0)::numeric as probability_effective,
         case when d.expected_commission is null then null else round(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0,2) end as weighted_commission,
         p.first_name,p.last_name,p.contract_status,p.contract_expiry,
         exists(
           select 1 from public.player_agreements a
           where a.player_id=d.player_id and a.status='active'
             and a.agreement_type in ('representation','mandate','placement_authorisation')
             and (a.end_date is null or a.end_date>=current_date)
         ) as authority_recorded,
         exists(select 1 from public.player_documents pd where pd.player_id=d.player_id and (pd.expires_at is null or pd.expires_at>=current_date)) as current_document_recorded,
         extract(day from now()-coalesce(d.last_meaningful_at,d.updated_at,d.created_at))::integer as days_since_meaningful,
         (d.owner_user_id is null) as owner_gap,
         (nullif(trim(d.next_action_text),'') is null or d.next_action_at is null or d.next_action_at<now()) as next_action_gap,
         (d.player_id is not null and p.contract_status='under_contract' and d.transfer_fee is null) as fee_position_gap,
         (d.player_id is not null and d.player_salary is null) as salary_gap,
         (d.player_id is not null and d.salary_period is null) as salary_period_gap
  from djm_os.deal_rooms d
  left join public.players p on p.id=d.player_id and p.tenant_id=d.tenant_id
  where d.tenant_id=p_tenant_id and d.status='active'
), scored as (
  select a.*,
         ((owner_gap::int)+(next_action_gap::int)+(fee_position_gap::int)+(salary_gap::int)+(salary_period_gap::int)+((not authority_recorded)::int)+((not current_document_recorded)::int)+(case when days_since_meaningful>=14 then 1 else 0 end)) as exposure_gap_count,
         (owner_gap or next_action_gap) as process_exposed,
         (fee_position_gap or salary_gap or salary_period_gap or not authority_recorded or not current_document_recorded) as negotiation_incomplete,
         (days_since_meaningful>=14) as activity_cooling
  from active_deals a
), by_currency as (
  select coalesce(nullif(trim(currency),''),'UNKNOWN') currency,
         count(*)::integer active_deals,
         count(*) filter(where expected_commission is null)::integer unpriced_active_deals,
         coalesce(sum(expected_commission),0) expected_commission,
         coalesce(sum(weighted_commission),0) weighted_commission,
         coalesce(sum(weighted_commission) filter(where process_exposed),0) weighted_commission_process_exposed,
         coalesce(sum(weighted_commission) filter(where negotiation_incomplete),0) weighted_commission_negotiation_incomplete,
         coalesce(sum(weighted_commission) filter(where activity_cooling),0) weighted_commission_activity_cooling,
         coalesce(sum(weighted_commission) filter(where exposure_gap_count>0),0) weighted_commission_with_any_recorded_gap,
         max(expected_commission) top_expected_commission
  from scored group by coalesce(nullif(trim(currency),''),'UNKNOWN')
), concentration as (
  select b.currency,b.expected_commission,b.top_expected_commission,
         case when b.expected_commission>0 then round(b.top_expected_commission/b.expected_commission,4) else 0 end top_deal_share,
         case when b.expected_commission>0 and b.top_expected_commission/b.expected_commission>=0.60 then 'concentrated' else 'distributed' end state
  from by_currency b
), attention as (
  select s.*,
         row_number() over(partition by coalesce(nullif(trim(s.currency),''),'UNKNOWN') order by s.exposure_gap_count desc,s.weighted_commission desc nulls last,s.expected_commission desc nulls last,s.updated_at desc) rn
  from scored s
), unmatched_needs as (
  select count(*)::integer n
  from djm_os.club_needs cn
  where cn.tenant_id=p_tenant_id and cn.status='active' and cn.need_type='confirmed'
    and not exists(select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=cn.id)
), player_service as (
  select count(*)::integer n
  from public.players p
  where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
    and not exists(select 1 from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id and d.status='active')
)
select jsonb_build_object(
  'tenant_id',p_tenant_id,'generated_at',now(),
  'by_currency',(select coalesce(jsonb_agg(jsonb_build_object(
    'currency',b.currency,'active_deals',b.active_deals,'unpriced_active_deals',b.unpriced_active_deals,
    'expected_commission',b.expected_commission,'weighted_commission',b.weighted_commission,
    'weighted_commission_process_exposed',b.weighted_commission_process_exposed,
    'weighted_commission_negotiation_incomplete',b.weighted_commission_negotiation_incomplete,
    'weighted_commission_activity_cooling',b.weighted_commission_activity_cooling,
    'weighted_commission_with_any_recorded_gap',b.weighted_commission_with_any_recorded_gap,
    'concentration',jsonb_build_object('state',c.state,'top_deal_share',c.top_deal_share,'top_expected_commission',c.top_expected_commission)
  ) order by b.currency),'[]'::jsonb) from by_currency b join concentration c using(currency)),
  'protect_revenue',(select coalesce(jsonb_agg(jsonb_build_object(
    'deal_room_id',a.id,'title',a.title,'player',trim(concat_ws(' ',a.first_name,a.last_name)),'currency',coalesce(nullif(trim(a.currency),''),'UNKNOWN'),
    'expected_commission',a.expected_commission,'weighted_commission',a.weighted_commission,'probability',a.probability_effective,
    'stage',a.stage,'primary_blocker',a.primary_blocker,'days_since_meaningful',a.days_since_meaningful,
    'exposure_gap_count',a.exposure_gap_count,
    'gaps',to_jsonb(array_remove(array[
      case when a.owner_gap then 'owner_missing' end,
      case when a.next_action_gap then 'next_action_not_controlled' end,
      case when a.fee_position_gap then 'fee_or_release_position_not_recorded' end,
      case when a.salary_gap then 'player_salary_not_recorded' end,
      case when a.salary_period_gap then 'salary_period_not_recorded' end,
      case when not a.authority_recorded then 'authority_record_not_confirmed_in_platform' end,
      case when not a.current_document_recorded then 'current_document_record_not_found' end,
      case when a.activity_cooling then 'meaningful_activity_14_plus_days_ago' end
    ],null))
  ) order by a.exposure_gap_count desc,a.weighted_commission desc nulls last),'[]'::jsonb)
  from attention a where a.rn<=greatest(1,least(coalesce(p_limit,12),50)) and a.exposure_gap_count>0),
  'commercial_hygiene',jsonb_build_object(
    'active_deals',(select count(*) from scored),
    'unpriced_active_deals',(select count(*) from scored where expected_commission is null),
    'deals_without_probability',(select count(*) from scored where probability is null and manual_probability is null and model_probability is null),
    'deals_without_owner',(select count(*) from scored where owner_gap),
    'deals_without_controlled_next_action',(select count(*) from scored where next_action_gap),
    'deals_with_negotiation_preparation_gaps',(select count(*) from scored where negotiation_incomplete)
  ),
  'pipeline_creation',jsonb_build_object(
    'confirmed_club_needs_without_player_match',(select n from unmatched_needs),
    'active_or_free_agent_players_without_active_deal',(select n from player_service),
    'interpretation','These are operating opportunities, not forecast revenue until a commercial deal is recorded.'
  ),
  'principle','Revenue Command shows recorded commission exposure and operating leakage by currency. It does not convert currencies, invent deal values or infer revenue from club needs.',
  'truth_contract',jsonb_build_object(
    'weighted_commission','recorded expected commission multiplied by recorded probability; not a forecast guarantee',
    'at_risk','operating exposure only, not expected loss',
    'authority','absence means no active relevant record was found in the platform, not that legal authority is absent',
    'activity_cooling','14-day recency signal, not proof a deal is stalled',
    'currency','currencies remain separate unless an explicit FX conversion layer is added'
  )
);
$$;

revoke all on function public.platform_server_revenue_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_revenue_command(uuid,integer) to service_role;
;
