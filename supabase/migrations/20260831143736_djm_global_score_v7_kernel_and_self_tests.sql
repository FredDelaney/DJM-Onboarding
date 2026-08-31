create or replace function djm_os.global_score_kernel_v7(p_components jsonb,p_identity_quality numeric default 0)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  kv record;
  v_score_component numeric;
  v_quality numeric;
  v_nominal numeric;
  v_effective numeric;
  v_eligible boolean;
  v_total numeric:=0;
  v_observed numeric:=0;
  v_available numeric:=0;
  v_prior numeric:=40;
  v_score numeric:=50;
  v_coverage numeric:=0;
  v_diversity numeric:=0;
  v_identity numeric:=greatest(0,least(1,coalesce(p_identity_quality,0)));
  v_used integer:=0;
  v_current_football_used integer:=0;
  v_conf integer:=0;
  v_grade text;
  v_state text;
  v_band integer;
  v_used_detail jsonb:='{}'::jsonb;
begin
  for kv in select key,value from jsonb_each(coalesce(p_components,'{}'::jsonb)) loop
    v_score_component:=djm_os.safe_json_number(kv.value->>'score');
    v_quality:=greatest(0,least(1,coalesce(djm_os.safe_json_number(kv.value->>'quality'),0)));
    v_nominal:=greatest(0,coalesce(djm_os.safe_json_number(kv.value->>'weight'),0));
    v_eligible:=coalesce((kv.value->>'eligible')::boolean,true);
    if v_eligible then v_available:=v_available+v_nominal; end if;
    if not v_eligible or v_score_component is null or v_quality<=0 or v_nominal<=0 then continue; end if;
    v_effective:=v_nominal*v_quality;
    v_total:=v_total+greatest(0,least(100,v_score_component))*v_effective;
    v_observed:=v_observed+v_effective;
    v_used:=v_used+1;
    if kv.key in ('competition','team_context','role','position_production','match_influence') then v_current_football_used:=v_current_football_used+1; end if;
    v_used_detail:=v_used_detail||jsonb_build_object(kv.key,jsonb_build_object('score',round(v_score_component,2),'quality',round(v_quality,3),'nominal_weight',v_nominal,'effective_weight',round(v_effective,2)));
  end loop;

  v_prior:=greatest(6::numeric,40-.34*v_observed);
  if v_observed>0 then v_score:=greatest(0,least(100,(50*v_prior+v_total)/nullif(v_prior+v_observed,0))); end if;
  if v_available>0 then v_coverage:=least(1,v_observed/v_available); end if;
  v_diversity:=least(1,v_used/5.0);
  v_conf:=least(97,greatest(0,round(100*(.65*v_coverage+.15*v_diversity+.20*v_identity))::int));
  if v_current_football_used=0 then v_conf:=least(v_conf,55); end if;
  if v_identity<.50 then v_conf:=least(v_conf,75); end if;
  if v_coverage<.25 then v_conf:=least(v_conf,55); end if;

  v_state:=case when v_conf>=90 then 'elite_evidence' when v_conf>=80 then 'ready' when v_conf>=65 then 'usable' else 'enriching' end;
  v_grade:=case when v_conf>=90 then 'A+' when v_conf>=80 then 'A' when v_conf>=65 then 'B' else 'BUILDING' end;
  v_band:=case when v_conf>=92 then 4 when v_conf>=85 then 6 when v_conf>=80 then 7 when v_conf>=65 then 11 when v_conf>=50 then 15 else 22 end;

  return jsonb_build_object(
    'score',round(v_score,2),'confidence',v_conf,'data_coverage',round(100*v_coverage),
    'evidence_grade',v_grade,'score_state',v_state,'identity_quality',round(v_identity,3),
    'observed_effective_weight',round(v_observed,2),'available_nominal_weight',round(v_available,2),
    'neutral_prior_score',50,'neutral_prior_strength',round(v_prior,2),'components_used',v_used_detail,
    'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval')
  );
