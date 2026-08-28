alter table djm_os.deal_rooms
  add column if not exists next_action_text text,
  add column if not exists model_probability smallint,
  add column if not exists manual_probability smallint,
  add column if not exists probability_source text not null default 'model',
  add column if not exists probability_basis jsonb not null default '{}'::jsonb,
  add column if not exists pitch_status text not null default 'not_created',
  add column if not exists transfer_fee numeric,
  add column if not exists player_salary numeric,
  add column if not exists salary_period text,
  add column if not exists financial_notes text,
  add column if not exists closed_at timestamptz;

update djm_os.deal_rooms
set model_probability = probability,
    probability_source = 'model'
where model_probability is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deal_rooms_model_probability_range'
      and conrelid = 'djm_os.deal_rooms'::regclass
  ) then
    alter table djm_os.deal_rooms add constraint deal_rooms_model_probability_range
      check (model_probability is null or model_probability between 0 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deal_rooms_manual_probability_range'
      and conrelid = 'djm_os.deal_rooms'::regclass
  ) then
    alter table djm_os.deal_rooms add constraint deal_rooms_manual_probability_range
      check (manual_probability is null or manual_probability between 0 and 100);
  end if;
end $$;

create index if not exists deal_rooms_active_next_action_idx
  on djm_os.deal_rooms (next_action_at, updated_at desc)
  where status = 'active';

alter table public.club_share_links
  add column if not exists opportunity_id uuid,
  add column if not exists organisation_id uuid,
  add column if not exists source_person_id uuid,
  add column if not exists pitch_message text,
  add column if not exists pitch_status text not null default 'draft',
  add column if not exists selected_sections jsonb not null default '{}'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists revoked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'club_share_links_opportunity_fkey'
      and conrelid = 'public.club_share_links'::regclass
  ) then
    alter table public.club_share_links
      add constraint club_share_links_opportunity_fkey
      foreign key (opportunity_id) references djm_os.deal_rooms(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'club_share_links_organisation_fkey'
      and conrelid = 'public.club_share_links'::regclass
  ) then
    alter table public.club_share_links
      add constraint club_share_links_organisation_fkey
      foreign key (organisation_id) references djm_os.organisations(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'club_share_links_source_person_fkey'
      and conrelid = 'public.club_share_links'::regclass
  ) then
    alter table public.club_share_links
      add constraint club_share_links_source_person_fkey
      foreign key (source_person_id) references djm_os.people(id) on delete set null;
  end if;
end $$;

create index if not exists club_share_links_opportunity_idx
  on public.club_share_links (opportunity_id, created_at desc)
  where opportunity_id is not null;

