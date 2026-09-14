create or replace function platform.build_player_relationship_control(p_tenant_id uuid,p_assurance jsonb,p_rep jsonb,p_limit integer default 100)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_items jsonb; v_total integer:=0; v_immediate integer:=0; v_gaps integer:=0; v_controlled integer:=0;
begin
  with players as (
    select p.id,p.first_name,p.last_name,p.football_status,p.contract_status,p.contract_expiry,p.primary_staff_user_id,p.next_action,p.next_action_due,
      coalesce(m.active_deals,0)::integer active_deals,coalesce(m.market_matches,0)::integer market_matches,coalesce(m.active_opportunities,0)::integer active_opportunities,
      coalesce(r.open_requests,0)::integer open_requests,coalesce(r.overdue_requests,0)::integer overdue_requests,
      greatest(t.last_task_at,d.last_deal_activity_at,r.last_request_at,s.last_strategy_at) last_recorded_service_activity_at
    from public.players p
    left join lateral (
      select (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id and d.status='active') active_deals,
             (select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p.id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')) market_matches,
             (select count(*) from public.player_opportunities po where po.tenant_id=p_tenant_id and po.player_id=p.id and po.stage not in ('won','lost')) active_opportunities
    ) m on true
    left join lateral (select count(*) filter(where pr.status<>'completed') open_requests,count(*) filter(where pr.status<>'completed' and pr.due_at is not null and pr.due_at<now()) overdue_requests,max(pr.updated_at) last_request_at from public.player_requests pr where pr.player_id=p.id) r on true
    left join lateral (select max(t.updated_at) last_task_at from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p.id) t on true
    left join lateral (select max(coalesce(d.last_meaningful_at,d.updated_at)) last_deal_activity_at from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id) d on true
    left join lateral (select max(cs.updated_at) last_strategy_at from platform.player_career_strategies cs where cs.tenant_id=p_tenant_id and cs.player_id=p.id) s on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), joined as (
    select p.*,coalesce(a.value->'breaches','[]'::jsonb) service_breaches,coalesce(a.value->>'state','not_evaluated') service_state,
      coalesce(rep.value->>'state','not_recorded') representation_state,coalesce(rep.value->>'attention','info') representation_attention,
      (select count(*) from jsonb_array_elements(coalesce(a.value->'breaches','[]'::jsonb)) b where b->>'severity'='high')::integer high_service_breaches,
      (select q.value->'action_plan' from jsonb_array_elements(coalesce(p_assurance->'operating_queue','[]'::jsonb)) q where q.value->>'entity_type'='player' and q.value->>'entity_id'=p.id::text order by case q.value#>>'{breach,severity}' when 'high' then 1 else 2 end limit 1) first_action_plan,
      (select q.value->'breach' from jsonb_array_elements(coalesce(p_assurance->'operating_queue','[]'::jsonb)) q where q.value->>'entity_type'='player' and q.value->>'entity_id'=p.id::text order by case q.value#>>'{breach,severity}' when 'high' then 1 else 2 end limit 1) first_breach
    from players p
    left join lateral (select value from jsonb_array_elements(coalesce(p_assurance->'players','[]'::jsonb)) where value->>'player_id'=p.id::text limit 1) a on true
    left join lateral (select value from jsonb_array_elements(coalesce(p_rep->'players','[]'::jsonb)) where value->>'player_id'=p.id::text limit 1) rep on true
  ), classified as (
    select j.*,case when j.high_service_breaches>0 or j.overdue_requests>0 then 'immediate_service_intervention' when jsonb_array_length(j.service_breaches)>0 then 'service_control_gap' when j.representation_attention in ('high','medium') then 'records_control_gap' when j.active_deals+j.market_matches+j.active_opportunities>0 then 'active_market_service' else 'maintained_no_active_market_process' end relationship_control_state,
      case when j.high_service_breaches>0 or j.overdue_requests>0 then 1 when jsonb_array_length(j.service_breaches)>0 then 2 when j.representation_attention in ('high','medium') then 3 when j.active_deals+j.market_matches+j.active_opportunities>0 then 4 else 5 end control_rank
    from joined j
  ), ranked as (
    select *,row_number() over(order by control_rank,case when football_status='free_agent' then 0 else 1 end,contract_expiry nulls last,last_recorded_service_activity_at nulls first,trim(concat_ws(' ',first_name,last_name))) rn from classified
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rn,'player_id',id,'player_name',trim(concat_ws(' ',first_name,last_name)),'football_status',football_status,'contract_status',contract_status,'contract_expiry',contract_expiry,'state',relationship_control_state,
    'service_control',jsonb_build_object('state',service_state,'breaches',service_breaches,'high_breach_count',high_service_breaches,'first_breach',first_breach,'next_allowed_workflow',first_action_plan),
    'representation_control',jsonb_build_object('state',representation_state,'attention',representation_attention),
    'market_service',jsonb_build_object('active_deals',active_deals,'market_matches',market_matches,'active_opportunities',active_opportunities),
    'player_requests',jsonb_build_object('open',open_requests,'overdue',overdue_requests),
    'service_plan',jsonb_build_object('next_action',next_action,'next_action_due',next_action_due,'has_primary_owner',primary_staff_user_id is not null),
    'last_recorded_service_activity_at',last_recorded_service_activity_at,'days_since_recorded_service_activity',case when last_recorded_service_activity_at is null then null else floor(extract(epoch from (now()-last_recorded_service_activity_at))/86400)::integer end,
    'player_safe_statement_action',jsonb_build_object('api_action','player_service_statement','player_id',id)
  ) order by rn) filter(where rn<=v_limit),'[]'::jsonb),count(*),count(*) filter(where relationship_control_state='immediate_service_intervention'),count(*) filter(where relationship_control_state in ('service_control_gap','records_control_gap')),count(*) filter(where relationship_control_state in ('active_market_service','maintained_no_active_market_process'))
  into v_items,v_total,v_immediate,v_gaps,v_controlled from ranked;
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'summary',jsonb_build_object('active_players',v_total,'immediate_service_interventions',v_immediate,'other_control_gaps',v_gaps,'controlled_players',v_controlled),'items',v_items,'principle','Protect player relationships through factual service continuity and accountability. Do not infer loyalty, satisfaction or churn probability from operational records.','truth_contract',jsonb_build_object('no_churn_prediction','The state is not a prediction that a player will leave the agency.','activity','Last recorded service activity is the latest captured task, player request, deal activity or career-strategy update. Offline conversations that are not recorded remain invisible.','representation','Representation-record attention is factual records control, not a legal enforceability judgement.','priority','Immediate intervention is driven by recorded high-severity service breaches or overdue player requests, not subjective player importance.'));
end;
$$;

