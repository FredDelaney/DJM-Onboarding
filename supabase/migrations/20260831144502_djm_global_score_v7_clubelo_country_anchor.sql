create or replace function djm_os.clubelo_country_strength_context(p_country text)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_cc text:=djm_os.clubelo_country_code(p_country);
  v_date date;
  v_avg numeric;
  v_n integer:=0;
  v_pr numeric;
  v_score numeric;
  v_quality numeric:=0;
  v_age integer;
begin
  if v_cc is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_country_not_covered'); end if;
  select max(snapshot_date) into v_date from djm_os.football_team_strength_snapshots where provider='clubelo' and country_code=v_cc;
  if v_date is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_snapshot_missing'); end if;
  with ranked as (
    select country_code,elo,row_number() over(partition by country_code order by elo desc) rn
    from djm_os.football_team_strength_snapshots
    where provider='clubelo' and snapshot_date=v_date and elo is not null
  ), avgs as (
    select country_code,count(*) filter(where rn<=6) n,avg(elo) filter(where rn<=6) avg_top
    from ranked group by country_code having count(*) filter(where rn<=6)>=4
  ), scored as (
    select *,percent_rank() over(order by avg_top) pr from avgs
  )
  select avg_top,n,pr into v_avg,v_n,v_pr from scored where country_code=v_cc;
  if v_avg is null then return jsonb_build_object('score',null,'quality',0,'reason','insufficient_clubelo_country_depth'); end if;
  v_score:=25+75*v_pr;
  v_age:=greatest(0,current_date-v_date);
  v_quality:=least(.95,least(1,v_n/6.0)*case when v_age<=3 then .95 when v_age<=10 then .88 when v_age<=30 then .72 else .50 end);
  return jsonb_build_object('score',round(v_score,2),'quality',round(v_quality,3),'country_code',v_cc,'clubs_used',v_n,'top_club_average_elo',round(v_avg,2),'snapshot_date',v_date,'provider','clubelo');
end;
$$;

create or replace function djm_os.global_country_top_league_score(p_country text)
returns numeric
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_iffhs numeric; v_confed numeric; v_rank integer; v_iffhs_score numeric; v_confed_score numeric; v_rank_score numeric; v_has_uefa boolean:=false;
  v_club jsonb; v_club_score numeric; v_base numeric;
begin
  select s.raw_value into v_iffhs from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_2025' order by s.observed_on desc limit 1;
  select s.raw_value,(s.source='uefa_live_2026_08_31') into v_confed,v_has_uefa from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source in ('uefa_live_2026_08_31','afc_2025_26') order by s.observed_on desc limit 1;
  select s.raw_rank into v_rank from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_world_rank_2025_rank_only' order by s.observed_on desc limit 1;
  if v_iffhs is not null then v_iffhs_score:=greatest(25,least(100,25+75*(ln(greatest(v_iffhs,155.75)/155.75)/nullif(ln(2359.0/155.75),0)))); end if;
  if v_confed is not null then
    if v_has_uefa then v_confed_score:=greatest(35,least(100,35+65*(ln(greatest(v_confed,5)/5.0)/nullif(ln(102.019/5.0),0))));
    else v_confed_score:=greatest(25,least(85,25+60*(ln(greatest(v_confed,0.5)/0.5)/nullif(ln(122.195/0.5),0)))); end if;
  end if;
  if v_rank is not null then v_rank_score:=greatest(18,least(25,25-.35*greatest(0,v_rank-100))); end if;
  if v_iffhs_score is not null and v_confed_score is not null then v_base:=v_iffhs_score*.70+v_confed_score*.30; else v_base:=coalesce(v_iffhs_score,v_confed_score,v_rank_score); end if;
  v_club:=djm_os.clubelo_country_strength_context(p_country); v_club_score:=djm_os.safe_json_number(v_club->>'score');
  if v_base is not null and v_club_score is not null then return round(v_base*.80+v_club_score*.20,2); end if;
  return round(coalesce(v_base,v_club_score),2);
end;
$$;

create or replace function djm_os.global_country_strength_quality(p_country text)
returns numeric
language plpgsql
stable security definer
set search_path=''
as $$
declare v_iffhs boolean; v_confed boolean; v_rank boolean; v_club jsonb; v_club_q numeric:=0;
begin
  select exists(select 1 from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_2025') into v_iffhs;
  select exists(select 1 from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source in ('uefa_live_2026_08_31','afc_2025_26')) into v_confed;
  select exists(select 1 from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_world_rank_2025_rank_only') into v_rank;
  v_club:=djm_os.clubelo_country_strength_context(p_country); v_club_q:=coalesce(djm_os.safe_json_number(v_club->>'quality'),0);
  if v_iffhs and v_confed and v_club_q>=.6 then return .96;
  elsif v_iffhs and v_confed then return .92;
  elsif (v_iffhs or v_confed) and v_club_q>=.6 then return .90;
  elsif v_confed then return .88;
  elsif v_iffhs then return .82;
  elsif v_club_q>=.6 then return .78;
  elsif v_rank then return .65;
  else return 0; end if;
end;
$$;