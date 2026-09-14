create or replace function platform.command_verification_plan(p_tenant_id uuid, p_command jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_health jsonb:=coalesce(p_command->'evidence_health',platform.command_evidence_health_v2(p_tenant_id,p_command));
  v_score integer:=coalesce((v_health->>'score')::integer,0);
  v_priority integer:=coalesce((p_command->>'priority_score')::integer,0);
  v_source_type text:=p_command->>'source_type';
  v_source_id uuid;
  v_org_id uuid;
  v_player_id uuid;
  v_need_id uuid;
  v_access jsonb;
  v_best_route jsonb;
  v_questions jsonb:='[]'::jsonb;
  v_criteria jsonb:='[]'::jsonb;
  v_reasons jsonb:=coalesce(v_health->'verify_reasons','[]'::jsonb);
  v_value integer;
  v_factor text;
  v_factor_score integer:=101;
begin
  begin v_source_id:=nullif(p_command->>'source_id','')::uuid; exception when others then v_source_id:=null; end;
  begin v_player_id:=nullif(p_command->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
  begin v_need_id:=nullif(p_command->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end;

  if v_source_type='deal_room' then
    select d.organisation_id,coalesce(v_player_id,d.player_id),coalesce(v_need_id,d.club_need_id)
    into v_org_id,v_player_id,v_need_id
    from djm_os.deal_rooms d where d.id=v_source_id and d.tenant_id=p_tenant_id;
    v_questions:=jsonb_build_array(
      'Is the club interest still live today?',
      'What is the current blocker or decision dependency?',
      'Who owns the next decision and when is it expected?',
      'Has the player availability, medical, financial or registration position changed?'
    );
    v_criteria:=jsonb_build_array('Fresh meaningful club interaction','Current blocker confirmed','Next decision owner/timing recorded');
  elsif v_source_type='club_need' then
    select n.organisation_id,n.id into v_org_id,v_need_id from djm_os.club_needs n where n.id=v_source_id and n.tenant_id=p_tenant_id;
    v_questions:=jsonb_build_array(
      'Is the requirement still live?',
      'What exact player profile and position does the club want?',
      'What are the transfer type, budget and timing constraints?',
      'Who at the club directly confirmed the requirement?'
    );
    v_criteria:=jsonb_build_array('Direct club confirmation or attributable interaction','Current position/profile recorded','Timing and material constraints recorded');
  elsif v_source_type='player' then
    v_player_id:=v_source_id;
    v_questions:=jsonb_build_array(
      'What is the player’s current availability and contract position?',
      'Have club, injury, registration or playing-status facts changed?',
      'What is the player’s current career preference and next action?'
    );
    v_criteria:=jsonb_build_array('Current player facts verified','Material status conflicts resolved','Next action based on verified player context');
  elsif v_source_type='capture' then
    v_questions:=jsonb_build_array(
      'Which exact person, club or player does this note refer to?',
      'Which statement should be treated as the factual claim?',
      'Is the information direct, inferred or second-hand?',
      'What additional context is required before Tell DJM can apply it safely?'
    );
    v_criteria:=jsonb_build_array('Identity resolved','Claim meaning resolved','Source/provenance understood','Ambiguity removed before applying data changes');
  else
    v_questions:=jsonb_build_array('What material fact is missing or stale?','What source can directly verify it?','What evidence would be sufficient to proceed safely?');
    v_criteria:=jsonb_build_array('Material uncertainty resolved','Evidence health reaches the action threshold');
  end if;

  if v_reasons ? 'evidence_is_stale' then
    v_questions:=jsonb_build_array('What has changed since the last reliable observation?')||v_questions;
    v_criteria:=v_criteria||jsonb_build_array('Fresh observation recorded');
  end if;
  if v_reasons ? 'source_provenance_is_weak' then
    v_questions:=jsonb_build_array('Can this be confirmed directly by the club, player or authoritative source?')||v_questions;
    v_criteria:=v_criteria||jsonb_build_array('Direct or attributable source recorded');
  end if;
  if v_reasons ? 'supporting_evidence_is_thin' then
    v_criteria:=v_criteria||jsonb_build_array('Independent corroborating evidence or second meaningful interaction recorded');
  end if;
  if v_reasons ? 'material_fields_are_missing' then
    v_questions:=v_questions||jsonb_build_array('Which missing field would change the decision if it were different?');
  end if;
  if v_reasons ? 'contradictory_evidence_requires_review' then
    v_questions:=jsonb_build_array('Which conflicting version is current, and which evidence should be superseded?')||v_questions;
    v_criteria:=v_criteria||jsonb_build_array('Contradictory claims resolved or superseded');
  end if;

  if v_org_id is not null then
    v_access:=public.platform_server_access_routes(p_tenant_id,v_org_id,3);
    v_best_route:=v_access->'best_route';
  end if;

  select factor_name,factor_score into v_factor,v_factor_score
  from (values
    ('freshness'::text,coalesce((v_health->'factors'->'freshness'->>'score')::integer,100)),
    ('provenance',coalesce((v_health->'factors'->'provenance'->>'score')::integer,100)),
    ('corroboration',coalesce((v_health->'factors'->'corroboration'->>'score')::integer,100)),
    ('completeness',coalesce((v_health->'factors'->'completeness'->>'score')::integer,100)),
    ('consistency',coalesce((v_health->'factors'->'consistency'->>'score')::integer,100))
  ) f(factor_name,factor_score)
  order by factor_score asc,factor_name limit 1;

  v_value:=round(v_priority::numeric * greatest(0,100-v_score)::numeric/100.0)::integer;

  return jsonb_build_object(
    'command_id',p_command->>'command_id','title',p_command->>'title','source_type',v_source_type,
    'priority_score',v_priority,'evidence_score',v_score,'evidence_state',v_health->>'state',
    'verification_value_score',v_value,
    'verification_value_interpretation','Deterministic attention score equal to decision priority multiplied by the evidence gap. It is not expected monetary value or probability.',
    'weakest_evidence_factor',jsonb_build_object('factor',v_factor,'score',v_factor_score),
    'verify_reasons',v_reasons,
    'questions',v_questions,
    'completion_criteria',v_criteria,
    'best_verification_route',case when v_best_route is null or v_best_route='null'::jsonb then null else v_best_route end,
    'route_guidance',case
      when v_best_route is not null and v_best_route<>'null'::jsonb then 'Use the strongest recorded relationship to verify the fact directly. Do not treat route strength as confirmation by itself.'
      when v_source_type='capture' then 'Human clarification is required because identity or meaning is unresolved.'
      when v_source_type='player' then 'Verify through the player, authorised representative or authoritative record; no club route is assumed.'
      else 'No reliable verification route is recorded. Establish provenance before acting.' end,
    'target_threshold',65,
    'current_health',v_health
  );
end;
$$;

create or replace function public.platform_server_verification_queue(p_tenant_id uuid, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),25));
  v_feed jsonb;
  v_items jsonb;
  v_total integer;
  v_important integer;
  v_top_value integer;
begin
  v_feed:=public.platform_server_agency_decisions(p_tenant_id,25);
  with commands as (
    select c.value as command from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
    where coalesce((c.value->'evidence_health'->>'score')::integer,100)<65
  ), plans as (
    select platform.command_verification_plan(p_tenant_id,command) as plan from commands
  ), ranked as (
    select plan,row_number() over(order by (plan->>'verification_value_score')::integer desc,(plan->>'priority_score')::integer desc,plan->>'title') as rank
    from plans
  )
  select coalesce(jsonb_agg(plan||jsonb_build_object('rank',rank) order by rank) filter(where rank<=v_limit),'[]'::jsonb),
         count(*)::integer,
         count(*) filter(where (plan->>'priority_score')::integer>=72)::integer,
         coalesce(max((plan->>'verification_value_score')::integer),0)
  into v_items,v_total,v_important,v_top_value
  from ranked;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,
    'summary',jsonb_build_object('verification_item_count',coalesce(v_total,0),'important_verification_count',coalesce(v_important,0),'top_verification_value_score',coalesce(v_top_value,0),'visible_count',jsonb_array_length(v_items),'hidden_by_limit',greatest(coalesce(v_total,0)-jsonb_array_length(v_items),0)),
    'principle','Verify the fact with the highest decision consequence and evidence gap first. Verification should reduce uncertainty, not merely produce activity.'
  );
