create table if not exists djm_os.global_league_strength_sources (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  confederation text,
  source text not null,
  raw_value numeric not null,
  raw_rank integer,
  observed_on date not null,
  reliability numeric not null default 0.8 check (reliability between 0 and 1),
  source_url text,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country, source, observed_on)
);
alter table djm_os.global_league_strength_sources enable row level security;
revoke all on djm_os.global_league_strength_sources from anon, authenticated;

create or replace function djm_os.global_country_top_league_score(p_country text)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_iffhs numeric; v_confed numeric; v_iffhs_score numeric; v_confed_score numeric; v_has_uefa boolean := false;
begin
  select s.raw_value into v_iffhs from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_2025' order by s.observed_on desc limit 1;
  select s.raw_value,(s.source='uefa_live_2026_08_31') into v_confed,v_has_uefa from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source in ('uefa_live_2026_08_31','afc_2025_26') order by s.observed_on desc limit 1;
  if v_iffhs is not null then v_iffhs_score := greatest(25,least(100,25+75*(ln(greatest(v_iffhs,155.75)/155.75)/nullif(ln(2359.0/155.75),0)))); end if;
  if v_confed is not null then
    if v_has_uefa then v_confed_score := greatest(35,least(100,35+65*(ln(greatest(v_confed,5)/5.0)/nullif(ln(102.019/5.0),0))));
    else v_confed_score := greatest(25,least(85,25+60*(ln(greatest(v_confed,0.5)/0.5)/nullif(ln(122.195/0.5),0)))); end if;
  end if;
  if v_iffhs_score is not null and v_confed_score is not null then return round((v_iffhs_score*.70+v_confed_score*.30),2); end if;
  if v_iffhs_score is not null then return round(v_iffhs_score,2); end if;
  if v_confed_score is not null then return round(v_confed_score,2); end if;
  return null;
end; $$;

create or replace function djm_os.infer_global_league_tier(p_country text,p_league text)
returns integer language plpgsql immutable set search_path='' as $$
declare c text:=lower(coalesce(p_country,'')); l text:=lower(coalesce(p_league,''));
begin
  if l='' then return null; end if;
  if c='england' then if l like '%premier league%' then return 1; elsif l like '%championship%' then return 2; elsif l like '%league one%' then return 3; elsif l like '%league two%' then return 4; end if;
  elsif c='netherlands' then if l like '%eredivisie%' then return 1; elsif l like '%eerste divisie%' then return 2; elsif l like '%tweede divisie%' then return 3; end if;
  elsif c='belgium' then if l like '%challenger%' then return 2; elsif l like '%pro league%' then return 1; end if;
  elsif c='portugal' then if l like '%primeira%' or l like '%liga portugal betclic%' then return 1; elsif l like '%liga portugal 2%' or l like '%segunda liga%' then return 2; elsif l like '%liga 3%' then return 3; end if;
  elsif c='sweden' then if l like '%allsvenskan%' then return 1; elsif l like '%superettan%' then return 2; elsif l like '%ettan%' then return 3; end if;
  elsif c='finland' then if l like '%veikkausliiga%' then return 1; elsif l like '%ykkosliiga%' or l like '%ykkösliiga%' then return 2; elsif l like '%ykkonen%' or l like '%ykkönen%' then return 3; elsif l like '%kakkonen%' then return 4; end if;
  elsif c='norway' then if l like '%eliteserien%' then return 1; elsif l like '%obos%' or l like '%1. divisjon%' or l like '%1 division%' then return 2; elsif l like '%2. divisjon%' or l like '%2 division%' then return 3; end if;
  elsif c='denmark' then if l like '%superliga%' then return 1; elsif l like '%1st division%' or l like '%1. division%' then return 2; elsif l like '%2nd division%' or l like '%2. division%' then return 3; end if;
  elsif c='poland' then if l like '%ekstraklasa%' then return 1; elsif l like '%i liga%' or l like '%1 liga%' then return 2; elsif l like '%ii liga%' or l like '%2 liga%' then return 3; end if;
  elsif c in ('czechia','czech republic') then if l like '%first league%' or l like '%1. liga%' or l like '%chance liga%' then return 1; elsif l like '%national football league%' or l like '%2. liga%' then return 2; end if;
  elsif c='austria' then if l like '%bundesliga%' then return 1; elsif l like '%2. liga%' or l like '%zweite liga%' then return 2; end if;
  elsif c='switzerland' then if l like '%super league%' then return 1; elsif l like '%challenge league%' then return 2; end if;
  elsif c='scotland' then if l like '%premiership%' then return 1; elsif l like '%championship%' then return 2; elsif l like '%league one%' then return 3; end if;
  elsif c in ('ireland','republic of ireland') then if l like '%premier division%' then return 1; elsif l like '%first division%' then return 2; end if;
  elsif c='slovakia' then if l like '%nike liga%' or l like '%niké liga%' or l like '%fortuna liga%' then return 1; elsif l like '%2. liga%' then return 2; end if;
  elsif c='australia' then if l like '%a-league%' or l like '%a league%' then return 1; end if;
  elsif c='thailand' then if l like '%thai league 2%' then return 2; elsif l like '%thai league 3%' then return 3; elsif l like '%thai league 1%' or l like '%thai league%' then return 1; end if;
  elsif c='malaysia' then if l like '%super league%' then return 1; end if;
  elsif c='indonesia' then if l like '%liga 2%' then return 2; elsif l like '%liga 1%' or l like '%super league%' then return 1; end if;
  elsif c='singapore' then if l like '%premier league%' then return 1; end if;
  elsif c='new zealand' then if l like '%national league%' then return 1; elsif l like '%northern league%' or l like '%central league%' or l like '%southern league%' then return 2; end if;
  end if;
  return null;
