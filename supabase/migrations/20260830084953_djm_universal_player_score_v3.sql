begin;

alter table djm_os.player_scorecards
  add column if not exists provisional_score smallint
    check (provisional_score is null or provisional_score between 0 and 100),
  add column if not exists provisional_confidence smallint
    check (provisional_confidence is null or provisional_confidence between 0 and 100),
  add column if not exists score_tier text not null default 'unavailable'
    check (score_tier in ('full','provisional','manual_override','unavailable')),
  add column if not exists missing_inputs jsonb not null default '[]'::jsonb;

create table if not exists private.djm_competition_tier_aliases (
  country_key text not null,
  league_key text not null,
  country_name text not null,
  canonical_name text not null,
  tier smallint not null check (tier between 1 and 5),
  created_at timestamptz not null default now(),
  primary key(country_key, league_key)
);

revoke all on private.djm_competition_tier_aliases from public, anon, authenticated;
grant select on private.djm_competition_tier_aliases to service_role;

insert into private.djm_competition_tier_aliases
  (country_key, league_key, country_name, canonical_name, tier)
values
  ('england','premier league','England','Premier League',1),
  ('england','championship','England','Championship',2),
  ('england','league one','England','League One',3),
  ('england','league two','England','League Two',4),
  ('england','national league','England','National League',5),
  ('italy','serie a','Italy','Serie A',1),
  ('italy','serie b','Italy','Serie B',2),
  ('italy','serie c','Italy','Serie C',3),
  ('spain','la liga','Spain','La Liga',1),
  ('spain','segunda division','Spain','Segunda Division',2),
  ('spain','primera federacion','Spain','Primera Federacion',3),
  ('spain','segunda federacion','Spain','Segunda Federacion',4),
  ('germany','bundesliga','Germany','Bundesliga',1),
  ('germany','2 bundesliga','Germany','2. Bundesliga',2),
  ('germany','3 liga','Germany','3. Liga',3),
  ('france','ligue 1','France','Ligue 1',1),
  ('france','ligue 2','France','Ligue 2',2),
  ('france','national','France','National',3),
  ('france','national 1','France','National',3),
  ('portugal','primeira liga','Portugal','Primeira Liga',1),
  ('portugal','liga portugal 2','Portugal','Liga Portugal 2',2),
  ('portugal','segunda liga','Portugal','Liga Portugal 2',2),
  ('portugal','liga 3','Portugal','Liga 3',3),
  ('netherlands','eredivisie','Netherlands','Eredivisie',1),
  ('netherlands','eerste divisie','Netherlands','Eerste Divisie',2),
  ('netherlands','tweede divisie','Netherlands','Tweede Divisie',3),
  ('belgium','jupiler pro league','Belgium','Jupiler Pro League',1),
  ('belgium','pro league','Belgium','Jupiler Pro League',1),
  ('scotland','premiership','Scotland','Premiership',1),
  ('scotland','championship','Scotland','Championship',2),
  ('scotland','league one','Scotland','League One',3),
  ('scotland','league two','Scotland','League Two',4),
  ('denmark','superliga','Denmark','Superliga',1),
  ('denmark','1st division','Denmark','1st Division',2),
  ('denmark','1 division','Denmark','1st Division',2),
  ('denmark','2nd division','Denmark','2nd Division',3),
  ('denmark','2 division','Denmark','2nd Division',3),
  ('norway','eliteserien','Norway','Eliteserien',1),
  ('norway','1 division','Norway','1. Division',2),
  ('norway','2 division','Norway','2. Division',3),
  ('sweden','allsvenskan','Sweden','Allsvenskan',1),
  ('sweden','superettan','Sweden','Superettan',2),
  ('sweden','ettan','Sweden','Ettan',3),
  ('sweden','ettan norra','Sweden','Ettan',3),
  ('sweden','ettan sodra','Sweden','Ettan',3),
  ('sweden','ettan södra','Sweden','Ettan',3),
  ('finland','veikkausliiga','Finland','Veikkausliiga',1),
  ('finland','ykkosliiga','Finland','Ykkosliiga',2),
  ('finland','ykkösliiga','Finland','Ykkosliiga',2),
  ('finland','ykkonen','Finland','Ykkonen',3),
  ('finland','ykkönen','Finland','Ykkonen',3),
  ('finland','kakkonen','Finland','Kakkonen',4),
  ('austria','bundesliga','Austria','Bundesliga',1),
  ('switzerland','super league','Switzerland','Super League',1),
  ('croatia','hnl','Croatia','HNL',1),
  ('croatia','1 hnl','Croatia','HNL',1),
  ('serbia','super liga','Serbia','Super Liga',1),
  ('romania','liga 1','Romania','Liga 1',1),
  ('romania','liga i','Romania','Liga 1',1),
  ('israel','premier league','Israel','Premier League',1),
  ('israel','ligat ha al','Israel','Premier League',1),
  ('israel','liga leumit','Israel','Liga Leumit',2),
  ('japan','j1 league','Japan','J1 League',1),
  ('japan','j2 league','Japan','J2 League',2),
  ('japan','j3 league','Japan','J3 League',3),
  ('south korea','k league 1','South Korea','K League 1',1),
  ('south korea','k league 2','South Korea','K League 2',2),
  ('australia','a league','Australia','A-League',1),
  ('australia','a league men','Australia','A-League',1),
  ('new zealand','national league','New Zealand','National League',1),
  ('new zealand','premiership','New Zealand','National League',1),
  ('new zealand','northern league','New Zealand','Northern League',2),
  ('new zealand','central league','New Zealand','Central League',2),
  ('new zealand','southern league','New Zealand','Southern League',2),
  ('thailand','thai league 1','Thailand','Thai League 1',1),
  ('thailand','thai league 2','Thailand','Thai League 2',2),
  ('thailand','thai league 3','Thailand','Thai League 3',3),
  ('indonesia','liga 1','Indonesia','Liga 1',1),
  ('indonesia','liga 2','Indonesia','Liga 2',2),
  ('indonesia','liga nusantara','Indonesia','Liga Nusantara',3),
  ('malaysia','super league','Malaysia','Super League',1),
  ('singapore','premier league','Singapore','Premier League',1),
  ('china','super league','China','Super League',1),
  ('china','league one','China','League One',2),
  ('china','league two','China','League Two',3),
  ('united states','major league soccer','United States','Major League Soccer',1),
  ('united states','mls','United States','Major League Soccer',1),
  ('united states','usl championship','United States','USL Championship',2),
  ('united states','usl league one','United States','USL League One',3),
  ('south africa','premiership','South Africa','Premiership',1),
  ('south africa','premier soccer league','South Africa','Premiership',1),
  ('south africa','first division','South Africa','First Division',2),
  ('south africa','1st division','South Africa','First Division',2),
  ('brazil','serie a','Brazil','Serie A',1),
  ('brazil','serie b','Brazil','Serie B',2),
  ('brazil','serie c','Brazil','Serie C',3),
  ('brazil','serie d','Brazil','Serie D',4),
  ('argentina','liga profesional argentina','Argentina','Liga Profesional Argentina',1),
  ('argentina','primera division','Argentina','Liga Profesional Argentina',1),
  ('argentina','primera nacional','Argentina','Primera Nacional',2),
  ('mexico','liga mx','Mexico','Liga MX',1),
  ('mexico','liga de expansion mx','Mexico','Liga de Expansion MX',2),
  ('mexico','liga de expansion','Mexico','Liga de Expansion MX',2)
