-- DJM OS UX comparison V1
-- Read-only evidence composition for the player comparison room.
-- V5 Player Score mathematics are intentionally untouched.

-- The existing authenticated RLS policy on public.audit_events is admin-only,
-- but Postgres requires a base table SELECT grant before RLS can evaluate it.
grant select on table public.audit_events to authenticated;

-- Remove any one-argument draft so the default second argument can never create
-- an ambiguous RPC overload.
drop function if exists public.djm_player_comparison(uuid);
drop function if exists public.djm_player_comparison(uuid, uuid);

create function public.djm_player_comparison(
  p_player_id uuid,
  p_compare_competition_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not djm_os.is_team_member() and auth.role() <> 'service_role' then
    raise exception 'DJM team access required';
  end if;

  if p_player_id is null then
    raise exception 'Player is required';
  end if;

  if not exists(select 1 from public.players p where p.id = p_player_id) then
    raise exception 'Player not found';
  end if;

  if auth.role() <> 'service_role' and not (
    exists(select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin')
    or exists(
      select 1
      from public.staff_player_access a
      where a.player_id = p_player_id
        and a.staff_user_id = auth.uid()
    )
  ) then
    raise exception 'Player access required';
  end if;

  with player_row as (
    select
      p.id,
      p.first_name,
      p.last_name,
      p.preferred_name,
      p.date_of_birth,
      p.primary_position,
      p.current_club,
      p.current_league,
      p.current_country,
      p.current_competition_id,
      p.football_status,
      p.contract_status,
      p.contract_expiry
    from public.players p
    where p.id = p_player_id
  ),
  score_row as (
    select s.*
    from djm_os.player_scorecards s
    where s.player_id = p_player_id
    limit 1
  ),
  performance_row as (
    select ps.*
    from djm_os.player_performance_snapshots ps
    where ps.player_id = p_player_id
    order by ps.evidence_date desc nulls last, ps.verified_at desc nulls last, ps.updated_at desc
    limit 1
  ),
  provider_row as (
    select pp.*
    from djm_os.player_provider_stat_snapshots pp
    where pp.player_id = p_player_id
      and pp.provider = 'pitchapi'
    order by pp.synced_at desc nulls last, pp.updated_at desc
    limit 1
  ),
  current_cohort as (
    select pc.*
    from djm_os.provider_peer_stat_snapshots pc
    join provider_row pr
      on pc.provider = 'pitchapi'
      and pc.provider_competition_id = pr.provider_competition_id
      and pc.provider_season_id = pr.provider_season_id
    where pc.minutes >= 180
      and (
        coalesce(pr.metrics #>> '{current_window,role}', pr.metrics #>> '{current_season,role}') is null
        or pc.provider_position = coalesce(pr.metrics #>> '{current_window,role}', pr.metrics #>> '{current_season,role}')
      )
    order by pc.minutes desc, pc.player_name
  ),
  target_competition as (
    select
      c.id,
      c.display_name,
      c.country,
      c.level_tier,
      c.provider_ids,
      nullif(c.provider_ids ->> 'pitchapi', '') as provider_competition_id
    from djm_os.competitions c
    where c.id = p_compare_competition_id
    limit 1
  ),
  target_cache_key as (
    select
      tc.id as competition_id,
      tc.display_name,
      tc.country,
      tc.provider_competition_id,
      (
        select pc.provider_season_id
        from djm_os.provider_peer_stat_snapshots pc
        where pc.provider = 'pitchapi'
          and pc.provider_competition_id = tc.provider_competition_id
        order by pc.synced_at desc nulls last, pc.updated_at desc
        limit 1
      ) as provider_season_id
    from target_competition tc
  ),
  target_cohort as (
    select pc.*
    from djm_os.provider_peer_stat_snapshots pc
    join target_cache_key tk
      on pc.provider = 'pitchapi'
      and pc.provider_competition_id = tk.provider_competition_id
      and pc.provider_season_id = tk.provider_season_id
    where pc.minutes >= 180
    order by pc.minutes desc, pc.player_name
  ),
  benchmark_rows as (
    select distinct on (lb.competition_id)
      lb.id,
      lb.competition_id,
      lb.league_name,
      lb.country,
      lb.strength_score,
      lb.benchmark_provider,
      lb.methodology_version,
      lb.source_note,
      lb.verified_at,
      lb.stale_at,
      c.level_tier,
      c.provider_ids
    from djm_os.league_benchmarks lb
    left join djm_os.competitions c on c.id = lb.competition_id
    where lb.competition_id is not null
    order by lb.competition_id, lb.verified_at desc nulls last, lb.updated_at desc
  ),
  competition_rows as (
    select
      c.id as competition_id,
      c.display_name as league_name,
      c.country,
      c.level_tier,
      c.provider_ids,
      lb.strength_score,
      lb.benchmark_provider,
      lb.methodology_version,
      lb.verified_at,
      lb.stale_at
    from djm_os.competitions c
    left join lateral (
      select b.strength_score, b.benchmark_provider, b.methodology_version, b.verified_at, b.stale_at
      from djm_os.league_benchmarks b
      where b.competition_id = c.id
      order by b.verified_at desc nulls last, b.updated_at desc
      limit 1
    ) lb on true
    where c.active is distinct from false
  ),
  cached_peer_leagues as (
    select
      c.id as competition_id,
      c.display_name as league_name,
      c.country,
      max(pc.synced_at) as synced_at,
      count(*)::int as peer_count,
      max(pc.provider_season_id) as provider_season_id
    from djm_os.competitions c
    join djm_os.provider_peer_stat_snapshots pc
      on pc.provider = 'pitchapi'
      and pc.provider_competition_id = c.provider_ids ->> 'pitchapi'
    group by c.id, c.display_name, c.country
  )
  select jsonb_build_object(
    'player', coalesce((select to_jsonb(p) from player_row p), '{}'::jsonb),
    'scorecard', coalesce((
      select jsonb_build_object(
        'display_score', coalesce(s.manual_score, s.model_score, s.provisional_score),
        'model_score', s.model_score,
        'manual_score', s.manual_score,
        'provisional_score', s.provisional_score,
        'potential_score', coalesce(s.manual_potential_score, s.potential_model_score),
        'potential_model_score', s.potential_model_score,
        'manual_potential_score', s.manual_potential_score,
        'score_status', s.score_status,
        'score_tier', s.score_tier,
        'confidence', case when s.score_tier = 'provisional' then coalesce(s.provisional_confidence, s.confidence) else s.confidence end,
        'data_coverage', s.data_coverage,
        'model_version', s.model_version,
        'calculated_at', s.calculated_at,
        'evidence_freshness', s.evidence_freshness,
        'evidence_band_low', nullif(s.basis #>> '{evidence_band,low}', '')::numeric,
        'evidence_band_high', nullif(s.basis #>> '{evidence_band,high}', '')::numeric,
        'provisional_grade', s.basis ->> 'provisional_grade',
        'effective_evidence_coverage', nullif(s.basis ->> 'effective_evidence_coverage', '')::numeric,
        'missing_inputs', s.missing_inputs,
        'basis', s.basis
      )
      from score_row s
    ), '{}'::jsonb),
    'performance', coalesce((select to_jsonb(ps) from performance_row ps), 'null'::jsonb),
    'provider_snapshot', coalesce((select to_jsonb(pr) from provider_row pr), 'null'::jsonb),
    'peers', coalesce((select jsonb_agg(to_jsonb(pc)) from current_cohort pc), '[]'::jsonb),
    'target_peers', coalesce((select jsonb_agg(to_jsonb(tc)) from target_cohort tc), '[]'::jsonb),
    'target_peer_context', coalesce((
      select jsonb_build_object(
        'competition_id', tk.competition_id,
        'display_name', tk.display_name,
        'country', tk.country,
        'provider', 'pitchapi',
        'provider_competition_id', tk.provider_competition_id,
        'provider_season_id', tk.provider_season_id,
        'peer_count', (select count(*) from target_cohort)
      )
      from target_cache_key tk
    ), 'null'::jsonb),
    'benchmarks', coalesce((select jsonb_agg(to_jsonb(br) order by br.strength_score desc nulls last, br.league_name) from benchmark_rows br), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(to_jsonb(cr) order by cr.country nulls last, cr.league_name) from competition_rows cr), '[]'::jsonb),
    'cached_peer_leagues', coalesce((select jsonb_agg(to_jsonb(cp) order by cp.synced_at desc nulls last) from cached_peer_leagues cp), '[]'::jsonb),
    'semantics', jsonb_build_object(
      'current_level', 'DJM Player Score V5 current demonstrated level',
      'position_profile', 'Observed provider percentile evidence against a relevant current peer cohort',
      'peer_plot', 'Observed provider players only; no synthetic player dots',
      'league_strength', 'Competition context; never the same thing as player ability',
      'cross_league', 'Current same-provider observed metric placed against a target league cohort without translating it into a synthetic percentile',
      'potential', 'Stored DJM potential only; not presented as a calibrated career-success probability',
      'confidence', 'Evidence strength, not probability of sporting, transfer or career success'
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.djm_player_comparison(uuid, uuid) from public;
revoke all on function public.djm_player_comparison(uuid, uuid) from anon;
grant execute on function public.djm_player_comparison(uuid, uuid) to authenticated;
grant execute on function public.djm_player_comparison(uuid, uuid) to service_role;

comment on function public.djm_player_comparison(uuid, uuid) is
  'Read-only DJM comparison evidence composer. Keeps V5 current level, observed peer performance, league context and potential semantically separate.';
