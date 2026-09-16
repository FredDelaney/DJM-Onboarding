alter table platform.tenant_owner_invites
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists first_sent_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0;

alter table platform.tenant_owner_invites
  drop constraint if exists tenant_owner_invites_open_count_check,
  add constraint tenant_owner_invites_open_count_check check (open_count >= 0),
  drop constraint if exists tenant_owner_invites_send_count_check,
  add constraint tenant_owner_invites_send_count_check check (send_count >= 0);

create or replace function public.platform_server_public_owner_invite_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text := trim(p_token);
  v_hash text;
  v_invite platform.tenant_owner_invites%rowtype;
  v_payload jsonb;
begin
  if v_token = '' or length(v_token) <> 64 or v_token !~ '^[0-9a-fA-F]{64}$' then
    return null;
  end if;

  v_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  update platform.tenant_owner_invites
  set first_opened_at = coalesce(first_opened_at, now()),
      last_opened_at = now(),
      open_count = open_count + 1,
      updated_at = now()
  where token_hash = v_hash
    and status = 'pending'
    and expires_at > now()
  returning * into v_invite;

  if not found then return null; end if;

  select public.platform_server_public_owner_invite_preflight(v_token) into v_payload;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    v_invite.tenant_id,null,'system','platform.owner_invite.opened','tenant_owner_invite',v_invite.id::text,
    jsonb_build_object('open_count',v_invite.open_count,'first_opened_at',coalesce(v_invite.first_opened_at,now()),'last_opened_at',now()),
    jsonb_build_object('source','agency_owner_invite_public')
  );

  return v_payload || jsonb_build_object(
    'engagement', jsonb_build_object(
      'first_opened_at',coalesce(v_invite.first_opened_at,now()),
      'last_opened_at',now(),
      'open_count',v_invite.open_count
    )
  );
end;
$function$;