create or replace function public.djm_opportunity_probability(
  p_need_id uuid,
  p_player_id uuid default null,
  p_prospect_id uuid default null,
  p_stage text default 'potential',
  p_primary_blocker text default null,
  p_next_action_at timestamptz default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_fit jsonb;
  v_stage text := lower(trim(coalesce(p_stage, 'potential')));
  v_stage_probability integer;
  v_probability integer;
  v_adjustments jsonb := '[]'::jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  v_fit := public.djm_market_deal_probability(p_need_id, p_player_id, p_prospect_id);
  v_stage_probability := case v_stage
    when 'potential' then 10 when 'qualifying' then 10
    when 'pitched' then 20 when 'contacted' then 20
    when 'talking' then 35 when 'interest' then 35
    when 'trial' then 55
    when 'negotiation' then 68 when 'negotiating' then 68
    when 'offer' then 84 when 'contracting' then 90
    when 'done' then 100 when 'won' then 100
    when 'closed' then 0 when 'lost' then 0
    else 12 end;

  v_probability := round(v_stage_probability * .58 + coalesce((v_fit ->> 'probability')::numeric, 45) * .42);
  if p_need_id is null then
    v_probability := v_probability - 8;
    v_adjustments := v_adjustments || jsonb_build_array('No confirmed club need linked: -8');
  else
    v_adjustments := v_adjustments || jsonb_build_array('Club need linked: demand evidence included');
  end if;
  if nullif(trim(coalesce(p_primary_blocker, '')), '') is not null then
    v_probability := v_probability - 12;
    v_adjustments := v_adjustments || jsonb_build_array('Primary blocker recorded: -12');
  end if;
  if p_next_action_at is not null then
    v_probability := v_probability + 5;
    v_adjustments := v_adjustments || jsonb_build_array('Dated next action: +5');
  end if;
  if v_stage in ('done', 'won') then v_probability := 100; end if;
  if v_stage in ('closed', 'lost') then v_probability := 0; end if;
  v_probability := greatest(0, least(case when v_stage in ('done', 'won') then 100 else 95 end, v_probability));

  return jsonb_build_object(
    'probability', v_probability,
    'stage_probability', v_stage_probability,
    'player_club_fit', coalesce((v_fit ->> 'football_fit')::int, 50),
    'djm_access', coalesce((v_fit ->> 'djm_access')::int, 40),
    'demand_confidence', coalesce((v_fit ->> 'demand_confidence')::int, 50),
    'player_willingness', coalesce((v_fit ->> 'player_willingness')::int, 50),
    'timing', coalesce((v_fit ->> 'timing')::int, 50),
    'adjustments', v_adjustments,
    'model', 'DJM opportunity model v2',
    'calculated_at', now()
  );
end $$;

create or replace function public.djm_opportunity_upsert(
  p_id uuid default null,
  p_title text default null,
  p_organisation_id uuid default null,
  p_source_person_id uuid default null,
  p_player_id uuid default null,
  p_prospect_id uuid default null,
  p_club_need_id uuid default null,
  p_stage text default 'potential',
  p_expected_commission numeric default null,
  p_currency text default 'EUR',
  p_primary_blocker text default null,
  p_next_decision text default null,
  p_next_action_text text default null,
  p_next_action_at timestamptz default null,
  p_transfer_fee numeric default null,
  p_player_salary numeric default null,
  p_salary_period text default null,
  p_financial_notes text default null,
  p_manual_probability smallint default null,
  p_source text default 'opportunity_os'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid := auth.uid();
  v_stage text := lower(trim(coalesce(p_stage, 'potential')));
  v_status text;
  v_prediction jsonb;
  v_model_probability smallint;
  v_probability smallint;
  v_org uuid;
  v_person uuid;
  v_player uuid;
  v_prospect uuid;
  v_need uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_stage not in ('potential', 'pitched', 'talking', 'trial', 'negotiation', 'offer', 'done', 'closed', 'paused') then raise exception 'Invalid opportunity stage'; end if;
  v_status := case when v_stage = 'done' then 'won' when v_stage = 'closed' then 'lost' when v_stage = 'paused' then 'paused' else 'active' end;

  if p_id is null then
    v_org := p_organisation_id; v_person := p_source_person_id; v_player := p_player_id; v_prospect := p_prospect_id; v_need := p_club_need_id;
    if v_org is null then raise exception 'Club is required'; end if;
    if num_nonnulls(v_player, v_prospect) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
  else
    select organisation_id, source_person_id, player_id, prospect_id, club_need_id
    into v_org, v_person, v_player, v_prospect, v_need
    from djm_os.deal_rooms where id = p_id;
    if not found then raise exception 'Opportunity not found'; end if;
    v_org := coalesce(p_organisation_id, v_org); v_person := coalesce(p_source_person_id, v_person);
    v_player := coalesce(p_player_id, v_player); v_prospect := coalesce(p_prospect_id, v_prospect); v_need := coalesce(p_club_need_id, v_need);
  end if;

  v_prediction := public.djm_opportunity_probability(v_need, v_player, v_prospect, v_stage, p_primary_blocker, p_next_action_at);
  v_model_probability := (v_prediction ->> 'probability')::smallint;
  v_probability := case when p_manual_probability is not null then p_manual_probability else v_model_probability end;

  if p_id is null then
    insert into djm_os.deal_rooms(
      title, organisation_id, source_person_id, player_id, prospect_id, club_need_id,
      owner_user_id, stage, status, expected_commission, currency, probability,
      model_probability, manual_probability, probability_source, probability_basis,
      primary_blocker, next_decision, next_action_text, next_action_at,
      transfer_fee, player_salary, salary_period, financial_notes, last_meaningful_at, source
    ) values (
      coalesce(nullif(trim(p_title), ''), 'DJM opportunity'), v_org, v_person, v_player, v_prospect, v_need,
      v_owner, v_stage, v_status, p_expected_commission, coalesce(nullif(trim(p_currency), ''), 'EUR'), v_probability,
      v_model_probability, p_manual_probability, case when p_manual_probability is null then 'model' else 'manual' end, v_prediction,
      nullif(trim(coalesce(p_primary_blocker, '')), ''), nullif(trim(coalesce(p_next_decision, '')), ''),
      nullif(trim(coalesce(p_next_action_text, '')), ''), p_next_action_at, p_transfer_fee, p_player_salary,
      nullif(trim(coalesce(p_salary_period, '')), ''), nullif(trim(coalesce(p_financial_notes, '')), ''), now(),
      coalesce(nullif(trim(p_source), ''), 'opportunity_os')
    ) returning id into v_id;
  else
    update djm_os.deal_rooms set
      title = coalesce(nullif(trim(p_title), ''), title), stage = v_stage, status = v_status,
      expected_commission = p_expected_commission, currency = coalesce(nullif(trim(p_currency), ''), currency),
      probability = v_probability, model_probability = v_model_probability, manual_probability = p_manual_probability,
      probability_source = case when p_manual_probability is null then 'model' else 'manual' end,
      probability_basis = v_prediction, primary_blocker = nullif(trim(coalesce(p_primary_blocker, '')), ''),
      next_decision = nullif(trim(coalesce(p_next_decision, '')), ''), next_action_text = nullif(trim(coalesce(p_next_action_text, '')), ''),
      next_action_at = p_next_action_at, transfer_fee = p_transfer_fee, player_salary = p_player_salary,
      salary_period = nullif(trim(coalesce(p_salary_period, '')), ''), financial_notes = nullif(trim(coalesce(p_financial_notes, '')), ''),
      closed_at = case when v_status in ('won', 'lost') then coalesce(closed_at, now()) else null end,
      last_meaningful_at = now(), updated_at = now()
    where id = p_id returning id into v_id;
  end if;

  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, player_id, payload, source, confidence, occurred_at)
  values(
    case when p_id is null then 'OPPORTUNITY_CREATED' else 'OPPORTUNITY_UPDATED' end,
    auth.uid(), v_org, v_person, v_player,
    jsonb_build_object('opportunity_id', v_id, 'stage', v_stage, 'model_probability', v_model_probability, 'effective_probability', v_probability, 'probability_source', case when p_manual_probability is null then 'model' else 'manual' end),
    'opportunity_os', 1, now()
  );

  return jsonb_build_object('opportunity_id', v_id, 'model_probability', v_model_probability, 'probability', v_probability, 'probability_source', case when p_manual_probability is null then 'model' else 'manual' end);
end $$;

create or replace function public.djm_opportunities(p_status text default 'active')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.next_action_at nulls last, x.probability desc, x.updated_at desc)
    from (
      select d.id, d.title, d.organisation_id, o.name as organisation_name,
        d.source_person_id, pe.full_name as source_person_name, d.player_id, d.prospect_id,
        coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), sp.full_name) as player_name,
        d.club_need_id, d.stage, d.status, d.expected_commission, d.currency,
        d.probability, d.model_probability, d.manual_probability, d.probability_source,
        d.probability_basis, d.primary_blocker, d.next_decision, d.next_action_text,
        d.next_action_at, d.pitch_status, d.transfer_fee, d.player_salary, d.salary_period,
        d.financial_notes, tm.display_name as owner_name, d.updated_at
      from djm_os.deal_rooms d
      join djm_os.organisations o on o.id = d.organisation_id
      left join djm_os.people pe on pe.id = d.source_person_id
      left join public.players p on p.id = d.player_id
      left join djm_os.scouting_prospects sp on sp.id = d.prospect_id
      left join djm_os.team_members tm on tm.user_id = d.owner_user_id
      where p_status is null or p_status = '' or d.status = p_status
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.djm_opportunity(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'deal', (
      select to_jsonb(x) from (
        select d.*, o.name as organisation_name, o.country as organisation_country, o.website_url,
          pe.full_name as source_person_name, pe.linkedin_url as source_person_linkedin_url, pe.instagram_url as source_person_instagram_url,
          (select cm.value from djm_os.contact_methods cm where cm.person_id = pe.id and cm.channel = 'whatsapp' order by cm.is_primary desc limit 1) as source_person_whatsapp,
          (select cm.value from djm_os.contact_methods cm where cm.person_id = pe.id and cm.channel = 'email' order by cm.is_primary desc limit 1) as source_person_email,
          coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), sp.full_name) as player_name,
          p.transfermarkt_url as player_transfermarkt_url, p.stats_url as player_stats_url, p.instagram_url as player_instagram_url,
          tm.display_name as owner_name, to_jsonb(n) as club_need
        from djm_os.deal_rooms d
        join djm_os.organisations o on o.id = d.organisation_id
        left join djm_os.people pe on pe.id = d.source_person_id
        left join public.players p on p.id = d.player_id
        left join djm_os.scouting_prospects sp on sp.id = d.prospect_id
        left join djm_os.team_members tm on tm.user_id = d.owner_user_id
        left join djm_os.club_needs n on n.id = d.club_need_id
        where d.id = p_opportunity_id
      ) x
    ),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.due_at nulls last)
      from (
        select id, title, due_at, status, priority from djm_os.tasks
        where club_need_id = (select club_need_id from djm_os.deal_rooms where id = p_opportunity_id)
          and status not in ('done', 'completed', 'cancelled')
      ) t
    ), '[]'::jsonb),
    'pitches', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (
        select id, token, label, active, expires_at, view_count, last_viewed_at,
          pitch_message, pitch_status, sent_at, revoked_at, created_at
        from public.club_share_links where opportunity_id = p_opportunity_id
      ) s
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.djm_opportunity_create_pitch(
  p_opportunity_id uuid,
  p_message text default null,
  p_expires_at timestamptz default null,
  p_selected_sections jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_share_id uuid;
  v_token uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into v_deal from djm_os.deal_rooms where id = p_opportunity_id;
  if not found then raise exception 'Opportunity not found'; end if;
  if v_deal.player_id is null then raise exception 'A club dossier pitch requires a signed player'; end if;

  insert into public.club_share_links(
    player_id, label, active, expires_at, created_by, opportunity_id, organisation_id,
    source_person_id, pitch_message, pitch_status, selected_sections, sent_at
  ) values (
    v_deal.player_id, v_deal.title, true, coalesce(p_expires_at, now() + interval '30 days'), auth.uid(),
    v_deal.id, v_deal.organisation_id, v_deal.source_person_id, nullif(trim(coalesce(p_message, '')), ''),
    'ready', coalesce(p_selected_sections, '{}'::jsonb), null
  ) returning id, token into v_share_id, v_token;

  update djm_os.deal_rooms set pitch_status = 'ready', updated_at = now() where id = v_deal.id;
  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, player_id, payload, source, confidence, occurred_at)
  values('PITCH_CREATED', auth.uid(), v_deal.organisation_id, v_deal.source_person_id, v_deal.player_id,
    jsonb_build_object('opportunity_id', v_deal.id, 'share_id', v_share_id, 'expires_at', coalesce(p_expires_at, now() + interval '30 days')),
    'opportunity_os', 1, now());

  return jsonb_build_object('share_id', v_share_id, 'token', v_token, 'pitch_status', 'ready');
