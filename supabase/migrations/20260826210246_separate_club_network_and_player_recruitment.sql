alter table djm_os.scouting_prospects
  add column if not exists recruitment_stage text not null default 'identified',
  add column if not exists recruitment_priority smallint not null default 3,
  add column if not exists first_contact_at timestamptz,
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists preferred_contact_channel text,
  add column if not exists recruitment_notes text;

alter table djm_os.scouting_prospects
  drop constraint if exists scouting_prospects_recruitment_stage_check;
alter table djm_os.scouting_prospects
  add constraint scouting_prospects_recruitment_stage_check check (recruitment_stage in ('identified','researching','ready_to_contact','contacted','replied','call_booked','interested','terms_discussed','agreement_sent','negotiating','signed','paused','declined','lost'));

alter table djm_os.scouting_prospects
  drop constraint if exists scouting_prospects_recruitment_priority_check;
alter table djm_os.scouting_prospects
  add constraint scouting_prospects_recruitment_priority_check check (recruitment_priority between 1 and 5);

create index if not exists scouting_prospects_recruitment_stage_idx on djm_os.scouting_prospects(recruitment_stage, recruitment_priority, next_action_at);

create or replace function public.djm_network_club_contacts(p_search text default null, p_limit integer default 200)
returns table(
  id uuid,
  full_name text,
  country text,
  city text,
  current_organisation text,
  role_title text,
  relationship_score smallint,
  last_meaningful_at timestamptz,
  last_interaction_at timestamptz,
  whatsapp text,
  email text,
  linkedin_url text
)
language sql
security invoker
set search_path=''
as $$
  select
    p.id,
    p.full_name,
    p.country,
    p.city,
    o.name as current_organisation,
    e.role_title,
    coalesce(r.strength_score,0)::smallint,
    r.last_meaningful_at,
    (select max(i.occurred_at) from djm_os.interactions i where i.person_id=p.id) as last_interaction_at,
    (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='whatsapp' order by cm.is_primary desc, cm.updated_at desc limit 1) as whatsapp,
    (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='email' order by cm.is_primary desc, cm.updated_at desc limit 1) as email,
    p.linkedin_url
  from djm_os.people p
  left join djm_os.employments e on e.person_id=p.id and e.is_current=true
  left join djm_os.organisations o on o.id=e.organisation_id
  left join djm_os.relationships r on r.person_id=p.id and r.team_member_id=(select auth.uid())
  where p.person_type in ('club_contact','coach','sporting_director','recruitment','club_executive','scout','intermediary','agent','football_contact')
    and (p_search is null or p_search='' or concat_ws(' ',p.full_name,o.name,e.role_title,p.country,p.city) ilike '%'||p_search||'%')
  order by coalesce(r.strength_score,0) desc, p.full_name
  limit greatest(1,least(coalesce(p_limit,200),500));
$$;

grant execute on function public.djm_network_club_contacts(text,integer) to authenticated;

create or replace function public.djm_network_upsert_club(
  p_name text,
  p_country text default null,
  p_city text default null,
  p_website_url text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_id uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_name is null or length(trim(p_name))<2 then raise exception 'Club name is required'; end if;
  v_id:=djm_os.ensure_organisation(trim(p_name),nullif(trim(p_country),''));
  update djm_os.organisations
  set organisation_type='club',
      country=coalesce(nullif(trim(p_country),''),country),
      city=coalesce(nullif(trim(p_city),''),city),
      website_url=coalesce(nullif(trim(p_website_url),''),website_url),
      updated_at=now()
  where id=v_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values('CLUB_UPSERTED',(select auth.uid()),v_id,jsonb_build_object('name',trim(p_name)),'network',1,now());
  return jsonb_build_object('organisation_id',v_id);
end $$;

grant execute on function public.djm_network_upsert_club(text,text,text,text) to authenticated;

create or replace function public.djm_recruitment_targets(p_search text default null, p_stage text default null, p_limit integer default 250)
returns table(
  id uuid,
  full_name text,
  date_of_birth date,
  nationality text,
  current_club text,
  current_country text,
  primary_position text,
  preferred_foot text,
  transfermarkt_url text,
  instagram_url text,
  agent_status text,
  agent_name text,
  availability_status text,
  recruitment_stage text,
  recruitment_priority smallint,
  owner_user_id uuid,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  next_action_at timestamptz,
  preferred_contact_channel text,
  notes text,
  recruitment_notes text,
  updated_at timestamptz
)
language sql
security invoker
set search_path=''
as $$
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.preferred_foot,s.transfermarkt_url,s.instagram_url,s.agent_status,s.agent_name,s.availability_status,s.recruitment_stage,s.recruitment_priority,s.owner_user_id,s.first_contact_at,s.last_contact_at,s.next_action_at,s.preferred_contact_channel,s.notes,s.recruitment_notes,s.updated_at
  from djm_os.scouting_prospects s
  where s.linked_player_id is null
    and (p_stage is null or p_stage='' or s.recruitment_stage=p_stage)
    and (p_search is null or p_search='' or concat_ws(' ',s.full_name,s.current_club,s.current_country,s.primary_position,s.nationality,s.agent_name) ilike '%'||p_search||'%')
  order by s.recruitment_priority asc, s.next_action_at nulls last, s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,250),500));
$$;

grant execute on function public.djm_recruitment_targets(text,text,integer) to authenticated;

create or replace function public.djm_recruitment_set_stage(
  p_prospect_id uuid,
  p_stage text,
  p_next_action_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_stage not in ('identified','researching','ready_to_contact','contacted','replied','call_booked','interested','terms_discussed','agreement_sent','negotiating','signed','paused','declined','lost') then raise exception 'Invalid recruitment stage'; end if;
  update djm_os.scouting_prospects
  set recruitment_stage=p_stage,
      first_contact_at=case when p_stage in ('contacted','replied','call_booked','interested','terms_discussed','agreement_sent','negotiating','signed') then coalesce(first_contact_at,now()) else first_contact_at end,
      last_contact_at=case when p_stage in ('contacted','replied','call_booked','interested','terms_discussed','agreement_sent','negotiating','signed') then now() else last_contact_at end,
      next_action_at=p_next_action_at,
      recruitment_notes=case when p_note is null or trim(p_note)='' then recruitment_notes else concat_ws(E'\n',nullif(recruitment_notes,''),trim(p_note)) end,
      updated_at=now()
  where id=p_prospect_id and linked_player_id is null;
  if not found then raise exception 'Recruitment target not found'; end if;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('RECRUITMENT_STAGE_CHANGED',(select auth.uid()),jsonb_build_object('prospect_id',p_prospect_id,'stage',p_stage,'next_action_at',p_next_action_at),'recruitment',1,now());
  return jsonb_build_object('prospect_id',p_prospect_id,'stage',p_stage);
end $$;

grant execute on function public.djm_recruitment_set_stage(uuid,text,timestamptz,text) to authenticated;
