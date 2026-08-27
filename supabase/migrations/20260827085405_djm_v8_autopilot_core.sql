-- DJM OS V8 Autopilot Core
-- Mirrors production migration 20260827085405.

create or replace function public.djm_network_capture_smart(
  p_text text,
  p_channel text default 'whatsapp'::text,
  p_person_id uuid default null::uuid,
  p_organisation_id uuid default null::uuid,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_person_id uuid:=p_person_id;
  v_org_id uuid:=p_organisation_id;
  v_person_name text;
  v_org_name text;
  v_resolution text:='manual';
  v_result jsonb;
  v_clean_text text:=lower(regexp_replace(coalesce(p_text,''),'[^a-zA-Z0-9]+',' ','g'));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_text is null or length(trim(p_text))<2 then raise exception 'Capture text is required'; end if;

  if v_person_id is null then
    select p.id,p.full_name into v_person_id,v_person_name
    from djm_os.people p
    where length(trim(p.full_name))>=4
      and position(lower(trim(p.full_name)) in lower(p_text))>0
    order by length(trim(p.full_name)) desc,p.updated_at desc
    limit 1;
    if v_person_id is not null then v_resolution:='full_name'; end if;
  end if;

  if v_person_id is null then
    with candidate as (
      select p.id,p.full_name,p.preferred_name
      from djm_os.people p
      where length(trim(coalesce(p.preferred_name,'')))>=4
        and position(' '||lower(trim(p.preferred_name))||' ' in ' '||v_clean_text||' ')>0
    ), unique_candidate as (
      select * from candidate where (select count(*) from candidate)=1
    )
    select id,full_name into v_person_id,v_person_name from unique_candidate limit 1;
    if v_person_id is not null then v_resolution:='unique_preferred_name'; end if;
  end if;

  if v_person_id is not null and v_org_id is null then
    select e.organisation_id,o.name into v_org_id,v_org_name
    from djm_os.employments e
    join djm_os.organisations o on o.id=e.organisation_id
    where e.person_id=v_person_id and e.is_current=true
    order by e.last_verified_at desc nulls last,e.updated_at desc
    limit 1;
  end if;

  if v_org_id is null then
    select o.id,o.name into v_org_id,v_org_name
    from djm_os.organisations o
    where o.organisation_type='club'
      and length(trim(o.name))>=3
      and position(lower(trim(o.name)) in lower(p_text))>0
    order by length(trim(o.name)) desc,o.updated_at desc
    limit 1;
    if v_org_id is not null and v_resolution='manual' then v_resolution:='club_name'; end if;
  end if;

  if v_person_id is not null and v_person_name is null then select full_name into v_person_name from djm_os.people where id=v_person_id; end if;
  if v_org_id is not null and v_org_name is null then select name into v_org_name from djm_os.organisations where id=v_org_id; end if;

  select public.djm_network_capture_text(
    p_text,
    coalesce(nullif(trim(p_channel),''),'whatsapp'),
    v_person_id,
    v_org_id,
    coalesce(p_occurred_at,now())
  ) into v_result;

  return v_result || jsonb_build_object(
    'resolved_person_id',v_person_id,
    'resolved_person_name',v_person_name,
    'resolved_organisation_id',v_org_id,
    'resolved_organisation_name',v_org_name,
    'resolution',v_resolution
  );
end;
$$;

create or replace function public.djm_recruitment_quick_add(
  p_transfermarkt_url text,
  p_priority smallint default 3,
  p_notes text default null::text
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_url text:=nullif(trim(coalesce(p_transfermarkt_url,'')),'');
  v_slug text;
  v_name text;
  v_result jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_url is null or v_url !~* 'transfermarkt\.' or v_url !~* '/profil/spieler/[0-9]+' then
    raise exception 'Paste a valid Transfermarkt player profile URL';
  end if;
  if p_priority<1 or p_priority>5 then raise exception 'Priority must be 1-5'; end if;

  v_slug:=substring(v_url from '/([^/?#]+)/profil/spieler/');
  if v_slug is null then raise exception 'Could not identify the player name from this Transfermarkt URL'; end if;
  v_name:=initcap(regexp_replace(v_slug,'[-_]+',' ','g'));

  select public.djm_recruitment_upsert_target(
    p_full_name=>v_name,
    p_transfermarkt_url=>v_url,
    p_recruitment_priority=>p_priority,
    p_recruitment_source=>'transfermarkt_url',
    p_notes=>nullif(trim(coalesce(p_notes,'')),'')
  ) into v_result;

  return v_result || jsonb_build_object('derived_name',v_name,'transfermarkt_url',v_url,'queued_for_enrichment',true);
end;
$$;

create or replace function public.djm_market_create_need_from_text(
  p_organisation_id uuid,
  p_text text,
  p_source_person_id uuid default null::uuid
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_text text:=trim(coalesce(p_text,''));
  v_lower text:=lower(trim(coalesce(p_text,'')));
  v_position text;
  v_foot text;
  v_min_age smallint;
  v_max_age smallint;
  v_transfer_type text;
  v_currency text;
  v_match text[];
  v_result jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null then raise exception 'Choose the club first'; end if;
  if length(v_text)<3 then raise exception 'Describe what the club needs'; end if;

  v_position:=djm_os.normalise_need_position(v_text);
  if v_position is null then raise exception 'DJM could not detect a position. Include something like RW, LCB, striker, number 6 or goalkeeper.'; end if;

  if v_lower ~ '(left[- ]?foot|left footed|left-footed)' and v_lower !~ '(right[- ]?foot|right footed|right-footed)' then v_foot:='left';
  elsif v_lower ~ '(right[- ]?foot|right footed|right-footed)' and v_lower !~ '(left[- ]?foot|left footed|left-footed)' then v_foot:='right';
  end if;

  v_match:=regexp_match(v_lower,'(?:min(?:imum)? age|age min)[^0-9]{0,5}([1-3][0-9])');
  if v_match is not null then v_min_age:=v_match[1]::smallint; end if;
  v_match:=regexp_match(v_lower,'(?:max(?:imum)? age|age max|under|u)[^0-9]{0,5}([1-3][0-9])');
  if v_match is not null then v_max_age:=v_match[1]::smallint; end if;

  if v_lower ~ '(free[^a-z0-9]+or[^a-z0-9]+(?:free[^a-z0-9]+)?loan|free/loan|free or loan)' then v_transfer_type:='free_or_loan';
  elsif v_lower ~ '\mloan\M' then v_transfer_type:='loan';
  elsif v_lower ~ '(free agent|free transfer|\mfree\M)' then v_transfer_type:='free';
  elsif v_lower ~ '(can pay transfer|transfer fee|\mtransfer\M)' then v_transfer_type:='transfer';
  end if;

  if v_lower ~ '(€|\meur\M|euro)' then v_currency:='EUR';
  elsif v_lower ~ '(£|\mgbp\M)' then v_currency:='GBP';
  elsif v_lower ~ '\maud\M' then v_currency:='AUD';
  elsif v_lower ~ '\mnzd\M' then v_currency:='NZD';
  elsif v_lower ~ '(\musd\M|\$)' then v_currency:='USD';
  end if;

  select public.djm_market_create_need(
    p_organisation_id=>p_organisation_id,
    p_title=>v_position||' requirement',
    p_position=>v_position,
    p_source_person_id=>p_source_person_id,
    p_preferred_foot=>v_foot,
    p_min_age=>v_min_age,
    p_max_age=>v_max_age,
    p_transfer_type=>v_transfer_type,
    p_currency=>v_currency,
    p_profile_notes=>v_text
  ) into v_result;

  return v_result || jsonb_build_object(
    'parsed',jsonb_build_object(
      'position',v_position,
      'preferred_foot',v_foot,
      'min_age',v_min_age,
      'max_age',v_max_age,
      'transfer_type',v_transfer_type,
      'currency',v_currency
    )
  );
end;
$$;

create or replace function public.djm_network_update_club_profile(
  p_organisation_id uuid,
  p_name text,
  p_country text default null::text,
  p_city text default null::text,
  p_website_url text default null::text
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_key text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_name is null then raise exception 'Club name is required'; end if;
  if not exists(select 1 from djm_os.organisations where id=p_organisation_id) then raise exception 'Club not found'; end if;
  v_key:=djm_os.canonical_org_key(v_name);
  if exists(select 1 from djm_os.organisations where canonical_key=v_key and id<>p_organisation_id) then
    raise exception 'Another club already uses this name';
  end if;

  update djm_os.organisations
  set name=v_name,
      canonical_key=v_key,
      organisation_type='club',
      country=nullif(trim(coalesce(p_country,'')),''),
      city=nullif(trim(coalesce(p_city,'')),''),
      website_url=nullif(trim(coalesce(p_website_url,'')),''),
      last_verified_at=now(),
      updated_at=now()
  where id=p_organisation_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values('CLUB_PROFILE_UPDATED',auth.uid(),p_organisation_id,jsonb_build_object('name',v_name),'network',1,now());
  return jsonb_build_object('organisation_id',p_organisation_id,'updated',true);
end;
$$;

create or replace function public.djm_market_update_need(
  p_need_id uuid,
  p_title text,
  p_position text,
  p_preferred_foot text default null::text,
  p_min_age smallint default null::smallint,
  p_max_age smallint default null::smallint,
  p_transfer_type text default null::text,
  p_transfer_budget numeric default null::numeric,
  p_salary_budget numeric default null::numeric,
  p_currency text default null::text,
  p_salary_period text default null::text,
  p_profile_notes text default null::text,
  p_registration_notes text default null::text,
  p_expires_at timestamptz default null::timestamptz
)
returns jsonb
language plpgsql
set search_path to ''
as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from djm_os.club_needs where id=p_need_id) then raise exception 'Club need not found'; end if;
  if p_position is null or length(trim(p_position))<1 then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age>p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;

  update djm_os.club_needs
  set title=coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement'),
      position=trim(p_position),
      preferred_foot=nullif(trim(coalesce(p_preferred_foot,'')),''),
      min_age=p_min_age,
      max_age=p_max_age,
      transfer_type=nullif(trim(coalesce(p_transfer_type,'')),''),
      transfer_budget=p_transfer_budget,
      salary_budget=p_salary_budget,
      currency=nullif(trim(coalesce(p_currency,'')),''),
      salary_period=nullif(trim(coalesce(p_salary_period,'')),''),
      profile_notes=nullif(trim(coalesce(p_profile_notes,'')),''),
      registration_notes=nullif(trim(coalesce(p_registration_notes,'')),''),
      expires_at=coalesce(p_expires_at,expires_at),
      updated_at=now()
  where id=p_need_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  select 'CLUB_NEED_UPDATED',auth.uid(),organisation_id,jsonb_build_object('club_need_id',id,'position',position,'title',title),'market',1,now()
  from djm_os.club_needs where id=p_need_id;

  return jsonb_build_object('need_id',p_need_id,'updated',true);
end;
$$;

create or replace function djm_os.autopilot_tick()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_titles int:=0;
  v_thread_reviews int:=0;
  v_contact_reviews int:=0;
  v_followups int:=0;
  v_needs int:=0;
  v_suggestions jsonb:='{}'::jsonb;
  r record;
begin
  update djm_os.tasks t
  set title='Follow up recruitment target: '||sp.full_name,updated_at=now()
  from djm_os.scouting_prospects sp
  where t.source='recruitment:'||sp.id::text
    and t.status not in ('completed','cancelled')
    and t.title is distinct from 'Follow up recruitment target: '||sp.full_name;
  get diagnostics v_titles=row_count;

  update djm_os.review_items ri
  set status='resolved',resolved_at=now()
  where ri.status='open'
    and ri.review_type='thread_identity'
    and exists(
      select 1 from djm_os.conversation_threads t
      where t.id=(ri.payload->>'thread_id')::uuid and t.person_id is not null
    );
  get diagnostics v_thread_reviews=row_count;

  update djm_os.review_items ri
  set status='resolved',resolved_at=now()
  where ri.status='open'
    and ri.review_type='contact_identity'
    and ri.person_id is not null
    and exists(
      select 1 from djm_os.employments e
      where e.person_id=ri.person_id and e.is_current=true and nullif(trim(coalesce(e.role_title,'')),'') is not null
    );
  get diagnostics v_contact_reviews=row_count;

  v_followups:=djm_os.refresh_recruitment_followups();

  for r in select id from djm_os.club_needs where status in ('active','open','confirmed') loop
    perform djm_os.refresh_need_matches(r.id);
    v_needs:=v_needs+1;
  end loop;

  v_suggestions:=djm_os.refresh_today_suggestions();

  return jsonb_build_object(
    'task_titles_synced',v_titles,
    'thread_reviews_resolved',v_thread_reviews,
    'contact_reviews_resolved',v_contact_reviews,
    'recruitment_followups_created',v_followups,
    'active_needs_refreshed',v_needs,
    'suggestions',v_suggestions,
    'ran_at',now()
  );
end;
$$;

revoke all on function public.djm_network_capture_smart(text,text,uuid,uuid,timestamptz) from public, anon;
revoke all on function public.djm_recruitment_quick_add(text,smallint,text) from public, anon;
revoke all on function public.djm_market_create_need_from_text(uuid,text,uuid) from public, anon;
revoke all on function public.djm_network_update_club_profile(uuid,text,text,text,text) from public, anon;
revoke all on function public.djm_market_update_need(uuid,text,text,text,smallint,smallint,text,numeric,numeric,text,text,text,text,timestamptz) from public, anon;

grant execute on function public.djm_network_capture_smart(text,text,uuid,uuid,timestamptz) to authenticated, service_role;
grant execute on function public.djm_recruitment_quick_add(text,smallint,text) to authenticated, service_role;
grant execute on function public.djm_market_create_need_from_text(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.djm_network_update_club_profile(uuid,text,text,text,text) to authenticated, service_role;
grant execute on function public.djm_market_update_need(uuid,text,text,text,smallint,smallint,text,numeric,numeric,text,text,text,text,timestamptz) to authenticated, service_role;

-- Ensure one V8 autopilot schedule exists.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='djm-os-autopilot-v8' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end $$;
select cron.schedule('djm-os-autopilot-v8','47 */3 * * *','select djm_os.autopilot_tick();');
