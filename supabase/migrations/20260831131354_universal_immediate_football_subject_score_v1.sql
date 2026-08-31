create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  ps djm_os.player_scorecards%rowtype;
  snap djm_os.football_subject_provider_snapshots%rowtype;
  v_signed_display smallint;
  v_signed_conf smallint;
  v_benchmark_score numeric;
  v_benchmark_provider text;
  v_benchmark_verified timestamptz;
  v_benchmark_stale timestamptz;
  v_level_quality numeric := 0;
  v_role_score numeric;
  v_role_quality numeric := 0;
  v_minutes numeric := 0;
  v_apps numeric := 0;
  v_starts numeric := 0;
  v_starts_known boolean := false;
  v_w_level numeric := 0;
  v_w_role numeric := 0;
  v_effective_weight numeric := 0;
  v_prior_score numeric := 50;
  v_prior_strength numeric := 45;
  v_weighted_total numeric := 0;
  v_score numeric := 50;
  v_info numeric := 0;
  v_quality numeric := 0;
  v_conf smallint := 2;
  v_coverage smallint := 0;
  v_grade text := 'initial_prior';
  v_position_group text;
  v_missing jsonb := '[]'::jsonb;
  v_band_half integer := 25;
  v_band_low integer;
  v_band_high integer;
  v_fingerprint text;
  v_basis jsonb;
  v_result jsonb;
