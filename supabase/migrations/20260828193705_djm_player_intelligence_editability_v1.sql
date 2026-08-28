alter table djm_os.organisations
  add column if not exists linkedin_url text,
  add column if not exists instagram_url text,
  add column if not exists transfermarkt_url text;

create table if not exists djm_os.entity_links (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null,
  entity_id uuid not null,
  platform text not null,
  label text not null,
  url text not null,
  sort_order smallint not null default 0,
  is_public boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_links_kind_valid check (entity_kind in ('contact','club','player','recruitment')),
  constraint entity_links_platform_valid check (platform in ('linkedin','instagram','transfermarkt','wyscout','sofascore','fotmob','soccerway','stats','website','youtube','vimeo','x','tiktok','video','other')),
  constraint entity_links_url_http check (url ~* '^https?://[^[:space:]]+$'),
  constraint entity_links_unique_platform unique (entity_kind, entity_id, platform)
);

create index if not exists entity_links_lookup_idx on djm_os.entity_links (entity_kind, entity_id, sort_order, updated_at desc);
alter table djm_os.entity_links enable row level security;

drop policy if exists "DJM staff read entity links" on djm_os.entity_links;
create policy "DJM staff read entity links" on djm_os.entity_links for select to authenticated using (djm_os.is_team_member());
drop policy if exists "DJM staff add entity links" on djm_os.entity_links;
create policy "DJM staff add entity links" on djm_os.entity_links for insert to authenticated with check (djm_os.is_team_member());
drop policy if exists "DJM staff update entity links" on djm_os.entity_links;
create policy "DJM staff update entity links" on djm_os.entity_links for update to authenticated using (djm_os.is_team_member()) with check (djm_os.is_team_member());
drop policy if exists "DJM staff delete entity links" on djm_os.entity_links;
create policy "DJM staff delete entity links" on djm_os.entity_links for delete to authenticated using (djm_os.is_team_member());

revoke all on table djm_os.entity_links from public, anon;
grant select, insert, update, delete on table djm_os.entity_links to authenticated, service_role;

create or replace function public.djm_entity_links(p_entity_kind text,p_entity_id uuid) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_kind text := lower(trim(coalesce(p_entity_kind, '')));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_kind not in ('contact','club','player','recruitment') then raise exception 'Invalid entity kind'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'entity_kind',l.entity_kind,'entity_id',l.entity_id,'platform',l.platform,'label',l.label,'url',l.url,'sort_order',l.sort_order,'is_public',l.is_public,'updated_at',l.updated_at) order by l.sort_order,l.platform) from djm_os.entity_links l where l.entity_kind=v_kind and l.entity_id=p_entity_id),'[]'::jsonb);
end; $$;

