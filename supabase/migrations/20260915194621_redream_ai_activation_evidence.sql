-- Value evidence requires an applied, tenant-owned action, not just a transcript.
create or replace function private.ai_first_value(p_tenant_id uuid)
returns table(capture_count integer,first_action_at timestamptz)
language sql stable security definer set search_path='' as $$
  select count(distinct c.id)::integer,min(a.applied_at)
  from djm_os.captures c join djm_os.tell_djm_actions a on a.capture_id=c.id and a.tenant_id=c.tenant_id
  where c.tenant_id=p_tenant_id and c.completed_at is not null
    and c.processing_version='tell_djm_v1' and a.status='applied'
    and a.target_id is not null and a.applied_at is not null;
$$;
revoke all on function private.ai_first_value(uuid) from public,anon,authenticated;
grant execute on function private.ai_first_value(uuid) to service_role;

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
  select capture_count into v_tell from private.ai_first_value(p_tenant_id);
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
    jsonb_build_object('key','tell_djm_first_value','state',case when v_tell>0 then 'complete' else 'not_started' end,'fact',format('%s completed ReDream AI capture(s) with an applied action.',v_tell),'required',false,'next_action',case when v_tell=0 then 'Complete one real ReDream AI capture that creates or updates useful agency work.' end),
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
    when v_tell=0 then jsonb_build_object('key','tell_djm_first_value','instruction','Complete one real ReDream AI capture that creates or updates useful agency work.')
    when v_linked=0 then jsonb_build_object('key','player_access','instruction','Activate the first real player portal account.')
    when v_portal_activity=0 then jsonb_build_object('key','player_portal_usage','instruction','Help a linked player complete the first Player OS review.')
    when v_value_loops=0 then jsonb_build_object('key','player_value_loop','instruction','Complete the first end-to-end player value loop.')
    when v_needs=0 then jsonb_build_object('key','club_demand_workflow','instruction','Capture the first real club demand.')
    when v_deals=0 then jsonb_build_object('key','deal_workflow','instruction','Open the first real material deal room.')
    when v_proof_players<v_players then jsonb_build_object('key','value_proof_coverage','instruction','Complete proof baselines for the uncovered players.')
    else jsonb_build_object('key','maintain_operating_loops','instruction','Maintain service, market, player and commercial control on their real operating cadence.') end;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'adoption_state',v_state,'next_milestone',v_next,'milestones',v_milestones,
    'truth_contract',jsonb_build_object('no_score','ReDream does not compress adoption into a proprietary engagement score. Each milestone is a factual recorded state.','usage','A feature being configured is not treated as usage. Player portal use requires a first-party Player OS event.','optional','Migration and integrations are optional accelerators and are never required merely to inflate an adoption state.','success','Core loops being active does not prove commercial success; it means the agency is genuinely operating through the recorded workflows.'));
end;$$;

