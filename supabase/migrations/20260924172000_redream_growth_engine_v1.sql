create table if not exists platform.demo_sales_events (
  id uuid primary key default gen_random_uuid(),
  demo_request_id uuid not null references platform.demo_requests(id) on delete cascade,
  actor_user_id uuid null,
  event_type text not null check (char_length(event_type) between 1 and 80),
  from_stage text null check (from_stage is null or char_length(from_stage) <= 40),
  to_stage text null check (to_stage is null or char_length(to_stage) <= 40),
  next_action text null check (next_action is null or char_length(next_action) <= 500),
  next_follow_up_at timestamptz null,
  demo_scheduled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table platform.demo_sales_events enable row level security;
revoke all on table platform.demo_sales_events from public, anon, authenticated;
grant select, insert on table platform.demo_sales_events to service_role;

create index if not exists demo_sales_events_request_created_idx
  on platform.demo_sales_events (demo_request_id, created_at desc);
create index if not exists demo_sales_events_stage_created_idx
  on platform.demo_sales_events (to_stage, created_at desc)
  where to_stage is not null;

create or replace function public.platform_server_operator_update_demo_request_sales(
  p_request_id uuid,
  p_sales_stage text,
  p_next_action text,
  p_next_follow_up_at timestamptz,
  p_demo_scheduled_at timestamptz,
  p_operator_notes text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before platform.demo_requests%rowtype;
  v_after platform.demo_requests%rowtype;
  v_stage text := lower(trim(coalesce(p_sales_stage, '')));
begin
  if v_stage not in ('new', 'contacted', 'demo', 'qualified', 'closed') then
    raise exception 'Unsupported sales stage';
  end if;

  select * into v_before
  from platform.demo_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Demo request not found'; end if;
  if v_before.status = 'converted' then
    raise exception 'Converted demo requests are managed from the customer lifecycle';
  end if;

  update platform.demo_requests
  set
    sales_stage = v_stage,
    status = case v_stage
      when 'new' then 'new'
      when 'contacted' then 'contacted'
      when 'demo' then 'contacted'
      when 'qualified' then 'qualified'
      when 'closed' then 'closed'
    end,
    next_action = nullif(trim(coalesce(p_next_action, '')), ''),
    next_follow_up_at = p_next_follow_up_at,
    demo_scheduled_at = p_demo_scheduled_at,
    operator_notes = nullif(trim(coalesce(p_operator_notes, '')), ''),
    contacted_at = case
      when v_stage in ('contacted', 'demo', 'qualified') then coalesce(contacted_at, now())
      else contacted_at
    end,
    contacted_by = case
      when v_stage in ('contacted', 'demo', 'qualified') then coalesce(contacted_by, p_actor_user_id)
      else contacted_by
    end,
    sales_owner_user_id = coalesce(sales_owner_user_id, p_actor_user_id),
    last_sales_activity_at = now(),
    updated_at = now()
  where id = p_request_id
  returning * into v_after;

  insert into platform.demo_sales_events (
    demo_request_id, actor_user_id, event_type, from_stage, to_stage,
    next_action, next_follow_up_at, demo_scheduled_at, metadata
  ) values (
    p_request_id,
    p_actor_user_id,
    case when v_before.sales_stage is distinct from v_after.sales_stage
      then 'stage_changed' else 'sales_context_updated' end,
    v_before.sales_stage,
    v_after.sales_stage,
    v_after.next_action,
    v_after.next_follow_up_at,
    v_after.demo_scheduled_at,
    jsonb_build_object('source', 'revenue_command_centre')
  );

  insert into platform.audit_events (
    tenant_id, actor_user_id, actor_kind, action, entity_type, entity_id,
    before_state, after_state, metadata
  ) values (
    null, p_actor_user_id, 'user', 'demo_request.sales_updated', 'demo_request',
    p_request_id::text, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('source', 'revenue_command_centre')
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.platform_server_operator_update_demo_request_sales(
  uuid, text, text, timestamptz, timestamptz, text, uuid
) from public, anon, authenticated;
grant execute on function public.platform_server_operator_update_demo_request_sales(
  uuid, text, text, timestamptz, timestamptz, text, uuid
) to service_role;

create or replace function public.platform_server_operator_update_demo_request(
  p_request_id uuid,
  p_status text,
  p_converted_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before platform.demo_requests%rowtype;
  v_after platform.demo_requests%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status not in ('contacted', 'qualified', 'converted', 'closed') then
    raise exception 'Unsupported demo request status';
  end if;

  select * into v_before
  from platform.demo_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Demo request not found'; end if;
  if v_before.status = 'converted' and v_status <> 'converted' then
    raise exception 'Converted demo requests cannot be moved back into the prospect queue';
  end if;
  if v_status = 'converted' and p_converted_tenant_id is null then
    raise exception 'converted_tenant_id is required when a demo request becomes a customer';
  end if;

  update platform.demo_requests
  set
    status = v_status,
    sales_stage = case
      when v_status = 'contacted' then 'contacted'
      when v_status = 'qualified' then 'qualified'
      when v_status = 'closed' then 'closed'
      else sales_stage
    end,
    converted_tenant_id = case when v_status = 'converted' then p_converted_tenant_id else null end,
    contacted_at = case
      when v_status in ('contacted', 'qualified', 'converted') then coalesce(contacted_at, now())
      else contacted_at
    end,
    contacted_by = case
      when v_status in ('contacted', 'qualified', 'converted') then coalesce(contacted_by, p_actor_user_id)
      else contacted_by
    end,
    last_sales_activity_at = now(),
    updated_at = now()
  where id = p_request_id
  returning * into v_after;

  insert into platform.demo_sales_events (
    demo_request_id, actor_user_id, event_type, from_stage, to_stage,
    next_action, next_follow_up_at, demo_scheduled_at, metadata
  ) values (
    p_request_id,
    p_actor_user_id,
    case when v_status = 'converted' then 'converted_to_customer' else 'status_changed' end,
    coalesce(v_before.sales_stage, v_before.status),
    case when v_status = 'converted' then 'customer' else coalesce(v_after.sales_stage, v_after.status) end,
    v_after.next_action,
    v_after.next_follow_up_at,
    v_after.demo_scheduled_at,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'platform_ops',
      'converted_tenant_id', case when v_status = 'converted' then p_converted_tenant_id else null end
    ))
  );

  insert into platform.audit_events (
    tenant_id, actor_user_id, actor_kind, action, entity_type, entity_id,
    before_state, after_state, metadata
  ) values (
    case when v_status = 'converted' then p_converted_tenant_id else null end,
    p_actor_user_id, 'user', 'demo_request.status_updated', 'demo_request',
    p_request_id::text, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('source', 'platform_ops')
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.platform_server_operator_update_demo_request(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.platform_server_operator_update_demo_request(uuid, text, uuid, uuid)
  to service_role;

create or replace function public.platform_server_operator_demo_requests(
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by r.needs_attention desc, r.attention_due_at asc nulls last, r.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select
      d.id,
      d.full_name,
      d.email,
      d.agency_name,
      d.website_url,
      d.staff_size,
      d.player_count,
      d.priority,
      d.requested_plan,
      d.status,
      d.sales_stage,
      coalesce(
        d.next_action,
        case
          when d.converted_tenant_id is not null then 'Customer lifecycle owns the next action'
          when d.sales_stage = 'qualified' then 'Agree a small trial or commercial start around one live workflow'
          when d.sales_stage = 'demo' then 'Run the demo, record the outcome and agree the next step before the call ends'
          when d.sales_stage = 'contacted' then 'Book the demo and ask them to bring one real agency situation'
          when d.sales_stage = 'closed' then null
          else 'Contact the agency and ask for one real club request, player situation or live deal'
        end
      ) as next_action,
      d.next_follow_up_at,
      d.demo_scheduled_at,
      d.operator_notes,
      d.sales_owner_user_id,
      d.last_sales_activity_at,
      d.converted_tenant_id,
      d.contacted_at,
      d.created_at,
      d.updated_at,
      (
        d.status not in ('converted', 'closed')
        and (
          d.sales_stage = 'new'
          or (d.next_follow_up_at is not null and d.next_follow_up_at <= now())
          or (
            d.sales_stage = 'demo'
            and d.demo_scheduled_at is not null
            and d.demo_scheduled_at <= now() + interval '24 hours'
          )
        )
      ) as needs_attention,
      case
        when d.status in ('converted', 'closed') then null
        when d.next_follow_up_at is not null and d.next_follow_up_at < now() then 'Follow-up overdue'
        when d.sales_stage = 'new' then 'New enquiry has not been worked'
        when d.sales_stage = 'demo'
          and d.demo_scheduled_at is not null
          and d.demo_scheduled_at <= now() + interval '24 hours'
          then 'Demo is due within 24 hours'
        else null
      end as attention_reason,
      case
        when d.sales_stage = 'demo'
          and d.next_follow_up_at is not null
          and d.demo_scheduled_at is not null
          then least(d.next_follow_up_at, d.demo_scheduled_at)
        when d.next_follow_up_at is not null then d.next_follow_up_at
        when d.sales_stage = 'demo' then d.demo_scheduled_at
        else null
      end as attention_due_at,
      jsonb_build_object(
        'conversion_source', d.conversion_source,
        'utm_source', d.utm_source,
        'utm_medium', d.utm_medium,
        'utm_campaign', d.utm_campaign,
        'referrer', d.referrer
      ) as acquisition,
      jsonb_build_object(
        'score', scores.intent_score + scores.fit_score,
        'intent_score', scores.intent_score,
        'fit_score', scores.fit_score,
        'temperature', case
          when scores.intent_score + scores.fit_score >= 75 then 'priority'
          when scores.intent_score + scores.fit_score >= 55 then 'engaged'
          else 'new'
        end,
        'event_count', coalesce(stats.event_count, 0),
        'sections_seen', coalesce(stats.sections_seen, 0),
        'story_seen', coalesce(stats.story_seen, false),
        'story_interactions', coalesce(stats.story_interactions, 0),
        'story_steps', coalesce(stats.story_steps, 0),
        'value_seen', coalesce(stats.value_seen, false),
        'control_seen', coalesce(stats.control_seen, false),
        'pricing_seen', coalesce(stats.pricing_seen, false),
        'demo_opened', coalesce(stats.demo_opened, false),
        'demo_step_2', coalesce(stats.demo_step_2, false),
        'cta_clicks', coalesce(stats.cta_clicks, 0),
        'first_seen_at', stats.first_seen_at,
        'last_seen_at', stats.last_seen_at,
        'reasons', to_jsonb(array_remove(array[
          case when coalesce(stats.story_interactions, 0) > 0 then 'Used the how-it-works story' end,
          case when coalesce(stats.pricing_seen, false) then 'Viewed pricing' end,
          case when coalesce(stats.value_seen, false) then 'Read the problem-to-outcome section' end,
          case when coalesce(stats.control_seen, false) then 'Read how control works' end,
          case when d.staff_size in ('16-30', '31+') then 'Larger agency team' end,
          case when d.player_count in ('101-250', '251+') then 'Larger represented roster' end,
          case when d.requested_plan in ('elite', 'enterprise') then 'Higher plan interest' end
        ], null))
      ) as lead_intelligence,
      jsonb_build_object(
        'headline', case
          when d.converted_tenant_id is not null then 'This lead is now a customer.'
          when coalesce(stats.pricing_seen, false) and coalesce(stats.story_interactions, 0) > 0
            then 'They used the example and reached pricing.'
          when coalesce(stats.story_interactions, 0) > 0
            then 'They actively used the example before enquiring.'
          when coalesce(stats.pricing_seen, false)
            then 'They reached pricing before enquiring.'
          else 'They submitted an enquiry. Use one real situation to qualify the need.'
        end,
        'what_to_show', to_jsonb(array_remove(array[
          'Show one club request becoming a player match, relationship route and next action.',
          case when d.staff_size in ('16-30', '31+')
            then 'Show how a team can see the same follow-up and ownership.'
            else 'Keep the demo focused on one real situation rather than the whole platform.' end,
          case when coalesce(stats.pricing_seen, false) or d.requested_plan is not null
            then 'Confirm which plan fits only after the workflow value is clear.'
            else 'Show the value first. Leave pricing until the workflow makes sense.' end
        ], null)),
        'questions', to_jsonb(array[
          'Where do club requests normally arrive today?',
          case when d.staff_size in ('16-30', '31+')
            then 'How does your team know who owns each follow-up?'
            else 'How do you make sure an important follow-up is not forgotten?' end,
          'What would ReDream need to make easier for you to change the way you work?'
        ]),
        'proof_to_use', 'Use DJM Sports Management as the real operating example. Show the workflow and real product use, not invented results.',
        'recommended_action', case
          when d.converted_tenant_id is not null then 'Customer lifecycle owns the next action.'
          when d.sales_stage = 'qualified' then 'Agree a small trial or commercial start around one live workflow.'
          when d.sales_stage = 'demo' then 'Run the demo, record the outcome and agree one next step before the call ends.'
          when d.sales_stage = 'contacted' then 'Book the demo. Ask them to bring one real club request, player situation or live deal.'
          when d.sales_stage = 'closed' then 'No active action. Keep the reason for the loss in the sales notes.'
          else 'Contact them today. Ask for one real situation and offer a short workflow demo.'
        end,
        'why', to_jsonb(array_remove(array[
          case when coalesce(stats.story_interactions, 0) > 0 then 'They interacted with the simple product story.' end,
          case when coalesce(stats.pricing_seen, false) then 'They reached pricing.' end,
          case when d.priority is not null then 'They told us what they want help with.' end,
          case when d.staff_size is not null then 'Agency size is known.' end,
          case when d.player_count is not null then 'Roster size is known.' end
        ], null))
      ) as sales_brief,
      coalesce(journey.events, '[]'::jsonb) as journey,
      coalesce(history.events, '[]'::jsonb) as sales_history
    from platform.demo_requests d
    left join lateral (
      select
        count(*)::integer as event_count,
        count(distinct e.section_key) filter (where e.event_name = 'section_view')::integer as sections_seen,
        coalesce(bool_or(e.event_name = 'section_view' and e.section_key = 'how-it-works'), false) as story_seen,
        count(*) filter (
          where e.event_name = 'product_mode' and e.metadata->>'mode' = 'simple_story'
        )::integer as story_interactions,
        count(distinct e.metadata->>'variant') filter (
          where e.event_name = 'product_mode' and e.metadata->>'mode' = 'simple_story'
        )::integer as story_steps,
        coalesce(bool_or(e.event_name = 'section_view' and e.section_key = 'value'), false) as value_seen,
        coalesce(bool_or(e.event_name = 'section_view' and e.section_key = 'control'), false) as control_seen,
        coalesce(bool_or(e.event_name = 'section_view' and e.section_key = 'pricing'), false) as pricing_seen,
        coalesce(bool_or(e.event_name = 'demo_open'), false) as demo_opened,
        coalesce(bool_or(e.event_name = 'demo_step_2'), false) as demo_step_2,
        count(*) filter (where e.event_name = 'cta_click')::integer as cta_clicks,
        min(e.created_at) as first_seen_at,
        max(e.created_at) as last_seen_at
      from platform.public_funnel_events e
      where d.session_id is not null and e.session_id = d.session_id
    ) stats on true
    left join lateral (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'event_name', x.event_name,
        'section_key', x.section_key,
        'scenario_kind', x.scenario_kind,
        'cta_key', x.cta_key,
        'mode', x.metadata->>'mode',
        'variant', x.metadata->>'variant',
        'plan', x.metadata->>'plan',
        'created_at', x.created_at
      )) order by x.created_at asc) as events
      from (
        select e.*
        from platform.public_funnel_events e
        where d.session_id is not null and e.session_id = d.session_id
        order by e.created_at desc
        limit 40
      ) x
    ) journey on true
    left join lateral (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'event_type', x.event_type,
        'from_stage', x.from_stage,
        'to_stage', x.to_stage,
        'next_action', x.next_action,
        'next_follow_up_at', x.next_follow_up_at,
        'demo_scheduled_at', x.demo_scheduled_at,
        'created_at', x.created_at
      )) order by x.created_at asc) as events
      from (
        select s.*
        from platform.demo_sales_events s
        where s.demo_request_id = d.id
        order by s.created_at desc
        limit 24
      ) x
    ) history on true
    cross join lateral (
      select
        least(60,
          20
          + case when coalesce(stats.story_seen, false) then 6 else 0 end
          + case when coalesce(stats.story_interactions, 0) > 0 then 10 else 0 end
          + case when coalesce(stats.story_steps, 0) >= 2 then 4 else 0 end
          + case when coalesce(stats.value_seen, false) then 5 else 0 end
          + case when coalesce(stats.control_seen, false) then 3 else 0 end
          + case when coalesce(stats.pricing_seen, false) then 7 else 0 end
          + case when coalesce(stats.cta_clicks, 0) >= 2 then 3 else 0 end
          + case when coalesce(stats.demo_step_2, false) then 2 else 0 end
        )::integer as intent_score,
        least(40,
          case d.staff_size
            when '1-5' then 4 when '6-15' then 9 when '16-30' then 14 when '31+' then 18 else 0 end
          + case d.player_count
            when '1-40' then 4 when '41-100' then 9 when '101-250' then 14 when '251+' then 18 else 0 end
          + case d.requested_plan
            when 'agency' then 2 when 'pro' then 4 when 'elite' then 6 when 'enterprise' then 8 else 0 end
        )::integer as fit_score
    ) scores
    order by needs_attention desc, attention_due_at asc nulls last, d.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) r;