end $$;

create or replace function public.djm_opportunity_mark_pitch_sent(p_share_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_opportunity uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  update public.club_share_links set pitch_status = 'sent', sent_at = coalesce(sent_at, now())
  where id = p_share_id and active = true returning opportunity_id into v_opportunity;
  if not found then raise exception 'Pitch not found'; end if;
  update djm_os.deal_rooms set pitch_status = 'sent', stage = case when stage = 'potential' then 'pitched' else stage end, updated_at = now()
  where id = v_opportunity;
  return jsonb_build_object('share_id', p_share_id, 'pitch_status', 'sent');
end $$;

create or replace function public.djm_opportunity_close(
  p_opportunity_id uuid,
  p_outcome text,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage text := lower(trim(coalesce(p_outcome, '')));
  v_status text;
  v_probability smallint;
  v_deal djm_os.deal_rooms%rowtype;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_stage not in ('done', 'closed') then raise exception 'Outcome must be done or closed'; end if;
  v_status := case when v_stage = 'done' then 'won' else 'lost' end;
  v_probability := case when v_stage = 'done' then 100 else 0 end;
  update djm_os.deal_rooms set stage = v_stage, status = v_status, probability = v_probability,
    model_probability = v_probability, probability_source = 'outcome', outcome_reason = nullif(trim(coalesce(p_reason, '')), ''),
    closed_at = now(), last_meaningful_at = now(), updated_at = now()
  where id = p_opportunity_id returning * into v_deal;
  if not found then raise exception 'Opportunity not found'; end if;
  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, player_id, payload, source, confidence, occurred_at)
  values('OPPORTUNITY_OUTCOME_RECORDED', auth.uid(), v_deal.organisation_id, v_deal.source_person_id, v_deal.player_id,
    jsonb_build_object('opportunity_id', v_deal.id, 'outcome', v_stage, 'reason', nullif(trim(coalesce(p_reason, '')), '')),
    'opportunity_os', 1, now());
  return jsonb_build_object('opportunity_id', v_deal.id, 'stage', v_stage, 'status', v_status);
end $$;

create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
as $$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'pitch_message', s.pitch_message,
    'target_club', o.name,
    'profile', jsonb_build_object(
      'display_name', pp.display_name,
      'headline', pp.headline,
      'primary_position', pp.primary_position,
      'secondary_positions', pp.secondary_positions,
      'preferred_foot', pp.preferred_foot,
      'age_display', pp.age_display,
      'height_display', pp.height_display,
      'nationalities', pp.nationalities,
      'current_status', pp.current_status,
      'current_club', pp.current_club,
      'key_stats', pp.key_stats,
      'why_review', pp.why_review,
      'career_summary', pp.career_summary,
      'profile_photo_path', pp.profile_photo_path,
      'hero_image_path', pp.hero_image_path,
      'primary_video_url', pp.primary_video_url,
      'transfermarkt_url', pp.transfermarkt_url,
      'wyscout_url', pp.wyscout_url,
      'stats_url', pp.stats_url,
      'career_timeline', pp.career_timeline,
      'selected_videos', pp.selected_videos,
      'notable_experience', pp.notable_experience,
      'verified_at', pp.verified_at
    ),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'document_type', d.document_type, 'created_at', d.created_at) order by d.created_at desc)
      from public.player_documents d where d.player_id = s.player_id and d.club_shareable = true
    ), '[]'::jsonb)
  )
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  left join djm_os.organisations o on o.id = s.organisation_id
  where s.token = share_token and s.active = true and (s.expires_at is null or s.expires_at > now())
    and pp.published = true and p.verification_status = 'verified' and p.verified_at is not null
  limit 1;
