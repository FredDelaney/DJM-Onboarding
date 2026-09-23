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
      d.next_action,
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
        when d.next_follow_up_at is not null and d.next_follow_up_at < now()
          then 'Follow-up overdue'
        when d.sales_stage = 'new'
          then 'New enquiry has not been worked'
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
        'temperature',
          case
            when scores.intent_score + scores.fit_score >= 75 then 'priority'
            when scores.intent_score + scores.fit_score >= 55 then 'engaged'
            else 'new'
          end,
        'event_count', coalesce(stats.event_count, 0),
        'sections_seen', coalesce(stats.sections_seen, 0),
        'scenario_runs', coalesce(stats.scenario_runs, 0),
        'scenario_types', coalesce(stats.scenario_types, 0),
        'top_scenario', top_scenario.scenario_kind,
        'product_modes', coalesce(stats.product_modes, 0),
        'cta_clicks', coalesce(stats.cta_clicks, 0),
        'pricing_seen', coalesce(stats.pricing_seen, false),
        'autopilot_seen', coalesce(stats.autopilot_seen, false),
        'first_seen_at', stats.first_seen_at,
        'last_seen_at', stats.last_seen_at,
        'reasons',
          to_jsonb(
            array_remove(
              array[
                case when coalesce(stats.scenario_runs, 0) > 0
                  then 'Ran the interactive agency scenario' end,
                case when coalesce(stats.scenario_types, 0) >= 2
                  then 'Explored multiple situation types' end,
                case when coalesce(stats.product_modes, 0) > 0
                  then 'Explored the product workspace' end,
                case when coalesce(stats.pricing_seen, false)
                  then 'Viewed pricing' end,
                case when coalesce(stats.autopilot_seen, false)
                  then 'Viewed Agency Autopilot' end,
                case when d.staff_size in ('16-30', '31+')
                  then 'Larger agency team' end,
                case when d.player_count in ('101-250', '251+')
                  then 'Larger represented roster' end,
                case when d.requested_plan in ('elite', 'enterprise')
                  then 'Higher plan interest' end
              ],
              null
            )
          )
      ) as lead_intelligence,
      coalesce(journey.events, '[]'::jsonb) as journey
    from platform.demo_requests d
    left join lateral (
      select
        count(*)::integer as event_count,
        count(distinct e.section_key)
          filter (where e.event_name = 'section_view')::integer as sections_seen,
        count(*) filter (where e.event_name = 'scenario_run')::integer as scenario_runs,
        count(distinct e.scenario_kind)
          filter (where e.event_name = 'scenario_run')::integer as scenario_types,
        count(*) filter (where e.event_name = 'product_mode')::integer as product_modes,
        count(*) filter (where e.event_name = 'cta_click')::integer as cta_clicks,
        coalesce(bool_or(e.section_key = 'pricing'), false) as pricing_seen,
        coalesce(bool_or(e.section_key = 'autopilot'), false) as autopilot_seen,
        min(e.created_at) as first_seen_at,
        max(e.created_at) as last_seen_at
      from platform.public_funnel_events e
      where d.session_id is not null
        and e.session_id = d.session_id
    ) stats on true
    left join lateral (
      select e.scenario_kind
      from platform.public_funnel_events e
      where d.session_id is not null
        and e.session_id = d.session_id
        and e.event_name = 'scenario_run'
        and e.scenario_kind is not null
      group by e.scenario_kind
      order by count(*) desc, max(e.created_at) desc
      limit 1
    ) top_scenario on true
    left join lateral (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'event_name', x.event_name,
            'section_key', x.section_key,
            'scenario_kind', x.scenario_kind,
            'cta_key', x.cta_key,
            'mode', x.metadata->>'mode',
            'plan', x.metadata->>'plan',
            'created_at', x.created_at
          )
        )
        order by x.created_at asc
      ) as events
      from (
        select e.*
        from platform.public_funnel_events e
        where d.session_id is not null
          and e.session_id = d.session_id
        order by e.created_at desc
        limit 32
      ) x
    ) journey on true
    cross join lateral (
      select
        least(
          60,
          20
          + case when coalesce(stats.scenario_runs, 0) > 0 then 12 else 0 end
          + case when coalesce(stats.scenario_types, 0) >= 2 then 5 else 0 end
          + case when coalesce(stats.product_modes, 0) > 0 then 6 else 0 end
          + case when coalesce(stats.pricing_seen, false) then 7 else 0 end
          + case when coalesce(stats.autopilot_seen, false) then 4 else 0 end
          + case when coalesce(stats.sections_seen, 0) >= 4 then 4 else 0 end
          + case when coalesce(stats.cta_clicks, 0) >= 2 then 2 else 0 end
        )::integer as intent_score,
        least(
          40,
          case d.staff_size
            when '1-5' then 4
            when '6-15' then 9
            when '16-30' then 14
            when '31+' then 18
            else 0
          end
          + case d.player_count
            when '1-40' then 4
            when '41-100' then 9
            when '101-250' then 14
            when '251+' then 18
            else 0
          end
          + case d.requested_plan
            when 'agency' then 2
            when 'pro' then 4
            when 'elite' then 6
            when 'enterprise' then 8
            else 0
          end
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

comment on function public.platform_server_operator_demo_requests(integer) is
  'Service-role operator revenue view of ReDream enquiries with the earliest explicit prospect due time.';
