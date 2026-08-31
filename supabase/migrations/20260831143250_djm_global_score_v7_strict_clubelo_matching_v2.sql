create or replace function djm_os.clubelo_country_code(p_country text)
returns text
language sql
immutable
set search_path=''
as $$
select case lower(trim(coalesce(p_country,'')))
  when 'england' then 'ENG' when 'eng' then 'ENG'
  when 'scotland' then 'SCO' when 'sco' then 'SCO'
  when 'wales' then 'WAL' when 'wal' then 'WAL'
  when 'northern ireland' then 'NIR' when 'nir' then 'NIR'
  when 'ireland' then 'IRL' when 'republic of ireland' then 'IRL' when 'irl' then 'IRL'
  when 'finland' then 'FIN' when 'fin' then 'FIN'
  when 'sweden' then 'SWE' when 'swe' then 'SWE'
  when 'norway' then 'NOR' when 'nor' then 'NOR'
  when 'denmark' then 'DEN' when 'den' then 'DEN'
  when 'iceland' then 'ISL' when 'isl' then 'ISL'
  when 'germany' then 'GER' when 'ger' then 'GER'
  when 'netherlands' then 'NED' when 'holland' then 'NED' when 'ned' then 'NED'
  when 'belgium' then 'BEL' when 'bel' then 'BEL'
  when 'france' then 'FRA' when 'fra' then 'FRA'
  when 'spain' then 'ESP' when 'esp' then 'ESP'
  when 'portugal' then 'POR' when 'por' then 'POR'
  when 'italy' then 'ITA' when 'ita' then 'ITA'
  when 'austria' then 'AUT' when 'aut' then 'AUT'
  when 'switzerland' then 'SUI' when 'sui' then 'SUI'
  when 'poland' then 'POL' when 'pol' then 'POL'
  when 'czechia' then 'CZE' when 'czech republic' then 'CZE' when 'cze' then 'CZE'
  when 'slovakia' then 'SLK' when 'svk' then 'SLK' when 'slk' then 'SLK'
  when 'slovenia' then 'SVN' when 'svn' then 'SVN'
  when 'croatia' then 'CRO' when 'cro' then 'CRO'
  when 'serbia' then 'SRB' when 'srb' then 'SRB'
  when 'romania' then 'ROM' when 'rou' then 'ROM' when 'rom' then 'ROM'
  when 'hungary' then 'HUN' when 'hun' then 'HUN'
  when 'greece' then 'GRE' when 'grc' then 'GRE' when 'gre' then 'GRE'
  when 'turkey' then 'TUR' when 'türkiye' then 'TUR' when 'tur' then 'TUR'
  when 'cyprus' then 'CYP' when 'cyp' then 'CYP'
  when 'bulgaria' then 'BUL' when 'bul' then 'BUL'
  when 'ukraine' then 'UKR' when 'ukr' then 'UKR'
  when 'russia' then 'RUS' when 'rus' then 'RUS'
  when 'israel' then 'ISR' when 'isr' then 'ISR'
  when 'estonia' then 'EST' when 'est' then 'EST'
  when 'latvia' then 'LAT' when 'lva' then 'LAT' when 'lat' then 'LAT'
  when 'lithuania' then 'LIT' when 'ltu' then 'LIT' when 'lit' then 'LIT'
  when 'georgia' then 'GEO' when 'geo' then 'GEO'
  when 'armenia' then 'ARM' when 'arm' then 'ARM'
  when 'azerbaijan' then 'AZE' when 'aze' then 'AZE'
  when 'kazakhstan' then 'KAZ' when 'kaz' then 'KAZ'
  when 'albania' then 'ALB' when 'alb' then 'ALB'
  when 'bosnia and herzegovina' then 'BHZ' when 'bosnia-herzegovina' then 'BHZ' when 'bih' then 'BHZ'
  when 'montenegro' then 'MNT' when 'mne' then 'MNT'
  when 'north macedonia' then 'MAC' when 'macedonia' then 'MAC' when 'mkd' then 'MAC'
  when 'moldova' then 'MOL' when 'mda' then 'MOL'
  when 'luxembourg' then 'LUX' when 'lux' then 'LUX'
  when 'malta' then 'MLT' when 'mlt' then 'MLT'
  else null end;
$$;

create or replace function djm_os.is_secondary_team_name(p_name text)
returns boolean
language sql
immutable
set search_path=''
as $$
select lower(coalesce(p_name,'')) ~ '(^|[^a-z0-9])(reserve|reserves|academy|u18|u19|u20|u21|u22|u23|under 18|under 19|under 20|under 21|under 23)([^a-z0-9]|$)';
$$;

