create table if not exists djm_os.scouting_prospects (
  id uuid primary key default gen_random_uuid(),
  linked_player_id uuid references public.players(id) on delete set null,
  full_name text not null,
  date_of_birth date,
  nationality text,
  current_club text,
  current_country text,
  primary_position text,
  secondary_positions text[] not null default '{}'::text[],
  preferred_foot text,
  contract_expiry date,
  market_value numeric,
  market_value_currency text,
  transfermarkt_url text,
  wyscout_url text,
  video_url text,
  instagram_url text,
  agent_status text,
  agent_name text,
  availability_status text not null default 'unknown' check (availability_status in ('unknown','monitor','approachable','available','represented','signed_djm','not_interested','do_not_contact')),
  source text,
  source_confidence numeric(5,4),
  owner_user_id uuid references djm_os.team_members(user_id) on delete set null,
  canonical_key text,
  last_verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists scouting_prospects_canonical_key_unique on djm_os.scouting_prospects(canonical_key) where canonical_key is not null;
create index if not exists scouting_prospects_position_idx on djm_os.scouting_prospects(primary_position,availability_status);
create index if not exists scouting_prospects_owner_idx on djm_os.scouting_prospects(owner_user_id,availability_status,updated_at desc);

create table if not exists djm_os.scouting_reports (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references djm_os.scouting_prospects(id) on delete cascade,
  scout_user_id uuid references djm_os.team_members(user_id) on delete set null,
  report_date date not null default current_date,
  source_type text not null default 'video' check (source_type in ('live','video','data','reference','conversation')),
  match_or_context text,
  football_score smallint check (football_score between 1 and 10),
  physical_score smallint check (physical_score between 1 and 10),
  tactical_score smallint check (tactical_score between 1 and 10),
  mentality_score smallint check (mentality_score between 1 and 10),
  personality_score smallint check (personality_score between 1 and 10),
  readiness_score smallint check (readiness_score between 1 and 10),
  recommendation text check (recommendation in ('strong_yes','yes','monitor','no','strong_no')),
  strengths text,
  risks text,
  role_fit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scouting_reports_prospect_idx on djm_os.scouting_reports(prospect_id,report_date desc);

create table if not exists djm_os.scouting_watchlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_user_id uuid references djm_os.team_members(user_id) on delete set null,
  is_shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists djm_os.scouting_watchlist_entries (
  watchlist_id uuid not null references djm_os.scouting_watchlists(id) on delete cascade,
  prospect_id uuid not null references djm_os.scouting_prospects(id) on delete cascade,
  priority smallint not null default 3 check(priority between 1 and 5),
  status text not null default 'active' check(status in ('active','contacted','paused','removed')),
  reason text,
  added_by uuid references djm_os.team_members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(watchlist_id,prospect_id)
);
create index if not exists scouting_watchlist_entries_prospect_idx on djm_os.scouting_watchlist_entries(prospect_id,status);

grant select,insert,update,delete on djm_os.scouting_prospects,djm_os.scouting_reports,djm_os.scouting_watchlists,djm_os.scouting_watchlist_entries to authenticated;
alter table djm_os.scouting_prospects enable row level security;
alter table djm_os.scouting_reports enable row level security;
alter table djm_os.scouting_watchlists enable row level security;
alter table djm_os.scouting_watchlist_entries enable row level security;

do $$ declare t text; begin
  foreach t in array array['scouting_prospects','scouting_reports','scouting_watchlists','scouting_watchlist_entries'] loop
    execute format('drop policy if exists djm_team_select on djm_os.%I',t);
    execute format('drop policy if exists djm_team_insert on djm_os.%I',t);
    execute format('drop policy if exists djm_team_update on djm_os.%I',t);
    execute format('drop policy if exists djm_team_delete on djm_os.%I',t);
    execute format('create policy djm_team_select on djm_os.%I for select to authenticated using ((select djm_os.is_team_member()))',t);
    execute format('create policy djm_team_insert on djm_os.%I for insert to authenticated with check ((select djm_os.is_team_member()))',t);
    execute format('create policy djm_team_update on djm_os.%I for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()))',t);
    execute format('create policy djm_team_delete on djm_os.%I for delete to authenticated using ((select djm_os.is_team_member()))',t);
  end loop;
end $$;

create or replace function public.djm_scout_upsert_prospect(
  p_full_name text,
  p_date_of_birth date default null,
  p_nationality text default null,
  p_current_club text default null,
  p_current_country text default null,
  p_primary_position text default null,
  p_secondary_positions text[] default '{}'::text[],
  p_preferred_foot text default null,
  p_contract_expiry date default null,
  p_transfermarkt_url text default null,
  p_wyscout_url text default null,
  p_video_url text default null,
  p_instagram_url text default null,
  p_agent_status text default null,
  p_agent_name text default null,
  p_availability_status text default 'unknown',
  p_source text default 'manual',
  p_notes text default null
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;v_key text;v_created boolean:=false;
begin
  if p_full_name is null or length(trim(p_full_name))<2 then raise exception 'Player name is required'; end if;
  if p_availability_status not in ('unknown','monitor','approachable','available','represented','signed_djm','not_interested','do_not_contact') then raise exception 'Invalid availability status'; end if;
  v_key:=lower(regexp_replace(trim(p_full_name),'[^a-zA-Z0-9]+','-','g'))||':'||coalesce(to_char(p_date_of_birth,'YYYY-MM-DD'),'unknown');
  select id into v_id from djm_os.scouting_prospects where canonical_key=v_key limit 1;
  if v_id is null then
    insert into djm_os.scouting_prospects(full_name,date_of_birth,nationality,current_club,current_country,primary_position,secondary_positions,preferred_foot,contract_expiry,transfermarkt_url,wyscout_url,video_url,instagram_url,agent_status,agent_name,availability_status,source,source_confidence,owner_user_id,canonical_key,last_verified_at,notes)
    values(trim(p_full_name),p_date_of_birth,nullif(trim(p_nationality),''),nullif(trim(p_current_club),''),nullif(trim(p_current_country),''),nullif(trim(p_primary_position),''),coalesce(p_secondary_positions,'{}'::text[]),nullif(trim(p_preferred_foot),''),p_contract_expiry,nullif(trim(p_transfermarkt_url),''),nullif(trim(p_wyscout_url),''),nullif(trim(p_video_url),''),nullif(trim(p_instagram_url),''),nullif(trim(p_agent_status),''),nullif(trim(p_agent_name),''),p_availability_status,coalesce(nullif(trim(p_source),''),'manual'),1,auth.uid(),v_key,now(),nullif(trim(p_notes),''))
    returning id into v_id;
    v_created:=true;
  else
    update djm_os.scouting_prospects set
      nationality=coalesce(nullif(trim(p_nationality),''),nationality),current_club=coalesce(nullif(trim(p_current_club),''),current_club),current_country=coalesce(nullif(trim(p_current_country),''),current_country),
      primary_position=coalesce(nullif(trim(p_primary_position),''),primary_position),secondary_positions=case when cardinality(coalesce(p_secondary_positions,'{}'::text[]))>0 then p_secondary_positions else secondary_positions end,
      preferred_foot=coalesce(nullif(trim(p_preferred_foot),''),preferred_foot),contract_expiry=coalesce(p_contract_expiry,contract_expiry),transfermarkt_url=coalesce(nullif(trim(p_transfermarkt_url),''),transfermarkt_url),
      wyscout_url=coalesce(nullif(trim(p_wyscout_url),''),wyscout_url),video_url=coalesce(nullif(trim(p_video_url),''),video_url),instagram_url=coalesce(nullif(trim(p_instagram_url),''),instagram_url),
      agent_status=coalesce(nullif(trim(p_agent_status),''),agent_status),agent_name=coalesce(nullif(trim(p_agent_name),''),agent_name),availability_status=p_availability_status,
      source=coalesce(nullif(trim(p_source),''),source),last_verified_at=now(),notes=coalesce(nullif(trim(p_notes),''),notes),updated_at=now()
    where id=v_id;
  end if;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(case when v_created then 'SCOUT_PROSPECT_CREATED' else 'SCOUT_PROSPECT_UPDATED' end,auth.uid(),jsonb_build_object('prospect_id',v_id,'name',trim(p_full_name),'availability_status',p_availability_status),'scout',1,now());
  return jsonb_build_object('prospect_id',v_id,'created',v_created);
end;
$$;

create or replace function public.djm_scout_prospects(p_search text default null,p_status text default null,p_limit integer default 200)
returns table(
  id uuid,full_name text,date_of_birth date,nationality text,current_club text,current_country text,primary_position text,secondary_positions text[],preferred_foot text,
  contract_expiry date,transfermarkt_url text,wyscout_url text,video_url text,instagram_url text,agent_status text,agent_name text,availability_status text,owner_user_id uuid,owner_name text,
  reports_count bigint,best_recommendation text,average_football_score numeric,updated_at timestamptz
)
language sql stable security invoker set search_path=''
as $$
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.secondary_positions,s.preferred_foot,s.contract_expiry,
         s.transfermarkt_url,s.wyscout_url,s.video_url,s.instagram_url,s.agent_status,s.agent_name,s.availability_status,s.owner_user_id,tm.display_name,
         (select count(*) from djm_os.scouting_reports r where r.prospect_id=s.id),
         (select r.recommendation from djm_os.scouting_reports r where r.prospect_id=s.id order by case r.recommendation when 'strong_yes' then 5 when 'yes' then 4 when 'monitor' then 3 when 'no' then 2 else 1 end desc,r.report_date desc limit 1),
         (select round(avg(r.football_score)::numeric,1) from djm_os.scouting_reports r where r.prospect_id=s.id and r.football_score is not null),s.updated_at
  from djm_os.scouting_prospects s left join djm_os.team_members tm on tm.user_id=s.owner_user_id
  where (p_search is null or p_search='' or s.full_name ilike '%'||p_search||'%' or s.current_club ilike '%'||p_search||'%')
    and (p_status is null or p_status='' or s.availability_status=p_status)
  order by case s.availability_status when 'available' then 0 when 'approachable' then 1 when 'monitor' then 2 else 3 end,s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
$$;

create or replace function public.djm_scout_add_report(
  p_prospect_id uuid,p_source_type text,p_match_or_context text default null,p_football_score smallint default null,p_physical_score smallint default null,
  p_tactical_score smallint default null,p_mentality_score smallint default null,p_personality_score smallint default null,p_readiness_score smallint default null,
  p_recommendation text default null,p_strengths text default null,p_risks text default null,p_role_fit text default null,p_notes text default null
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
  if not exists(select 1 from djm_os.scouting_prospects where id=p_prospect_id) then raise exception 'Prospect not found'; end if;
  insert into djm_os.scouting_reports(prospect_id,scout_user_id,source_type,match_or_context,football_score,physical_score,tactical_score,mentality_score,personality_score,readiness_score,recommendation,strengths,risks,role_fit,notes)
  values(p_prospect_id,auth.uid(),p_source_type,nullif(trim(p_match_or_context),''),p_football_score,p_physical_score,p_tactical_score,p_mentality_score,p_personality_score,p_readiness_score,p_recommendation,nullif(trim(p_strengths),''),nullif(trim(p_risks),''),nullif(trim(p_role_fit),''),nullif(trim(p_notes),'')) returning id into v_id;
  update djm_os.scouting_prospects set updated_at=now() where id=p_prospect_id;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('SCOUT_REPORT_ADDED',auth.uid(),jsonb_build_object('prospect_id',p_prospect_id,'report_id',v_id,'recommendation',p_recommendation),'scout',1,now());
  return jsonb_build_object('report_id',v_id);
end;
$$;

create or replace function public.djm_scout_need_matches(p_need_id uuid)
returns table(
  prospect_id uuid,full_name text,current_club text,primary_position text,preferred_foot text,date_of_birth date,availability_status text,
  scouting_score numeric,recommendation text,match_score smallint,reasoning jsonb
)
language sql stable security invoker set search_path=''
as $$
with n as (select * from djm_os.club_needs where id=p_need_id), candidates as (
  select s.*,
    (select round(avg((coalesce(r.football_score,0)+coalesce(r.physical_score,0)+coalesce(r.tactical_score,0)+coalesce(r.mentality_score,0)+coalesce(r.personality_score,0)+coalesce(r.readiness_score,0))::numeric/nullif((case when r.football_score is not null then 1 else 0 end+case when r.physical_score is not null then 1 else 0 end+case when r.tactical_score is not null then 1 else 0 end+case when r.mentality_score is not null then 1 else 0 end+case when r.personality_score is not null then 1 else 0 end+case when r.readiness_score is not null then 1 else 0 end),0)),1) from djm_os.scouting_reports r where r.prospect_id=s.id) as scouting_score,
    (select r.recommendation from djm_os.scouting_reports r where r.prospect_id=s.id order by r.report_date desc,r.created_at desc limit 1) as recommendation
  from djm_os.scouting_prospects s,n
  where s.availability_status in ('unknown','monitor','approachable','available') and djm_os.position_matches_player(n.position,s.primary_position,s.secondary_positions)
), scored as (
  select c.*,n.preferred_foot as need_foot,n.min_age as need_min_age,n.max_age as need_max_age,
    least(100,
      55
      +case when n.preferred_foot is null then 8 when lower(coalesce(c.preferred_foot,''))=lower(n.preferred_foot) then 15 else 0 end
      +case when n.min_age is null and n.max_age is null then 8 when c.date_of_birth is null then 3 when (n.min_age is null or date_part('year',age(current_date,c.date_of_birth))>=n.min_age) and (n.max_age is null or date_part('year',age(current_date,c.date_of_birth))<=n.max_age) then 12 else 0 end
      +case c.availability_status when 'available' then 10 when 'approachable' then 8 when 'monitor' then 4 else 2 end
      +case c.recommendation when 'strong_yes' then 8 when 'yes' then 6 when 'monitor' then 3 else 0 end
    )::smallint as score
  from candidates c,n
  where (n.preferred_foot is null or c.preferred_foot is null or lower(c.preferred_foot)=lower(n.preferred_foot))
    and (n.min_age is null or c.date_of_birth is null or date_part('year',age(current_date,c.date_of_birth))>=n.min_age)
    and (n.max_age is null or c.date_of_birth is null or date_part('year',age(current_date,c.date_of_birth))<=n.max_age)
)
select s.id,s.full_name,s.current_club,s.primary_position,s.preferred_foot,s.date_of_birth,s.availability_status,s.scouting_score,s.recommendation,s.score,
  jsonb_build_object('position_match',true,'foot_match',case when s.need_foot is null then null else lower(coalesce(s.preferred_foot,''))=lower(s.need_foot) end,'availability',s.availability_status,'scouting_score',s.scouting_score,'recommendation',s.recommendation)
from scored s
order by s.score desc,s.scouting_score desc nulls last,s.full_name;
$$;

revoke execute on function public.djm_scout_upsert_prospect(text,date,text,text,text,text,text[],text,date,text,text,text,text,text,text,text,text,text) from public,anon;
revoke execute on function public.djm_scout_prospects(text,text,integer) from public,anon;
revoke execute on function public.djm_scout_add_report(uuid,text,text,smallint,smallint,smallint,smallint,smallint,smallint,text,text,text,text,text) from public,anon;
revoke execute on function public.djm_scout_need_matches(uuid) from public,anon;
grant execute on function public.djm_scout_upsert_prospect(text,date,text,text,text,text,text[],text,date,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.djm_scout_prospects(text,text,integer) to authenticated;
grant execute on function public.djm_scout_add_report(uuid,text,text,smallint,smallint,smallint,smallint,smallint,smallint,text,text,text,text,text) to authenticated;
grant execute on function public.djm_scout_need_matches(uuid) to authenticated;
notify pgrst,'reload schema';