create or replace function public.djm_entity_link_upsert(p_id uuid default null,p_entity_kind text default null,p_entity_id uuid default null,p_platform text default null,p_label text default null,p_url text default null,p_sort_order smallint default 0,p_is_public boolean default false) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_kind text := lower(trim(coalesce(p_entity_kind, ''))); v_platform text := lower(trim(coalesce(p_platform, ''))); v_label text := nullif(trim(coalesce(p_label, '')), ''); v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_kind not in ('contact','club','player','recruitment') then raise exception 'Invalid entity kind'; end if;
  if v_platform not in ('linkedin','instagram','transfermarkt','wyscout','sofascore','fotmob','soccerway','stats','website','youtube','vimeo','x','tiktok','video','other') then raise exception 'Invalid link type'; end if;
  if p_entity_id is null then raise exception 'Entity is required'; end if;
  if v_url is null then raise exception 'URL is required'; end if;
  if v_url !~* '^https?://' then v_url := 'https://' || v_url; end if;
  if v_url !~* '^https?://[^[:space:]]+$' then raise exception 'Enter a valid http or https URL'; end if;
  v_label := coalesce(v_label, initcap(replace(v_platform, '_', ' ')));
  if v_kind='contact' then if not exists(select 1 from djm_os.people where id=p_entity_id) then raise exception 'Contact not found'; end if;
  elsif v_kind='club' then if not exists(select 1 from djm_os.organisations where id=p_entity_id and organisation_type='club') then raise exception 'Club not found'; end if;
  elsif v_kind='player' then if not exists(select 1 from public.players where id=p_entity_id) then raise exception 'Player not found'; end if;
  elsif v_kind='recruitment' then if not exists(select 1 from djm_os.scouting_prospects where id=p_entity_id) then raise exception 'Recruitment target not found'; end if; end if;
  if p_id is not null then
    update djm_os.entity_links set platform=v_platform,label=v_label,url=v_url,sort_order=coalesce(p_sort_order,0),is_public=coalesce(p_is_public,false),updated_at=now() where id=p_id and entity_kind=v_kind and entity_id=p_entity_id returning id into v_id;
    if v_id is null then raise exception 'Link not found'; end if;
  else
    insert into djm_os.entity_links(entity_kind,entity_id,platform,label,url,sort_order,is_public,created_by) values(v_kind,p_entity_id,v_platform,v_label,v_url,coalesce(p_sort_order,0),coalesce(p_is_public,false),auth.uid()) on conflict (entity_kind,entity_id,platform) do update set label=excluded.label,url=excluded.url,sort_order=excluded.sort_order,is_public=excluded.is_public,updated_at=now() returning id into v_id;
  end if;
  if v_kind='contact' then update djm_os.people set linkedin_url=case when v_platform='linkedin' then v_url else linkedin_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,updated_at=now(),last_verified_at=now() where id=p_entity_id;
  elsif v_kind='club' then update djm_os.organisations set website_url=case when v_platform='website' then v_url else website_url end,linkedin_url=case when v_platform='linkedin' then v_url else linkedin_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,transfermarkt_url=case when v_platform='transfermarkt' then v_url else transfermarkt_url end,updated_at=now(),last_verified_at=now() where id=p_entity_id;
  elsif v_kind='player' then update public.players set transfermarkt_url=case when v_platform='transfermarkt' then v_url else transfermarkt_url end,wyscout_url=case when v_platform='wyscout' then v_url else wyscout_url end,stats_url=case when v_platform in ('stats','sofascore','fotmob','soccerway') then v_url else stats_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,updated_at=now() where id=p_entity_id;
  elsif v_kind='recruitment' then update djm_os.scouting_prospects set transfermarkt_url=case when v_platform='transfermarkt' then v_url else transfermarkt_url end,wyscout_url=case when v_platform='wyscout' then v_url else wyscout_url end,video_url=case when v_platform in ('video','youtube','vimeo') then v_url else video_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,updated_at=now(),last_verified_at=now() where id=p_entity_id; end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at) values('ENTITY_LINK_SAVED',auth.uid(),case when v_kind='contact' then p_entity_id else null end,case when v_kind='club' then p_entity_id else null end,case when v_kind='player' then p_entity_id else null end,jsonb_build_object('entity_kind',v_kind,'entity_id',p_entity_id,'platform',v_platform,'label',v_label,'url',v_url),'manual_ui',1,now());
  return jsonb_build_object('id',v_id,'platform',v_platform,'label',v_label,'url',v_url);
end; $$;