$$;

create or replace function public.track_club_share_view(share_token uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare share_row public.club_share_links%rowtype;
begin
  select s.* into share_row
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  where s.token = share_token and s.active = true and (s.expires_at is null or s.expires_at > now())
    and pp.published = true and p.verification_status = 'verified' and p.verified_at is not null
  for update of s;
  if share_row.id is null then return false; end if;
  insert into public.club_share_views(share_id) values (share_row.id);
  update public.club_share_links set view_count = view_count + 1, last_viewed_at = now(),
    pitch_status = case when pitch_status in ('draft', 'ready', 'sent') then 'opened' else pitch_status end
  where id = share_row.id;
  if share_row.opportunity_id is not null then
    update djm_os.deal_rooms set pitch_status = 'opened', updated_at = now() where id = share_row.opportunity_id;
  end if;
  return true;
end $$;

revoke all on function public.djm_opportunity_probability(uuid,uuid,uuid,text,text,timestamptz) from public, anon;
revoke all on function public.djm_opportunity_upsert(uuid,text,uuid,uuid,uuid,uuid,uuid,text,numeric,text,text,text,text,timestamptz,numeric,numeric,text,text,smallint,text) from public, anon;
revoke all on function public.djm_opportunities(text) from public, anon;
revoke all on function public.djm_opportunity(uuid) from public, anon;
revoke all on function public.djm_opportunity_create_pitch(uuid,text,timestamptz,jsonb) from public, anon;
revoke all on function public.djm_opportunity_mark_pitch_sent(uuid) from public, anon;
revoke all on function public.djm_opportunity_close(uuid,text,text) from public, anon;
grant execute on function public.djm_opportunity_probability(uuid,uuid,uuid,text,text,timestamptz) to authenticated, service_role;
grant execute on function public.djm_opportunity_upsert(uuid,text,uuid,uuid,uuid,uuid,uuid,text,numeric,text,text,text,text,timestamptz,numeric,numeric,text,text,smallint,text) to authenticated, service_role;
grant execute on function public.djm_opportunities(text) to authenticated, service_role;
grant execute on function public.djm_opportunity(uuid) to authenticated, service_role;
grant execute on function public.djm_opportunity_create_pitch(uuid,text,timestamptz,jsonb) to authenticated, service_role;
grant execute on function public.djm_opportunity_mark_pitch_sent(uuid) to authenticated, service_role;
grant execute on function public.djm_opportunity_close(uuid,text,text) to authenticated, service_role;
revoke all on function public.get_club_share(uuid) from public;
revoke all on function public.track_club_share_view(uuid) from public;
grant execute on function public.get_club_share(uuid) to anon, authenticated;
grant execute on function public.track_club_share_view(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
