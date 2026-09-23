alter table platform.demo_requests
  alter column staff_size drop not null,
  alter column player_count drop not null,
  add column if not exists session_id uuid null,
  add column if not exists conversion_source text null
    check (conversion_source is null or char_length(conversion_source) <= 120),
  add column if not exists utm_source text null
    check (utm_source is null or char_length(utm_source) <= 160),
  add column if not exists utm_medium text null
    check (utm_medium is null or char_length(utm_medium) <= 160),
  add column if not exists utm_campaign text null
    check (utm_campaign is null or char_length(utm_campaign) <= 160),
  add column if not exists utm_content text null
    check (utm_content is null or char_length(utm_content) <= 160),
  add column if not exists utm_term text null
    check (utm_term is null or char_length(utm_term) <= 160);

create index if not exists demo_requests_session_created_idx
  on platform.demo_requests (session_id, created_at desc)
  where session_id is not null;

create table if not exists platform.public_funnel_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  session_id uuid not null,
  event_name text not null
    check (
      event_name in (
        'page_view',
        'section_view',
        'scenario_select',
        'scenario_run',
        'scenario_complete',
        'product_mode',
        'cta_click',
        'demo_open',
        'demo_step_2',
        'demo_submit'
      )
    ),
  section_key text null check (section_key is null or char_length(section_key) <= 80),
  scenario_kind text null
    check (
      scenario_kind is null
      or scenario_kind in ('club', 'player', 'deal', 'relationship')
    ),
  cta_key text null check (cta_key is null or char_length(cta_key) <= 120),
  source_host text null check (source_host is null or char_length(source_host) <= 255),
  source_path text null check (source_path is null or char_length(source_path) <= 500),
  referrer text null check (referrer is null or char_length(referrer) <= 1000),
  utm_source text null check (utm_source is null or char_length(utm_source) <= 160),
  utm_medium text null check (utm_medium is null or char_length(utm_medium) <= 160),
  utm_campaign text null check (utm_campaign is null or char_length(utm_campaign) <= 160),
  utm_content text null check (utm_content is null or char_length(utm_content) <= 160),
  utm_term text null check (utm_term is null or char_length(utm_term) <= 160),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table platform.public_funnel_events enable row level security;

revoke all on table platform.public_funnel_events from public, anon, authenticated;
grant select, insert, delete on table platform.public_funnel_events to service_role;

create index if not exists public_funnel_events_session_created_idx
  on platform.public_funnel_events (session_id, created_at);

create index if not exists public_funnel_events_name_created_idx
  on platform.public_funnel_events (event_name, created_at desc);

create index if not exists public_funnel_events_source_created_idx
  on platform.public_funnel_events (source_host, created_at desc);

