alter table djm_os.club_needs
  add column if not exists secondary_position text,
  add column if not exists min_height_cm smallint,
  add column if not exists salary_tax_basis text,
  add column if not exists nationality_preferences text[] not null default '{}',
  add column if not exists passport_requirements text,
  add column if not exists foreign_player_notes text,
  add column if not exists playing_style text,
  add column if not exists raw_request text,
  add column if not exists source_context text,
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists priority smallint not null default 3,
  add column if not exists need_type text not null default 'confirmed',
  add column if not exists prediction_probability smallint,
  add column if not exists prediction_basis jsonb not null default '{}'::jsonb;

update djm_os.club_needs
set raw_request = profile_notes
where raw_request is null and profile_notes is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'club_needs_height_range'
      and conrelid = 'djm_os.club_needs'::regclass
  ) then
    alter table djm_os.club_needs
      add constraint club_needs_height_range
      check (min_height_cm is null or min_height_cm between 140 and 230);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'club_needs_priority_range'
      and conrelid = 'djm_os.club_needs'::regclass
  ) then
    alter table djm_os.club_needs
      add constraint club_needs_priority_range check (priority between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'club_needs_type_valid'
      and conrelid = 'djm_os.club_needs'::regclass
  ) then
    alter table djm_os.club_needs
      add constraint club_needs_type_valid check (need_type in ('confirmed', 'predicted'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'club_needs_prediction_range'
      and conrelid = 'djm_os.club_needs'::regclass
  ) then
    alter table djm_os.club_needs
      add constraint club_needs_prediction_range
      check (prediction_probability is null or prediction_probability between 0 and 100);
  end if;
end $$;

create index if not exists club_needs_live_priority_idx
  on djm_os.club_needs (priority desc, updated_at desc)
  where status in ('active', 'open', 'confirmed');

create or replace function public.djm_market_create_need_v2(
  p_organisation_id uuid,
  p_title text,
  p_position text,
  p_source_person_id uuid default null,
  p_secondary_position text default null,
  p_preferred_foot text default null,
  p_min_age smallint default null,
  p_max_age smallint default null,
  p_min_height_cm smallint default null,
  p_transfer_type text default null,
  p_transfer_budget numeric default null,
  p_salary_budget numeric default null,
  p_currency text default null,
  p_salary_period text default null,
  p_salary_tax_basis text default null,
  p_nationality_preferences text[] default '{}',
  p_passport_requirements text default null,
  p_foreign_player_notes text default null,
  p_playing_style text default null,
  p_profile_notes text default null,
  p_registration_notes text default null,
  p_raw_request text default null,
  p_source_context text default null,
  p_received_at timestamptz default now(),
  p_priority smallint default 3,
  p_need_type text default 'confirmed',
  p_prediction_probability smallint default null,
  p_prediction_basis jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_need_type text := lower(trim(coalesce(p_need_type, 'confirmed')));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from djm_os.organisations where id = p_organisation_id and organisation_type = 'club') then raise exception 'Club is required'; end if;
  if nullif(trim(coalesce(p_position, '')), '') is null then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age > p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id = p_source_person_id) then raise exception 'Source contact not found'; end if;
  if v_need_type not in ('confirmed', 'predicted') then raise exception 'Invalid need type'; end if;
  if v_need_type = 'predicted' and p_prediction_probability is null then raise exception 'Predicted needs require a likelihood'; end if;

  insert into djm_os.club_needs(
    organisation_id, source_person_id, owner_user_id, title, position, secondary_position,
    preferred_foot, min_age, max_age, min_height_cm, transfer_type, transfer_budget,
    salary_budget, currency, salary_period, salary_tax_basis, nationality_preferences,
    passport_requirements, foreign_player_notes, playing_style, profile_notes,
    registration_notes, raw_request, source_context, received_at, priority, need_type,
    prediction_probability, prediction_basis, status, confidence, confirmed_at, expires_at
  ) values (
    p_organisation_id, p_source_person_id, auth.uid(),
    coalesce(nullif(trim(p_title), ''), trim(p_position) || ' requirement'), trim(p_position),
    nullif(trim(coalesce(p_secondary_position, '')), ''), nullif(trim(coalesce(p_preferred_foot, '')), ''),
    p_min_age, p_max_age, p_min_height_cm, nullif(trim(coalesce(p_transfer_type, '')), ''),
    p_transfer_budget, p_salary_budget, nullif(trim(coalesce(p_currency, '')), ''),
    nullif(trim(coalesce(p_salary_period, '')), ''), nullif(trim(coalesce(p_salary_tax_basis, '')), ''),
    coalesce(p_nationality_preferences, '{}'), nullif(trim(coalesce(p_passport_requirements, '')), ''),
    nullif(trim(coalesce(p_foreign_player_notes, '')), ''), nullif(trim(coalesce(p_playing_style, '')), ''),
    nullif(trim(coalesce(p_profile_notes, '')), ''), nullif(trim(coalesce(p_registration_notes, '')), ''),
    nullif(trim(coalesce(p_raw_request, '')), ''), nullif(trim(coalesce(p_source_context, '')), ''),
    coalesce(p_received_at, now()), greatest(1, least(5, coalesce(p_priority, 3))), v_need_type,
    case when v_need_type = 'predicted' then p_prediction_probability else 100 end,
    coalesce(p_prediction_basis, '{}'::jsonb), 'active',
    case when v_need_type = 'confirmed' then 1 else coalesce(p_prediction_probability, 50)::numeric / 100 end,
    case when v_need_type = 'confirmed' then now() else null end,
    coalesce(p_expires_at, now() + interval '45 days')
  ) returning id into v_id;

  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, payload, source, confidence, occurred_at)
  values(
    'CLUB_NEED_CREATED', auth.uid(), p_organisation_id, p_source_person_id,
    jsonb_build_object('club_need_id', v_id, 'need_type', v_need_type, 'position', trim(p_position), 'raw_request_preserved', p_raw_request is not null),
    'opportunity_os', case when v_need_type = 'confirmed' then 1 else coalesce(p_prediction_probability, 50)::numeric / 100 end, now()
  );

  return jsonb_build_object('need_id', v_id, 'need_type', v_need_type);
