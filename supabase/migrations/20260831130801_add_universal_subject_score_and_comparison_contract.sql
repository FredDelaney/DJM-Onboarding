create table if not exists djm_os.football_subject_scorecards (
  subject_id uuid primary key references djm_os.football_intelligence_subjects(id) on delete cascade,
  display_score smallint,
  model_score smallint,
  provisional_score smallint,
  potential_score smallint,
  score_tier text not null default 'unavailable',
  confidence smallint not null default 0 check (confidence between 0 and 100),
  data_coverage smallint not null default 0 check (data_coverage between 0 and 100),
  position_group text,
  basis jsonb not null default '{}'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  model_version text,
  calculated_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on djm_os.football_subject_scorecards from anon, authenticated;
grant all on djm_os.football_subject_scorecards to service_role;

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

  if v_subject_id is null then return new; end if;

  insert into djm_os.football_subject_scorecards(
    subject_id, display_score, model_score, provisional_score, potential_score,
    score_tier, confidence, data_coverage, position_group, basis, missing_inputs,
    model_version, calculated_at, provenance, updated_at
  ) values (
    v_subject_id,
    coalesce(new.manual_score,new.model_score,new.provisional_score),
    new.model_score,new.provisional_score,coalesce(new.manual_potential_score,new.potential_model_score),
    coalesce(new.score_tier,new.score_status,'unavailable'),
    coalesce(case when new.score_tier='provisional' then new.provisional_confidence else new.confidence end,0),
    coalesce(new.data_coverage,0),new.position_group,coalesce(new.basis,'{}'::jsonb),
    coalesce(new.missing_inputs,'[]'::jsonb),new.model_version,new.calculated_at,
    jsonb_build_object('source','djm_os.player_scorecards','player_id',new.player_id),now()
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

drop trigger if exists mirror_player_scorecard_to_subject_trg on djm_os.player_scorecards;
create trigger mirror_player_scorecard_to_subject_trg
after insert or update on djm_os.player_scorecards
for each row execute function djm_os.mirror_player_scorecard_to_subject();

insert into djm_os.football_subject_scorecards(
  subject_id, display_score, model_score, provisional_score, potential_score,
  score_tier, confidence, data_coverage, position_group, basis, missing_inputs,
  model_version, calculated_at, provenance
)
select s.id,
       coalesce(ps.manual_score,ps.model_score,ps.provisional_score),
       ps.model_score,ps.provisional_score,coalesce(ps.manual_potential_score,ps.potential_model_score),
       coalesce(ps.score_tier,ps.score_status,'unavailable'),
       coalesce(case when ps.score_tier='provisional' then ps.provisional_confidence else ps.confidence end,0),
       coalesce(ps.data_coverage,0),ps.position_group,coalesce(ps.basis,'{}'::jsonb),
       coalesce(ps.missing_inputs,'[]'::jsonb),ps.model_version,ps.calculated_at,
       jsonb_build_object('source','djm_os.player_scorecards','player_id',ps.player_id)
from djm_os.player_scorecards ps
join djm_os.football_intelligence_subjects s on s.player_id=ps.player_id
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

create or replace function public.djm_football_subject_comparison(
  p_subject_id uuid,
  p_compare_competition_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_score djm_os.football_subject_scorecards%rowtype;
  v_provider djm_os.football_subject_provider_snapshots%rowtype;
  v_role text;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_subject
  from djm_os.football_intelligence_subjects
  where id=p_subject_id;
  if not found then raise exception 'Football intelligence subject not found'; end if;

  select * into v_score
  from djm_os.football_subject_scorecards
  where subject_id=p_subject_id;

  select * into v_provider
  from djm_os.football_subject_provider_snapshots
  where subject_id=p_subject_id
  order by
    case provider when 'pitchapi' then 1 when 'official_league' then 2 when 'wyscout' then 3 when 'api_football' then 4 else 9 end,
    synced_at desc
  limit 1;

  v_role := coalesce(v_provider.metrics #>> '{current_window,role}', v_provider.metrics #>> '{current_season,role}', v_provider.metrics ->> 'role');

  with current_peers as (
    select p.*
    from djm_os.provider_peer_stat_snapshots p
    where v_provider.id is not null
      and p.provider=v_provider.provider
      and p.provider_competition_id=v_provider.provider_competition_id
      and p.provider_season_id=v_provider.provider_season_id
      and p.minutes>=180
      and (v_role is null or p.provider_position=v_role)
    order by p.minutes desc,p.player_name
  ), target_comp as (
    select c.*,
      coalesce(nullif(c.provider_ids->>'pitchapi',''),nullif(c.provider_ids->>'official_league','')) as provider_competition_id,
      case
        when nullif(c.provider_ids->>'pitchapi','') is not null then 'pitchapi'
        when nullif(c.provider_ids->>'official_league','') is not null then 'official_league'
        else null
      end as target_provider
    from djm_os.competitions c
    where c.id=p_compare_competition_id
    limit 1
  ), target_key as (
    select tc.*,
      (select p.provider_season_id from djm_os.provider_peer_stat_snapshots p
       where p.provider=tc.target_provider and p.provider_competition_id=tc.provider_competition_id
       order by p.synced_at desc limit 1) as provider_season_id
    from target_comp tc
  ), target_peers as (
    select p.*
    from djm_os.provider_peer_stat_snapshots p
    join target_key tk on p.provider=tk.target_provider
      and p.provider_competition_id=tk.provider_competition_id
      and p.provider_season_id=tk.provider_season_id
    where p.minutes>=180
      and (v_role is null or p.provider_position=v_role)
    order by p.minutes desc,p.player_name
  )
  select jsonb_build_object(
    'subject',to_jsonb(v_subject),
    'scorecard',case when v_score.subject_id is null then jsonb_build_object(
      'display_score',null,'score_tier','unavailable','confidence',0,
      'reason','No canonical score has been calculated for this subject yet.'
    ) else to_jsonb(v_score) end,
    'provider_snapshot',case when v_provider.id is null then 'null'::jsonb else to_jsonb(v_provider) end,
    'peers',coalesce((select jsonb_agg(to_jsonb(p)) from current_peers p),'[]'::jsonb),
    'target_peers',coalesce((select jsonb_agg(to_jsonb(p)) from target_peers p),'[]'::jsonb),
    'semantics',jsonb_build_object(
      'subject_scope','Signed players and prospects share one persistent football intelligence identity.',
      'score','Signed-player V5 scores are mirrored unchanged. Prospect scores remain unknown until a canonical prospect-capable scorer is available.',
      'peers','Observed provider or verified official-league players only. No synthetic peer rows.',
      'promotion','When a prospect becomes signed, provider identities and evidence remain attached to the same subject.'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.djm_football_subject_comparison(uuid,uuid) from public, anon;
grant execute on function public.djm_football_subject_comparison(uuid,uuid) to authenticated, service_role;