create or replace function public.platform_server_customer_adoption_path(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_owner_admin int:=0; v_staff int:=0; v_players int:=0; v_players_without_owner int:=0; v_tell int:=0; v_needs int:=0; v_deals int:=0; v_windows int:=0;
  v_proof_players int:=0; v_integrations int:=0; v_applied_migrations int:=0; v_activation jsonb; v_linked int:=0; v_portal_activity int:=0; v_value_loops int:=0;
  v_milestones jsonb:='[]'::jsonb; v_state text; v_next jsonb;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;
  select count(*) filter(where role in ('owner','admin')),count(*) into v_owner_admin,v_staff from platform.tenant_memberships where tenant_id=p_tenant_id and status='active';
  select count(*),count(*) filter(where primary_staff_user_id is null) into v_players,v_players_without_owner from public.players where tenant_id=p_tenant_id and football_status in ('active','free_agent','loan','injured');
  select count(*) into v_tell from djm_os.captures where tenant_id=p_tenant_id and completed_at is not null;
  select count(*) into v_needs from djm_os.club_needs where tenant_id=p_tenant_id;
  select count(*) into v_deals from djm_os.deal_rooms where tenant_id=p_tenant_id;
  select count(*) into v_windows from platform.tenant_operating_windows where tenant_id=p_tenant_id and status in ('planned','active','closed');
  select count(distinct player_id) into v_proof_players from platform.player_value_proof_snapshots where tenant_id=p_tenant_id;
  select count(*) into v_integrations from platform.tenant_integrations where tenant_id=p_tenant_id and status in ('connected','healthy','active');
  select count(*) into v_applied_migrations from platform.tenant_migration_batches where tenant_id=p_tenant_id and status='applied';
  v_activation:=public.platform_server_player_activation_command(p_tenant_id,1000);
  v_linked:=coalesce((select count(*) from jsonb_array_elements(coalesce(v_activation->'items','[]'::jsonb)) x where (x#>>'{milestones,account_linked}')::boolean),0);
  v_portal_activity:=coalesce((v_activation#>>'{summary,players_with_recorded_portal_activity}')::int,0);
  v_value_loops:=coalesce((v_activation#>>'{summary,player_value_loop_active}')::int,0);

  v_milestones:=jsonb_build_array(
    jsonb_build_object('key','accountable_admin','state',case when v_owner_admin>0 then 'complete' else 'missing' end,'fact',format('%s active owner/admin membership(s).',v_owner_admin),'required',true,'next_action',case when v_owner_admin=0 then 'Add an accountable owner or administrator.' end),
    jsonb_build_object('key','roster_loaded','state',case when v_players>0 then 'complete' else 'missing' end,'fact',format('%s active/free-agent/loan/injured player record(s).',v_players),'required',true,'next_action',case when v_players=0 then 'Import or create the active roster.' end),
    jsonb_build_object('key','player_accountability','state',case when v_players>0 and v_players_without_owner=0 then 'complete' when v_players=0 then 'not_applicable_yet' else 'incomplete' end,'fact',format('%s of %s eligible player(s) have no primary staff owner.',v_players_without_owner,v_players),'required',true,'next_action',case when v_players_without_owner>0 then 'Assign one accountable primary staff owner to every active player.' end),
    jsonb_build_object('key','tell_djm_first_value','state',case when v_tell>0 then 'complete' else 'not_started' end,'fact',format('%s completed Tell DJM capture(s).',v_tell),'required',false,'next_action',case when v_tell=0 then 'Complete one real Tell DJM capture that creates or updates useful agency work.' end),
    jsonb_build_object('key','player_access','state',case when v_linked>0 then 'started' else 'not_started' end,'fact',format('%s of %s eligible player(s) have linked portal accounts.',v_linked,v_players),'required',false,'next_action',case when v_players>0 and v_linked=0 then 'Start tenant-scoped player portal invitations with one real player.' end),
    jsonb_build_object('key','player_portal_usage','state',case when v_portal_activity>0 then 'started' else 'not_started' end,'fact',format('%s player(s) have first-party Player OS activity recorded.',v_portal_activity),'required',false,'next_action',case when v_linked>0 and v_portal_activity=0 then 'Help a linked player complete the first Player OS review.' end),
    jsonb_build_object('key','player_value_loop','state',case when v_value_loops>0 then 'started' else 'not_started' end,'fact',format('%s player(s) have a confirmed strategy, proof baseline and recorded player review.',v_value_loops),'required',false,'next_action',case when v_players>0 and v_value_loops=0 then 'Complete the first end-to-end player value loop: strategy, proof baseline and player review.' end),
    jsonb_build_object('key','club_demand_workflow','state',case when v_needs>0 then 'started' else 'not_started' end,'fact',format('%s club need record(s).',v_needs),'required',false,'next_action',case when v_needs=0 then 'Capture the first real club demand and resolve whether the roster can serve it.' end),
    jsonb_build_object('key','deal_workflow','state',case when v_deals>0 then 'started' else 'not_started' end,'fact',format('%s deal room record(s).',v_deals),'required',false,'next_action',case when v_deals=0 then 'Open the first real deal room when a club process becomes material.' end),
    jsonb_build_object('key','operating_window','state',case when v_windows>0 then 'configured' else 'not_configured' end,'fact',format('%s operating window record(s).',v_windows),'required',false,'next_action',case when v_windows=0 then 'Configure an agency operating window when a market, renewal or recruitment period needs coordinated execution.' end),
    jsonb_build_object('key','value_proof_coverage','state',case when v_players>0 and v_proof_players>=v_players then 'complete' when v_proof_players>0 then 'partial' else 'not_started' end,'fact',format('%s of %s eligible player(s) have at least one persisted value-proof baseline.',v_proof_players,v_players),'required',false,'next_action',case when v_players>0 and v_proof_players<v_players then 'Capture proof baselines for the uncovered players.' end),
    jsonb_build_object('key','data_migration','state',case when v_applied_migrations>0 then 'used' else 'not_used' end,'fact',format('%s tenant migration batch(es) applied.',v_applied_migrations),'required',false,'next_action',null),
    jsonb_build_object('key','connected_integrations','state',case when v_integrations>0 then 'connected' else 'optional_not_connected' end,'fact',format('%s connected/healthy integration(s).',v_integrations),'required',false,'next_action',null)
  );

  v_state:=case
    when v_owner_admin=0 or v_players=0 then 'foundation_incomplete'
    when v_players_without_owner>0 then 'operating_foundation_incomplete'
    when v_tell=0 and v_needs=0 and v_deals=0 then 'foundation_ready_workflows_not_started'
    when v_linked=0 then 'agency_workflows_active_player_experience_not_started'
    when v_portal_activity=0 then 'player_access_started_usage_not_started'
    when v_value_loops=0 then 'player_experience_active_value_loop_incomplete'
    when v_needs=0 or v_deals=0 then 'player_value_loop_active_market_workflow_incomplete'
    else 'core_operating_loops_active' end;

  v_next:=case
    when v_owner_admin=0 then jsonb_build_object('key','accountable_admin','instruction','Add an accountable owner or administrator.')
    when v_players=0 then jsonb_build_object('key','roster_loaded','instruction','Import or create the active roster.')
    when v_players_without_owner>0 then jsonb_build_object('key','player_accountability','instruction','Assign one accountable primary staff owner to every active player.')
    when v_tell=0 then jsonb_build_object('key','tell_djm_first_value','instruction','Complete one real Tell DJM capture that creates or updates useful agency work.')
    when v_linked=0 then jsonb_build_object('key','player_access','instruction','Activate the first real player portal account.')
    when v_portal_activity=0 then jsonb_build_object('key','player_portal_usage','instruction','Help a linked player complete the first Player OS review.')
    when v_value_loops=0 then jsonb_build_object('key','player_value_loop','instruction','Complete the first end-to-end player value loop.')
    when v_needs=0 then jsonb_build_object('key','club_demand_workflow','instruction','Capture the first real club demand.')
    when v_deals=0 then jsonb_build_object('key','deal_workflow','instruction','Open the first real material deal room.')
    when v_proof_players<v_players then jsonb_build_object('key','value_proof_coverage','instruction','Complete proof baselines for the uncovered players.')
    else jsonb_build_object('key','maintain_operating_loops','instruction','Maintain service, market, player and commercial control on their real operating cadence.') end;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'adoption_state',v_state,'next_milestone',v_next,'milestones',v_milestones,
    'truth_contract',jsonb_build_object('no_score','DJM does not compress adoption into a proprietary engagement score. Each milestone is a factual recorded state.','usage','A feature being configured is not treated as usage. Player portal use requires a first-party Player OS event.','optional','Migration and integrations are optional accelerators and are never required merely to inflate an adoption state.','success','Core loops being active does not prove commercial success; it means the agency is genuinely operating through the recorded workflows.'));
end;$$;

revoke all on function public.platform_server_customer_adoption_path(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_customer_adoption_path(uuid) to service_role;;
