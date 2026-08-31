-- Keep the global subject model authoritative for staff intelligence.
-- Player Score V5 remains available as legacy evidence and for reviewed overrides.

create or replace function djm_os.mirror_player_scorecard_to_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = new.player_id
  limit 1;

  if v_subject_id is null then
    return new;
  end if;

  -- V5 can update legacy player evidence, but the shared subject scorecard is
  -- always recalculated by the current global model instead of being replaced.
  perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  return new;
end;
$$;

comment on function djm_os.mirror_player_scorecard_to_subject() is
  'Recalculates the authoritative global subject score after legacy signed-player evidence changes.';

create or replace function public.djm_player_global_intelligence(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_score djm_os.football_subject_scorecards%rowtype;
  v_snapshot djm_os.football_subject_provider_snapshots%rowtype;
  v_queue djm_os.football_intelligence_enrichment_queue%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_subject
  from djm_os.football_intelligence_subjects s
  where s.player_id = p_player_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'available', false,
      'reason', 'global_subject_not_initialised',
      'player_id', p_player_id
    );
  end if;

  select * into v_score
  from djm_os.football_subject_scorecards sc
  where sc.subject_id = v_subject.id;

  select * into v_snapshot
  from djm_os.football_subject_provider_snapshots ps
  where ps.subject_id = v_subject.id
  order by
    case ps.provider
      when 'pitchapi' then 1
      when 'official_league' then 2
      when 'wyscout' then 3
      when 'api_football' then 4
      when 'thesportsdb' then 5
      else 9
    end,
    ps.observed_at desc nulls last,
    ps.updated_at desc
  limit 1;

  select * into v_queue
  from djm_os.football_intelligence_enrichment_queue q
  where q.subject_id = v_subject.id;

  return jsonb_build_object(
    'available', v_score.subject_id is not null,
    'subject', jsonb_build_object(
      'subject_id', v_subject.id,
      'player_id', v_subject.player_id,
      'full_name', v_subject.full_name,
      'primary_position', v_subject.primary_position,
      'current_club', v_subject.current_club,
      'current_league', v_subject.current_league,
      'current_country', v_subject.current_country,
      'external_data_status', v_subject.external_data_status,
      'external_data_checked_at', v_subject.external_data_checked_at,
      'external_data_error', v_subject.external_data_error
    ),
    'scorecard', case when v_score.subject_id is null then null else jsonb_build_object(
      'display_score', v_score.display_score,
      'model_score', v_score.model_score,
      'provisional_score', v_score.provisional_score,
      'score_tier', v_score.score_tier,
      'confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage,
      'position_group', v_score.position_group,
      'model_version', v_score.model_version,
      'calculated_at', v_score.calculated_at,
      'definition', v_score.basis ->> 'definition',
      'score_state', v_score.basis ->> 'score_state',
      'evidence_grade', v_score.basis ->> 'evidence_grade',
      'evidence_band', v_score.basis -> 'evidence_band',
      'components', coalesce(v_score.basis -> 'components', '{}'::jsonb),
      'missing_inputs', coalesce(v_score.missing_inputs, '[]'::jsonb),
      'identity_quality', v_score.basis -> 'identity_quality',
      'season_recency_quality', v_score.basis -> 'season_recency_quality',
      'advanced_data_required', coalesce((v_score.basis ->> 'advanced_data_required')::boolean, false)
    ) end,
    'evidence', jsonb_build_object(
      'provider_snapshot_count', (select count(*) from djm_os.football_subject_provider_snapshots ps where ps.subject_id = v_subject.id),
      'match_snapshot_count', (select count(*) from djm_os.football_subject_match_snapshots ms where ms.subject_id = v_subject.id),
      'career_entry_count', (select count(*) from djm_os.football_subject_career_entries ce where ce.subject_id = v_subject.id),
      'latest_provider', v_snapshot.provider,
      'provider_player_id', v_snapshot.provider_player_id,
      'season_label', v_snapshot.season_label,
      'competition_name', v_snapshot.competition_name,
      'data_depth', v_snapshot.data_depth,
      'snapshot_confidence', v_snapshot.confidence,
      'latest_observed_at', v_snapshot.observed_at,
      'latest_synced_at', v_snapshot.synced_at,
      'source_name', v_snapshot.metrics #>> '{source,name}',
      'source_url', coalesce(v_snapshot.metrics #>> '{source,url}', v_snapshot.provenance ->> 'source_url')
    ),
    'automation', jsonb_build_object(
      'status', coalesce(v_queue.status, 'ready'),
      'target_confidence', coalesce(v_queue.target_confidence, 80),
      'current_confidence', coalesce(v_queue.current_confidence, v_score.confidence, 0),
      'missing_evidence', coalesce(v_queue.missing_evidence, v_score.missing_inputs, '[]'::jsonb),
      'last_attempt_at', v_queue.last_attempt_at,
      'next_attempt_at', v_queue.next_attempt_at,
      'attempts', coalesce(v_queue.attempts, 0),
      'last_error', v_queue.last_error
    )
  );
end;
$$;

create or replace function public.djm_refresh_player_global_intelligence(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = p_player_id
  limit 1;

  if v_subject_id is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'global_subject_not_initialised',
      'player_id', p_player_id
    );
  end if;

  perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  return public.djm_player_global_intelligence(p_player_id);
end;
$$;

revoke all on function public.djm_player_global_intelligence(uuid) from public, anon;
revoke all on function public.djm_refresh_player_global_intelligence(uuid) from public, anon;
grant execute on function public.djm_player_global_intelligence(uuid) to authenticated, service_role;
grant execute on function public.djm_refresh_player_global_intelligence(uuid) to authenticated, service_role;

comment on function public.djm_player_global_intelligence(uuid) is
  'Staff-only read model for the current global player intelligence score, evidence and automation state.';
comment on function public.djm_refresh_player_global_intelligence(uuid) is
  'Staff-only immediate recalculation of the global player intelligence score from verified stored evidence.';

do $$
declare
  v_job integer;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select jobid into v_job
  from cron.job
  where jobname = 'djm-official-football-refresh-weekly'
  limit 1;

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'djm-official-football-refresh-weekly',
    '12 4 * * 1',
    $job$
      select net.http_post(
        url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/refresh-official-football-data',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-djm-cron', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'djm_push_cron_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('mode', 'refresh_all', 'source', 'weekly_official_data'),
        timeout_milliseconds := 60000
      );
    $job$
  );
end;
$$;

select djm_os.refresh_global_scorecards_batch(5000);

notify pgrst, 'reload schema';
