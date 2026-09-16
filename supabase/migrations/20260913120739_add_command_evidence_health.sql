create or replace function platform.evidence_freshness_score(p_observed_at timestamptz)
returns integer
language sql
stable
set search_path=''
as $$
  select case
    when p_observed_at is null then 20
    when p_observed_at >= now()-interval '2 days' then 100
    when p_observed_at >= now()-interval '7 days' then 90
    when p_observed_at >= now()-interval '14 days' then 80
    when p_observed_at >= now()-interval '30 days' then 65
    when p_observed_at >= now()-interval '60 days' then 45
    when p_observed_at >= now()-interval '120 days' then 25
    else 10
  end;
$$;

create or replace function platform.command_evidence_health(p_tenant_id uuid, p_command jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_source_type text := p_command->>'source_type';
  v_source_id uuid;
  v_player_id uuid;
  v_need_id uuid;
  v_org_id uuid;
  v_observed_at timestamptz;
  v_freshness integer := 70;
  v_provenance integer := 70;
  v_corroboration integer := 70;
  v_completeness integer := 70;
  v_consistency integer := 100;
  v_score integer;
  v_state text;
  v_mode text;
  v_interactions integer := 0;
  v_claims integer := 0;
  v_conflicts integer := 0;
  v_evidence_rows integer := 0;
  v_verified_rows integer := 0;
  v_missing jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_deal djm_os.deal_rooms%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_task djm_os.tasks%rowtype;
  v_match djm_os.player_matches%rowtype;
  v_player public.players%rowtype;
  v_capture djm_os.captures%rowtype;
begin
  begin v_source_id := nullif(p_command->>'source_id','')::uuid; exception when others then v_source_id:=null; end;
  begin v_player_id := nullif(p_command->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
  begin v_need_id := nullif(p_command->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end;

  if v_source_type='task' then
    select * into v_task from djm_os.tasks t where t.id=v_source_id and t.tenant_id=p_tenant_id;
    if found then
      v_observed_at:=coalesce(v_task.updated_at,v_task.created_at);
      v_freshness:=platform.evidence_freshness_score(v_observed_at);
      v_provenance:=case when v_task.source like 'agency_os:%' then 100 when v_task.source like 'synthetic_demo:%' then 100 when nullif(trim(v_task.source),'') is not null then 85 else 65 end;
      v_corroboration:=100;
      v_completeness:=50
        + case when nullif(trim(v_task.title),'') is not null then 20 else 0 end
        + case when v_task.status is not null then 10 else 0 end
        + case when v_task.due_at is not null then 10 else 0 end
        + case when nullif(trim(v_task.source),'') is not null then 10 else 0 end;
      v_consistency:=100;
    end if;

  elsif v_source_type='deal_room' then
    select * into v_deal from djm_os.deal_rooms d where d.id=v_source_id and d.tenant_id=p_tenant_id;
    if found then
      v_org_id:=v_deal.organisation_id; v_player_id:=coalesce(v_player_id,v_deal.player_id); v_need_id:=coalesce(v_need_id,v_deal.club_need_id);
      v_observed_at:=coalesce(v_deal.last_meaningful_at,v_deal.updated_at,v_deal.created_at);
      v_freshness:=platform.evidence_freshness_score(v_observed_at);
      v_provenance:=case
        when v_deal.source='synthetic_demo' then 100
        when nullif(trim(v_deal.source),'') is not null and v_deal.probability_basis is not null then 90
        when nullif(trim(v_deal.source),'') is not null then 80
        when v_deal.probability_basis is not null then 75
        else 55 end;
      select count(*) into v_interactions from djm_os.interactions i where i.tenant_id=p_tenant_id and i.organisation_id=v_org_id and i.occurred_at>=now()-interval '90 days';
      select count(*) into v_claims from djm_os.claims c where c.tenant_id=p_tenant_id and (c.organisation_id=v_org_id or c.player_id=v_player_id) and coalesce(c.valid_until,now()+interval '1 day')>now();
      v_corroboration:=case when v_interactions>=2 then 100 when v_interactions=1 then 88 when v_claims>=1 or v_need_id is not null then 72 else 48 end;
      v_completeness:=20
        + case when v_deal.organisation_id is not null then 12 else 0 end
        + case when v_deal.player_id is not null then 10 else 0 end
        + case when nullif(trim(v_deal.stage),'') is not null then 8 else 0 end
        + case when v_deal.expected_commission is not null and nullif(trim(v_deal.currency),'') is not null then 12 else 0 end
        + case when coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability) is not null then 10 else 0 end
        + case when nullif(trim(v_deal.primary_blocker),'') is not null then 8 else 0 end
        + case when nullif(trim(v_deal.next_action_text),'') is not null or nullif(trim(v_deal.next_decision),'') is not null then 10 else 0 end
        + case when v_deal.last_meaningful_at is not null then 10 else 0 end;
    else
      v_missing:=v_missing||jsonb_build_array('deal_record_missing');
    end if;

  elsif v_source_type='club_need' then
    select * into v_need from djm_os.club_needs n where n.id=v_source_id and n.tenant_id=p_tenant_id;
    if found then
      v_need_id:=v_need.id; v_org_id:=v_need.organisation_id;
      select max(i.occurred_at) into v_observed_at from djm_os.interactions i where i.tenant_id=p_tenant_id and i.organisation_id=v_org_id;
      v_observed_at:=greatest(coalesce(v_observed_at,'epoch'::timestamptz),coalesce(v_need.confirmed_at,v_need.received_at,v_need.created_at,'epoch'::timestamptz));
      v_freshness:=platform.evidence_freshness_score(nullif(v_observed_at,'epoch'::timestamptz));
      v_provenance:=case
        when v_need.source_context='synthetic_demo' then 100
        when v_need.source_interaction_id is not null then 100
        when v_need.need_type='confirmed' and nullif(trim(v_need.raw_request),'') is not null then greatest(80,least(98,round(coalesce(v_need.confidence,0.8)*100)::int))
        when v_need.need_type='confirmed' then greatest(70,least(92,round(coalesce(v_need.confidence,0.7)*100)::int))
        when v_need.need_type='predicted' and v_need.prediction_basis is not null then greatest(55,least(82,coalesce(v_need.prediction_probability,60)))
        else 45 end;
      select count(*) into v_interactions from djm_os.interactions i where i.tenant_id=p_tenant_id and i.organisation_id=v_org_id and i.occurred_at>=now()-interval '90 days';
      select count(*) into v_claims from djm_os.claims c where c.tenant_id=p_tenant_id and c.organisation_id=v_org_id and coalesce(c.valid_until,now()+interval '1 day')>now();
      v_corroboration:=case when v_need.source_interaction_id is not null and v_interactions>=2 then 100 when v_interactions>=2 then 92 when v_interactions=1 then 82 when v_claims>=1 then 72 when v_need.need_type='confirmed' then 62 else 45 end;
      v_completeness:=20
        + case when v_need.organisation_id is not null then 12 else 0 end
        + case when nullif(trim(v_need.title),'') is not null then 10 else 0 end
        + case when nullif(trim(v_need.position),'') is not null then 12 else 0 end
        + case when v_need.priority is not null then 8 else 0 end
        + case when v_need.expires_at is not null then 8 else 0 end
        + case when nullif(trim(v_need.transfer_type),'') is not null then 8 else 0 end
        + case when v_need.salary_budget is not null or v_need.transfer_budget is not null then 8 else 0 end
        + case when nullif(trim(v_need.profile_notes),'') is not null or nullif(trim(v_need.raw_request),'') is not null then 14 else 0 end;
    else
      v_missing:=v_missing||jsonb_build_array('club_need_record_missing');
    end if;

  elsif v_source_type='player' then
    select * into v_player from public.players p where p.id=v_source_id and p.tenant_id=p_tenant_id;
    if found then
      v_player_id:=v_player.id;
      v_observed_at:=coalesce(v_player.verified_at,v_player.updated_at,v_player.created_at);
      v_freshness:=platform.evidence_freshness_score(v_observed_at);
      v_provenance:=case when v_player.verification_status='verified' then 95 when v_player.verification_status in ('review','pending') then 60 else 45 end;
      select count(*),count(*) filter(where pe.truth_state in ('verified','confirmed') or pe.verified_at is not null)
      into v_evidence_rows,v_verified_rows
      from djm_os.player_evidence pe
      where pe.player_id=v_player.id and (pe.valid_to is null or pe.valid_to>now());
      v_corroboration:=case when v_verified_rows>=3 then 100 when v_verified_rows>=1 then 88 when v_evidence_rows>=3 then 75 when v_evidence_rows>=1 then 65 else 55 end;
      v_completeness:=30
        + case when nullif(trim(v_player.primary_position),'') is not null then 12 else 0 end
        + case when v_player.date_of_birth is not null then 10 else 0 end
        + case when array_length(v_player.nationalities,1)>0 then 10 else 0 end
        + case when v_player.contract_status is not null then 10 else 0 end
        + case when v_player.football_status is not null then 8 else 0 end
        + case when nullif(trim(v_player.current_club),'') is not null or v_player.football_status='free_agent' then 10 else 0 end
        + case when nullif(trim(v_player.next_action),'') is not null then 10 else 0 end;
      if v_player.review_required_at is not null and v_player.review_required_at<=now() then v_consistency:=55; v_notes:=v_notes||jsonb_build_array('player_record_flagged_for_review'); end if;
    else
      v_missing:=v_missing||jsonb_build_array('player_record_missing');
    end if;

  elsif v_source_type='capture' then
    select * into v_capture from djm_os.captures c where c.id=v_source_id and c.tenant_id=p_tenant_id;
    if found then
      v_observed_at:=v_capture.created_at;
      v_freshness:=platform.evidence_freshness_score(v_observed_at);
      v_provenance:=greatest(25,least(70,round(coalesce(v_capture.confidence,0.5)*100)::int));
      v_corroboration:=30; v_completeness:=40; v_consistency:=45;
      v_notes:=v_notes||jsonb_build_array('capture_requires_human_clarification');
    end if;
  end if;

  if v_need_id is not null and v_source_type<>'club_need' then
    select n.organisation_id into v_org_id from djm_os.club_needs n where n.id=v_need_id and n.tenant_id=p_tenant_id;
  end if;

  if v_source_type='club_need' and p_command->>'command_type'='Review player match for live club need' then
    begin
      select * into v_match from djm_os.player_matches m
      where m.id=(p_command->'evidence'->>'match_id')::uuid and m.tenant_id=p_tenant_id;
    exception when others then null; end;
    if found then
      v_freshness:=least(v_freshness,platform.evidence_freshness_score(coalesce(v_match.updated_at,v_match.created_at)));
      v_completeness:=least(100,v_completeness + case when v_match.overall_score is not null then 4 else 0 end + case when v_match.football_score is not null then 4 else 0 end + case when v_match.commercial_score is not null then 4 else 0 end + case when v_match.registration_score is not null then 4 else 0 end + case when v_match.career_score is not null then 4 else 0 end + case when v_match.access_score is not null then 4 else 0 end);
      if jsonb_array_length(coalesce(v_match.reasoning->'evidence','[]'::jsonb))>=2 then v_corroboration:=least(100,v_corroboration+8); end if;
    end if;
  end if;

  if v_org_id is not null or v_player_id is not null then
    select count(*) into v_conflicts
    from (
      select c.claim_key
      from djm_os.claims c
      where c.tenant_id=p_tenant_id
        and ((v_org_id is not null and c.organisation_id=v_org_id) or (v_player_id is not null and c.player_id=v_player_id))
        and coalesce(c.valid_until,now()+interval '1 day')>now()
        and coalesce(c.verification_status,'') not in ('rejected','superseded')
      group by c.claim_key
      having count(distinct c.value_json)>1
    ) q;
    if v_conflicts>0 then
      v_consistency:=greatest(25,100-(v_conflicts*25));
      v_notes:=v_notes||jsonb_build_array(v_conflicts::text||' active claim contradiction(s) detected');
    end if;
  end if;

  v_freshness:=greatest(0,least(100,coalesce(v_freshness,20)));
  v_provenance:=greatest(0,least(100,coalesce(v_provenance,50)));
  v_corroboration:=greatest(0,least(100,coalesce(v_corroboration,50)));
  v_completeness:=greatest(0,least(100,coalesce(v_completeness,50)));
  v_consistency:=greatest(0,least(100,coalesce(v_consistency,100)));

  v_score:=round(v_freshness*0.25 + v_provenance*0.20 + v_corroboration*0.20 + v_completeness*0.20 + v_consistency*0.15)::int;
  v_state:=case when v_score>=80 then 'strong' when v_score>=65 then 'usable' when v_score>=45 then 'verify_first' else 'weak' end;
  v_mode:=case when v_score>=65 then 'normal' else 'verify_first' end;

  if v_freshness<50 then v_missing:=v_missing||jsonb_build_array('evidence_is_stale'); end if;
  if v_provenance<60 then v_missing:=v_missing||jsonb_build_array('source_provenance_is_weak'); end if;
  if v_corroboration<60 then v_missing:=v_missing||jsonb_build_array('supporting_evidence_is_thin'); end if;
  if v_completeness<65 then v_missing:=v_missing||jsonb_build_array('material_fields_are_missing'); end if;
  if v_consistency<80 then v_missing:=v_missing||jsonb_build_array('contradictory_evidence_requires_review'); end if;

  return jsonb_build_object(
    'score',v_score,
    'state',v_state,
    'operating_mode',v_mode,
    'external_decision_ready',v_score>=65,
    'observed_at',v_observed_at,
    'factors',jsonb_build_object(
      'freshness',jsonb_build_object('score',v_freshness,'weight',0.25),
      'provenance',jsonb_build_object('score',v_provenance,'weight',0.20),
      'corroboration',jsonb_build_object('score',v_corroboration,'weight',0.20,'recent_interactions',v_interactions,'supporting_claims',v_claims),
      'completeness',jsonb_build_object('score',v_completeness,'weight',0.20),
      'consistency',jsonb_build_object('score',v_consistency,'weight',0.15,'active_contradictions',v_conflicts)
    ),
    'verify_reasons',v_missing,
    'notes',v_notes,
    'interpretation','Evidence health measures how safely the recorded information supports action. It is not a probability that the deal, need or player claim is true.'
  );
end;
$$;

revoke all on function platform.evidence_freshness_score(timestamptz) from public,anon,authenticated;
revoke all on function platform.command_evidence_health(uuid,jsonb) from public,anon,authenticated;
grant execute on function platform.evidence_freshness_score(timestamptz) to service_role;
grant execute on function platform.command_evidence_health(uuid,jsonb) to service_role;;