create or replace function public.platform_server_player_relationship_control(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,500); v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120); begin return platform.build_player_relationship_control(p_tenant_id,v_assurance,v_rep,p_limit); end;
$$;

create or replace function platform.build_go_live_readiness(p_tenant_id uuid,p_assurance jsonb,p_rep jsonb,p_learning jsonb,p_capacity jsonb)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_tenant platform.tenants%rowtype; v_checks jsonb:='[]'::jsonb; v_blockers integer:=0; v_gaps integer:=0; v_ready integer:=0;
  v_owner_admin integer:=0; v_branding boolean:=false; v_active_players integer:=0; v_onboarding_required integer:=0; v_onboarding_open integer:=0; v_domain_verified integer:=0; v_integrations_connected integer:=0;
  v_player_ownership_gaps integer:=0; v_deal_ownership_gaps integer:=0; v_strategy_gaps integer:=0; v_rep_gaps integer:=0; v_control_breaches integer:=0; v_origin_missing integer:=0; v_guardrail_missing integer:=0; v_state text;
begin
  select * into v_tenant from platform.tenants t where t.id=p_tenant_id and t.status='active'; if not found then raise exception 'tenant_not_found'; end if;
  select count(*) into v_owner_admin from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin');
  select exists(select 1 from platform.tenant_branding b where b.tenant_id=p_tenant_id and nullif(trim(b.display_name),'') is not null) into v_branding;
  select count(*) into v_active_players from public.players p where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent');
  select count(*),count(*) filter(where status<>'completed') into v_onboarding_required,v_onboarding_open from platform.tenant_onboarding_tasks ot where ot.tenant_id=p_tenant_id and ot.required=true;
  select count(*) into v_domain_verified from platform.tenant_domains d where d.tenant_id=p_tenant_id and d.status='verified';
  select count(*) into v_integrations_connected from platform.tenant_integrations i where i.tenant_id=p_tenant_id and i.status in ('connected','healthy','active');
  v_player_ownership_gaps:=coalesce((p_capacity#>>'{summary,active_players_without_primary_owner}')::integer,0);
  v_deal_ownership_gaps:=coalesce((p_capacity#>>'{summary,active_deals_without_owner}')::integer,0);
  v_strategy_gaps:=coalesce((p_learning#>>'{data_flywheel,active_players}')::integer,0)-coalesce((p_learning#>>'{data_flywheel,player_confirmed_career_strategies}')::integer,0);
  v_rep_gaps:=coalesce((p_rep#>>'{summary,records_needing_review}')::integer,0);
  v_control_breaches:=coalesce((p_assurance#>>'{summary,total_breaches}')::integer,0);
  select count(*) into v_origin_missing from jsonb_array_elements(coalesce(p_assurance->'operating_queue','[]'::jsonb)) q where q#>>'{breach,code}'='deal_origin_missing';
  select count(*) into v_guardrail_missing from jsonb_array_elements(coalesce(p_assurance->'operating_queue','[]'::jsonb)) q where q#>>'{breach,code}'='negotiation_guardrails_missing';
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','owner_admin_access','category','identity_and_control','state',case when v_owner_admin>0 then 'ready' else 'blocker' end,'fact',format('%s active owner/admin membership(s) recorded.',v_owner_admin),'required_action',case when v_owner_admin=0 then 'Add at least one accountable owner or administrator before operational use.' else null end)); if v_owner_admin>0 then v_ready:=v_ready+1; else v_blockers:=v_blockers+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','agency_branding','category','agency_setup','state',case when v_branding then 'ready' else 'gap' end,'fact',case when v_branding then 'Agency display branding is configured.' else 'No tenant branding record with a display name is configured.' end,'required_action',case when not v_branding then 'Configure agency display identity before client-facing rollout.' else null end)); if v_branding then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','active_roster','category','data_foundation','state',case when v_active_players>0 then 'ready' else 'gap' end,'fact',format('%s active/free-agent player record(s) are present.',v_active_players),'required_action',case when v_active_players=0 then 'Import or create the active roster before evaluating player-service readiness.' else null end)); if v_active_players>0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','onboarding_tasks','category','agency_setup','state',case when v_onboarding_open=0 then 'ready' else 'gap' end,'fact',format('%s required onboarding task(s); %s remain open.',v_onboarding_required,v_onboarding_open),'required_action',case when v_onboarding_open>0 then 'Complete or deliberately resolve the remaining required onboarding tasks.' else null end)); if v_onboarding_open=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','player_ownership','category','accountability','state',case when v_player_ownership_gaps=0 then 'ready' else 'gap' end,'fact',format('%s active player(s) do not have a primary staff owner.',v_player_ownership_gaps),'required_action',case when v_player_ownership_gaps>0 then 'Assign one accountable primary owner to each active player.' else null end)); if v_player_ownership_gaps=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','deal_ownership','category','accountability','state',case when v_deal_ownership_gaps=0 then 'ready' else 'gap' end,'fact',format('%s active deal(s) do not have an accountable owner.',v_deal_ownership_gaps),'required_action',case when v_deal_ownership_gaps>0 then 'Assign accountable owners to active deals.' else null end)); if v_deal_ownership_gaps=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','player_career_strategy','category','player_service','state',case when v_strategy_gaps<=0 then 'ready' else 'gap' end,'fact',format('%s active player(s) do not yet have player-confirmed career strategy coverage.',greatest(v_strategy_gaps,0)),'required_action',case when v_strategy_gaps>0 then 'Complete the human-owned career strategy and player-confirmation workflow for the uncovered players.' else null end)); if v_strategy_gaps<=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','representation_records','category','records_control','state',case when v_rep_gaps=0 then 'ready' else 'gap' end,'fact',format('%s representation/mandate record(s) need review.',v_rep_gaps),'required_action',case when v_rep_gaps>0 then 'Review representation records and migrate/link the applicable active records and documents.' else null end)); if v_rep_gaps=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','operating_assurance','category','operating_control','state',case when v_control_breaches=0 then 'ready' else 'gap' end,'fact',format('%s current operating-standard breach(es) are recorded.',v_control_breaches),'required_action',case when v_control_breaches>0 then 'Work the Service Assurance queue until the agency-defined operating controls are inside standard.' else null end)); if v_control_breaches=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','serious_deal_provenance','category','deal_control','state',case when v_origin_missing=0 then 'ready' else 'gap' end,'fact',format('%s serious deal(s) lack confirmed origin attribution.',v_origin_missing),'required_action',case when v_origin_missing>0 then 'Record human-confirmed deal origin before relying on route-learning or provenance reporting.' else null end)); if v_origin_missing=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','negotiation_control','category','deal_control','state',case when v_guardrail_missing=0 then 'ready' else 'gap' end,'fact',format('%s deal(s) at/above the negotiation threshold lack approved guardrails.',v_guardrail_missing),'required_action',case when v_guardrail_missing>0 then 'Agree and approve negotiation guardrails before progressing terms.' else null end)); if v_guardrail_missing=0 then v_ready:=v_ready+1; else v_gaps:=v_gaps+1; end if;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','verified_domain','category','white_label_rollout','state',case when v_domain_verified>0 then 'ready' else 'optional_gap' end,'fact',format('%s verified custom domain(s) recorded.',v_domain_verified),'required_action',case when v_domain_verified=0 then 'Verify a custom domain when moving to a white-labelled client rollout; not required for internal controlled use.' else null end));
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','connected_integrations','category','automation_rollout','state',case when v_integrations_connected>0 then 'ready' else 'optional_gap' end,'fact',format('%s integration(s) are recorded as connected/healthy/active.',v_integrations_connected),'required_action',case when v_integrations_connected=0 then 'Connect supported systems where the agency wants automated data capture; not required for manual controlled use.' else null end));
  v_state:=case when v_blockers>0 then 'blocked' when v_gaps>0 then 'controlled_use_with_gaps' else 'ready_for_controlled_use' end;
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,'summary',jsonb_build_object('blockers',v_blockers,'operational_gaps',v_gaps,'ready_controls',v_ready,'optional_setup_gaps',(case when v_domain_verified=0 then 1 else 0 end)+(case when v_integrations_connected=0 then 1 else 0 end)),'checks',v_checks,'next_action',case when v_blockers>0 then jsonb_build_object('action','resolve_blockers','reason','At least one identity/control prerequisite blocks controlled operational use.') when v_player_ownership_gaps>0 then jsonb_build_object('action','assign_player_owners','reason','Accountability is the first operational gap to resolve.') when v_strategy_gaps>0 then jsonb_build_object('action','complete_player_strategies','reason','Player-confirmed career strategy coverage is incomplete.') when v_rep_gaps>0 then jsonb_build_object('action','migrate_representation_records','reason','Representation records need review before the agency treats the data foundation as complete.') when v_control_breaches>0 then jsonb_build_object('action','work_service_assurance_queue','reason','Recorded operating controls still sit outside the agency standard.') else jsonb_build_object('action','controlled_go_live','reason','No required operational readiness gaps remain.') end,'truth_contract',jsonb_build_object('purpose','Product-operational readiness for controlled agency use.','not_legal_certification','This is not legal, regulatory, data-protection, FIFA-agent or financial compliance certification.','optional_setup','Custom domains and integrations are treated as optional for controlled manual use and become more important for full white-label/automation rollout.','imports','Generic import batches are not counted because they are not tenant-keyed directly; readiness refuses to infer agency ownership from the submitter alone.'));
end;
$$;