begin
  select * into s
  from djm_os.football_intelligence_subjects
  where id = p_subject_id;

  if not found then
    raise exception 'Football intelligence subject not found';
  end if;

  -- Signed-player V5 remains canonical whenever it has an actual score.
  if s.player_id is not null then
    select * into ps
    from djm_os.player_scorecards
    where player_id = s.player_id;

    if found then
      v_signed_display := coalesce(ps.manual_score, ps.model_score, ps.provisional_score);
      if v_signed_display is not null then
        insert into djm_os.football_subject_scorecards(
          subject_id,display_score,model_score,provisional_score,potential_score,
          score_tier,confidence,data_coverage,position_group,basis,missing_inputs,
          model_version,calculated_at,provenance,updated_at
        ) values (
          s.id,v_signed_display,ps.model_score,ps.provisional_score,
          coalesce(ps.manual_potential_score,ps.potential_model_score),
          coalesce(ps.score_tier,ps.score_status,'provisional'),
          coalesce(case when ps.score_tier='provisional' then ps.provisional_confidence else ps.confidence end,0),
          coalesce(ps.data_coverage,0),ps.position_group,coalesce(ps.basis,'{}'::jsonb),
          coalesce(ps.missing_inputs,'[]'::jsonb),ps.model_version,ps.calculated_at,
          jsonb_build_object(
            'source','signed_player_v5',
            'player_id',s.player_id,
            'canonical',true,
            'subject_model','universal_immediate_score_v1'
          ),now()
        )
        on conflict(subject_id) do update set
          display_score=excluded.display_score,
          model_score=excluded.model_score,
          provisional_score=excluded.provisional_score,
          potential_score=excluded.potential_score,
          score_tier=excluded.score_tier,
          confidence=excluded.confidence,
          data_coverage=excluded.data_coverage,
          position_group=excluded.position_group,
          basis=excluded.basis,
          missing_inputs=excluded.missing_inputs,
          model_version=excluded.model_version,
          calculated_at=excluded.calculated_at,
          provenance=excluded.provenance,
          updated_at=now();

        return jsonb_build_object(
          'subject_id',s.id,
          'display_score',v_signed_display,
          'score_tier',coalesce(ps.score_tier,ps.score_status,'provisional'),
          'confidence',coalesce(case when ps.score_tier='provisional' then ps.provisional_confidence else ps.confidence end,0),
          'source','signed_player_v5',
          'model_version',ps.model_version
        );
      end if;
    end if;
  end if;

  v_position_group := private.djm_position_group(s.primary_position);

  -- Competition context. Prefer canonical competition ID; otherwise use a unique
  -- league/country benchmark match without mutating the subject record.
  select lb.strength_score, lb.benchmark_provider, lb.verified_at, lb.stale_at
  into v_benchmark_score, v_benchmark_provider, v_benchmark_verified, v_benchmark_stale
  from djm_os.league_benchmarks lb
  where (
      s.current_competition_id is not null and lb.competition_id=s.current_competition_id
    )
    or (
      s.current_competition_id is null
      and nullif(trim(coalesce(s.current_league,'')),'') is not null
      and lower(trim(lb.league_name))=lower(trim(s.current_league))
      and (
        nullif(trim(coalesce(s.current_country,'')),'') is null
        or nullif(trim(coalesce(lb.country,'')),'') is null
        or lower(trim(lb.country))=lower(trim(s.current_country))
      )
    )
  order by
    case when s.current_competition_id is not null and lb.competition_id=s.current_competition_id then 0 else 1 end,
    lb.verified_at desc nulls last,
    lb.updated_at desc
  limit 1;

  if v_benchmark_score is not null then
    v_level_quality := private.djm_v5_benchmark_quality(
      v_benchmark_provider,
      case
        when v_benchmark_stale is not null and v_benchmark_stale < now() then 'stale'
        when v_benchmark_verified is not null then 'fresh'
        else 'unknown'
      end
    );
    v_w_level := 30 * greatest(0,least(1,coalesce(v_level_quality,0)));
  else
    v_missing := v_missing || jsonb_build_array('competition_level');
  end if;

  -- Latest subject provider evidence can improve role certainty for either a prospect
  -- or signed player. Missing provider evidence is never converted into performance.
  select * into snap
  from djm_os.football_subject_provider_snapshots x
  where x.subject_id=s.id
  order by x.observed_at desc nulls last, x.synced_at desc nulls last, x.updated_at desc
  limit 1;

  if found then
    v_minutes := coalesce(
      nullif(snap.metrics #>> '{current_window,minutes}','')::numeric,
      nullif(snap.metrics #>> '{current_season,minutes}','')::numeric,
      0
    );
    v_apps := coalesce(
      nullif(snap.metrics #>> '{current_window,apps}','')::numeric,
      nullif(snap.metrics #>> '{current_season,apps}','')::numeric,
      0
    );
    v_starts := coalesce(
      nullif(snap.metrics #>> '{current_window,starts}','')::numeric,
      nullif(snap.metrics #>> '{current_season,starts}','')::numeric,
      0
    );
    v_starts_known := (snap.metrics #>> '{current_window,starts}') is not null
      or (snap.metrics #>> '{current_season,starts}') is not null;

    if v_minutes > 0 then
      v_role_score := private.djm_v5_role_score(v_minutes,v_apps,v_starts,v_starts_known);
      v_role_quality := private.djm_v5_role_quality(v_minutes,v_apps);
      v_w_role := 15 * greatest(0,least(1,coalesce(v_role_quality,0)));
    end if;
  end if;

  if v_role_score is null then
    v_missing := v_missing || jsonb_build_array('role_minutes');
  end if;
  v_missing := v_missing || jsonb_build_array('position_adjusted_performance','experience_history','trend','availability');

  v_effective_weight := v_w_level + v_w_role;
  v_weighted_total := coalesce(v_benchmark_score*v_w_level,0) + coalesce(v_role_score*v_w_role,0);

  if v_effective_weight > 0 then
    v_score := (v_prior_score*v_prior_strength + v_weighted_total)
      / nullif(v_prior_strength+v_effective_weight,0);
    v_score := greatest(0,least(100,v_score));
    v_info := v_effective_weight/nullif(v_effective_weight+v_prior_strength,0);
    v_quality := case
      when v_w_level>0 and v_w_role>0 then (v_level_quality+v_role_quality)/2.0
      when v_w_level>0 then v_level_quality
      when v_w_role>0 then v_role_quality
      else 0
    end;
    v_conf := least(
      45,
      greatest(5,round(100*v_info*(.65+.35*greatest(0,least(1,v_quality))))::int)
    )::smallint;
    v_coverage := least(45,greatest(1,round(v_effective_weight)::int))::smallint;
    v_grade := case
      when v_w_level>0 and v_w_role>0 then 'context_only'
      when v_w_level>0 then 'competition_prior'
      else 'role_prior'
    end;
    v_band_half := greatest(14,least(25,round(25 - v_conf*.22)::int));
  else
    v_score := v_prior_score;
    v_conf := 2;
    v_coverage := 0;
    v_grade := 'initial_prior';
    v_band_half := 25;
  end if;

  v_band_low := greatest(0,round(v_score)::int-v_band_half);
  v_band_high := least(100,round(v_score)::int+v_band_half);

  v_fingerprint := md5(jsonb_build_object(
    'model_version','djm_subject_score_v1_information_prior',
    'subject_id',s.id,
    'representation_status',s.representation_status,
    'primary_position',s.primary_position,
    'current_club',s.current_club,
    'current_league',s.current_league,
    'current_country',s.current_country,
    'current_competition_id',s.current_competition_id,
    'benchmark_score',v_benchmark_score,
    'benchmark_provider',v_benchmark_provider,
    'provider',case when snap.id is null then null else snap.provider end,
    'provider_player_id',case when snap.id is null then null else snap.provider_player_id end,
    'minutes',v_minutes,
    'apps',v_apps,
    'starts',case when v_starts_known then v_starts else null end
  )::text);

  v_basis := jsonb_build_object(
    'model','DJM Universal Immediate Score',
    'model_version','djm_subject_score_v1_information_prior',
    'provisional_grade',v_grade,
    'model_definition','Every footballer receives an immediate score. Missing evidence remains unknown; the initial number is an explicit neutral prior, not fabricated performance evidence.',
    'prior_score',v_prior_score,
    'prior_strength',v_prior_strength,
    'competition_level_score',case when v_benchmark_score is null then null else round(v_benchmark_score,2) end,
    'competition_level_quality',round(v_level_quality,3),
    'role_score',case when v_role_score is null then null else round(v_role_score,2) end,
    'role_quality',round(v_role_quality,3),
    'effective_evidence_coverage',round(v_effective_weight,2),
    'posterior_information',round(v_info,3),
    'evidence_confidence',v_conf,
    'evidence_confidence_semantics','Evidence strength only. It is not a probability of career success, transfer success or future performance.',
    'evidence_band',jsonb_build_object(
      'low',v_band_low,
      'high',v_band_high,
      'type','heuristic_evidence_band_not_statistical_confidence_interval'
    ),
    'missing_inputs',v_missing,
    'input_fingerprint',v_fingerprint,
    'canonical_signed_score',false,
    'scoring_rule','Signed V5 score is canonical when available. Otherwise use a neutral 50 prior plus only observed competition and role context. Never impute missing performance.'
  );

  insert into djm_os.football_subject_scorecards(
    subject_id,display_score,model_score,provisional_score,potential_score,
    score_tier,confidence,data_coverage,position_group,basis,missing_inputs,
    model_version,calculated_at,provenance,updated_at
  ) values (
    s.id,round(v_score)::smallint,null,round(v_score)::smallint,null,
    'provisional',v_conf,v_coverage,v_position_group,v_basis,v_missing,
    'djm_subject_score_v1_information_prior',now(),
    jsonb_build_object(
      'source','universal_subject_prior',
      'representation_status',s.representation_status,
      'canonical_signed_score',false
    ),now()
  )
  on conflict(subject_id) do update set
    display_score=excluded.display_score,
    model_score=excluded.model_score,
    provisional_score=excluded.provisional_score,
    potential_score=excluded.potential_score,
    score_tier=excluded.score_tier,
    confidence=excluded.confidence,
    data_coverage=excluded.data_coverage,
    position_group=excluded.position_group,
    basis=excluded.basis,
    missing_inputs=excluded.missing_inputs,
    model_version=excluded.model_version,
    calculated_at=excluded.calculated_at,
    provenance=excluded.provenance,
    updated_at=now();

  v_result := jsonb_build_object(
    'subject_id',s.id,
    'display_score',round(v_score)::int,
    'score_tier','provisional',
    'provisional_grade',v_grade,
    'confidence',v_conf,
    'data_coverage',v_coverage,
    'evidence_band',jsonb_build_object('low',v_band_low,'high',v_band_high),
    'source','universal_subject_prior',
    'model_version','djm_subject_score_v1_information_prior'
  );

  return v_result;
end;
$$;

revoke all on function djm_os.refresh_football_subject_scorecard(uuid) from public, anon, authenticated;
grant execute on function djm_os.refresh_football_subject_scorecard(uuid) to service_role;

create or replace function djm_os.refresh_football_subject_scorecard_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform djm_os.refresh_football_subject_scorecard(coalesce(new.id,old.id));
  return coalesce(new,old);
end;
$$;

create or replace function djm_os.refresh_football_subject_score_from_provider_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform djm_os.refresh_football_subject_scorecard(coalesce(new.subject_id,old.subject_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_football_subject_immediate_score on djm_os.football_intelligence_subjects;
create trigger trg_football_subject_immediate_score
after insert or update of representation_status,date_of_birth,primary_position,current_club,current_league,current_country,current_competition_id,current_season_label,current_season_start,football_provider_ids
on djm_os.football_intelligence_subjects
for each row execute function djm_os.refresh_football_subject_scorecard_trigger();

drop trigger if exists trg_football_subject_provider_score on djm_os.football_subject_provider_snapshots;
create trigger trg_football_subject_provider_score
after insert or update or delete on djm_os.football_subject_provider_snapshots
for each row execute function djm_os.refresh_football_subject_score_from_provider_trigger();

create or replace function djm_os.mirror_player_scorecard_to_subject()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_subject_id uuid;
  v_display smallint;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = new.player_id
  limit 1;

  if v_subject_id is null then return new; end if;

  v_display := coalesce(new.manual_score,new.model_score,new.provisional_score);

  if v_display is null then
    perform djm_os.refresh_football_subject_scorecard(v_subject_id);
    return new;
  end if;

  insert into djm_os.football_subject_scorecards(
    subject_id, display_score, model_score, provisional_score, potential_score,
    score_tier, confidence, data_coverage, position_group, basis, missing_inputs,
    model_version, calculated_at, provenance, updated_at
  ) values (
    v_subject_id,
    v_display,
    new.model_score,new.provisional_score,coalesce(new.manual_potential_score,new.potential_model_score),
    coalesce(new.score_tier,new.score_status,'provisional'),
    coalesce(case when new.score_tier='provisional' then new.provisional_confidence else new.confidence end,0),
    coalesce(new.data_coverage,0),new.position_group,coalesce(new.basis,'{}'::jsonb),
    coalesce(new.missing_inputs,'[]'::jsonb),new.model_version,new.calculated_at,
    jsonb_build_object(
      'source','signed_player_v5',
      'player_id',new.player_id,
      'canonical',true,
      'subject_model','universal_immediate_score_v1'
    ),now()
  )
  on conflict(subject_id) do update set
    display_score=excluded.display_score,
    model_score=excluded.model_score,
    provisional_score=excluded.provisional_score,
    potential_score=excluded.potential_score,
    score_tier=excluded.score_tier,
    confidence=excluded.confidence,
    data_coverage=excluded.data_coverage,
    position_group=excluded.position_group,
    basis=excluded.basis,
    missing_inputs=excluded.missing_inputs,
    model_version=excluded.model_version,
    calculated_at=excluded.calculated_at,
    provenance=excluded.provenance,
    updated_at=now();

  return new;
end;
$$;

-- Backfill every current signed player and prospect immediately.
do $$
declare r record;
begin
  for r in select id from djm_os.football_intelligence_subjects loop
    perform djm_os.refresh_football_subject_scorecard(r.id);
  end loop;
end;
$$;