create or replace function public.platform_server_operator_mark_owner_invite_sent(
  p_invite_id uuid,
  p_actor_user_id uuid,
  p_channel text default 'link'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invite platform.tenant_owner_invites%rowtype;
  v_channel text := lower(trim(coalesce(p_channel,'link'));
begin
  if not exists (
    select 1 from platform.platform_admins
    where user_id = p_actor_user_id and status = 'active'
  ) then
    raise exception 'platform_operator_access_required';
  end if;

  if v_channel not in ('email','link','manual') then
    raise exception 'invalid_invite_channel';
  end if;

  update platform.tenant_owner_invites
  set first_sent_at = coalesce(first_sent_at, now()),
      last_sent_at = now(),
      send_count = send_count + 1,
      metadata = metadata || jsonb_build_object('last_send_channel',v_channel),
      updated_at = now()
  where id = p_invite_id and status = 'pending' and expires_at > now()
  returning * into v_invite;

  if not found then raise exception 'pending_owner_invite_not_found'; end if;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    v_invite.tenant_id,p_actor_user_id,'user','platform.owner_invite.sent','tenant_owner_invite',v_invite.id::text,
    jsonb_build_object('send_count',v_invite.send_count,'first_sent_at',v_invite.first_sent_at,'last_sent_at',v_invite.last_sent_at),
    jsonb_build_object('source','platform_ops','channel',v_channel)
  );

  return jsonb_build_object(
    'invite_id',v_invite.id,
    'tenant_id',v_invite.tenant_id,
    'status',v_invite.status,
    'send_count',v_invite.send_count,
    'first_sent_at',v_invite.first_sent_at,
    'last_sent_at',v_invite.last_sent_at,
    'channel',v_channel
  );
end;
$function$;

create or replace function public.platform_server_customer_activation(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with metrics as (
  select
    p_tenant_id tenant_id,
    (select count(*)::int from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role='owner') owner_count,
    (select count(*)::int from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role<>'player') staff_count,
    (select count(*)::int from public.players p where p.tenant_id=p_tenant_id) roster_player_count,
    (select count(*)::int from djm_os.relationships r where r.tenant_id=p_tenant_id) relationship_count,
    (select count(*)::int from public.player_opportunities o where o.tenant_id=p_tenant_id) player_opportunity_count,
    (select count(*)::int from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.status='active') active_club_need_count,
    (select count(*)::int from djm_os.tasks t where t.tenant_id=p_tenant_id and (t.completed_at is not null or t.status in ('done','complete','completed'))) completed_action_count,
    (select count(*)::int from platform.ai_usage_events a where a.tenant_id=p_tenant_id) ai_event_count,
    (select min(p.created_at) from public.players p where p.tenant_id=p_tenant_id) first_player_at,
    (select min(r.created_at) from djm_os.relationships r where r.tenant_id=p_tenant_id) first_relationship_at,
    (select min(o.created_at) from public.player_opportunities o where o.tenant_id=p_tenant_id) first_player_opportunity_at,
    (select min(n.created_at) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.status='active') first_club_need_at,
    (select min(coalesce(t.completed_at,t.updated_at)) from djm_os.tasks t where t.tenant_id=p_tenant_id and (t.completed_at is not null or t.status in ('done','complete','completed'))) first_completed_action_at,
    (select min(a.occurred_at) from platform.ai_usage_events a where a.tenant_id=p_tenant_id) first_ai_at,
    (select min(m.joined_at) from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role='owner') owner_activated_at,
    (select max(case when i.status='accepted' then i.accepted_at end) from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id) invite_accepted_at,
    (select max(i.first_opened_at) from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id) invite_opened_at,
    (select max(i.first_sent_at) from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id) invite_sent_at,
    (select count(*)::int from platform.tenant_onboarding_tasks x where x.tenant_id=p_tenant_id and x.required) required_tasks,
    (select count(*)::int from platform.tenant_onboarding_tasks x where x.tenant_id=p_tenant_id and x.required and x.status in ('complete','waived')) completed_required_tasks
), scored as (
  select *,
    least(100,
      (case when owner_count>0 then 20 else 0 end) +
      (case when roster_player_count>0 then 20 else 0 end) +
      (case when relationship_count>0 then 15 else 0 end) +
      (case when player_opportunity_count>0 or active_club_need_count>0 then 20 else 0 end) +
      (case when completed_action_count>0 then 15 else 0 end) +
      (case when staff_count>1 then 5 else 0 end) +
      (case when ai_event_count>0 then 5 else 0 end)
    )::int activation_score,
    (owner_count>0 and roster_player_count>0 and relationship_count>0 and (player_opportunity_count>0 or active_club_need_count>0)) first_value_ready,
    case
      when owner_count=0 then 'owner_activation'
      when roster_player_count=0 then 'load_roster'
      when relationship_count=0 then 'add_club_relationship'
      when player_opportunity_count=0 and active_club_need_count=0 then 'create_live_opportunity'
      when completed_action_count=0 then 'complete_first_action'
      when staff_count<=1 then 'invite_team'
      when ai_event_count=0 then 'use_intelligence'
      else 'activation_complete'
    end next_activation_step
  from metrics
)
select jsonb_build_object(
  'score',activation_score,
  'first_value_ready',first_value_ready,
  'next_step',next_activation_step,
  'counts',jsonb_build_object(
    'owners',owner_count,
    'staff',staff_count,
    'roster_players',roster_player_count,
    'relationships',relationship_count,
    'player_opportunities',player_opportunity_count,
    'active_club_needs',active_club_need_count,
    'completed_actions',completed_action_count,
    'ai_events',ai_event_count
  ),
  'milestones',jsonb_build_array(
    jsonb_build_object('key','owner_activation','label','Owner activated','complete',owner_count>0,'weight',20,'completed_at',owner_activated_at),
    jsonb_build_object('key','load_roster','label','First player loaded','complete',roster_player_count>0,'weight',20,'completed_at',first_player_at),
    jsonb_build_object('key','add_club_relationship','label','First club relationship added','complete',relationship_count>0,'weight',15,'completed_at',first_relationship_at),
    jsonb_build_object('key','create_live_opportunity','label','First live opportunity captured','complete',(player_opportunity_count>0 or active_club_need_count>0),'weight',20,'completed_at',least(first_player_opportunity_at,first_club_need_at)),
    jsonb_build_object('key','complete_first_action','label','First action completed','complete',completed_action_count>0,'weight',15,'completed_at',first_completed_action_at),
    jsonb_build_object('key','invite_team','label','Second staff member active','complete',staff_count>1,'weight',5,'completed_at',null),
    jsonb_build_object('key','use_intelligence','label','First intelligence action used','complete',ai_event_count>0,'weight',5,'completed_at',first_ai_at)
  ),
  'invite',jsonb_build_object('sent_at',invite_sent_at,'opened_at',invite_opened_at,'accepted_at',invite_accepted_at),
  'onboarding',jsonb_build_object('required_total',required_tasks,'required_complete',completed_required_tasks)
)
from scored;
$function$;

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
      || jsonb_build_object('activation_journey',public.platform_server_customer_activation(t.id)) health
  from platform.tenants t
), rows as (
  select id,health,
    health->>'stage' stage,
    health->>'health_band' health_band,
    health->>'next_action' next_action,
    coalesce((health->>'action_priority')::int,999) action_priority,
    coalesce((health->'commercial'->>'contracted_monthly_cents')::bigint,0) contracted_monthly_cents,
    coalesce((health->'commercial'->>'ai_cost_micros_30d')::bigint,0) ai_cost_micros_30d,
    coalesce(jsonb_array_length(health->'expansion_signals'),0) expansion_count,
    coalesce(jsonb_array_length(health->'risk_flags'),0) risk_count,
    (health->>'trial_days_left')::int trial_days_left
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
    'customers_needing_action',count(*) filter(where action_priority<80 and stage<>'internal'),
    'first_value_ready',count(*) filter(where stage<>'internal' and coalesce((health->'activation_journey'->>'first_value_ready')::boolean,false)),
    'activation_score_avg',coalesce(round(avg((health->'activation_journey'->>'score')::numeric) filter(where stage<>'internal')),0)
  ),
  'agenda',coalesce((select jsonb_agg(x.health order by x.action_priority,(x.health->>'health_score')::int asc) from (select * from rows where stage<>'internal' and action_priority<80 order by action_priority,(health->>'health_score')::int asc limit 10) x),'[]'::jsonb),
  'customers',coalesce(jsonb_agg(health order by case stage when 'trial' then 1 when 'onboarding' then 2 when 'at_risk' then 3 when 'live' then 4 when 'internal' then 5 else 6 end,action_priority,(health->>'display_name')),'[]'::jsonb)
) from rows;
$function$;