end;
$$;

create or replace function public.platform_server_agency_home_executive(p_tenant_id uuid, p_command_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.platform_server_agency_home_full(p_tenant_id,p_command_limit)
         || jsonb_build_object(
              'strategic_plays',public.platform_server_agency_playbook(p_tenant_id,3),
              'pursuit_summary',public.platform_server_pursuit_board(p_tenant_id,20)->'summary',
              'evidence_risk',public.platform_server_evidence_risk_summary(p_tenant_id,3),
              'verification_queue',public.platform_server_verification_queue(p_tenant_id,3),
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$$;

create or replace function public.platform_server_agency_brief_executive(p_tenant_id uuid, p_window_hours integer default 24, p_decision_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.platform_server_agency_brief_full(p_tenant_id,p_window_hours,p_decision_limit)
         || jsonb_build_object(
              'pursuit_board',public.platform_server_pursuit_board(p_tenant_id,10),
              'strategic_playbook',public.platform_server_agency_playbook(p_tenant_id,8),
              'evidence_risk',public.platform_server_evidence_risk_summary(p_tenant_id,10),
              'verification_queue',public.platform_server_verification_queue(p_tenant_id,10),
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$$;

revoke all on function platform.command_verification_plan(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_verification_queue(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_agency_home_executive(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_agency_brief_executive(uuid,integer,integer) from public,anon,authenticated;
grant execute on function platform.command_verification_plan(uuid,jsonb) to service_role;
grant execute on function public.platform_server_verification_queue(uuid,integer) to service_role;
grant execute on function public.platform_server_agency_home_executive(uuid,integer) to service_role;
grant execute on function public.platform_server_agency_brief_executive(uuid,integer,integer) to service_role;;
