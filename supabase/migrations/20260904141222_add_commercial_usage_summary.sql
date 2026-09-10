create view platform.monthly_usage_summary
with (security_invoker=true)
as
select
  tenant_id,
  date_trunc('month', occurred_at) as usage_month,
  feature_key,
  unit,
  sum(quantity) as quantity,
  count(*) as event_count,
  sum(estimated_cost_micros) as estimated_cost_micros,
  sum(coalesce(actual_cost_micros, estimated_cost_micros)) as effective_cost_micros
from platform.usage_events
group by tenant_id,date_trunc('month',occurred_at),feature_key,unit;
revoke all on platform.monthly_usage_summary from public, anon, authenticated;

create or replace function public.platform_server_commercial_summary(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with plan as (
  select a.plan_key, a.billing_mode, a.status, pc.display_name, platform.effective_plan_limits(p_tenant_id) as limits
  from platform.tenant_plan_assignments a
  join platform.plan_catalog pc on pc.plan_key=a.plan_key
  where a.tenant_id=p_tenant_id and a.status in ('trialing','active')
    and a.effective_from<=now() and (a.effective_until is null or a.effective_until>now())
  order by a.effective_from desc limit 1
), wallet as (
  select balance,is_unlimited,status from platform.credit_wallets where tenant_id=p_tenant_id and wallet_key='platform_credits'
), usage_total as (
  select count(*)::int as events,
         coalesce(sum(estimated_cost_micros),0)::bigint as estimated_cost_micros,
         coalesce(sum(coalesce(actual_cost_micros,estimated_cost_micros)),0)::bigint as effective_cost_micros
  from platform.usage_events
  where tenant_id=p_tenant_id and occurred_at>=date_trunc('month',now())
), by_feature as (
  select coalesce(jsonb_object_agg(feature_key,jsonb_build_object(
    'quantity',quantity,'event_count',event_count,'estimated_cost_micros',estimated_cost_micros,'effective_cost_micros',effective_cost_micros
  ) order by feature_key),'{}'::jsonb) as value
  from platform.monthly_usage_summary
  where tenant_id=p_tenant_id and usage_month=date_trunc('month',now())
)
select jsonb_build_object(
  'tenant_id',p_tenant_id,
  'plan',(select jsonb_build_object('key',plan_key,'name',display_name,'billing_mode',billing_mode,'status',status,'limits',limits) from plan),
  'credits',(select jsonb_build_object('balance',balance,'unlimited',is_unlimited,'status',status) from wallet),
  'current_month',jsonb_build_object(
    'event_count',(select events from usage_total),
    'estimated_cost_micros',(select estimated_cost_micros from usage_total),
    'effective_cost_micros',(select effective_cost_micros from usage_total),
    'by_feature',(select value from by_feature)
  )
);
$$;
revoke all on function public.platform_server_commercial_summary(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_commercial_summary(uuid) to service_role;