create or replace function public.platform_server_create_funnel_event(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_event_id uuid;
  v_session_id uuid;
  v_event_name text;
  v_scenario_kind text;
  v_id uuid;
  v_metadata jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Funnel event payload is required';
  end if;

  begin
    v_client_event_id := nullif(p_input->>'client_event_id', '')::uuid;
    v_session_id := nullif(p_input->>'session_id', '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Valid funnel event identifiers are required';
  end;

  v_event_name := lower(trim(coalesce(p_input->>'event_name', '')));
  v_scenario_kind := lower(trim(coalesce(p_input->>'scenario_kind', '')));

  if v_client_event_id is null or v_session_id is null then
    raise exception 'Valid funnel event identifiers are required';
  end if;

  if v_event_name not in (
    'page_view',
    'section_view',
    'scenario_select',
    'scenario_run',
    'scenario_complete',
    'product_mode',
    'cta_click',
    'demo_open',
    'demo_step_2',
    'demo_submit'
  ) then
    raise exception 'Unsupported funnel event';
  end if;

  if v_scenario_kind <> ''
     and v_scenario_kind not in ('club', 'player', 'deal', 'relationship') then
    raise exception 'Unsupported scenario kind';
  end if;

  v_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'mode', nullif(left(coalesce(p_input#>>'{metadata,mode}', ''), 80), ''),
      'plan', nullif(left(coalesce(p_input#>>'{metadata,plan}', ''), 80), ''),
      'variant', nullif(left(coalesce(p_input#>>'{metadata,variant}', ''), 80), '')
    )
  );

  insert into platform.public_funnel_events (
    client_event_id,
    session_id,
    event_name,
    section_key,
    scenario_kind,
    cta_key,
    source_host,
    source_path,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    metadata
  )
  values (
    v_client_event_id,
    v_session_id,
    v_event_name,
    nullif(left(coalesce(p_input->>'section_key', ''), 80), ''),
    nullif(v_scenario_kind, ''),
    nullif(left(coalesce(p_input->>'cta_key', ''), 120), ''),
    lower(nullif(left(coalesce(p_input->>'source_host', ''), 255), '')),
    nullif(left(coalesce(p_input->>'source_path', ''), 500), ''),
    nullif(left(coalesce(p_input->>'referrer', ''), 1000), ''),
    nullif(left(coalesce(p_input->>'utm_source', ''), 160), ''),
    nullif(left(coalesce(p_input->>'utm_medium', ''), 160), ''),
    nullif(left(coalesce(p_input->>'utm_campaign', ''), 160), ''),
    nullif(left(coalesce(p_input->>'utm_content', ''), 160), ''),
    nullif(left(coalesce(p_input->>'utm_term', ''), 160), ''),
    v_metadata
  )
  on conflict (client_event_id) do nothing
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'created', v_id is not null
  );
end;
$$;

revoke all on function public.platform_server_create_funnel_event(jsonb)
  from public, anon, authenticated;
grant execute on function public.platform_server_create_funnel_event(jsonb)
  to service_role;

create or replace function public.platform_server_create_demo_request(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_request_id uuid;
  v_session_id uuid;
  v_id uuid;
  v_created boolean := false;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Demo request payload is required';
  end if;

  begin
    v_client_request_id := nullif(p_input->>'client_request_id', '')::uuid;
    v_session_id := nullif(p_input->>'session_id', '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Valid request identifiers are required';
  end;

  if v_client_request_id is null then
    raise exception 'Valid client_request_id is required';
  end if;

  insert into platform.demo_requests (
    client_request_id,
    session_id,
    full_name,
    email,
    agency_name,
    website_url,
    staff_size,
    player_count,
    priority,
    requested_plan,
    source_host,
    source_path,
    referrer,
    conversion_source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    user_agent,
    consent_at
  )
  values (
    v_client_request_id,
    v_session_id,
    nullif(p_input->>'full_name', ''),
    lower(nullif(p_input->>'email', '')),
    nullif(p_input->>'agency_name', ''),
    nullif(p_input->>'website_url', ''),
    nullif(p_input->>'staff_size', ''),
    nullif(p_input->>'player_count', ''),
    nullif(p_input->>'priority', ''),
    nullif(p_input->>'requested_plan', ''),
    lower(nullif(p_input->>'source_host', '')),
    nullif(p_input->>'source_path', ''),
    nullif(p_input->>'referrer', ''),
    nullif(p_input->>'conversion_source', ''),
    nullif(p_input->>'utm_source', ''),
    nullif(p_input->>'utm_medium', ''),
    nullif(p_input->>'utm_campaign', ''),
    nullif(p_input->>'utm_content', ''),
    nullif(p_input->>'utm_term', ''),
    nullif(p_input->>'user_agent', ''),
    (p_input->>'consent_at')::timestamptz
  )
  on conflict (client_request_id) do nothing
  returning id into v_id;

  if v_id is not null then
    v_created := true;
  else
    select d.id
      into v_id
    from platform.demo_requests d
    where d.client_request_id = v_client_request_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'created', v_created
  );
end;
$$;

revoke all on function public.platform_server_create_demo_request(jsonb)
  from public, anon, authenticated;
grant execute on function public.platform_server_create_demo_request(jsonb)
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
    jsonb_agg(to_jsonb(r) order by r.created_at desc),
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
      d.converted_tenant_id,
      d.contacted_at,
      d.created_at,
      d.updated_at,
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
      ) as lead_intelligence
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
    order by d.created_at desc
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
  visited as (
    select distinct session_id
    from events
    where event_name = 'page_view'
  ),
  interactive as (
    select distinct session_id
    from events
    where event_name = 'scenario_run'
  ),
  pricing as (
    select distinct session_id
    from events
    where event_name = 'section_view'
      and section_key = 'pricing'
  ),
  opened as (
    select distinct session_id
    from events
    where event_name = 'demo_open'
  ),
  leads as (
    select d.*
    from platform.demo_requests d, bounds b
    where d.created_at >= b.starts_at
      and d.source_host in ('redreamsystems.com', 'www.redreamsystems.com')
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'sessions', (select count(*) from visited),
    'interactive_sessions', (select count(*) from interactive),
    'pricing_sessions', (select count(*) from pricing),
    'demo_open_sessions', (select count(*) from opened),
    'leads', (select count(*) from leads),
    'qualified_leads', (select count(*) from leads where status in ('qualified', 'converted')),
    'converted_leads', (select count(*) from leads where status = 'converted'),
    'visit_to_lead_pct',
      case
        when (select count(*) from visited) = 0 then 0
        else round(
          100.0 * (select count(*) from leads)
          / (select count(*) from visited),
          1
        )
      end,
    'interactive_to_lead_pct',
      case
        when (select count(*) from interactive) = 0 then 0
        else round(
          100.0 * (
            select count(*)
            from leads l
            where l.session_id in (select session_id from interactive)
          )
          / (select count(*) from interactive),
          1
        )
      end,
    'top_scenario',
      (
        select e.scenario_kind
        from events e
        where e.event_name = 'scenario_run'
          and e.scenario_kind is not null
        group by e.scenario_kind
        order by count(*) desc, max(e.created_at) desc
        limit 1
      ),
    'top_sources',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('source', x.source, 'leads', x.leads)
            order by x.leads desc, x.source
          )
          from (
            select
              coalesce(
                nullif(lower(l.utm_source), ''),
                case when nullif(l.referrer, '') is null then 'direct' else 'referral' end
              ) as source,
              count(*)::integer as leads
            from leads l
            group by 1
            order by 2 desc, 1
            limit 5
          ) x
        ),
        '[]'::jsonb
      )
  );
$$;

revoke all on function public.platform_server_operator_funnel_summary(integer)
  from public, anon, authenticated;
grant execute on function public.platform_server_operator_funnel_summary(integer)
  to service_role;

comment on table platform.public_funnel_events is
  'Privacy-minimal first-party ReDream sales-site funnel events. No raw scenario text is stored here.';
comment on function public.platform_server_create_funnel_event(jsonb) is
  'Service-role bridge for idempotent first-party sales-site event capture.';
comment on function public.platform_server_operator_funnel_summary(integer) is
  'Service-role operator summary of canonical ReDream sales-site funnel performance.';