revoke all on function public.platform_server_customer_adoption_path(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_customer_adoption_path(uuid) to service_role;

create or replace function public.platform_server_customer_activation(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with metrics as (
  select
    p_tenant_id tenant_id,
    (select capture_count from private.ai_first_value(p_tenant_id)) ai_action_count,
    (select first_action_at from private.ai_first_value(p_tenant_id)) first_ai_action_at,
    (select count(*)::int from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role='owner') owner_count,
    (select count(*)::int from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role<>'player') staff_count,
    (select count(*)::int from public.players p where p.tenant_id=p_tenant_id) roster_player_count,
    (select count(*)::int from djm_os.relationships r where r.tenant_id=p_tenant_id) relationship_count,
    (select count(*)::int from public.player_opportunities o where o.tenant_id=p_tenant_id) player_opportunity_count,
    (select count(*)::int from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.status='active') active_club_need_count,
    (select count(*)::int from djm_os.tasks t where t.tenant_id=p_tenant_id and (t.completed_at is not null or t.status in ('done','complete','completed'))) completed_action_count,
    (select count(*)::int from platform.ai_usage_events a where a.tenant_id=p_tenant_id) ai_event_count,
    (select min(p.created_at) from public.players p where p.tenant_id=p_tenant_id) first_player_at,
    (select min(r.created_at) from djm_os.relationships r where r.tenant_id=p_tenant_id) first_relationship_at,
    (select min(o.created_at) from public.player_opportunities o where o.tenant_id=p_tenant_id) first_player_opportunity_at,
    (select min(n.created_at) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.status='active') first_club_need_at,
    (select min(coalesce(t.completed_at,t.updated_at)) from djm_os.tasks t where t.tenant_id=p_tenant_id and (t.completed_at is not null or t.status in ('done','complete','completed'))) first_completed_action_at,
    (select min(a.occurred_at) from platform.ai_usage_events a where a.tenant_id=p_tenant_id) first_ai_at,
    (select min(m.joined_at) from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role='owner') owner_activated_at,
    (select max(case when i.status='accepted' then i.accepted_at end) from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id) invite_accepted_at,
    (select max(i.first_opened_at) from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id) invite_opened_at,
    (select max(i.first_sent_at) from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id) invite_sent_at,
    (select count(*)::int from platform.tenant_onboarding_tasks x where x.tenant_id=p_tenant_id and x.required) required_tasks,
    (select count(*)::int from platform.tenant_onboarding_tasks x where x.tenant_id=p_tenant_id and x.required and x.status in ('complete','waived')) completed_required_tasks
), scored as (
  select *,
    least(100,
      (case when owner_count>0 then 20 else 0 end) +
      (case when roster_player_count>0 then 20 else 0 end) +
      (case when relationship_count>0 then 15 else 0 end) +
      (case when player_opportunity_count>0 or active_club_need_count>0 then 20 else 0 end) +
      (case when (completed_action_count>0 or ai_action_count>0) then 15 else 0 end) +
      (case when staff_count>1 then 5 else 0 end) +
      (case when ai_action_count>0 then 5 else 0 end)
    )::int activation_score,
    (owner_count>0 and roster_player_count>0 and relationship_count>0 and (player_opportunity_count>0 or active_club_need_count>0)) first_value_ready,
    case
      when owner_count=0 then 'owner_activation'
      when roster_player_count=0 then 'load_roster'
      when relationship_count=0 then 'add_club_relationship'
      when player_opportunity_count=0 and active_club_need_count=0 then 'create_live_opportunity'
      when completed_action_count=0 and ai_action_count=0 then 'complete_first_action'
      when staff_count<=1 then 'invite_team'
      when ai_action_count=0 then 'use_intelligence'
      else 'activation_complete'
    end next_activation_step
  from metrics
)
select jsonb_build_object(
  'score',activation_score,
  'first_value_ready',first_value_ready,
  'next_step',next_activation_step,
  'counts',jsonb_build_object(
    'owners',owner_count,
    'staff',staff_count,
    'roster_players',roster_player_count,
    'relationships',relationship_count,
    'player_opportunities',player_opportunity_count,
    'active_club_needs',active_club_need_count,
    'completed_actions',completed_action_count,
    'meaningful_ai_captures',ai_action_count,
    'ai_events',ai_event_count
  ),
  'milestones',jsonb_build_array(
    jsonb_build_object('key','owner_activation','label','Owner activated','complete',owner_count>0,'weight',20,'completed_at',owner_activated_at),
    jsonb_build_object('key','load_roster','label','First player loaded','complete',roster_player_count>0,'weight',20,'completed_at',first_player_at),
    jsonb_build_object('key','add_club_relationship','label','First club relationship added','complete',relationship_count>0,'weight',15,'completed_at',first_relationship_at),
    jsonb_build_object('key','create_live_opportunity','label','First live opportunity captured','complete',(player_opportunity_count>0 or active_club_need_count>0),'weight',20,'completed_at',least(first_player_opportunity_at,first_club_need_at)),
    jsonb_build_object('key','complete_first_action','label','First action completed','complete',(completed_action_count>0 or ai_action_count>0),'weight',15,'completed_at',least(first_completed_action_at,first_ai_action_at)),
    jsonb_build_object('key','invite_team','label','Second staff member active','complete',staff_count>1,'weight',5,'completed_at',null),
    jsonb_build_object('key','use_intelligence','label','First intelligence action used','complete',ai_action_count>0,'weight',5,'completed_at',first_ai_action_at)
  ),
  'invite',jsonb_build_object('sent_at',invite_sent_at,'opened_at',invite_opened_at,'accepted_at',invite_accepted_at),
  'onboarding',jsonb_build_object('required_total',required_tasks,'required_complete',completed_required_tasks)
)
from scored;
$function$;

-- Explicit grants also protect a fresh installation; never depend on an older ACL.
revoke all on function public.platform_server_customer_activation(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_customer_activation(uuid) to service_role;
