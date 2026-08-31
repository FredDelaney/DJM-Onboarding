create or replace function djm_os.position_metric_weights(p_role text)
returns table(metric_key text, nominal_weight numeric, higher_is_better boolean)
language sql
immutable
set search_path=''
as $$
select w.metric_key,w.nominal_weight,w.higher_is_better from (
  values
    ('attacker','goals90',24::numeric,true),('attacker','xg90',14::numeric,true),('attacker','assists90',10::numeric,true),('attacker','xa90',10::numeric,true),('attacker','keyPasses90',8::numeric,true),('attacker','progressiveCarries90',8::numeric,true),('attacker','rating',10::numeric,true),('attacker','sprints90',6::numeric,true),('attacker','topSpeedMax',4::numeric,true),('attacker','passAccuracy',3::numeric,true),('attacker','aerialWinRate',3::numeric,true),
    ('midfielder','rating',12::numeric,true),('midfielder','assists90',10::numeric,true),('midfielder','xa90',10::numeric,true),('midfielder','keyPasses90',14::numeric,true),('midfielder','progressivePasses90',16::numeric,true),('midfielder','progressiveCarries90',10::numeric,true),('midfielder','passes90',8::numeric,true),('midfielder','passAccuracy',8::numeric,true),('midfielder','tackles90',5::numeric,true),('midfielder','interceptions90',5::numeric,true),('midfielder','goals90',2::numeric,true),
    ('defender','rating',12::numeric,true),('defender','interceptions90',18::numeric,true),('defender','tackles90',16::numeric,true),('defender','aerialWinRate',15::numeric,true),('defender','progressivePasses90',12::numeric,true),('defender','passes90',8::numeric,true),('defender','passAccuracy',8::numeric,true),('defender','progressiveCarries90',4::numeric,true),('defender','assists90',3::numeric,true),('defender','goals90',2::numeric,true),('defender','topSpeedMax',2::numeric,true),
    ('goalkeeper','savePercentage',24::numeric,true),('goalkeeper','goalsPrevented90',18::numeric,true),('goalkeeper','rating',18::numeric,true),('goalkeeper','cleanSheetRate',10::numeric,true),('goalkeeper','goalsConceded90',10::numeric,false),('goalkeeper','passAccuracy',8::numeric,true),('goalkeeper','passes90',5::numeric,true),('goalkeeper','longPassAccuracy',7::numeric,true)
) as w(role_name,metric_key,nominal_weight,higher_is_better)
where w.role_name=lower(coalesce(p_role,''));
$$;

create or replace function djm_os.peer_metric_percentile(
  p_provider text,p_competition text,p_season text,p_role text,p_metric text,p_value numeric,p_higher_is_better boolean default true
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_n integer:=0; v_below integer:=0; v_equal integer:=0; v_pct numeric;
begin
  if p_value is null or p_metric is null then return jsonb_build_object('percentile',null,'n',0); end if;
  select
    count(*) filter(where djm_os.safe_json_number(p.metrics->>p_metric) is not null),
    count(*) filter(where djm_os.safe_json_number(p.metrics->>p_metric) is not null and ((p_higher_is_better and djm_os.safe_json_number(p.metrics->>p_metric)<p_value) or (not p_higher_is_better and djm_os.safe_json_number(p.metrics->>p_metric)>p_value))),
    count(*) filter(where djm_os.safe_json_number(p.metrics->>p_metric)=p_value)
  into v_n,v_below,v_equal
  from djm_os.provider_peer_stat_snapshots p
  where p.provider=p_provider and p.provider_competition_id=p_competition and p.provider_season_id=p_season
    and coalesce(p.provider_position,'unknown')=p_role and coalesce(p.minutes,0)>=180;
  if v_n<6 then return jsonb_build_object('percentile',null,'n',v_n); end if;
  v_pct:=100.0*(v_below+.5*v_equal)/v_n;
  return jsonb_build_object('percentile',round(v_pct,2),'n',v_n);
end;
$$;

create or replace function djm_os.subject_position_production(p_subject_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  snap djm_os.football_subject_provider_snapshots%rowtype;
  v_metrics jsonb:='{}'::jsonb;
  v_role text;
  v_minutes numeric:=0;
  v_used_weight numeric:=0;
  v_total numeric:=0;
  v_value numeric;
  v_pct jsonb;
  v_pct_value numeric;
  v_n integer:=0;
  v_max_n integer:=0;
  v_depth_q numeric:=.55;
  v_quality numeric:=0;
  v_score numeric;
  v_details jsonb:='{}'::jsonb;
  m record;
begin
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then return jsonb_build_object('score',null,'quality',0,'reason','subject_not_found'); end if;
  select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id
  order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,
           x.observed_at desc nulls last,x.updated_at desc limit 1;
  if not found or nullif(snap.provider_competition_id,'') is null or nullif(snap.provider_season_id,'') is null then
    return jsonb_build_object('score',null,'quality',0,'reason','provider_cohort_unavailable');
  end if;
  v_metrics:=coalesce(snap.metrics->'current_window',snap.metrics->'current_season',snap.metrics,'{}'::jsonb);
  v_role:=coalesce(nullif(v_metrics->>'role',''),djm_os.global_broad_role(s.primary_position),snap.metrics->>'role');
  if v_role is null then return jsonb_build_object('score',null,'quality',0,'reason','role_unknown'); end if;
  v_minutes:=coalesce(djm_os.safe_json_number(v_metrics->>'minutes'),0);
  v_depth_q:=case lower(coalesce(snap.data_depth,'')) when 'advanced' then 1 when 'deep' then 1 when 'standard' then .85 when 'basic_official' then .70 when 'basic' then .60 else .55 end;

  for m in select * from djm_os.position_metric_weights(v_role) loop
    v_value:=djm_os.safe_json_number(v_metrics->>m.metric_key);
    if v_value is null then continue; end if;
    v_pct:=djm_os.peer_metric_percentile(snap.provider,snap.provider_competition_id,snap.provider_season_id,v_role,m.metric_key,v_value,m.higher_is_better);
    v_pct_value:=djm_os.safe_json_number(v_pct->>'percentile');
    v_n:=coalesce((v_pct->>'n')::integer,0);
    v_max_n:=greatest(v_max_n,v_n);
    if v_pct_value is null then continue; end if;
    v_total:=v_total+v_pct_value*m.nominal_weight;
    v_used_weight:=v_used_weight+m.nominal_weight;
    v_details:=v_details||jsonb_build_object(m.metric_key,jsonb_build_object('value',v_value,'percentile',round(v_pct_value,2),'weight',m.nominal_weight,'peer_n',v_n));
  end loop;

  if v_used_weight<25 then
    return jsonb_build_object('score',null,'quality',0,'reason','insufficient_position_metric_coverage','role',v_role,'metric_coverage_pct',round(v_used_weight,1),'metrics',v_details,'cohort_size',v_max_n);
  end if;
  v_score:=v_total/v_used_weight;
  v_quality:=least(1,v_used_weight/100.0)*least(1,v_max_n/35.0)*least(1,v_minutes/900.0)*v_depth_q;
  return jsonb_build_object(
    'score',round(v_score,2),'quality',round(v_quality,3),'role',v_role,
    'metric_coverage_pct',round(v_used_weight,1),'minutes',v_minutes,'cohort_size',v_max_n,
    'data_depth',snap.data_depth,'provider',snap.provider,'metrics',v_details,
    'rule','Only position-relevant metrics that exist for both the player and a real same-role cohort are used. Missing metrics are omitted, never zero-imputed.'
  );
end;
$$;