create or replace function public.djm_entity_link_delete(p_link_id uuid) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_link djm_os.entity_links%rowtype;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into v_link from djm_os.entity_links where id=p_link_id; if not found then raise exception 'Link not found'; end if;
  delete from djm_os.entity_links where id=p_link_id;
  if v_link.entity_kind='contact' then update djm_os.people set linkedin_url=case when v_link.platform='linkedin' and linkedin_url=v_link.url then null else linkedin_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,updated_at=now() where id=v_link.entity_id;
  elsif v_link.entity_kind='club' then update djm_os.organisations set website_url=case when v_link.platform='website' and website_url=v_link.url then null else website_url end,linkedin_url=case when v_link.platform='linkedin' and linkedin_url=v_link.url then null else linkedin_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,transfermarkt_url=case when v_link.platform='transfermarkt' and transfermarkt_url=v_link.url then null else transfermarkt_url end,updated_at=now() where id=v_link.entity_id;
  elsif v_link.entity_kind='player' then update public.players set transfermarkt_url=case when v_link.platform='transfermarkt' and transfermarkt_url=v_link.url then null else transfermarkt_url end,wyscout_url=case when v_link.platform='wyscout' and wyscout_url=v_link.url then null else wyscout_url end,stats_url=case when v_link.platform in ('stats','sofascore','fotmob','soccerway') and stats_url=v_link.url then null else stats_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,updated_at=now() where id=v_link.entity_id;
  elsif v_link.entity_kind='recruitment' then update djm_os.scouting_prospects set transfermarkt_url=case when v_link.platform='transfermarkt' and transfermarkt_url=v_link.url then null else transfermarkt_url end,wyscout_url=case when v_link.platform='wyscout' and wyscout_url=v_link.url then null else wyscout_url end,video_url=case when v_link.platform in ('video','youtube','vimeo') and video_url=v_link.url then null else video_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,updated_at=now() where id=v_link.entity_id; end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at) values('ENTITY_LINK_REMOVED',auth.uid(),case when v_link.entity_kind='contact' then v_link.entity_id else null end,case when v_link.entity_kind='club' then v_link.entity_id else null end,case when v_link.entity_kind='player' then v_link.entity_id else null end,jsonb_build_object('entity_kind',v_link.entity_kind,'entity_id',v_link.entity_id,'platform',v_link.platform,'label',v_link.label),'manual_ui',1,now());
  return true;
end; $$;

revoke all on function public.djm_entity_links(text,uuid) from public, anon;
revoke all on function public.djm_entity_link_upsert(uuid,text,uuid,text,text,text,smallint,boolean) from public, anon;
revoke all on function public.djm_entity_link_delete(uuid) from public, anon;
grant execute on function public.djm_entity_links(text,uuid) to authenticated, service_role;
grant execute on function public.djm_entity_link_upsert(uuid,text,uuid,text,text,text,smallint,boolean) to authenticated, service_role;
grant execute on function public.djm_entity_link_delete(uuid) to authenticated, service_role;