end $$;

create or replace function public.djm_market_update_need_v2(
  p_need_id uuid,
  p_organisation_id uuid,
  p_title text,
  p_position text,
  p_source_person_id uuid default null,
  p_secondary_position text default null,
  p_preferred_foot text default null,
  p_min_age smallint default null,
  p_max_age smallint default null,
  p_min_height_cm smallint default null,
  p_transfer_type text default null,
  p_transfer_budget numeric default null,
  p_salary_budget numeric default null,
  p_currency text default null,
  p_salary_period text default null,
  p_salary_tax_basis text default null,
  p_nationality_preferences text[] default '{}',
  p_passport_requirements text default null,
  p_foreign_player_notes text default null,
  p_playing_style text default null,
  p_profile_notes text default null,
  p_registration_notes text default null,
  p_raw_request text default null,
  p_source_context text default null,
  p_received_at timestamptz default null,
  p_priority smallint default 3,
  p_need_type text default 'confirmed',
  p_prediction_probability smallint default null,
  p_prediction_basis jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_need_type text := lower(trim(coalesce(p_need_type, 'confirmed')));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select to_jsonb(n) into v_before from djm_os.club_needs n where n.id = p_need_id;
  if v_before is null then raise exception 'Club need not found'; end if;
  if not exists(select 1 from djm_os.organisations where id = p_organisation_id and organisation_type = 'club') then raise exception 'Club is required'; end if;
  if nullif(trim(coalesce(p_position, '')), '') is null then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age > p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id = p_source_person_id) then raise exception 'Source contact not found'; end if;
  if v_need_type not in ('confirmed', 'predicted') then raise exception 'Invalid need type'; end if;

  update djm_os.club_needs set
    organisation_id = p_organisation_id,
    source_person_id = p_source_person_id,
    title = coalesce(nullif(trim(p_title), ''), trim(p_position) || ' requirement'),
    position = trim(p_position),
    secondary_position = nullif(trim(coalesce(p_secondary_position, '')), ''),
    preferred_foot = nullif(trim(coalesce(p_preferred_foot, '')), ''),
    min_age = p_min_age,
    max_age = p_max_age,
    min_height_cm = p_min_height_cm,
    transfer_type = nullif(trim(coalesce(p_transfer_type, '')), ''),
    transfer_budget = p_transfer_budget,
    salary_budget = p_salary_budget,
    currency = nullif(trim(coalesce(p_currency, '')), ''),
    salary_period = nullif(trim(coalesce(p_salary_period, '')), ''),
    salary_tax_basis = nullif(trim(coalesce(p_salary_tax_basis, '')), ''),
    nationality_preferences = coalesce(p_nationality_preferences, '{}'),
    passport_requirements = nullif(trim(coalesce(p_passport_requirements, '')), ''),
    foreign_player_notes = nullif(trim(coalesce(p_foreign_player_notes, '')), ''),
    playing_style = nullif(trim(coalesce(p_playing_style, '')), ''),
    profile_notes = nullif(trim(coalesce(p_profile_notes, '')), ''),
    registration_notes = nullif(trim(coalesce(p_registration_notes, '')), ''),
    raw_request = nullif(trim(coalesce(p_raw_request, '')), ''),
    source_context = nullif(trim(coalesce(p_source_context, '')), ''),
    received_at = coalesce(p_received_at, received_at),
    priority = greatest(1, least(5, coalesce(p_priority, 3))),
    need_type = v_need_type,
    prediction_probability = case when v_need_type = 'confirmed' then 100 else p_prediction_probability end,
    prediction_basis = coalesce(p_prediction_basis, '{}'::jsonb),
    confidence = case when v_need_type = 'confirmed' then 1 else coalesce(p_prediction_probability, 50)::numeric / 100 end,
    confirmed_at = case when v_need_type = 'confirmed' then coalesce(confirmed_at, now()) else null end,
    expires_at = p_expires_at,
    updated_at = now()
  where id = p_need_id;

  select to_jsonb(n) into v_after from djm_os.club_needs n where n.id = p_need_id;
  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, payload, source, confidence, occurred_at)
  values(
    'CLUB_NEED_UPDATED', auth.uid(), p_organisation_id, p_source_person_id,
    jsonb_build_object('club_need_id', p_need_id, 'before', v_before, 'after', v_after),
    'opportunity_os', 1, now()
  );

  return jsonb_build_object('need_id', p_need_id, 'updated', true);