create or replace function public.platform_server_operator_customer_detail(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when exists(select 1 from platform.tenants t0 where t0.id = p_tenant_id) then
    jsonb_build_object(
      'tenant', (select to_jsonb(x) from (select t.id,t.slug,t.tenant_type,t.status,t.legal_name,t.metadata,t.created_at,t.updated_at from platform.tenants t where t.id=p_tenant_id) x),
      'branding', (select to_jsonb(x) from (select b.* from platform.tenant_branding b where b.tenant_id=p_tenant_id) x),
      'lifecycle', (select to_jsonb(x) from (select l.* from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id) x),
      'plan', (select to_jsonb(x) from (select a.plan_key,a.status,a.billing_mode,a.effective_from,a.effective_until,a.configuration from platform.tenant_plan_assignments a where a.tenant_id=p_tenant_id and a.status in ('trialing','active') order by a.effective_from desc limit 1) x),
      'activation_journey', public.platform_server_customer_activation(p_tenant_id),
      'domains', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select d.id,d.hostname,d.domain_type,d.status,d.is_primary,d.verified_at,d.created_at from platform.tenant_domains d where d.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'owner_invites', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select i.id,i.email,case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end status,i.expires_at,i.first_sent_at,i.last_sent_at,i.send_count,i.first_opened_at,i.last_opened_at,i.open_count,i.accepted_by,i.accepted_at,i.revoked_at,i.created_by,i.created_at from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id order by i.created_at desc limit 20) x),'[]'::jsonb),
      'onboarding_tasks', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from (select o.task_key,o.category,o.title,o.description,o.status,o.required,o.sort_order,o.blocked_reason,o.completed_at from platform.tenant_onboarding_tasks o where o.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'memberships', coalesce((select jsonb_agg(to_jsonb(x) order by x.joined_at) from (select m.user_id,m.role,m.status,m.is_primary,m.joined_at from platform.tenant_memberships m where m.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'feature_overrides', coalesce((select jsonb_agg(to_jsonb(x) order by x.feature_key) from (select e.feature_key,e.enabled,e.source,e.configuration,e.valid_from,e.valid_until,e.updated_at from platform.tenant_entitlements e where e.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'audit', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select a.id,a.actor_user_id,a.actor_kind,a.action,a.entity_type,a.entity_id,a.after_state,a.metadata,a.occurred_at from platform.audit_events a where a.tenant_id=p_tenant_id order by a.occurred_at desc limit 50) x),'[]'::jsonb)
    )
  else null end;
$function$;

revoke all on function public.platform_server_public_owner_invite_open(text) from public, anon, authenticated;
revoke all on function public.platform_server_operator_mark_owner_invite_sent(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.platform_server_customer_activation(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_public_owner_invite_open(text) to service_role;
grant execute on function public.platform_server_operator_mark_owner_invite_sent(uuid,uuid,text) to service_role;
grant execute on function public.platform_server_customer_activation(uuid) to service_role;

revoke all on function public.platform_server_operator_portfolio() from public, anon, authenticated;
revoke all on function public.platform_server_operator_customer_detail(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_operator_portfolio() to service_role;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