end; $$;

create or replace function djm_os.global_competition_level_score(p_country text,p_league text,p_level_tier integer default null)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_base numeric; v_tier integer:=coalesce(p_level_tier,djm_os.infer_global_league_tier(p_country,p_league),1); v_penalty numeric;
begin
  v_base:=djm_os.global_country_top_league_score(p_country); if v_base is null then return null; end if;
  v_penalty:=case v_tier when 1 then 0 when 2 then 8 when 3 then 15 when 4 then 22 else 28 end;
  return round(greatest(15,least(100,v_base-v_penalty)),2);
end; $$;

grant execute on function djm_os.global_country_top_league_score(text) to service_role;
grant execute on function djm_os.global_competition_level_score(text,text,integer) to service_role;

insert into djm_os.global_league_strength_sources(country,confederation,source,raw_value,raw_rank,observed_on,reliability,source_url,source_note) values
('England','UEFA','iffhs_2025',2359,1,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Spain','UEFA','iffhs_2025',2073,2,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Brazil','CONMEBOL','iffhs_2025',1999,3,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Italy','UEFA','iffhs_2025',1972,4,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Germany','UEFA','iffhs_2025',1880,5,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('France','UEFA','iffhs_2025',1502,6,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Portugal','UEFA','iffhs_2025',1145,7,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Argentina','CONMEBOL','iffhs_2025',1089,8,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Netherlands','UEFA','iffhs_2025',1067,9,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Colombia','CONMEBOL','iffhs_2025',1025.5,10,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Turkey','UEFA','iffhs_2025',980,11,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Belgium','UEFA','iffhs_2025',957.5,12,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Saudi Arabia','AFC','iffhs_2025',868.75,13,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Greece','UEFA','iffhs_2025',748.25,15,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Czechia','UEFA','iffhs_2025',716,17,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Poland','UEFA','iffhs_2025',644.5,23,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Scotland','UEFA','iffhs_2025',630.5,24,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Denmark','UEFA','iffhs_2025',576.25,25,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Switzerland','UEFA','iffhs_2025',502.5,29,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Norway','UEFA','iffhs_2025',499.75,30,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Austria','UEFA','iffhs_2025',468.75,35,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('United States','CONCACAF','iffhs_2025',426.75,40,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Slovenia','UEFA','iffhs_2025',394,44,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Thailand','AFC','iffhs_2025',361.5,47,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Republic of Ireland','UEFA','iffhs_2025',340,50,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Sweden','UEFA','iffhs_2025',287,59,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Finland','UEFA','iffhs_2025',241.5,66,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Australia','AFC','iffhs_2025',211.25,73,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Malaysia','AFC','iffhs_2025',191.75,82,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Indonesia','AFC','iffhs_2025',190.25,84,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Slovakia','UEFA','iffhs_2025',178,89,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025'),('Singapore','AFC','iffhs_2025',165.75,97,'2025-12-31',0.82,'https://iffhs.com/en/news/iffhs-awards-2025-the-strongest-league-of-the-world-4862','IFFHS 2025') on conflict(country,source,observed_on) do update set raw_value=excluded.raw_value,raw_rank=excluded.raw_rank,updated_at=now();

insert into djm_os.global_league_strength_sources(country,confederation,source,raw_value,raw_rank,observed_on,reliability,source_url,source_note) values
('England','UEFA','uefa_live_2026_08_31',102.019,1,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA five-season association coefficient'),('Portugal','UEFA','uefa_live_2026_08_31',64.550,6,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Belgium','UEFA','uefa_live_2026_08_31',59.050,7,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Netherlands','UEFA','uefa_live_2026_08_31',52.395,8,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Poland','UEFA','uefa_live_2026_08_31',45.125,10,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Czechia','UEFA','uefa_live_2026_08_31',44.725,11,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Norway','UEFA','uefa_live_2026_08_31',38.612,13,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Denmark','UEFA','uefa_live_2026_08_31',38.306,14,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Switzerland','UEFA','uefa_live_2026_08_31',30.200,16,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Austria','UEFA','uefa_live_2026_08_31',27.650,17,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Scotland','UEFA','uefa_live_2026_08_31',26.250,19,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Sweden','UEFA','uefa_live_2026_08_31',25.750,20,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Slovakia','UEFA','uefa_live_2026_08_31',22.375,27,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Republic of Ireland','UEFA','uefa_live_2026_08_31',16.343,32,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Finland','UEFA','uefa_live_2026_08_31',13.625,37,'2026-08-31',0.95,'https://www.uefa.com/nationalassociations/uefarankings/','UEFA coefficient'),('Thailand','AFC','afc_2025_26',58.721,7,'2026-02-23',0.93,'https://www.the-afc.com/en/more/content/afc-mens-club-competition-ranking-202526','AFC ranking'),('Australia','AFC','afc_2025_26',46.678,9,'2026-02-23',0.93,'https://www.the-afc.com/en/more/content/afc-mens-club-competition-ranking-202526','AFC ranking'),('Malaysia','AFC','afc_2025_26',41.434,11,'2026-02-23',0.93,'https://www.the-afc.com/en/more/content/afc-mens-club-competition-ranking-202526','AFC ranking'),('Singapore','AFC','afc_2025_26',38.061,14,'2026-02-23',0.93,'https://www.the-afc.com/en/more/content/afc-mens-club-competition-ranking-202526','AFC ranking'),('Indonesia','AFC','afc_2025_26',26.299,18,'2026-02-23',0.93,'https://www.the-afc.com/en/more/content/afc-mens-club-competition-ranking-202526','AFC ranking') on conflict(country,source,observed_on) do update set raw_value=excluded.raw_value,raw_rank=excluded.raw_rank,updated_at=now();