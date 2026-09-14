create or replace function platform.command_evidence_health_v2(p_tenant_id uuid, p_command jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_health jsonb;
  v_source_type text:=p_command->>'source_type';
  v_source_id uuid;
  v_need djm_os.club_needs%rowtype;
  v_source_interaction_at timestamptz;
  v_observed_at timestamptz;
  v_freshness integer;
  v_provenance integer;
  v_corroboration integer;
  v_completeness integer;
  v_consistency integer;
  v_score integer;
  v_state text;
  v_mode text;
  v_reasons jsonb;
begin
  v_health:=platform.command_evidence_health(p_tenant_id,p_command);
  if v_source_type<>'club_need' then return v_health; end if;

  begin v_source_id:=nullif(p_command->>'source_id','')::uuid; exception when others then return v_health; end;
  select * into v_need from djm_os.club_needs n where n.id=v_source_id and n.tenant_id=p_tenant_id;
  if not found then return v_health; end if;

  if v_need.source_interaction_id is not null then
    select i.occurred_at into v_source_interaction_at from djm_os.interactions i
    where i.id=v_need.source_interaction_id and i.tenant_id=p_tenant_id;
  end if;

  v_observed_at:=coalesce(v_source_interaction_at,v_need.confirmed_at,v_need.created_at);
  v_freshness:=platform.evidence_freshness_score(v_observed_at);

  v_provenance:=(v_health->'factors'->'provenance'->>'score')::integer;
  if v_need.need_type='predicted' and (v_need.prediction_basis is null or v_need.prediction_basis='{}'::jsonb) then
    v_provenance:=least(v_provenance,45);
  end if;
  if coalesce(lower(v_need.source_context),'') like '%unverified%' or coalesce(lower(v_need.source_context),'') like '%rumour%' then
    v_provenance:=least(v_provenance,40);
  end if;

  v_corroboration:=(v_health->'factors'->'corroboration'->>'score')::integer;
  v_completeness:=(v_health->'factors'->'completeness'->>'score')::integer;
  v_consistency:=(v_health->'factors'->'consistency'->>'score')::integer;
  v_score:=round(v_freshness*0.25 + v_provenance*0.20 + v_corroboration*0.20 + v_completeness*0.20 + v_consistency*0.15)::integer;
  v_state:=case when v_score>=80 then 'strong' when v_score>=65 then 'usable' when v_score>=45 then 'verify_first' else 'weak' end;
  v_mode:=case when v_score>=65 then 'normal' else 'verify_first' end;
  v_reasons:=coalesce(v_health->'verify_reasons','[]'::jsonb);
  if v_freshness<50 and not (v_reasons ? 'evidence_is_stale') then v_reasons:=v_reasons||jsonb_build_array('evidence_is_stale'); end if;
  if v_provenance<60 and not (v_reasons ? 'source_provenance_is_weak') then v_reasons:=v_reasons||jsonb_build_array('source_provenance_is_weak'); end if;

  return jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_health,'{score}',to_jsonb(v_score),true),
            '{state}',to_jsonb(v_state),true),
          '{operating_mode}',to_jsonb(v_mode),true),
        '{external_decision_ready}',to_jsonb(v_score>=65),true),
      '{observed_at}',to_jsonb(v_observed_at),true),
    '{verify_reasons}',v_reasons,true)
    || jsonb_build_object('factors',(v_health->'factors') || jsonb_build_object(
      'freshness',(v_health->'factors'->'freshness')||jsonb_build_object('score',v_freshness),
      'provenance',(v_health->'factors'->'provenance')||jsonb_build_object('score',v_provenance)
    ));
end;
$$;

revoke all on function platform.command_evidence_health_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function platform.command_evidence_health_v2(uuid,jsonb) to service_role;

create or replace function public.platform_server_agency_decisions(p_tenant_id uuid, p_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer := coalesce(p_limit,12);
  v_raw jsonb;
  v_commands jsonb;
begin
  if v_limit not between 1 and 25 then raise exception 'invalid_decision_limit'; end if;
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;
  v_raw := public.platform_server_agency_commands(p_tenant_id,25);

  with expanded as (
    select c.value as command from jsonb_array_elements(coalesce(v_raw->'commands','[]'::jsonb)) c
  ), profiled as (
    select command,profile,platform.command_evidence_health_v2(p_tenant_id,command) as health,platform.command_actionability(command) as base_actionability
    from expanded cross join lateral platform.command_priority_profile(command) profile
  ), enriched as (
    select command || jsonb_build_object(
      'base_priority_score',(command->>'priority_score')::integer,
      'priority_score',(profile->>'effective_score')::integer,
      'priority_band',profile->>'effective_band',
      'decision_basis',profile,
      'evidence_health',health,
      'actionability',case
        when health->>'operating_mode'='verify_first' and command->>'source_type' in ('deal_room','club_need','player') and base_actionability->>'mode'<>'review_only'
        then jsonb_build_object('cta','Verify evidence','mode','one_tap','risk_level','low','action_type','create_verification_task','undo_expected',true,'requires_input',false,'external_side_effect',false,'evidence_gate','verify_first','blocked_action',base_actionability)
        else base_actionability||jsonb_build_object('evidence_gate',case when health->>'operating_mode'='verify_first' then 'verify_first_review_only' else 'ready' end)
      end
    ) as command
    from profiled
  ), ranked as (
    select command,row_number() over(order by (command->>'priority_score')::integer desc,(command->>'base_priority_score')::integer desc,command->>'title') as effective_rank
    from enriched
  )
  select coalesce(jsonb_agg(command||jsonb_build_object('rank',effective_rank) order by effective_rank),'[]'::jsonb)
  into v_commands from ranked where effective_rank<=v_limit;

  return jsonb_build_object('tenant_id',p_tenant_id,'generated_at',now(),
    'ranking_policy','urgency_plus_explainable_decision_value_v2_with_evidence_health',
    'evidence_policy',jsonb_build_object('priority_and_evidence_are_separate',true,'verify_first_threshold',65,'principle','High-value work stays high priority even when evidence is weak; weak evidence changes the operating mode rather than hiding the opportunity.'),
    'commands',v_commands);
end;
$$;

revoke all on function public.platform_server_agency_decisions(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_decisions(uuid,integer) to service_role;;
