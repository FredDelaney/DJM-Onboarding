create table if not exists djm_os.captures (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  channel text not null default 'whatsapp',
  capture_type text not null default 'text',
  raw_text text,
  source_uri text,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  status text not null default 'queued',
  confidence numeric(5,4),
  extracted_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists djm_os_captures_created_idx on djm_os.captures(created_at desc);
create index if not exists djm_os_captures_status_idx on djm_os.captures(status, created_at desc);
create index if not exists djm_os_interactions_person_idx on djm_os.interactions(person_id, occurred_at desc);
create index if not exists djm_os_interactions_org_idx on djm_os.interactions(organisation_id, occurred_at desc);
create index if not exists djm_os_relationship_person_idx on djm_os.relationships(person_id, strength_score desc nulls last);
create index if not exists djm_os_employments_current_idx on djm_os.employments(person_id, is_current) where is_current;
create index if not exists djm_os_needs_status_idx on djm_os.club_needs(status, updated_at desc);
create index if not exists djm_os_tasks_owner_idx on djm_os.tasks(owner_user_id, status, due_at);

create or replace function djm_os.is_team_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from djm_os.team_members tm
    where tm.user_id = auth.uid() and tm.is_active = true
  );
$$;
revoke all on function djm_os.is_team_member() from public, anon;
grant execute on function djm_os.is_team_member() to authenticated;
grant usage on schema djm_os to authenticated;
grant select, insert, update, delete on all tables in schema djm_os to authenticated;
alter default privileges in schema djm_os grant select, insert, update, delete on tables to authenticated;

alter table djm_os.team_members enable row level security;
alter table djm_os.people enable row level security;
alter table djm_os.organisations enable row level security;
alter table djm_os.employments enable row level security;
alter table djm_os.contact_methods enable row level security;
alter table djm_os.relationships enable row level security;
alter table djm_os.interactions enable row level security;
alter table djm_os.claims enable row level security;
alter table djm_os.club_needs enable row level security;
alter table djm_os.player_matches enable row level security;
alter table djm_os.tasks enable row level security;
alter table djm_os.events enable row level security;
alter table djm_os.captures enable row level security;

do $$
declare t text;
begin
  foreach t in array array['team_members','people','organisations','employments','contact_methods','relationships','interactions','claims','club_needs','player_matches','tasks','events','captures']
  loop
    execute format('drop policy if exists djm_team_select on djm_os.%I', t);
    execute format('drop policy if exists djm_team_insert on djm_os.%I', t);
    execute format('drop policy if exists djm_team_update on djm_os.%I', t);
    execute format('drop policy if exists djm_team_delete on djm_os.%I', t);
    execute format('create policy djm_team_select on djm_os.%I for select to authenticated using ((select djm_os.is_team_member()))', t);
    execute format('create policy djm_team_insert on djm_os.%I for insert to authenticated with check ((select djm_os.is_team_member()))', t);
    execute format('create policy djm_team_update on djm_os.%I for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()))', t);
    execute format('create policy djm_team_delete on djm_os.%I for delete to authenticated using ((select djm_os.is_team_member()))', t);
  end loop;
end $$;

create or replace function public.djm_network_dashboard()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'people_count', (select count(*) from djm_os.people),
    'club_count', (select count(*) from djm_os.organisations where organisation_type = 'club'),
    'active_needs', (select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
    'open_tasks', (select count(*) from djm_os.tasks where status not in ('done','completed','cancelled')),
    'my_open_tasks', (select count(*) from djm_os.tasks where owner_user_id = auth.uid() and status not in ('done','completed','cancelled')),
    'recent_interactions', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (
      select i.id, i.occurred_at, i.channel, i.summary, i.person_id, p.full_name,
             i.organisation_id, o.name as organisation_name, tm.display_name as team_member_name
      from djm_os.interactions i
      left join djm_os.people p on p.id = i.person_id
      left join djm_os.organisations o on o.id = i.organisation_id
      left join djm_os.team_members tm on tm.user_id = i.team_member_id
      order by i.occurred_at desc limit 8
    ) x), '[]'::jsonb),
    'priority_tasks', coalesce((select jsonb_agg(x order by x.priority desc, x.due_at asc nulls last) from (
      select t.id, t.title, t.task_type, t.owner_user_id, t.priority, t.due_at, t.person_id,
             p.full_name, t.organisation_id, o.name as organisation_name
      from djm_os.tasks t
      left join djm_os.people p on p.id = t.person_id
      left join djm_os.organisations o on o.id = t.organisation_id
      where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id = auth.uid())
      order by t.priority desc, t.due_at asc nulls last limit 8
    ) x), '[]'::jsonb),
    'active_needs_list', coalesce((select jsonb_agg(x order by x.updated_at desc) from (
      select n.id, n.title, n.position, n.preferred_foot, n.status, n.confidence, n.updated_at,
             o.name as organisation_name, p.full_name as source_person_name
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people p on p.id = n.source_person_id
      where n.status in ('active','open','confirmed')
      order by n.updated_at desc limit 6
    ) x), '[]'::jsonb)
  );