create or replace function public.platform_server_go_live_readiness(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,500); v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120); v_learning jsonb:=public.platform_server_learning_center(p_tenant_id); v_capacity jsonb:=public.platform_server_team_capacity(p_tenant_id); begin return platform.build_go_live_readiness(p_tenant_id,v_assurance,v_rep,v_learning,v_capacity); end;
$$;

revoke all on function platform.build_player_relationship_control(uuid,jsonb,jsonb,integer) from public,anon,authenticated;
revoke all on function platform.build_go_live_readiness(uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_player_relationship_control(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_go_live_readiness(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_relationship_control(uuid,integer) to service_role;
grant execute on function public.platform_server_go_live_readiness(uuid) to service_role;

create or replace function public.platform_server_agency_control_centre(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,50);
  v_roster jsonb:=public.platform_server_roster_command(p_tenant_id,12);
  v_demand jsonb:=public.platform_server_demand_control_fast(p_tenant_id,100);
  v_origination jsonb:=platform.build_origination_from_demand(p_tenant_id,v_demand,12);
  v_scouting jsonb:=platform.build_scouting_from_demand(p_tenant_id,v_demand,10);
  v_revenue jsonb:=public.platform_server_revenue_command(p_tenant_id,10);
  v_capacity jsonb:=public.platform_server_team_capacity(p_tenant_id);
  v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120);
  v_learning jsonb:=public.platform_server_learning_center(p_tenant_id);
  v_ready jsonb:=platform.build_go_live_readiness(p_tenant_id,v_assurance,v_rep,v_learning,v_capacity);
  v_relationships jsonb:=platform.build_player_relationship_control(p_tenant_id,v_assurance,v_rep,20);
  v_clubs jsonb:=public.platform_server_club_portfolio_control(p_tenant_id,20);
  v_proof jsonb:=public.platform_server_player_value_proof_portfolio(p_tenant_id,30,20);
  v_service_lane jsonb; v_roster_lane jsonb; v_origin_lane jsonb; v_revenue_lane jsonb; v_relationship_lane jsonb; v_club_lane jsonb; v_proof_lane jsonb; v_state text;
begin
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_service_lane from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_roster_lane from jsonb_array_elements(coalesce(v_roster->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_origin_lane from jsonb_array_elements(coalesce(v_origination->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_revenue_lane from jsonb_array_elements(coalesce(v_revenue->'protect_revenue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_relationship_lane from jsonb_array_elements(coalesce(v_relationships->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_club_lane from jsonb_array_elements(coalesce(v_clubs->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_proof_lane from jsonb_array_elements(coalesce(v_proof->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  v_state:=case when coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0)>0 then 'operating_controls_need_attention' when coalesce(v_ready->>'state','')<>'ready_for_controlled_use' then 'setup_gaps_remain' when coalesce((v_demand#>>'{summary,ready_for_deep_pursuit_review}')::integer,0)>0 then 'commercial_execution_available' else 'controlled' end;
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,
    'executive_summary',jsonb_build_object('active_players',coalesce((v_roster#>>'{summary,active_players}')::integer,0),'active_deals',coalesce((v_assurance#>>'{summary,active_deals}')::integer,0),'service_standard_breaches',coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0),'players_without_primary_owner',coalesce((v_capacity#>>'{summary,active_players_without_primary_owner}')::integer,0),'deals_without_owner',coalesce((v_capacity#>>'{summary,active_deals_without_owner}')::integer,0),'club_needs_ready_for_deep_review',coalesce((v_demand#>>'{summary,ready_for_deep_pursuit_review}')::integer,0),'club_need_roster_gaps',coalesce((v_demand#>>'{summary,roster_gaps}')::integer,0),'representation_records_needing_review',coalesce((v_rep#>>'{summary,records_needing_review}')::integer,0),'players_needing_immediate_service_intervention',coalesce((v_relationships#>>'{summary,immediate_service_interventions}')::integer,0),'live_club_business_to_protect',coalesce((v_clubs#>>'{summary,live_business_to_protect}')::integer,0),'players_with_thin_30d_value_proof',coalesce((v_proof#>>'{summary,players_with_thin_recorded_evidence}')::integer,0),'go_live_state',v_ready->>'state','learning_maturity',v_learning->>'maturity_state'),
    'lanes',jsonb_build_object('service_control',jsonb_build_object('summary',v_assurance->'summary','items',v_service_lane),'player_relationship_control',jsonb_build_object('summary',v_relationships->'summary','items',v_relationship_lane),'player_value_proof',jsonb_build_object('window_days',30,'summary',v_proof->'summary','items',v_proof_lane),'roster_effort',jsonb_build_object('summary',v_roster->'summary','items',v_roster_lane),'club_demand_origination',jsonb_build_object('summary',v_demand->'summary','items',v_origin_lane,'deep_review_action','origination_command'),'club_portfolio',jsonb_build_object('summary',v_clubs->'summary','items',v_club_lane),'revenue_execution',jsonb_build_object('commercial_hygiene',v_revenue->'commercial_hygiene','pipeline_creation',v_revenue->'pipeline_creation','by_currency',v_revenue->'by_currency','items',v_revenue_lane),'scouting_mandates',jsonb_build_object('count',v_scouting->'mandate_count','items',v_scouting->'items')),
    'governance',jsonb_build_object('team_capacity_summary',v_capacity->'summary','representation_summary',v_rep->'summary','go_live',jsonb_build_object('state',v_ready->>'state','summary',v_ready->'summary','next_action',v_ready->'next_action'),'learning',jsonb_build_object('maturity_state',v_learning->>'maturity_state','next_learning_action',v_learning->'next_learning_action')),
    'truth_contract',jsonb_build_object('no_composite_score','The Control Centre intentionally keeps player service, value proof, revenue, demand, club accounts, ownership and setup controls in separate lanes rather than collapsing them into one opaque score.','demand_fast_path','HOME uses compact demand control and preserves player-career permission and recorded access. Full pursuit readiness is calculated only when the opportunity is opened.','component_reuse','HOME computes shared assurance, representation, capacity and learning context once and reuses it across dependent lanes.','value_proof','Thin recorded proof never means no work occurred; it means DJM has little captured evidence in the selected period.','revenue','Commercial exposure is shown by recorded currency and is not converted across currencies or treated as guaranteed revenue.','scope','Only work and facts recorded in the platform are visible.'));
end;
$$;

revoke all on function public.platform_server_agency_control_centre(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_agency_control_centre(uuid) to service_role;
;
