create or replace function public.platform_server_evidence_risk_summary(p_tenant_id uuid, p_limit integer default 10)
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
  v_exposure jsonb;
  v_total integer:=0;
  v_strong integer:=0;
  v_usable integer:=0;
  v_verify integer:=0;
  v_weak integer:=0;
  v_important_uncertain integer:=0;
  v_avg numeric:=null;
begin
  v_feed:=public.platform_server_agency_decisions(p_tenant_id,25);

  with commands as (
    select c.value as command
    from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
  )
  select count(*)::integer,
         count(*) filter(where command->'evidence_health'->>'state'='strong')::integer,
         count(*) filter(where command->'evidence_health'->>'state'='usable')::integer,
         count(*) filter(where command->'evidence_health'->>'state'='verify_first')::integer,
         count(*) filter(where command->'evidence_health'->>'state'='weak')::integer,
         count(*) filter(where (command->>'priority_score')::integer>=72 and coalesce((command->'evidence_health'->>'score')::integer,0)<65)::integer,
         round(avg((command->'evidence_health'->>'score')::numeric),1)
  into v_total,v_strong,v_usable,v_verify,v_weak,v_important_uncertain,v_avg
  from commands;

  with commands as (
    select c.value as command
    from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
  ), uncertain as (
    select command
    from commands
    where coalesce((command->'evidence_health'->>'score')::integer,0)<65
    order by (command->>'priority_score')::integer desc,command->>'title'
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'command_id',command->>'command_id',
    'title',command->>'title',
    'command_type',command->>'command_type',
    'source_type',command->>'source_type',
    'priority_score',(command->>'priority_score')::integer,
    'priority_band',command->>'priority_band',
    'evidence_score',(command->'evidence_health'->>'score')::integer,
    'evidence_state',command->'evidence_health'->>'state',
    'verify_reasons',command->'evidence_health'->'verify_reasons',
    'actionability',command->'actionability',
    'why_now',command->>'why_now'
  ) order by (command->>'priority_score')::integer desc,command->>'title'),'[]'::jsonb)
  into v_items
  from uncertain;

  with commands as (
    select c.value as command
    from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
    where c.value->>'source_type'='deal_room'
      and coalesce((c.value->'evidence_health'->>'score')::integer,0)<65
  ), grouped as (
    select coalesce(nullif(command->'evidence'->>'currency',''),'UNKNOWN') as currency,
           count(*)::integer as active_deals,
           coalesce(sum((command->'evidence'->>'expected_commission')::numeric),0) as expected_commission,
           coalesce(sum((command->'evidence'->>'expected_commission')::numeric * coalesce((command->'evidence'->>'probability')::numeric,0)/100.0),0) as weighted_commission
    from commands
    group by coalesce(nullif(command->'evidence'->>'currency',''),'UNKNOWN')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',round(weighted_commission,2)
  ) order by currency),'[]'::jsonb)
  into v_exposure
  from grouped;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'summary',jsonb_build_object(
      'decision_count',v_total,
      'strong_count',v_strong,
      'usable_count',v_usable,
      'verify_first_count',v_verify,
      'weak_count',v_weak,
      'important_uncertain_count',v_important_uncertain,
      'average_evidence_score',v_avg,
      'commercial_exposure_blocked_by_weak_evidence',v_exposure
    ),
    'important_uncertain_items',v_items,
    'policy',jsonb_build_object(
      'verify_first_threshold',65,
      'important_priority_threshold',72,
      'principle','Priority measures importance. Evidence health measures how safely the recorded facts support action. High priority with weak evidence creates verification work rather than disappearing from attention.'
    )
  );
end;
$$;

revoke all on function public.platform_server_evidence_risk_summary(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_evidence_risk_summary(uuid,integer) to service_role;

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
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$$;

revoke all on function public.platform_server_agency_home_executive(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_agency_brief_executive(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_home_executive(uuid,integer) to service_role;
grant execute on function public.platform_server_agency_brief_executive(uuid,integer,integer) to service_role;;