$$;

create or replace function public.djm_network_people(p_search text default null, p_limit integer default 100)
returns table (
  id uuid, full_name text, preferred_name text, person_type text, country text, city text,
  current_organisation text, role_title text, relationship_score smallint, last_meaningful_at timestamptz,
  last_interaction_at timestamptz, whatsapp text, email text
)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.full_name, p.preferred_name, p.person_type, p.country, p.city,
         eo.name, e.role_title, r.strength_score, r.last_meaningful_at, li.last_interaction_at, cmw.value, cme.value
  from djm_os.people p
  left join lateral (
    select e1.* from djm_os.employments e1
    where e1.person_id = p.id and e1.is_current = true
    order by e1.started_on desc nulls last, e1.created_at desc limit 1
  ) e on true
  left join djm_os.organisations eo on eo.id = e.organisation_id
  left join djm_os.relationships r on r.person_id = p.id and r.team_member_id = auth.uid()
  left join lateral (select max(i.occurred_at) as last_interaction_at from djm_os.interactions i where i.person_id = p.id) li on true
  left join lateral (select value from djm_os.contact_methods c where c.person_id=p.id and c.channel='whatsapp' order by c.is_primary desc, c.updated_at desc limit 1) cmw on true
  left join lateral (select value from djm_os.contact_methods c where c.person_id=p.id and c.channel='email' order by c.is_primary desc, c.updated_at desc limit 1) cme on true
  where p_search is null or p_search = '' or p.full_name ilike '%' || p_search || '%' or eo.name ilike '%' || p_search || '%'
  order by coalesce(li.last_interaction_at, r.last_meaningful_at, p.updated_at) desc nulls last, p.full_name
  limit greatest(1, least(coalesce(p_limit,100),250));
$$;