end;
$$;

create or replace function djm_os.global_score_v7_self_test()
returns table(test_name text,passed boolean,details jsonb)
language plpgsql
stable security definer
set search_path=''
as $$
declare a jsonb; b jsonb; rich jsonb; market_only jsonb; stale jsonb; optional_a jsonb; optional_b jsonb;
begin
  market_only:=djm_os.global_score_kernel_v7(jsonb_build_object(
    'competition',jsonb_build_object('score',null,'quality',0,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',null,'quality',0,'weight',10,'eligible',true),
    'role',jsonb_build_object('score',null,'quality',0,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',null,'quality',0,'weight',20,'eligible',true),
    'match_influence',jsonb_build_object('score',null,'quality',0,'weight',12,'eligible',true),
    'market_consensus',jsonb_build_object('score',98,'quality',.92,'weight',12,'eligible',true),
    'career_context',jsonb_build_object('score',null,'quality',0,'weight',8,'eligible',true)
  ),.95);
  test_name:='market_value_alone_cannot_create_elite_current_level'; passed:=(market_only->>'score')::numeric<65 and (market_only->>'confidence')::int<60; details:=market_only; return next;

  a:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',40,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',60,'quality',1,'weight',18,'eligible',true)),1);
  b:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',70,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',60,'quality',1,'weight',18,'eligible',true)),1);
  test_name:='stronger_verified_competition_never_lowers_identical_player'; passed:=(b->>'score')::numeric>(a->>'score')::numeric; details:=jsonb_build_object('weaker',a,'stronger',b); return next;

  a:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',45,'quality',1,'weight',18,'eligible',true)),1);
  b:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',80,'quality',1,'weight',18,'eligible',true)),1);
  test_name:='stronger_verified_role_never_lowers_identical_player'; passed:=(b->>'score')::numeric>(a->>'score')::numeric; details:=jsonb_build_object('lower_role',a,'higher_role',b); return next;

  optional_a:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'team_context',jsonb_build_object('score',null,'quality',0,'weight',10,'eligible',false),'role',jsonb_build_object('score',70,'quality',1,'weight',18,'eligible',true)),1);
  optional_b:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',70,'quality',1,'weight',18,'eligible',true)),1);
  test_name:='unavailable_optional_source_does_not_change_score'; passed:=abs((optional_a->>'score')::numeric-(optional_b->>'score')::numeric)<.01; details:=jsonb_build_object('with_ineligible_optional',optional_a,'without_optional',optional_b); return next;

  stale:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',70,'quality',.25,'weight',20,'eligible',true),'role',jsonb_build_object('score',75,'quality',.20,'weight',18,'eligible',true),'market_consensus',jsonb_build_object('score',90,'quality',.30,'weight',12,'eligible',true)),.95);
  test_name:='stale_sparse_evidence_cannot_create_high_confidence'; passed:=(stale->>'confidence')::int<65; details:=stale; return next;

  rich:=djm_os.global_score_kernel_v7(jsonb_build_object(
    'competition',jsonb_build_object('score',70,'quality',.95,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',62,'quality',.90,'weight',10,'eligible',true),
    'role',jsonb_build_object('score',82,'quality',.95,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',74,'quality',.90,'weight',20,'eligible',true),
    'match_influence',jsonb_build_object('score',72,'quality',.90,'weight',12,'eligible',true),
    'market_consensus',jsonb_build_object('score',68,'quality',.90,'weight',12,'eligible',true),
    'career_context',jsonb_build_object('score',69,'quality',.90,'weight',8,'eligible',true)
  ),.98);
  test_name:='rich_independent_evidence_reaches_ready_high_confidence'; passed:=(rich->>'confidence')::int>=80 and (rich->>'confidence')::int<=97; details:=rich; return next;

  test_name:='confidence_never_claims_certainty'; passed:=(rich->>'confidence')::int<100; details:=rich; return next;
end;
$$;