create or replace function djm_os.clubelo_team_context(p_club text,p_country text,p_level_tier integer default null)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_key text:=djm_os.normalise_team_key(p_club);
  v_cc text:=djm_os.clubelo_country_code(p_country);
  v_date date;
  t djm_os.football_team_strength_snapshots%rowtype;
  v_avg numeric;
  v_score numeric;
  v_quality numeric:=0;
  v_age integer;
  v_best_id uuid;
  v_best_sim numeric:=0;
  v_second_sim numeric:=0;
  v_match_method text:='exact';
begin
  if v_key is null then return jsonb_build_object('score',null,'quality',0,'reason','club_unknown'); end if;
  if v_cc is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_country_not_covered'); end if;
  select max(snapshot_date) into v_date from djm_os.football_team_strength_snapshots where provider='clubelo' and country_code=v_cc;
  if v_date is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_country_snapshot_missing'); end if;

  select * into t
  from djm_os.football_team_strength_snapshots x
  where x.provider='clubelo' and x.snapshot_date=v_date and x.country_code=v_cc
    and x.team_key=v_key and (p_level_tier is null or x.level_tier=p_level_tier)
  order by x.elo desc limit 1;

  if not found then
    if djm_os.is_secondary_team_name(p_club) then
      return jsonb_build_object('score',null,'quality',0,'reason','secondary_team_requires_exact_match');
    end if;

    select x.id,extensions.similarity(x.team_key,v_key)
    into v_best_id,v_best_sim
    from djm_os.football_team_strength_snapshots x
    where x.provider='clubelo' and x.snapshot_date=v_date and x.country_code=v_cc
      and (p_level_tier is null or x.level_tier=p_level_tier)
    order by extensions.similarity(x.team_key,v_key) desc,x.elo desc
    limit 1;

    select coalesce(extensions.similarity(x.team_key,v_key),0)
    into v_second_sim
    from djm_os.football_team_strength_snapshots x
    where x.provider='clubelo' and x.snapshot_date=v_date and x.country_code=v_cc
      and (p_level_tier is null or x.level_tier=p_level_tier)
      and x.id is distinct from v_best_id
    order by extensions.similarity(x.team_key,v_key) desc,x.elo desc
    limit 1;
    v_second_sim:=coalesce(v_second_sim,0);

    if v_best_id is null or coalesce(v_best_sim,0)<.78 or (v_second_sim>=.70 and v_best_sim-v_second_sim<.08) then
      return jsonb_build_object('score',null,'quality',0,'reason','clubelo_ambiguous_or_weak_match','best_similarity',round(coalesce(v_best_sim,0),3),'second_similarity',round(v_second_sim,3));
    end if;
    select * into t from djm_os.football_team_strength_snapshots where id=v_best_id;
    v_match_method:='strict_fuzzy';
  else
    v_best_sim:=1;
  end if;

  select avg(x.elo) into v_avg
  from djm_os.football_team_strength_snapshots x
  where x.provider='clubelo' and x.snapshot_date=t.snapshot_date and x.country_code=t.country_code
    and x.level_tier=t.level_tier and x.elo is not null;
  if v_avg is null then return jsonb_build_object('score',null,'quality',0,'reason','league_average_unavailable'); end if;

  v_score:=greatest(20::numeric,least(80::numeric,50+(t.elo-v_avg)/5.0));
  v_age:=greatest(0,current_date-t.snapshot_date);
  v_quality:=case when v_age<=3 then .95 when v_age<=10 then .88 when v_age<=30 then .72 when v_age<=90 then .50 else .30 end;
  if v_match_method='strict_fuzzy' then v_quality:=v_quality*least(1,greatest(.75,v_best_sim)); end if;

  return jsonb_build_object(
    'score',round(v_score,2),'quality',round(v_quality,3),'club_elo',t.elo,
    'league_level_average_elo',round(v_avg,2),'elo_delta',round(t.elo-v_avg,2),
    'snapshot_date',t.snapshot_date,'provider','clubelo','source_url',t.source_url,
    'matched_team_name',t.team_name,'match_method',v_match_method,
    'match_similarity',round(coalesce(v_best_sim,1),3),'country_code',t.country_code,'level_tier',t.level_tier
  );
end;
$$;

create or replace function djm_os.subject_team_context(p_subject_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare s djm_os.football_intelligence_subjects%rowtype; c djm_os.competitions%rowtype; v_tier integer;
begin
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then return jsonb_build_object('score',null,'quality',0,'reason','subject_not_found'); end if;
  if s.current_competition_id is not null then select * into c from djm_os.competitions where id=s.current_competition_id; end if;
  v_tier:=coalesce(c.level_tier,djm_os.infer_global_league_tier(coalesce(s.current_country,c.country),coalesce(s.current_league,c.display_name)));
  return djm_os.clubelo_team_context(s.current_club,coalesce(s.current_country,c.country),v_tier);
end;
$$;