create or replace function public.djm_network_organisations(p_search text default null, p_limit integer default 100)
returns table (
  id uuid, name text, organisation_type text, country text, city text,
  contacts_count bigint, active_needs_count bigint, last_interaction_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select o.id, o.name, o.organisation_type, o.country, o.city,
         (select count(distinct e.person_id) from djm_os.employments e where e.organisation_id=o.id and e.is_current=true),
         (select count(*) from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')),
         (select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=o.id)
  from djm_os.organisations o
  where p_search is null or p_search='' or o.name ilike '%' || p_search || '%'
  order by coalesce((select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=o.id), o.updated_at) desc nulls last, o.name
  limit greatest(1, least(coalesce(p_limit,100),250));
$$;

create or replace function public.djm_network_capture_text(
  p_text text, p_channel text default 'whatsapp', p_person_id uuid default null,
  p_organisation_id uuid default null, p_occurred_at timestamptz default now()
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_capture_id uuid; v_interaction_id uuid; v_summary text; v_task_id uuid; v_position text; v_needs_review boolean := false;
begin
  if p_text is null or length(trim(p_text)) < 2 then raise exception 'Capture text is required'; end if;
  v_summary := left(regexp_replace(trim(p_text), '\s+', ' ', 'g'), 240);
  insert into djm_os.captures(submitted_by, channel, capture_type, raw_text, person_id, organisation_id, status)
  values(auth.uid(), coalesce(nullif(trim(p_channel),''),'whatsapp'), 'text', trim(p_text), p_person_id, p_organisation_id, 'processing')
  returning id into v_capture_id;
  insert into djm_os.interactions(occurred_at, channel, direction, team_member_id, person_id, organisation_id, source_external_id, source_type, raw_text, summary, confidence)
  values(coalesce(p_occurred_at,now()), coalesce(nullif(trim(p_channel),''),'whatsapp'), 'captured', auth.uid(), p_person_id, p_organisation_id, v_capture_id::text, 'djm_capture', trim(p_text), v_summary, 1)
  returning id into v_interaction_id;
  if p_person_id is not null then
    insert into djm_os.relationships(team_member_id, person_id, last_meaningful_at, first_known_at, strength_score)
    values(auth.uid(), p_person_id, coalesce(p_occurred_at,now()), coalesce(p_occurred_at,now()), 35)
    on conflict (team_member_id, person_id) do update set
      last_meaningful_at = greatest(coalesce(djm_os.relationships.last_meaningful_at, excluded.last_meaningful_at), excluded.last_meaningful_at),
      strength_score = greatest(coalesce(djm_os.relationships.strength_score,0), 35), updated_at = now();
  end if;
  if p_text ~* '\m(i.ll|i will|we.ll|we will|send|follow up|call|speak|revert|get back|come back)\M' then
    insert into djm_os.tasks(title, task_type, owner_user_id, person_id, organisation_id, interaction_id, status, priority, source)
    values(case when p_text ~* '\msend\M' then 'Follow through on promised send' when p_text ~* '\mcall\M|\mspeak\M' then 'Follow up on promised call' else 'Follow up on conversation commitment' end,
      'commitment', auth.uid(), p_person_id, p_organisation_id, v_interaction_id, 'open', 70, 'auto_capture') returning id into v_task_id;
  end if;
  v_position := case
    when p_text ~* '\m(left[- ]?back|lb)\M' then 'LB'
    when p_text ~* '\m(right[- ]?back|rb)\M' then 'RB'
    when p_text ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
    when p_text ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
    when p_text ~* '\mdefensive midfielder|number 6|no\.? ?6\M' then '6'
    when p_text ~* '\m(number 8|no\.? ?8|central midfielder|cm)\M' then '8'
    when p_text ~* '\m(number 10|no\.? ?10|attacking midfielder|am)\M' then '10'
    when p_text ~* '\mright winger|rw\M' then 'RW'
    when p_text ~* '\mleft winger|lw\M' then 'LW'
    when p_text ~* '\mwinger\M' then 'Winger'
    when p_text ~* '\mstriker|centre forward|center forward|cf\M' then 'ST'
    when p_text ~* '\mgoalkeeper|keeper|gk\M' then 'GK'
    else null end;
  if p_organisation_id is not null and v_position is not null and p_text ~* '\m(need|looking|searching|want|require|after)\M' then
    insert into djm_os.club_needs(organisation_id, source_person_id, owner_user_id, source_interaction_id, title, position, profile_notes, status, confidence, confirmed_at, expires_at)
    values(p_organisation_id, p_person_id, auth.uid(), v_interaction_id, v_position || ' requirement', v_position, left(trim(p_text),1000), 'active', 0.72, coalesce(p_occurred_at,now()), coalesce(p_occurred_at,now()) + interval '45 days');
  elsif v_position is not null and p_text ~* '\m(need|looking|searching|want|require|after)\M' then v_needs_review := true; end if;
  insert into djm_os.events(event_type, actor_user_id, person_id, organisation_id, interaction_id, payload, source, confidence, occurred_at)
  values('CAPTURE_PROCESSED', auth.uid(), p_person_id, p_organisation_id, v_interaction_id,
    jsonb_build_object('capture_id',v_capture_id,'channel',coalesce(nullif(trim(p_channel),''),'whatsapp'),'task_created',v_task_id is not null,'position_detected',v_position,'needs_review',v_needs_review),
    'djm_capture', 1, coalesce(p_occurred_at,now()));
  update djm_os.captures set status = case when v_needs_review then 'needs_review' else 'processed' end,
    extracted_json = jsonb_build_object('interaction_id',v_interaction_id,'task_id',v_task_id,'position',v_position,'needs_review',v_needs_review),
    confidence = case when v_needs_review then 0.72 else 1 end, processed_at = now() where id=v_capture_id;
  return jsonb_build_object('capture_id',v_capture_id,'interaction_id',v_interaction_id,'task_id',v_task_id,'position',v_position,'needs_review',v_needs_review);
end;
$$;

revoke execute on function public.djm_network_dashboard() from public, anon;
revoke execute on function public.djm_network_people(text, integer) from public, anon;
revoke execute on function public.djm_network_organisations(text, integer) from public, anon;
revoke execute on function public.djm_network_capture_text(text, text, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.djm_network_dashboard() to authenticated;
grant execute on function public.djm_network_people(text, integer) to authenticated;
grant execute on function public.djm_network_organisations(text, integer) to authenticated;
grant execute on function public.djm_network_capture_text(text, text, uuid, uuid, timestamptz) to authenticated;
notify pgrst, 'reload schema';
