create or replace function public.platform_server_governance_ledger(
  p_tenant_id uuid,
  p_limit integer default 100,
  p_category text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_items jsonb;
  v_total integer;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  with e as (
    select a.*,
      case
        when a.action like 'career_strategy.%' then 'career_strategy'
        when a.action like 'career_exception.%' then 'career_exception'
        when a.action='service_standards.updated' then 'service_standard'
        when a.action in ('agency_action.applied','agency_action.undone') then 'agency_action'
        when a.action like '%guardrail%' then 'negotiation_control'
        when a.action like '%origin%' then 'deal_provenance'
        when a.action like '%owner%' or a.action like '%assign%' then 'ownership'
        when a.action like 'player_service.%' then 'player_service'
        else 'platform_governance'
      end category,
      coalesce(tm.display_name,u.email,case when a.actor_kind='system' then 'System' else null end,a.actor_user_id::text) actor_name
    from platform.audit_events a
    left join auth.users u on u.id=a.actor_user_id
    left join djm_os.team_members tm on tm.user_id=a.actor_user_id
    where a.tenant_id=p_tenant_id
      and (
        a.action like 'career_strategy.%'
        or a.action like 'career_exception.%'
        or a.action='service_standards.updated'
        or a.action in ('agency_action.applied','agency_action.undone')
        or a.action like '%guardrail%'
        or a.action like '%origin%'
        or a.action like '%owner%'
        or a.action like '%assign%'
        or a.action like 'player_service.%'
        or a.action in ('customer_lifecycle.initialized','agency_command_engine.enabled','value_proof.enabled')
      )
  ), f as (
    select *,row_number() over(order by occurred_at desc,id desc) rn
    from e
    where p_category is null or category=p_category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'audit_event_id',id,
    'occurred_at',occurred_at,
    'category',category,
    'action',action,
    'actor',jsonb_build_object('user_id',actor_user_id,'kind',actor_kind,'name',actor_name),
    'entity',jsonb_build_object('type',entity_type,'id',entity_id),
    'decision_state',case
      when action like '%.approved' then 'approved'
      when action like '%.withdrawn' or action='agency_action.undone' then 'withdrawn_or_undone'
      when action like '%.player_confirmed' then 'player_confirmed'
      when action='agency_action.applied' then 'applied'
      when action like '%.saved' or action like '%.updated' then 'recorded'
      else 'event'
    end,
    'reversibility',case
      when action='agency_action.applied' then coalesce((metadata->>'undo_supported')::boolean,false)
      when action='agency_action.undone' then true
      else null end,
    'correlation',jsonb_build_object('request_id',request_id,'correlation_id',correlation_id),
    'metadata_summary',jsonb_strip_nulls(jsonb_build_object(
      'command_id',metadata->>'command_id',
      'action_type',metadata->>'action_type',
      'player_id',metadata->>'player_id',
      'player_match_id',metadata->>'player_match_id',
      'deal_room_id',metadata->>'deal_room_id',
      'confirmation_method',metadata->>'confirmation_method',
      'policy_name',metadata->>'policy_name',
      'reason',case when length(coalesce(metadata->>'reason',''))<=240 then metadata->>'reason' else left(metadata->>'reason',237)||'...' end
    )),
    'raw_state_available',(before_state is not null or after_state is not null)
  ) order by rn) filter(where rn<=v_limit),'[]'::jsonb),count(*)
  into v_items,v_total from f;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'category_filter',p_category,
    'total_matching_events',v_total,'items',v_items,
    'truth_contract',jsonb_build_object(
      'purpose','Auditable timeline of controlled agency decisions and operating changes.',
      'privacy','Raw before/after state is intentionally not included in the default ledger response because it may contain private player, commercial or negotiation information.',
      'completeness','Only actions written to the platform audit ledger are visible. Offline decisions are not inferred.'
    )
  );
end;
$function$;