on conflict(country_key,league_key) do update set
  country_name=excluded.country_name,
  canonical_name=excluded.canonical_name,
  tier=excluded.tier;

create or replace function private.djm_autoresolve_player_benchmark(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.players%rowtype;
  m private.djm_competition_tier_aliases%rowtype;
  a djm_os.country_league_strength_anchors%rowtype;
  c djm_os.competitions%rowtype;
  v_penalty integer;
  v_strength integer;
  v_key text;
  v_benchmark_key text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into p
  from public.players
  where id=p_player_id;

  if not found then
    return jsonb_build_object('resolved',false,'reason','player_not_found');
  end if;

  if p.current_league is null or p.current_country is null then
    return jsonb_build_object('resolved',false,'reason','league_or_country_missing');
  end if;

  select * into m
  from private.djm_competition_tier_aliases
  where country_key=lower(trim(p.current_country))
    and league_key=lower(trim(p.current_league))
  limit 1;

  if not found then
    return jsonb_build_object('resolved',false,'reason','tier_alias_missing');
  end if;

  select * into a
  from djm_os.country_league_strength_anchors
  where lower(country)=lower(m.country_name)
  limit 1;

  if not found then
    return jsonb_build_object('resolved',false,'reason','country_anchor_missing');
  end if;

  v_penalty := case m.tier
    when 1 then 0
    when 2 then 12
    when 3 then 20
    when 4 then 27
    when 5 then 33
    else null
  end;

  if v_penalty is null then
    return jsonb_build_object('resolved',false,'reason','tier_penalty_missing');
  end if;

  v_strength := greatest(10,a.strength_score-v_penalty);
  v_key := 'auto:'||md5(m.country_key||'|'||lower(m.canonical_name));

  select * into c
  from djm_os.competitions
  where canonical_key=v_key
  limit 1;

  if not found then
    insert into djm_os.competitions(
      canonical_key,display_name,country,level_tier,aliases,provider_ids,created_by,updated_by
    )
    values(
      v_key,m.canonical_name,m.country_name,m.tier,
      array[p.current_league,m.canonical_name],
      jsonb_build_object('autoresolved',true),
      auth.uid(),auth.uid()
    )
    returning * into c;
  else
    update djm_os.competitions
    set
      display_name=m.canonical_name,
      country=m.country_name,
      level_tier=m.tier,
      aliases=(
        select array_agg(distinct x)
        from unnest(coalesce(c.aliases,'{}'::text[])||array[p.current_league,m.canonical_name]) x
      ),
      updated_by=auth.uid(),
      updated_at=now()
    where id=c.id
    returning * into c;
  end if;

  update public.players
  set current_competition_id=c.id, updated_at=now()
  where id=p_player_id and current_competition_id is null;

  update public.career_entries
  set competition_id=c.id, updated_at=now()
  where player_id=p_player_id
    and lower(coalesce(league,''))=lower(p.current_league)
    and competition_id is null;

  v_benchmark_key := v_key||':iffhs_2025:t'||m.tier;

  insert into djm_os.league_benchmarks(
    canonical_key,league_name,country,strength_score,source_url,source_note,
    verified_at,updated_by,competition_id,review_cadence_days,
    raw_strength_value,raw_strength_scale,benchmark_provider,benchmark_metric,
    methodology,methodology_version,source_reference,observed_at,next_review_at
  )
  values(
    v_benchmark_key,
    m.canonical_name,
    m.country_name,
    v_strength,
    a.source_url,
    case
      when m.tier=1 then
        'IFFHS 2025 national top-division anchor, rank '||a.iffhs_rank||'.'
      else
        'Derived from IFFHS 2025 national top-division anchor with DJM tier-'||
        m.tier||' penalty of '||v_penalty||' points.'
    end,
    now(),
    auth.uid(),
    c.id,
    365,
    a.iffhs_points,
    'IFFHS 2025 national league points',
    case when m.tier=1 then 'iffhs_2025' else 'djm_iffhs_tier_decay_v1' end,
    'national_league_strength',
    case
      when m.tier=1 then a.methodology
      else a.methodology||' Lower division adjustment is model-derived and explicitly tier-based.'
    end,
    'djm_global_league_strength_v1',
    'IFFHS rank '||a.iffhs_rank||'; tier '||m.tier,
    a.observed_at,
    '2027-02-01T00:00:00Z'::timestamptz
  )
  on conflict(canonical_key) do update set
    league_name=excluded.league_name,
    country=excluded.country,
    strength_score=excluded.strength_score,
    source_url=excluded.source_url,
    source_note=excluded.source_note,
    verified_at=excluded.verified_at,
    updated_by=excluded.updated_by,
    competition_id=excluded.competition_id,
    raw_strength_value=excluded.raw_strength_value,
    benchmark_provider=excluded.benchmark_provider,
    methodology=excluded.methodology,
    source_reference=excluded.source_reference,
    observed_at=excluded.observed_at,
    next_review_at=excluded.next_review_at;

  return jsonb_build_object(
    'resolved',true,
    'competition_id',c.id,
    'competition_name',m.canonical_name,
    'tier',m.tier,
    'strength_score',v_strength,
    'source','IFFHS 2025'
  );
end;
$$;

revoke all on function private.djm_autoresolve_player_benchmark(uuid) from public, anon;
grant execute on function private.djm_autoresolve_player_benchmark(uuid) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.djm_player_scorecard_v2_core(uuid)') is null then
    alter function public.djm_player_scorecard(uuid)
      rename to djm_player_scorecard_v2_core;
  end if;
end
$$;

create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  r jsonb;
  s djm_os.player_scorecards%rowtype;
  b jsonb;
  v_status text;
  v_provisional numeric;
  v_level numeric;
  v_perf numeric;
  v_role numeric;
  v_exp numeric;
  v_trend numeric;
  v_avail numeric;
  v_conf integer;
  v_missing jsonb := '[]'::jsonb;
  v_tier text := 'unavailable';
begin
  r := public.djm_player_scorecard_v2_core(p_player_id);

  if coalesce(r->>'model_status',r->>'status')='benchmark_required' then
    perform private.djm_autoresolve_player_benchmark(p_player_id);
    r := public.djm_player_scorecard_v2_core(p_player_id);
  end if;

  select * into s
  from djm_os.player_scorecards
  where player_id=p_player_id;

  b := coalesce(s.basis,'{}'::jsonb);
  v_status := s.score_status;

  if s.manual_score is not null then
    v_tier := 'manual_override';
    update djm_os.player_scorecards
    set
      provisional_score=null,
      provisional_confidence=null,
      score_tier=v_tier,
      missing_inputs='[]'::jsonb,
      model_version='djm_player_score_v3_coverage_aware',
      updated_at=now()
    where player_id=p_player_id;

    return r || jsonb_build_object(
      'display_score',s.manual_score,
      'provisional_score',null,
      'provisional_confidence',null,
      'score_tier',v_tier,
      'model_version','djm_player_score_v3_coverage_aware'
    );
  end if;

  if s.model_score is not null and v_status='calculated' then
    v_tier := 'full';
    update djm_os.player_scorecards
    set
      provisional_score=null,
      provisional_confidence=null,
      score_tier=v_tier,
      missing_inputs='[]'::jsonb,
      model_version='djm_player_score_v3_coverage_aware',
      updated_at=now()
    where player_id=p_player_id;

    return r || jsonb_build_object(
      'display_score',s.model_score,
      'provisional_score',null,
      'provisional_confidence',null,
      'score_tier',v_tier,
      'model_version','djm_player_score_v3_coverage_aware'
    );
  end if;

  if v_status in ('performance_data_required','not_enough_model_coverage')
    and coalesce((b->>'recent_minutes_24m')::numeric,0) >= 500
    and nullif(b->>'level_score','') is not null
  then
    v_level := nullif(b->>'level_score','')::numeric;
    v_perf := nullif(b->>'performance_score','')::numeric;
    v_role := nullif(b->>'role_score','')::numeric;
    v_exp := nullif(b->>'experience_score','')::numeric;
    v_trend := nullif(b->>'trend_score','')::numeric;
    v_avail := nullif(b->>'availability_score','')::numeric;

    if v_perf is null then
      v_missing := v_missing || jsonb_build_array('position_adjusted_performance');
    end if;
    if v_role is null then
      v_missing := v_missing || jsonb_build_array('role_minutes');
    end if;
    if v_exp is null then
      v_missing := v_missing || jsonb_build_array('experience');
    end if;
    if v_trend is null then
      v_missing := v_missing || jsonb_build_array('trend');
    end if;
    if v_avail is null then
      v_missing := v_missing || jsonb_build_array('availability');
    end if;

    v_provisional := (
      coalesce(v_level,50)*30 +
      coalesce(v_perf,50)*30 +
      coalesce(v_role,50)*15 +
      coalesce(v_exp,50)*10 +
      coalesce(v_trend,50)*10 +
      coalesce(v_avail,50)*5
    ) / 100;

    v_conf := least(65,greatest(20,coalesce(s.confidence,0)));
    v_tier := 'provisional';

    b := b || jsonb_build_object(
      'score_tier','provisional',
      'provisional_score',round(v_provisional),
      'provisional_confidence',v_conf,
      'provisional_methodology',
        'Coverage-aware context rating. Missing components are neutral-imputed at 50 rather than fabricated. This is not a Full Player Score until position-adjusted performance evidence is available.',
      'provisional_missing_inputs',v_missing,
      'provisional_comparison_rule',
        'Compare provisional ratings only when the provisional label and confidence are visible. Full Scores remain the preferred cross-player measure.'
    );

    update djm_os.player_scorecards
    set
      provisional_score=round(v_provisional)::smallint,
      provisional_confidence=v_conf::smallint,
      score_tier=v_tier,
      missing_inputs=v_missing,
      basis=b,
      model_version='djm_player_score_v3_coverage_aware',
      updated_at=now()
    where player_id=p_player_id;

    insert into djm_os.events(
      event_type,actor_user_id,player_id,payload,source,confidence,occurred_at
    )
    values(
      'PLAYER_SCORE_PROVISIONAL_CALCULATED',
      auth.uid(),
      p_player_id,
      jsonb_build_object(
        'provisional_score',round(v_provisional),
        'underlying_status',v_status,
        'missing_inputs',v_missing
      ),
      'coverage_aware_model',
      v_conf::numeric/100,
      now()
    );

    return r || jsonb_build_object(
      'display_score',round(v_provisional),
      'provisional_score',round(v_provisional),
      'provisional_confidence',v_conf,
      'score_tier','provisional',
      'missing_inputs',v_missing,
      'model_version','djm_player_score_v3_coverage_aware',
      'basis',b
    );
  end if;

  update djm_os.player_scorecards
  set
    provisional_score=null,
    provisional_confidence=null,
    score_tier='unavailable',
    missing_inputs='[]'::jsonb,
    model_version='djm_player_score_v3_coverage_aware',
    updated_at=now()
  where player_id=p_player_id;

  return r || jsonb_build_object(
    'display_score',null,
    'provisional_score',null,
    'provisional_confidence',null,
    'score_tier','unavailable',
    'model_version','djm_player_score_v3_coverage_aware'
  );
end;
$$;

revoke all on function public.djm_player_scorecard(uuid) from public, anon;
grant execute on function public.djm_player_scorecard(uuid) to authenticated, service_role;

comment on column djm_os.player_scorecards.provisional_score is
  'Coverage-aware provisional context rating. It is never a substitute for a Full Player Score and must be displayed with its provisional label and confidence.';

comment on function public.djm_player_scorecard(uuid) is
  'DJM Player Score v3 wrapper: auto-resolves reviewed competition benchmarks, preserves the V2 full-score model, and adds a conservative provisional score when deep performance evidence is unavailable.';

notify pgrst,'reload schema';

commit;
