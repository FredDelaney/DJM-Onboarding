update platform.plan_catalog
set metadata = coalesce(metadata,'{}'::jsonb) || case plan_key
  when 'agency' then jsonb_build_object(
    'commercial_promise','Run the agency professionally',
    'positioning','Core agency operations plus a branded player experience',
    'primary_outcome','Replace spreadsheets and fragmented player administration with one accountable workspace',
    'sales_anchor','Branded player portal included',
    'trial_default',false,
    'trial_days',14
  )
  when 'pro' then jsonb_build_object(
    'commercial_promise','Turn conversations into opportunities',
    'positioning','The full agency operating system with Tell DJM, voice capture and football intelligence',
    'primary_outcome','Reduce admin while making club demand, player context and next actions usable immediately',
    'sales_anchor','Tell DJM plus intelligence plus custom domain',
    'trial_default',true,
    'trial_days',14,
    'hero_plan',true
  )
  when 'elite' then jsonb_build_object(
    'commercial_promise','Run the whole agency as a measurable business',
    'positioning','Agency-wide intelligence, revenue control, player service and branded communications',
    'primary_outcome','Give owners visibility across sporting work, relationships, commissions and service quality',
    'sales_anchor','Business intelligence plus commissions plus API access',
    'trial_default',false,
    'trial_days',14
  )
  when 'enterprise' then jsonb_build_object(
    'commercial_promise','Scale privately and securely',
    'positioning','Dedicated infrastructure, SSO and tailored integration for complex agencies',
    'primary_outcome','Operate the platform as strategic infrastructure rather than another SaaS tool',
    'sales_anchor','Dedicated infrastructure plus SSO plus custom integration',
    'trial_default',false,
    'trial_days',30,
    'custom_contract',true
  )
  else '{}'::jsonb
end,
updated_at=now()
where plan_key in ('agency','pro','elite','enterprise');

create or replace function public.platform_server_customer_portfolio()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  with snapshots as (
    select
      t.id,
      t.slug,
      b.display_name,
      l.stage,
      l.onboarding_status,
      l.trial_started_at,
      l.trial_ends_at,
      l.contracted_monthly_cents,
      l.contract_currency,
      pc.plan_key,
      pc.display_name as plan_name,
      pc.monthly_price_cents as list_monthly_price_cents,
      pc.price_currency,
      pa.billing_mode,
      public.platform_server_customer_snapshot(t.id) as customer_snapshot,
      public.platform_server_trial_scorecard(t.id) as trial_scorecard,
      public.platform_server_value_proof(t.id,30) as value_proof
    from platform.tenants t
    join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
    left join platform.tenant_branding b on b.tenant_id=t.id
    left join platform.tenant_plan_assignments pa on pa.tenant_id=t.id and pa.status='active'
    left join platform.plan_catalog pc on pc.plan_key=pa.plan_key
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'total_tenants',count(*),
      'external_customers',count(*) filter (where stage <> 'internal'),
      'live_customers',count(*) filter (where stage='live'),
      'active_trials',count(*) filter (where stage='trial' and (trial_ends_at is null or trial_ends_at >= now())),
      'demo_accounts',count(*) filter (where stage='demo'),
      'onboarding_accounts',count(*) filter (where stage='onboarding'),
      'at_risk_accounts',count(*) filter (where stage='at_risk'),
      'contracted_mrr_cents',coalesce(sum(contracted_monthly_cents) filter (where stage in ('live','onboarding','trial')),0)
    ),
    'customers',coalesce(jsonb_agg(jsonb_build_object(
      'tenant_id',id,
      'slug',slug,
      'display_name',display_name,
      'stage',stage,
      'onboarding_status',onboarding_status,
      'plan_key',plan_key,
      'plan_name',plan_name,
      'list_monthly_price_cents',list_monthly_price_cents,
      'price_currency',price_currency,
      'contracted_monthly_cents',contracted_monthly_cents,
      'contract_currency',contract_currency,
      'billing_mode',billing_mode,
      'trial_started_at',trial_started_at,
      'trial_ends_at',trial_ends_at,
      'trial_days_remaining',case when trial_ends_at is null then null else greatest(0,ceil(extract(epoch from (trial_ends_at-now()))/86400.0)::integer) end,
      'trial_status',trial_scorecard->>'status',
      'trial_success',(trial_scorecard->>'trial_success')::boolean,
      'onboarding_percentage',customer_snapshot->'onboarding'->>'percentage',
      'ready_to_go_live',(customer_snapshot->>'ready_to_go_live')::boolean,
      'ai_events_30d',value_proof->'ai'->>'events',
      'ai_cost_micros_30d',value_proof->'ai'->>'estimated_cost_micros',
      'value_activity_30d',value_proof->'measured_activity',
      'current_control',value_proof->'current_control'
    ) order by
      case stage when 'trial' then 1 when 'onboarding' then 2 when 'at_risk' then 3 when 'demo' then 4 when 'live' then 5 when 'internal' then 6 else 7 end,
      display_name),'[]'::jsonb)
  ) into v_result
  from snapshots;

  return v_result;
end;
$function$;

revoke all on function public.platform_server_customer_portfolio() from public, anon, authenticated;
grant execute on function public.platform_server_customer_portfolio() to service_role;;
