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
    select c.value as command
    from jsonb_array_elements(coalesce(v_raw->'commands','[]'::jsonb)) c
  ), profiled as (
    select command,
           profile,
           platform.command_evidence_health(p_tenant_id,command) as health,
           platform.command_actionability(command) as base_actionability
    from expanded
    cross join lateral platform.command_priority_profile(command) profile
  ), enriched as (
    select command || jsonb_build_object(
      'base_priority_score',(command->>'priority_score')::integer,
      'priority_score',(profile->>'effective_score')::integer,
      'priority_band',profile->>'effective_band',
      'decision_basis',profile,
      'evidence_health',health,
      'actionability',
        case
          when health->>'operating_mode'='verify_first'
               and command->>'source_type' in ('deal_room','club_need','player')
               and base_actionability->>'mode' <> 'review_only'
          then jsonb_build_object(
            'cta','Verify evidence',
            'mode','one_tap',
            'risk_level','low',
            'action_type','create_verification_task',
            'undo_expected',true,
            'requires_input',false,
            'external_side_effect',false,
            'evidence_gate','verify_first',
            'blocked_action',base_actionability
          )
          else base_actionability || jsonb_build_object(
            'evidence_gate',case when health->>'operating_mode'='verify_first' then 'verify_first_review_only' else 'ready' end
          )
        end
    ) as command
    from profiled
  ), ranked as (
    select command,
           row_number() over(
             order by (command->>'priority_score')::integer desc,
                      (command->>'base_priority_score')::integer desc,
                      command->>'title'
           ) as effective_rank
    from enriched
  )
  select coalesce(jsonb_agg(command || jsonb_build_object('rank',effective_rank) order by effective_rank),'[]'::jsonb)
  into v_commands
  from ranked
  where effective_rank <= v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'ranking_policy','urgency_plus_explainable_decision_value_v2_with_evidence_health',
    'evidence_policy',jsonb_build_object(
      'priority_and_evidence_are_separate',true,
      'verify_first_threshold',65,
      'principle','High-value work stays high priority even when evidence is weak; weak evidence changes the operating mode rather than hiding the opportunity.'
    ),
    'commands',v_commands
  );
end;
$$;

revoke all on function public.platform_server_agency_decisions(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_decisions(uuid,integer) to service_role;;