create table if not exists djm_os.league_benchmarks (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  league_name text not null,
  country text,
  strength_score smallint not null check (strength_score between 0 and 100),
  source_url text,
  source_note text,
  verified_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table djm_os.league_benchmarks enable row level security;
drop policy if exists "DJM staff read league benchmarks" on djm_os.league_benchmarks;
create policy "DJM staff read league benchmarks" on djm_os.league_benchmarks for select to authenticated using (djm_os.is_team_member());
drop policy if exists "DJM staff add league benchmarks" on djm_os.league_benchmarks;
create policy "DJM staff add league benchmarks" on djm_os.league_benchmarks for insert to authenticated with check (djm_os.is_team_member());
drop policy if exists "DJM staff update league benchmarks" on djm_os.league_benchmarks;
create policy "DJM staff update league benchmarks" on djm_os.league_benchmarks for update to authenticated using (djm_os.is_team_member()) with check (djm_os.is_team_member());
drop policy if exists "DJM staff delete league benchmarks" on djm_os.league_benchmarks;
create policy "DJM staff delete league benchmarks" on djm_os.league_benchmarks for delete to authenticated using (djm_os.is_team_member());
revoke all on table djm_os.league_benchmarks from public, anon;
grant select,insert,update,delete on table djm_os.league_benchmarks to authenticated,service_role;

create table if not exists djm_os.player_scorecards (
  player_id uuid primary key references public.players(id) on delete cascade,
  model_score smallint check (model_score is null or model_score between 0 and 100),
  manual_score smallint check (manual_score is null or manual_score between 0 and 100),
  potential_model_score smallint check (potential_model_score is null or potential_model_score between 0 and 100),
  manual_potential_score smallint check (manual_potential_score is null or manual_potential_score between 0 and 100),
  score_status text not null default 'not_enough_benchmark_data',
  confidence smallint not null default 0 check (confidence between 0 and 100),
  basis jsonb not null default '{}'::jsonb,
  model_version text not null default 'djm_player_score_v1',
  calculated_at timestamptz,
  override_reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table djm_os.player_scorecards enable row level security;
drop policy if exists "DJM staff read player scorecards" on djm_os.player_scorecards;
create policy "DJM staff read player scorecards" on djm_os.player_scorecards for select to authenticated using (djm_os.is_team_member());
drop policy if exists "DJM staff add player scorecards" on djm_os.player_scorecards;
create policy "DJM staff add player scorecards" on djm_os.player_scorecards for insert to authenticated with check (djm_os.is_team_member());
drop policy if exists "DJM staff update player scorecards" on djm_os.player_scorecards;
create policy "DJM staff update player scorecards" on djm_os.player_scorecards for update to authenticated using (djm_os.is_team_member()) with check (djm_os.is_team_member());
revoke all on table djm_os.player_scorecards from public, anon;
grant select,insert,update on table djm_os.player_scorecards to authenticated,service_role;

create or replace function public.djm_player_scorecard(p_player_id uuid) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p public.players%rowtype;
  b djm_os.league_benchmarks%rowtype;
  s djm_os.player_scorecards%rowtype;
  v_minutes integer:=0;
  v_appearances integer:=0;
  v_playing_time_score integer:=0;
  v_model smallint;
  v_potential smallint;
  v_confidence smallint:=0;
  v_status text:='not_enough_benchmark_data';
  v_age integer;
  v_headroom integer:=0;
  v_key text;
  v_basis jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id=p_player_id;
  if not found then raise exception 'Player not found'; end if;

  select coalesce(sum(coalesce(c.minutes,0)),0)::int,coalesce(sum(coalesce(c.appearances,0)),0)::int
  into v_minutes,v_appearances
  from public.career_entries c
  where c.player_id=p_player_id
    and coalesce(c.end_date,c.start_date,current_date)>=current_date-interval '24 months';

  v_key:=lower(regexp_replace(trim(coalesce(p.current_country,'')||'|'||coalesce(p.current_league,'')),'\s+',' ','g'));
  select * into b from djm_os.league_benchmarks where canonical_key=v_key limit 1;

  if p.date_of_birth is not null then
    v_age:=date_part('year',age(current_date,p.date_of_birth))::int;
  end if;

  v_playing_time_score:=least(100,round(v_minutes::numeric/2500*100))::int;
  v_confidence:=least(100,round(
    (case when v_minutes>=500 then 45 else v_minutes::numeric/500*45 end)
    +(case when b.id is not null then 45 else 0 end)
    +(case when p.verification_status='verified' then 10 else 0 end)
  ))::smallint;

  if v_minutes>=500 and b.id is not null then
    v_model:=least(100,greatest(0,round(b.strength_score*.75+v_playing_time_score*.25)))::smallint;
    v_status:='provisional';
    if v_age is not null then
      v_headroom:=case when v_age<=19 then 12 when v_age<=21 then 9 when v_age<=23 then 6 when v_age<=25 then 3 else 0 end;
      v_potential:=least(100,v_model+v_headroom)::smallint;
    end if;
  end if;

  v_basis:=jsonb_build_object(
    'model','DJM Player Score v1',
    'status',v_status,
    'recent_minutes_24m',v_minutes,
    'recent_appearances_24m',v_appearances,
    'current_league',p.current_league,
    'current_country',p.current_country,
    'league_strength_score',b.strength_score,
    'league_benchmark_source_url',b.source_url,
    'playing_time_score',v_playing_time_score,
    'age',v_age,
    'potential_headroom',v_headroom,
    'rules',jsonb_build_array(
      'Minimum 500 senior minutes in the previous 24 months',
      'Current competition requires a DJM league benchmark',
      'Current score is 75% competition benchmark and 25% playing-time signal',
      'Potential is an age-based provisional headroom and is not a transfer prediction'
    ),
    'calculated_at',now()
  );

  insert into djm_os.player_scorecards(player_id,model_score,potential_model_score,score_status,confidence,basis,model_version,calculated_at,updated_by)
  values(p_player_id,v_model,v_potential,v_status,v_confidence,v_basis,'djm_player_score_v1',now(),auth.uid())
  on conflict (player_id) do update set
    model_score=excluded.model_score,
    potential_model_score=excluded.potential_model_score,
    score_status=excluded.score_status,
    confidence=excluded.confidence,
    basis=excluded.basis,
    model_version=excluded.model_version,
    calculated_at=excluded.calculated_at,
    updated_at=now()
  returning * into s;

  return jsonb_build_object(
    'player_id',p_player_id,
    'score',coalesce(s.manual_score,s.model_score),
    'model_score',s.model_score,
    'manual_score',s.manual_score,
    'potential_score',coalesce(s.manual_potential_score,s.potential_model_score),
    'potential_model_score',s.potential_model_score,
    'manual_potential_score',s.manual_potential_score,
    'source',case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' else 'insufficient_data' end,
    'status',s.score_status,
    'confidence',s.confidence,
    'override_reason',s.override_reason,
    'basis',s.basis,
    'model_version',s.model_version,
    'calculated_at',s.calculated_at
  );
end; $$;

create or replace function public.djm_player_score_override(p_player_id uuid,p_score smallint default null,p_potential_score smallint default null,p_reason text default null) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id=p_player_id) then raise exception 'Player not found'; end if;
  if p_score is not null and (p_score<0 or p_score>100) then raise exception 'Player score must be between 0 and 100'; end if;
  if p_potential_score is not null and (p_potential_score<0 or p_potential_score>100) then raise exception 'Potential score must be between 0 and 100'; end if;
  if (p_score is not null or p_potential_score is not null) and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Add a reason for the manual override'; end if;

  insert into djm_os.player_scorecards(player_id,manual_score,manual_potential_score,override_reason,updated_by)
  values(p_player_id,p_score,p_potential_score,nullif(trim(coalesce(p_reason,'')),''),auth.uid())
  on conflict (player_id) do update set
    manual_score=excluded.manual_score,
    manual_potential_score=excluded.manual_potential_score,
    override_reason=excluded.override_reason,
    updated_by=auth.uid(),
    updated_at=now();

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_SCORE_OVERRIDE_UPDATED',auth.uid(),p_player_id,jsonb_build_object('manual_score',p_score,'manual_potential_score',p_potential_score,'reason',nullif(trim(coalesce(p_reason,'')),'')),'manual_ui',1,now());

  return public.djm_player_scorecard(p_player_id);
end; $$;

create or replace function public.djm_league_benchmark_upsert(p_league_name text,p_country text,p_strength_score smallint,p_source_url text default null,p_source_note text default null) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_key text; v_id uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_league_name,'')),'') is null then raise exception 'League name is required'; end if;
  if p_strength_score is null or p_strength_score<0 or p_strength_score>100 then raise exception 'Strength score must be between 0 and 100'; end if;
  v_key:=lower(regexp_replace(trim(coalesce(p_country,'')||'|'||p_league_name),'\s+',' ','g'));

  insert into djm_os.league_benchmarks(canonical_key,league_name,country,strength_score,source_url,source_note,verified_at,updated_by)
  values(v_key,trim(p_league_name),nullif(trim(coalesce(p_country,'')),''),p_strength_score,nullif(trim(coalesce(p_source_url,'')),''),nullif(trim(coalesce(p_source_note,'')),''),now(),auth.uid())
  on conflict(canonical_key) do update set
    league_name=excluded.league_name,
    country=excluded.country,
    strength_score=excluded.strength_score,
    source_url=excluded.source_url,
    source_note=excluded.source_note,
    verified_at=now(),
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object('id',v_id,'canonical_key',v_key,'strength_score',p_strength_score);
end; $$;

revoke all on function public.djm_player_scorecard(uuid) from public,anon;
revoke all on function public.djm_player_score_override(uuid,smallint,smallint,text) from public,anon;
revoke all on function public.djm_league_benchmark_upsert(text,text,smallint,text,text) from public,anon;
grant execute on function public.djm_player_scorecard(uuid) to authenticated,service_role;
grant execute on function public.djm_player_score_override(uuid,smallint,smallint,text) to authenticated,service_role;
grant execute on function public.djm_league_benchmark_upsert(text,text,smallint,text,text) to authenticated,service_role;

notify pgrst,'reload schema';