$$;

revoke all on function public.platform_server_operator_demo_requests(integer)
  from public, anon, authenticated;
grant execute on function public.platform_server_operator_demo_requests(integer)
  to service_role;

create or replace function public.platform_server_operator_funnel_summary(
  p_days integer default 30
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with bounds as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as starts_at
  ),
  events as (
    select e.*
    from platform.public_funnel_events e, bounds b
    where e.created_at >= b.starts_at
      and e.source_host in ('redreamsystems.com', 'www.redreamsystems.com')
  ),
  session_source as (
    select
      e.session_id,
      coalesce(
        max(nullif(lower(e.utm_source), '')),
        case when max(nullif(e.referrer, '')) is null then 'direct' else 'referral' end
      ) as source
    from events e
    group by e.session_id
  ),
  visited as (
    select distinct session_id from events where event_name = 'page_view'
  ),
  story_seen as (
    select distinct session_id from events
    where event_name = 'section_view' and section_key = 'how-it-works'
  ),
  story_used as (
    select distinct session_id from events
    where event_name = 'product_mode' and metadata->>'mode' = 'simple_story'
  ),
  pricing as (
    select distinct session_id from events
    where event_name = 'section_view' and section_key = 'pricing'
  ),
  opened as (
    select distinct session_id from events where event_name = 'demo_open'
  ),
  leads as (
    select d.*,
      coalesce(
        nullif(lower(d.utm_source), ''),
        case when nullif(d.referrer, '') is null then 'direct' else 'referral' end
      ) as marketing_source
    from platform.demo_requests d, bounds b
    where d.created_at >= b.starts_at
      and d.source_host in ('redreamsystems.com', 'www.redreamsystems.com')
  ),
  lead_value as (
    select
      l.*,
      lifecycle.stage as customer_stage,
      lifecycle.trial_started_at,
      lifecycle.contracted_at,
      lifecycle.contracted_monthly_cents,
      lifecycle.contract_currency
    from leads l
    left join platform.tenant_customer_lifecycle lifecycle
      on lifecycle.tenant_id = l.converted_tenant_id
  ),
  source_visits as (
    select ss.source, count(distinct v.session_id)::integer as visits
    from visited v
    join session_source ss on ss.session_id = v.session_id
    group by ss.source
  ),
  source_story as (
    select ss.source, count(distinct s.session_id)::integer as story_used
    from story_used s
    join session_source ss on ss.session_id = s.session_id
    group by ss.source
  ),
  source_pricing as (
    select ss.source, count(distinct p.session_id)::integer as pricing
    from pricing p
    join session_source ss on ss.session_id = p.session_id
    group by ss.source
  ),
  source_demo_open as (
    select ss.source, count(distinct o.session_id)::integer as demo_opens
    from opened o
    join session_source ss on ss.session_id = o.session_id
    group by ss.source
  ),
  source_leads as (
    select
      l.marketing_source as source,
      count(*)::integer as requests,
      count(*) filter (where l.status in ('qualified', 'converted') or l.sales_stage = 'qualified')::integer as qualified,
      count(distinct l.converted_tenant_id) filter (where l.trial_started_at is not null)::integer as trials,
      count(distinct l.converted_tenant_id) filter (where l.contracted_at is not null)::integer as customers
    from lead_value l
    group by l.marketing_source
  ),
  sources as (
    select source from source_visits
    union select source from source_story
    union select source from source_pricing
    union select source from source_demo_open
    union select source from source_leads
  ),
  attribution as (
    select
      s.source,
      coalesce(v.visits, 0) as visits,
      coalesce(st.story_used, 0) as story_used,
      coalesce(p.pricing, 0) as pricing,
      coalesce(o.demo_opens, 0) as demo_opens,
      coalesce(l.requests, 0) as requests,
      coalesce(l.qualified, 0) as qualified,
      coalesce(l.trials, 0) as trials,
      coalesce(l.customers, 0) as customers,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('currency', r.currency, 'mrr_cents', r.mrr_cents)
          order by r.mrr_cents desc, r.currency
        )
        from (
          select
            upper(coalesce(nullif(lv.contract_currency, ''), 'EUR')) as currency,
            sum(lv.contracted_monthly_cents)::bigint as mrr_cents
          from lead_value lv
          where lv.marketing_source = s.source
            and lv.contracted_at is not null
            and lv.contracted_monthly_cents is not null
          group by 1
        ) r
      ), '[]'::jsonb) as mrr_by_currency
    from sources s
    left join source_visits v using (source)
    left join source_story st using (source)
    left join source_pricing p using (source)
    left join source_demo_open o using (source)
    left join source_leads l using (source)
  ),
  speed as (
    select
      round(avg(extract(epoch from (l.contacted_at - l.created_at)) / 3600.0)
        filter (where l.contacted_at is not null), 1) as avg_contact_hours,
      round(avg(extract(epoch from (l.contracted_at - l.created_at)) / 86400.0)
        filter (where l.contracted_at is not null), 1) as avg_customer_days
    from lead_value l
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'sessions', (select count(*) from visited),
    'interactive_sessions', (select count(*) from story_used),
    'story_seen_sessions', (select count(*) from story_seen),
    'story_used_sessions', (select count(*) from story_used),
    'pricing_sessions', (select count(*) from pricing),
    'demo_open_sessions', (select count(*) from opened),
    'leads', (select count(*) from leads),
    'contacted_leads', (select count(*) from leads where contacted_at is not null),
    'demo_leads', (select count(*) from leads where sales_stage in ('demo', 'qualified') or demo_scheduled_at is not null),
    'qualified_leads', (select count(*) from leads where status in ('qualified', 'converted') or sales_stage = 'qualified'),
    'trial_leads', (select count(distinct converted_tenant_id) from lead_value where trial_started_at is not null),
    'converted_leads', (select count(distinct converted_tenant_id) from lead_value where contracted_at is not null),
    'new_mrr_by_currency', coalesce((
      select jsonb_agg(
        jsonb_build_object('currency', r.currency, 'mrr_cents', r.mrr_cents)
        order by r.mrr_cents desc, r.currency
      )
      from (
        select
          upper(coalesce(nullif(contract_currency, ''), 'EUR')) as currency,
          sum(contracted_monthly_cents)::bigint as mrr_cents
        from lead_value
        where contracted_at is not null
          and contracted_monthly_cents is not null
        group by 1
      ) r
    ), '[]'::jsonb),
    'visit_to_lead_pct', case
      when (select count(*) from visited) = 0 then 0
      else round(100.0 * (select count(*) from leads) / (select count(*) from visited), 1)
    end,
    'interactive_to_lead_pct', case
      when (select count(*) from story_used) = 0 then 0
      else round(100.0 * (
        select count(*) from leads l where l.session_id in (select session_id from story_used)
      ) / (select count(*) from story_used), 1)
    end,
    'top_scenario', 'simple_story',
    'funnel', jsonb_build_array(
      jsonb_build_object('key','visit','label','Visits','count',(select count(*) from visited)),
      jsonb_build_object('key','story_seen','label','Saw example','count',(select count(*) from story_seen)),
      jsonb_build_object('key','story_used','label','Used example','count',(select count(*) from story_used)),
      jsonb_build_object('key','pricing','label','Saw pricing','count',(select count(*) from pricing)),
      jsonb_build_object('key','demo_open','label','Opened demo','count',(select count(*) from opened)),
      jsonb_build_object('key','request','label','Sent request','count',(select count(*) from leads)),
      jsonb_build_object('key','contacted','label','Contacted','count',(select count(*) from leads where contacted_at is not null)),
      jsonb_build_object('key','demo','label','Demo','count',(select count(*) from leads where sales_stage in ('demo','qualified') or demo_scheduled_at is not null)),
      jsonb_build_object('key','qualified','label','Qualified','count',(select count(*) from leads where status in ('qualified','converted') or sales_stage='qualified')),
      jsonb_build_object('key','trial','label','Trial','count',(select count(distinct converted_tenant_id) from lead_value where trial_started_at is not null)),
      jsonb_build_object('key','customer','label','Customer','count',(select count(distinct converted_tenant_id) from lead_value where contracted_at is not null))
    ),
    'attribution', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', a.source,
        'visits', a.visits,
        'story_used', a.story_used,
        'pricing', a.pricing,
        'demo_opens', a.demo_opens,
        'requests', a.requests,
        'qualified', a.qualified,
        'trials', a.trials,
        'customers', a.customers,
        'mrr_by_currency', a.mrr_by_currency,
        'visit_to_request_pct', case when a.visits = 0 then 0 else round(100.0*a.requests/a.visits,1) end,
        'request_to_customer_pct', case when a.requests = 0 then 0 else round(100.0*a.customers/a.requests,1) end
      ) order by a.customers desc, a.requests desc, a.visits desc, a.source)
      from attribution a
    ), '[]'::jsonb),
    'speed', jsonb_build_object(
      'avg_contact_hours', (select avg_contact_hours from speed),
      'avg_customer_days', (select avg_customer_days from speed)
    ),
    'top_sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'leads', x.requests)
        order by x.requests desc, x.source)
      from (select * from attribution order by requests desc, source limit 5) x
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.platform_server_operator_funnel_summary(integer)
  from public, anon, authenticated;
grant execute on function public.platform_server_operator_funnel_summary(integer)
  to service_role;

comment on table platform.demo_sales_events is
  'Append-only operator sales activity history for ReDream inbound demo requests.';
comment on function public.platform_server_operator_demo_requests(integer) is
  'Operator prospect workbench with V6.1 website intent signals, deterministic sales brief and activity history.';
comment on function public.platform_server_operator_funnel_summary(integer) is
  'Closed-loop ReDream marketing funnel and source-to-customer revenue attribution.';