create or replace function public.platform_server_go_live_readiness(p_tenant_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant platform.tenants%rowtype;
  v_assurance jsonb;
  v_rep jsonb;
  v_learning jsonb;
  v_capacity jsonb;
  v_checks jsonb:='[]'::jsonb;
  v_blockers integer:=0;
  v_gaps integer:=0;
  v_ready integer:=0;
  v_owner_admin integer:=0;
  v_branding boolean:=false;
  v_active_players integer:=0;
  v_onboarding_required integer:=0;
  v_onboarding_open integer:=0;
  v_domain_verified integer:=0;
  v_integrations_connected integer:=0;
  v_player_ownership_gaps integer:=0;
  v_deal_ownership_gaps integer:=0;
  v_strategy_gaps integer:=0;
  v_rep_gaps integer:=0;
  v_control_breaches integer:=0;
  v_origin_missing integer:=0;
  v_guardrail_missing integer:=0;
  v_state text;
begin
  select * into v_tenant from platform.tenants t where t.id=p_tenant_id and t.status='active';
  if not found then raise exception 'tenant_not_found'; end if;

  select count(*) into v_owner_admin from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin');
  select exists(select 1 from platform.tenant_branding b where b.tenant_id=p_tenant_id and nullif(trim(b.display_name),'') is not null) into v_branding;
  select count(*) into v_active_players from public.players p where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent');
  select count(*),count(*) filter(where status<>'completed') into v_onboarding_required,v_onboarding_open
    from platform.tenant_onboarding_tasks ot where ot.tenant_id=p_tenant_id and ot.required=true;
  select count(*) into v_domain_verified from platform.tenant_domains d where d.tenant_id=p_tenant_id and d.status='verified';
  select count(*) into v_integrations_connected from platform.tenant_integrations i where i.tenant_id=p_tenant_id and i.status in ('connected','healthy','active');

  v_assurance:=public.platform_server_service_assurance_v2(p_tenant_id,500);
  v_rep:=public.platform_server_representation_records_control(p_tenant_id,120);
  v_learning:=public.platform_server_learning_center(p_tenant_id);
  v_capacity:=public.platform_server_team_capacity(p_tenant_id);

  v_player_ownership_gaps:=coalesce((v_capacity#>>'{summary,active_players_without_primary_owner}')::integer,0);
  v_deal_ownership_gaps:=coalesce((v_capacity#>>'{summary,active_deals_without_owner}')::integer,0);
  v_strategy_gaps:=coalesce((v_learning#>>'{data_flywheel,active_players}')::integer,0)-coalesce((v_learning#>>'{data_flywheel,player_confirmed_career_strategies}')::integer,0);
  v_rep_gaps:=coalesce((v_rep#>>'{summary,records_needing_review}')::integer,0);
  v_control_breaches:=coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0);
  select count(*) into v_origin_missing from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) q where q#>>'{breach,code}'='deal_origin_missing';
  select count(*) into v_guardrail_missing from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) q where q#>>'{breach,code}'='negotiation_guardrails_missing';

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','owner_admin_access','category','identity_and_control','state',case when v_owner_admin>0 then 'ready' else 'blocker' end,
    'fact',format('%s active owner/admin membership(s) recorded.',v_owner_admin),
    'required_action',case when v_owner_admin=0 then 'Add at least one accountable owner or administrator before operational use.' else null end));
  if v_owner_admin>0 then v_ready:=v_ready+1; else v_blockers:=v_blockers+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','agency_branding','category','agency_setup','state',case when v_branding then 'ready' else 'gap' end,
    'fact',case when v_branding then 'Agency display branding is configured.' else 'No tenant branding record with a display name is configured.' end,
    'required_action',case when not v_branding then 'Configure agency display identity before client-facing rollout.' else null end));
  if v_branding then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','active_roster','category','data_foundation','state',case when v_active_players>0 then 'ready' else 'gap' end,
    'fact',format('%s active/free-agent player record(s) are present.',v_active_players),
    'required_action',case when v_active_players=0 then 'Import or create the active roster before evaluating player-service readiness.' else null end));
  if v_active_players>0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','onboarding_tasks','category','agency_setup','state',case when v_onboarding_open=0 then 'ready' else 'gap' end,
    'fact',format('%s required onboarding task(s); %s remain open.',v_onboarding_required,v_onboarding_open),
    'required_action',case when v_onboarding_open>0 then 'Complete or deliberately resolve the remaining required onboarding tasks.' else null end));
  if v_onboarding_open=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','player_ownership','category','accountability','state',case when v_player_ownership_gaps=0 then 'ready' else 'gap' end,
    'fact',format('%s active player(s) do not have a primary staff owner.',v_player_ownership_gaps),
    'required_action',case when v_player_ownership_gaps>0 then 'Assign one accountable primary owner to each active player.' else null end));
  if v_player_ownership_gaps=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','deal_ownership','category','accountability','state',case when v_deal_ownership_gaps=0 then 'ready' else 'gap' end,
    'fact',format('%s active deal(s) do not have an accountable owner.',v_deal_ownership_gaps),
    'required_action',case when v_deal_ownership_gaps>0 then 'Assign accountable owners to active deals.' else null end));
  if v_deal_ownership_gaps=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','player_career_strategy','category','player_service','state',case when v_strategy_gaps<=0 then 'ready' else 'gap' end,
    'fact',format('%s active player(s) do not yet have player-confirmed career strategy coverage.',greatest(v_strategy_gaps,0)),
    'required_action',case when v_strategy_gaps>0 then 'Complete the human-owned career strategy and player-confirmation workflow for the uncovered players.' else null end));
  if v_strategy_gaps<=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','representation_records','category','records_control','state',case when v_rep_gaps=0 then 'ready' else 'gap' end,
    'fact',format('%s representation/mandate record(s) need review.',v_rep_gaps),
    'required_action',case when v_rep_gaps>0 then 'Review representation records and migrate/link the applicable active records and documents.' else null end));
  if v_rep_gaps=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','operating_assurance','category','operating_control','state',case when v_control_breaches=0 then 'ready' else 'gap' end,
    'fact',format('%s current operating-standard breach(es) are recorded.',v_control_breaches),
    'required_action',case when v_control_breaches>0 then 'Work the Service Assurance queue until the agency-defined operating controls are inside standard.' else null end));
  if v_control_breaches=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','serious_deal_provenance','category','deal_control','state',case when v_origin_missing=0 then 'ready' else 'gap' end,
    'fact',format('%s serious deal(s) lack confirmed origin attribution.',v_origin_missing),
    'required_action',case when v_origin_missing>0 then 'Record human-confirmed deal origin before relying on route-learning or provenance reporting.' else null end));
  if v_origin_missing=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','negotiation_control','category','deal_control','state',case when v_guardrail_missing=0 then 'ready' else 'gap' end,
    'fact',format('%s deal(s) at/above the negotiation threshold lack approved guardrails.',v_guardrail_missing),
    'required_action',case when v_guardrail_missing>0 then 'Agree and approve negotiation guardrails before progressing terms.' else null end));
  if v_guardrail_missing=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','verified_domain','category','white_label_rollout','state',case when v_domain_verified>0 then 'ready' else 'optional_gap' end,
    'fact',format('%s verified custom domain(s) recorded.',v_domain_verified),
    'required_action',case when v_domain_verified=0 then 'Verify a custom domain when moving to a white-labelled client rollout; not required for internal controlled use.' else null end));

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','connected_integrations','category','automation_rollout','state',case when v_integrations_connected>0 then 'ready' else 'optional_gap' end,
    'fact',format('%s integration(s) are recorded as connected/healthy/active.',v_integrations_connected),
    'required_action',case when v_integrations_connected=0 then 'Connect supported systems where the agency wants automated data capture; not required for manual controlled use.' else null end));

  v_state:=case when v_blockers>0 then 'blocked' when v_gaps>0 then 'controlled_use_with_gaps' else 'ready_for_controlled_use' end;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,
    'summary',jsonb_build_object('blockers',v_blockers,'operational_gaps',v_gaps,'ready_controls',v_ready,'optional_setup_gaps',(case when v_domain_verified=0 then 1 else 0 end)+(case when v_integrations_connected=0 then 1 else 0 end)),
    'checks',v_checks,
    'next_action',case
      when v_blockers>0 then jsonb_build_object('action','resolve_blockers','reason','At least one identity/control prerequisite blocks controlled operational use.')
      when v_player_ownership_gaps>0 then jsonb_build_object('action','assign_player_owners','reason','Accountability is the first operational gap to resolve.')
      when v_strategy_gaps>0 then jsonb_build_object('action','complete_player_strategies','reason','Player-confirmed career strategy coverage is incomplete.')
      when v_rep_gaps>0 then jsonb_build_object('action','migrate_representation_records','reason','Representation records need review before the agency treats the data foundation as complete.')
      when v_control_breaches>0 then jsonb_build_object('action','work_service_assurance_queue','reason','Recorded operating controls still sit outside the agency standard.')
      else jsonb_build_object('action','controlled_go_live','reason','No required operational readiness gaps remain.') end,
    'truth_contract',jsonb_build_object(
      'purpose','Product-operational readiness for controlled agency use.',
      'not_legal_certification','This is not legal, regulatory, data-protection, FIFA-agent or financial compliance certification.',
      'optional_setup','Custom domains and integrations are treated as optional for controlled manual use and become more important for full white-label/automation rollout.',
      'imports','Generic import batches are not counted because they are not tenant-keyed directly; readiness refuses to infer agency ownership from the submitter alone.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_governance_ledger(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.platform_server_go_live_readiness(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_governance_ledger(uuid,integer,text) to service_role;
grant execute on function public.platform_server_go_live_readiness(uuid) to service_role;;
