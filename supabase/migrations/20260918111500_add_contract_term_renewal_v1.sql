alter table platform.tenant_customer_lifecycle
  add column if not exists contract_term_ends_on date;

alter table platform.tenant_customer_lifecycle
  drop constraint if exists tenant_customer_lifecycle_contract_term_check;

alter table platform.tenant_customer_lifecycle
  add constraint tenant_customer_lifecycle_contract_term_check
  check (
    contract_term_ends_on is null
    or contracted_at is null
    or contract_term_ends_on >= contracted_at::date
  );

create or replace function public.platform_server_operator_set_contract_term(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_contract_term_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_contracted_at timestamptz;
  v_contract_cents integer;
begin
  if not exists(
    select 1
    from platform.platform_admins a
    where a.user_id=p_actor_user_id
      and a.status='active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  select
    l.contracted_at,
    l.contracted_monthly_cents,
    jsonb_build_object(
      'contract_term_ends_on',l.contract_term_ends_on,
      'contracted_at',l.contracted_at,
      'annual_commitment',l.annual_commitment
    )
  into v_contracted_at,v_contract_cents,v_before
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id
  for update;

  if not found then
    raise exception 'customer_lifecycle_not_found';
  end if;

  if coalesce(v_contract_cents,0)<=0 or v_contracted_at is null then
    raise exception 'commercial_contract_required';
  end if;

  if p_contract_term_ends_on is not null
     and p_contract_term_ends_on < v_contracted_at::date then
    raise exception 'invalid_contract_term_end';
  end if;

  update platform.tenant_customer_lifecycle
  set contract_term_ends_on=p_contract_term_ends_on,
      updated_at=now()
  where tenant_id=p_tenant_id;

  select jsonb_build_object(
    'contract_term_ends_on',l.contract_term_ends_on,
    'contracted_at',l.contracted_at,
    'annual_commitment',l.annual_commitment
  )
  into v_after
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id;

  if v_before is distinct from v_after then
    insert into platform.audit_events(
      tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
      before_state,after_state,metadata
    ) values (
      p_tenant_id,p_actor_user_id,'user',
      'platform.customer.contract_term_updated',
      'tenant',p_tenant_id::text,
      v_before,v_after,
      jsonb_build_object('source','platform_ops')
    );
  end if;

  return jsonb_build_object(
    'completed',true,
    'changed',v_before is distinct from v_after,
    'contract_term_ends_on',p_contract_term_ends_on
  );
end;
$function$;

revoke all on function public.platform_server_operator_set_contract_term(uuid,uuid,date)
from public,anon,authenticated;
grant execute on function public.platform_server_operator_set_contract_term(uuid,uuid,date)
to service_role;

create or replace function public.platform_server_customer_attention_with_renewal(
  p_tenant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_stage text;
  v_contract_cents integer;
  v_annual_commitment boolean:=false;
  v_contract_term_ends_on date;
  v_contract_days_left integer;
  v_rank integer;
  v_state text;
  v_label text;
  v_why text;
  v_due_at timestamptz;
  v_base_rank integer;
  v_base_requires_action boolean:=false;
  v_waiting_until timestamptz;
begin
  v_base:=public.platform_server_customer_attention(p_tenant_id);

  select
    l.stage,
    l.contracted_monthly_cents,
    coalesce(l.annual_commitment,false),
    l.contract_term_ends_on
  into
    v_stage,
    v_contract_cents,
    v_annual_commitment,
    v_contract_term_ends_on
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id;

  if not found
     or v_stage not in ('live','at_risk')
     or coalesce(v_contract_cents,0)<=0 then
    return v_base;
  end if;

  if v_contract_term_ends_on is null then
    if not v_annual_commitment then
      return v_base;
    end if;

    v_rank:=55;
    v_state:='now';
    v_label:='Record contract end date';
    v_why:='The annual commitment has no recorded end date, so ReDream cannot track the renewal window.';
    v_due_at:=null;
  else
    v_contract_days_left:=v_contract_term_ends_on-current_date;
    v_due_at:=(v_contract_term_ends_on::timestamp at time zone 'UTC');

    if v_contract_days_left<0 then
      v_rank:=9;
      v_state:='overdue';
      v_label:='Contract renewal overdue';
      v_why:='The recorded contract term has ended without a newer term date.';
    elsif v_contract_days_left<=30 then
      v_rank:=25;
      v_state:='now';
      v_label:='Renewal decision due';
      v_why:='The contract term ends within 30 days.';
    elsif v_contract_days_left<=60 then
      v_rank:=50;
      v_state:='soon';
      v_label:='Renewal window open';
      v_why:='The contract term ends within 60 days.';
    else
      return v_base;
    end if;
  end if;

  v_base_requires_action:=coalesce((v_base->>'requires_action')::boolean,false);
  v_base_rank:=coalesce((v_base->>'sort_rank')::integer,999);
  v_waiting_until:=nullif(v_base->>'waiting_until','')::timestamptz;

  if v_base_requires_action and v_base_rank<=v_rank then
    return v_base;
  end if;

  if v_contract_term_ends_on is not null
     and not v_base_requires_action
     and v_waiting_until is not null
     and v_waiting_until<=v_due_at then
    return v_base;
  end if;

  return jsonb_build_object(
    'requires_action',true,
    'state',v_state,
    'sort_rank',v_rank,
    'source','renewal',
    'label',v_label,
    'why_now',v_why,
    'responsible_party','redream',
    'due_at',v_due_at,
    'waiting_until',null,
    'contract_term_ends_on',v_contract_term_ends_on,
    'contract_days_left',v_contract_days_left
  );
end;
$function$;

revoke all on function public.platform_server_customer_attention_with_renewal(uuid)
from public,anon,authenticated;
grant execute on function public.platform_server_customer_attention_with_renewal(uuid)
to service_role;

create or replace function public.platform_server_operator_portfolio()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with customers as (
  select t.id,
    public.platform_server_customer_health(t.id)
      || jsonb_build_object(
        'activation_journey',public.platform_server_customer_activation(t.id),
        'go_live_readiness',public.platform_server_customer_go_live_readiness(t.id),
        'operator_intervention',public.platform_server_customer_intervention(t.id),
        'attention',public.platform_server_customer_attention_with_renewal(t.id)
      ) health
  from platform.tenants t
), rows as (
  select id,health,
    health->>'stage' stage,
    health->>'health_band' health_band,
    coalesce((health->'operator_intervention'->>'priority')::int,999) intervention_priority,
    coalesce((health->'attention'->>'sort_rank')::int,999) attention_rank,
    coalesce((health->'attention'->>'requires_action')::boolean,false) requires_action,
    health->'attention'->>'state' attention_state,
    health->'attention'->>'source' attention_source,
    health->'attention'->>'responsible_party' attention_responsible_party,
    nullif(health->'attention'->>'due_at','')::timestamptz attention_due_at,
    coalesce((health->'commercial'->>'contracted_monthly_cents')::bigint,0) contracted_monthly_cents,
    coalesce((health->'commercial'->>'ai_cost_micros_30d')::bigint,0) ai_cost_micros_30d,
    coalesce(jsonb_array_length(health->'expansion_signals'),0) expansion_count,
    (health->>'trial_days_left')::int trial_days_left,
    coalesce((health->'go_live_readiness'->>'ready')::boolean,false) launch_ready,
    coalesce((health->'go_live_readiness'->>'readiness_pct')::int,0) launch_readiness_pct
  from customers
)
select jsonb_build_object(
  'summary',jsonb_build_object(
    'total_tenants',count(*),
    'external_customers',count(*) filter(where stage<>'internal'),
    'active_trials',count(*) filter(where stage='trial' and (trial_days_left is null or trial_days_left>=0)),
    'trials_expiring_7d',count(*) filter(where stage='trial' and trial_days_left between 0 and 7),
    'onboarding_customers',count(*) filter(where stage='onboarding'),
    'live_customers',count(*) filter(where stage='live'),
    'at_risk_customers',count(*) filter(where health_band in ('risk','critical') and stage<>'internal'),
    'expansion_candidates',count(*) filter(where expansion_count>0 and stage<>'internal'),
    'contracted_mrr_cents',coalesce(sum(contracted_monthly_cents) filter(where stage in ('trial','onboarding','live','at_risk')),0),
    'ai_cost_micros_30d',coalesce(sum(ai_cost_micros_30d),0),
    'customers_needing_action',count(*) filter(where requires_action and stage<>'internal'),
    'due_now',count(*) filter(where requires_action and stage<>'internal'),
    'followups_due',count(*) filter(where requires_action and attention_source='follow_up' and stage<>'internal'),
    'trials_urgent',count(*) filter(where requires_action and attention_source='trial' and stage<>'internal'),
    'renewals_due',count(*) filter(where requires_action and attention_source='renewal' and stage<>'internal'),
    'stalled_activation',count(*) filter(where requires_action and attention_source='activation_stall' and stage<>'internal'),
    'waiting_on_agency',count(*) filter(where not requires_action and attention_state in ('waiting','scheduled','scheduled_today') and stage<>'internal'),
    'redream_actions',count(*) filter(where requires_action and stage<>'internal' and attention_responsible_party='redream'),
    'customer_actions',count(*) filter(where not requires_action and stage<>'internal' and attention_responsible_party='agency_owner'),
    'launch_ready',count(*) filter(where stage<>'internal' and launch_ready),
    'launch_blocked',count(*) filter(where stage<>'internal' and not launch_ready),
    'launch_readiness_avg',coalesce(round(avg(launch_readiness_pct) filter(where stage<>'internal')),0),
    'first_value_ready',count(*) filter(where stage<>'internal' and coalesce((health->'activation_journey'->>'first_value_ready')::boolean,false)),
    'activation_score_avg',coalesce(round(avg((health->'activation_journey'->>'score')::numeric) filter(where stage<>'internal')),0)
  ),
  'agenda',coalesce((
    select jsonb_agg(x.health order by x.attention_rank,x.attention_due_at nulls last,(x.health->>'display_name'))
    from (
      select * from rows
      where stage<>'internal' and requires_action
      order by attention_rank,attention_due_at nulls last,(health->>'display_name')
      limit 10
    ) x
  ),'[]'::jsonb),
  'customers',coalesce(jsonb_agg(
    health order by
      case stage when 'trial' then 1 when 'onboarding' then 2 when 'demo' then 3 when 'at_risk' then 4 when 'live' then 5 when 'internal' then 6 else 7 end,
      attention_rank,
      (health->>'display_name')
  ),'[]'::jsonb)
) from rows;
$function$;