end $$;

create or replace function public.djm_market_needs_v2(p_status text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.is_live desc, x.priority desc, x.updated_at desc)
    from (
      select
        n.id, n.organisation_id, o.name as organisation_name, o.country as organisation_country,
        o.website_url, n.source_person_id, pe.full_name as source_person_name,
        n.owner_user_id, tm.display_name as owner_name, n.title, n.position as need_position,
        n.secondary_position, n.preferred_foot, n.min_age, n.max_age, n.min_height_cm,
        n.transfer_type, n.transfer_budget, n.salary_budget, n.currency, n.salary_period,
        n.salary_tax_basis, n.nationality_preferences, n.passport_requirements,
        n.foreign_player_notes, n.playing_style, n.profile_notes, n.registration_notes,
        n.raw_request, n.source_context, n.received_at, n.priority, n.need_type,
        n.prediction_probability, n.prediction_basis, n.status as need_status,
        n.confidence, n.confirmed_at, n.expires_at, n.created_at, n.updated_at,
        n.status in ('active', 'open', 'confirmed') as is_live,
        (select count(*) from djm_os.player_matches m where m.club_need_id = n.id and m.status not in ('dismissed', 'rejected')) as match_count,
        (select max(m.overall_score) from djm_os.player_matches m where m.club_need_id = n.id and m.status not in ('dismissed', 'rejected')) as top_match_score
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people pe on pe.id = n.source_person_id
      left join djm_os.team_members tm on tm.user_id = n.owner_user_id
      where p_status is null or p_status = '' or n.status = p_status
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function djm_os.refresh_need_matches(p_need_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n djm_os.club_needs%rowtype;
  v_country text;
begin
  select * into n from djm_os.club_needs where id = p_need_id;
  if not found then return; end if;
  select country into v_country from djm_os.organisations where id = n.organisation_id;

  if n.status not in ('active', 'open', 'confirmed') then
    delete from djm_os.player_matches where club_need_id = p_need_id and status = 'suggested';
    return;
  end if;

  delete from djm_os.player_matches m using public.players p
  where m.club_need_id = p_need_id and m.player_id = p.id and m.status = 'suggested'
    and not (
      djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
      and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
      and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
      and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
      and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
    );

  insert into djm_os.player_matches(
    club_need_id, player_id, overall_score, football_score, commercial_score,
    registration_score, career_score, access_score, reasoning, status
  )
  select
    n.id, p.id,
    round((s.football_score * .45 + s.commercial_score * .10 + s.registration_score * .15 + s.career_score * .20 + s.availability_score * .10)::numeric, 1),
    s.football_score, s.commercial_score, s.registration_score, s.career_score, null::numeric,
    jsonb_build_object(
      'source', 'djm_fit_prediction_v3',
      'model', 'DJM fit model v3',
      'coverage', s.coverage,
      'components', jsonb_build_object(
        'football_fit', s.football_score,
        'commercial_fit', s.commercial_score,
        'registration_fit', s.registration_score,
        'career_fit', s.career_score,
        'availability', s.availability_score
      ),
      'strengths', to_jsonb(array_remove(array[
        'Primary or secondary position fits the requested role',
        case when n.preferred_foot is not null and p.preferred_foot is not null then 'Preferred foot matches' end,
        case when n.min_height_cm is not null and p.height_cm is not null then 'Minimum height is met' end,
        case when n.min_age is not null or n.max_age is not null then 'Recorded age is within range' end
      ], null)),
      'concerns', '[]'::jsonb,
      'hard_blockers', '[]'::jsonb,
      'missing_information', to_jsonb(array_remove(array[
        case when p.date_of_birth is null and (n.min_age is not null or n.max_age is not null) then 'Player date of birth is not recorded' end,
        case when p.preferred_foot is null and n.preferred_foot is not null then 'Player preferred foot is not recorded' end,
        case when p.height_cm is null and n.min_height_cm is not null then 'Player height is not recorded' end,
        case when nullif(trim(coalesce(f.salary_expectation, '')), '') is null and n.salary_budget is not null then 'Player salary expectation is not recorded' end,
        case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is not null and cardinality(coalesce(f.passports_held, '{}')) = 0 then 'Passport evidence is not recorded' end
      ], null)),
      'sample', jsonb_build_object('career_minutes', coalesce(c.minutes, 0), 'career_appearances', coalesce(c.appearances, 0)),
      'calculated_at', now()
    ),
    'suggested'
  from public.players p
  left join djm_os.player_market_facts f on f.player_id = p.id
  left join lateral (
    select coalesce(sum(ce.minutes), 0)::numeric as minutes, coalesce(sum(ce.appearances), 0)::numeric as appearances
    from public.career_entries ce where ce.player_id = p.id
  ) c on true
  cross join lateral (
    select
      least(100, 70
        + case when n.preferred_foot is null then 6 when p.preferred_foot is null then 3 else 10 end
        + case when n.min_age is null and n.max_age is null then 6 when p.date_of_birth is null then 3 else 8 end
        + case when n.min_height_cm is null then 5 when p.height_cm is null then 2 else 7 end)::numeric as football_score,
      case when n.salary_budget is null then 72 when nullif(trim(coalesce(f.salary_expectation, '')), '') is null then 55 else 68 end::numeric as commercial_score,
      djm_os.registration_fit_score(coalesce(n.passport_requirements, n.registration_notes), f.work_rights, f.passports_held, v_country)::numeric as registration_score,
      least(100, 45 + least(35, coalesce(c.minutes, 0) / 180) + least(20, coalesce(c.appearances, 0) / 5))::numeric as career_score,
      case when lower(coalesce(p.football_status, '')) in ('free_agent', 'free agent', 'available') then 95 when lower(coalesce(p.football_status, '')) = 'active' then 82 when lower(coalesce(p.football_status, '')) = 'injured' then 30 else 60 end::numeric as availability_score,
      round((
        1
        + case when n.preferred_foot is null or p.preferred_foot is not null then 1 else 0 end
        + case when (n.min_age is null and n.max_age is null) or p.date_of_birth is not null then 1 else 0 end
        + case when n.min_height_cm is null or p.height_cm is not null then 1 else 0 end
        + case when n.salary_budget is null or nullif(trim(coalesce(f.salary_expectation, '')), '') is not null then 1 else 0 end
        + case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is null or cardinality(coalesce(f.passports_held, '{}')) > 0 then 1 else 0 end
      )::numeric / 6 * 100)::int as coverage
  ) s
  where djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
    and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
    and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
    and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
    and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
  on conflict (club_need_id, player_id) do update set
    overall_score = excluded.overall_score,
    football_score = excluded.football_score,
    commercial_score = excluded.commercial_score,
    registration_score = excluded.registration_score,
    career_score = excluded.career_score,
    reasoning = excluded.reasoning,
    updated_at = now()
  where djm_os.player_matches.status = 'suggested';
end $$;

create or replace function public.djm_market_candidates_v2(p_need_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'signed_players', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.overall_score desc nulls last, x.player_name)
      from (
        select m.id as match_id, p.id as player_id,
          coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Player') as player_name,
          p.current_club, p.current_league, p.current_country, p.primary_position as player_position,
          p.secondary_positions, p.preferred_foot, p.height_cm, p.date_of_birth,
          p.football_status, p.transfermarkt_url, p.stats_url, p.instagram_url,
          m.overall_score, m.football_score, m.commercial_score, m.registration_score,
          m.career_score, m.access_score, m.status as match_status, m.reasoning
        from djm_os.player_matches m
        join public.players p on p.id = m.player_id
        where m.club_need_id = p_need_id and m.status not in ('dismissed', 'rejected')
      ) x
    ), '[]'::jsonb),
    'recruitment_targets', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.match_score desc nulls last)
      from public.djm_scout_need_matches(p_need_id) x
    ), '[]'::jsonb)
  );
