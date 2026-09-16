create table if not exists platform.tenant_value_settings (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  manual_minutes_per_capture numeric(8,2),
  manual_minutes_per_applied_action numeric(8,2),
  staff_hourly_cost_cents integer,
  currency text not null default 'EUR',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_value_settings_capture_minutes_check check (manual_minutes_per_capture is null or manual_minutes_per_capture >= 0),
  constraint tenant_value_settings_action_minutes_check check (manual_minutes_per_applied_action is null or manual_minutes_per_applied_action >= 0),
  constraint tenant_value_settings_staff_cost_check check (staff_hourly_cost_cents is null or staff_hourly_cost_cents >= 0),
  constraint tenant_value_settings_currency_check check (currency ~ '^[A-Z]{3}$')
);

alter table platform.tenant_value_settings enable row level security;
revoke all on platform.tenant_value_settings from public, anon, authenticated;

drop trigger if exists tenant_value_settings_touch_updated_at on platform.tenant_value_settings;
create trigger tenant_value_settings_touch_updated_at
before update on platform.tenant_value_settings
for each row execute function platform.touch_updated_at();

create or replace function public.platform_server_value_proof(
  p_tenant_id uuid,
  p_window_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_window_days integer := coalesce(p_window_days,30);
  v_since timestamptz;
  v_capture_count bigint := 0;
  v_action_count bigint := 0;
  v_tasks_completed bigint := 0;
  v_club_needs bigint := 0;
  v_player_matches bigint := 0;
  v_opportunities bigint := 0;
  v_interactions bigint := 0;
  v_meetings bigint := 0;
  v_open_tasks bigint := 0;
  v_overdue_tasks bigint := 0;
  v_players_needing_action bigint := 0;
  v_contracts_120 bigint := 0;
  v_ai_events bigint := 0;
  v_ai_cost bigint := 0;
  v_pipeline jsonb := '[]'::jsonb;
  v_manual_capture_minutes numeric;
  v_manual_action_minutes numeric;
  v_staff_hourly_cost_cents integer;
  v_currency text;
  v_estimated_minutes numeric;
  v_estimated_cost_cents numeric;
  v_estimate jsonb := null;
begin
  if v_window_days not between 1 and 366 then raise exception 'invalid_window_days'; end if;
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;

  v_since := now() - make_interval(days => v_window_days);

  select count(*) into v_capture_count
  from djm_os.captures c
  where c.tenant_id=p_tenant_id and c.status='done' and coalesce(c.completed_at,c.processed_at,c.created_at) >= v_since;

  select count(*) into v_action_count
  from djm_os.tell_djm_actions a
  where a.tenant_id=p_tenant_id and a.status='applied' and coalesce(a.applied_at,a.updated_at,a.created_at) >= v_since;

  select count(*) into v_tasks_completed
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id and t.completed_at is not null and t.completed_at >= v_since;

  select count(*) into v_club_needs
  from djm_os.club_needs n
  where n.tenant_id=p_tenant_id and n.created_at >= v_since;

  select count(*) into v_player_matches
  from djm_os.player_matches m
  where m.tenant_id=p_tenant_id and m.created_at >= v_since;

  select count(*) into v_opportunities
  from public.player_opportunities o
  where o.tenant_id=p_tenant_id and o.created_at >= v_since;

  select count(*) into v_interactions
  from djm_os.interactions i
  where i.tenant_id=p_tenant_id and i.created_at >= v_since;

  select count(*) into v_meetings
  from djm_os.meetings m
  where m.tenant_id=p_tenant_id and m.created_at >= v_since;

  select count(*) into v_open_tasks
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id and t.status='open';

  select count(*) into v_overdue_tasks
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id and t.status='open' and t.due_at is not null and t.due_at < now();

  select count(*) into v_players_needing_action
  from public.players p
  where p.tenant_id=p_tenant_id and p.next_action_due is not null and p.next_action_due < current_date;

  select count(*) into v_contracts_120
  from public.players p
  where p.tenant_id=p_tenant_id and p.contract_expiry is not null and p.contract_expiry between current_date and current_date + 120;

  select count(*), coalesce(sum(a.estimated_cost_micros),0)
  into v_ai_events, v_ai_cost
  from platform.ai_usage_events a
  where a.tenant_id=p_tenant_id and a.occurred_at >= v_since;

  select coalesce(jsonb_agg(jsonb_build_object(
    'currency',x.currency,
    'active_deals',x.active_deals,
    'expected_commission',x.expected_commission,
    'weighted_commission',x.weighted_commission
  ) order by x.currency),'[]'::jsonb)
  into v_pipeline
  from (
    select coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,
      count(*) filter (where coalesce(d.status,'open') not in ('closed','lost','cancelled')) as active_deals,
      coalesce(sum(d.expected_commission) filter (where coalesce(d.status,'open') not in ('closed','lost','cancelled')),0) as expected_commission,
      coalesce(sum(d.expected_commission * coalesce(d.probability, d.manual_probability, d.model_probability, 0) / 100.0) filter (where coalesce(d.status,'open') not in ('closed','lost','cancelled')),0) as weighted_commission
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id
    group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
  ) x;

  select s.manual_minutes_per_capture,s.manual_minutes_per_applied_action,s.staff_hourly_cost_cents,s.currency
  into v_manual_capture_minutes,v_manual_action_minutes,v_staff_hourly_cost_cents,v_currency
  from platform.tenant_value_settings s
  where s.tenant_id=p_tenant_id;

  if v_manual_capture_minutes is not null or v_manual_action_minutes is not null then
    v_estimated_minutes := coalesce(v_manual_capture_minutes,0) * v_capture_count + coalesce(v_manual_action_minutes,0) * v_action_count;
    if v_staff_hourly_cost_cents is not null then
      v_estimated_cost_cents := (v_estimated_minutes / 60.0) * v_staff_hourly_cost_cents;
    end if;
    v_estimate := jsonb_build_object(
      'enabled',true,
      'basis','customer_configured_baseline',
      'estimated_admin_minutes_avoided',round(v_estimated_minutes,1),
      'estimated_staff_cost_avoided_cents',case when v_estimated_cost_cents is null then null else round(v_estimated_cost_cents)::bigint end,
      'currency',coalesce(v_currency,'EUR'),
      'assumptions',jsonb_build_object(
        'manual_minutes_per_capture',v_manual_capture_minutes,
        'manual_minutes_per_applied_action',v_manual_action_minutes,
        'staff_hourly_cost_cents',v_staff_hourly_cost_cents
      )
    );
  else
    v_estimate := jsonb_build_object(
      'enabled',false,
      'basis','not_configured',
      'message','No time or labour saving estimate is shown until the customer sets their own baseline assumptions.'
    );
  end if;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'window',jsonb_build_object('days',v_window_days,'from',v_since,'to',now()),
    'measured_activity',jsonb_build_object(
      'tell_djm_captures_completed',v_capture_count,
      'tell_djm_actions_applied',v_action_count,
      'tasks_completed',v_tasks_completed,
      'club_needs_created',v_club_needs,
      'player_matches_created',v_player_matches,
      'opportunities_created',v_opportunities,
      'interactions_logged',v_interactions,
      'meetings_created',v_meetings
    ),
    'current_control',jsonb_build_object(
      'open_tasks',v_open_tasks,
      'overdue_tasks',v_overdue_tasks,
      'players_with_overdue_next_action',v_players_needing_action,
      'contracts_expiring_within_120_days',v_contracts_120
    ),
    'commercial_pipeline',v_pipeline,
    'ai',jsonb_build_object(
      'events',v_ai_events,
      'estimated_cost_micros',v_ai_cost
    ),
    'customer_baseline_estimate',v_estimate
  );
end;
$function$;

revoke all on function public.platform_server_value_proof(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_value_proof(uuid,integer) to service_role;

insert into platform.audit_events(tenant_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
select t.id,'system','value_proof.enabled','tenant',t.id::text,
  jsonb_build_object('measured_only_by_default',true),
  jsonb_build_object('migration','add_customer_value_proof_v1')
from platform.tenants t
where not exists (
  select 1 from platform.audit_events a
  where a.tenant_id=t.id and a.action='value_proof.enabled'
);;