end $$;

drop trigger if exists trg_djm_need_match_refresh on djm_os.club_needs;
create trigger trg_djm_need_match_refresh
after insert or update of position, secondary_position, preferred_foot, min_age, max_age,
  min_height_cm, transfer_type, transfer_budget, salary_budget, salary_tax_basis,
  nationality_preferences, passport_requirements, foreign_player_notes, playing_style,
  profile_notes, registration_notes, status
on djm_os.club_needs
for each row execute function djm_os.club_need_match_trigger();

revoke all on function public.djm_market_create_need_v2(uuid,text,text,uuid,text,text,smallint,smallint,smallint,text,numeric,numeric,text,text,text,text[],text,text,text,text,text,text,text,timestamptz,smallint,text,smallint,jsonb,timestamptz) from public, anon;
revoke all on function public.djm_market_update_need_v2(uuid,uuid,text,text,uuid,text,text,smallint,smallint,smallint,text,numeric,numeric,text,text,text,text[],text,text,text,text,text,text,text,timestamptz,smallint,text,smallint,jsonb,timestamptz) from public, anon;
revoke all on function public.djm_market_needs_v2(text) from public, anon;
revoke all on function public.djm_market_candidates_v2(uuid) from public, anon;
grant execute on function public.djm_market_create_need_v2(uuid,text,text,uuid,text,text,smallint,smallint,smallint,text,numeric,numeric,text,text,text,text[],text,text,text,text,text,text,text,timestamptz,smallint,text,smallint,jsonb,timestamptz) to authenticated, service_role;
grant execute on function public.djm_market_update_need_v2(uuid,uuid,text,text,uuid,text,text,smallint,smallint,smallint,text,numeric,numeric,text,text,text,text[],text,text,text,text,text,text,text,timestamptz,smallint,text,smallint,jsonb,timestamptz) to authenticated, service_role;
grant execute on function public.djm_market_needs_v2(text) to authenticated, service_role;
grant execute on function public.djm_market_candidates_v2(uuid) to authenticated, service_role;

do $$
declare r record;
begin
  for r in select id from djm_os.club_needs where status in ('active', 'open', 'confirmed') loop
    perform djm_os.refresh_need_matches(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
