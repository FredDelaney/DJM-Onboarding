create or replace function public.platform_server_player_owner_candidates(p_tenant_id uuid,p_player_id uuid,p_limit integer default 10)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_player public.players%rowtype;
  v_candidates jsonb;
  v_target_org_count integer:=0;
  v_current_owner_name text;
begin
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  if v_player.primary_staff_user_id is not null then select display_name into v_current_owner_name from djm_os.team_members where user_id=v_player.primary_staff_user_id; end if;
  with target_orgs as (
    select d.organisation_id from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active'
    union
    select n.organisation_id from djm_os.player_matches pm join djm_os.club_needs n on n.id=pm.club_need_id and n.tenant_id=pm.tenant_id where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and n.status='active'
  ) select count(*) into v_target_org_count from target_orgs;

  with target_orgs as (
    select d.organisation_id from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active'
    union
    select n.organisation_id from djm_os.player_matches pm join djm_os.club_needs n on n.id=pm.club_need_id and n.tenant_id=pm.tenant_id where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and n.status='active'
  ), members as (
    select m.user_id,m.role,coalesce(tm.display_name,m.user_id::text) as display_name,tm.role_title,
      (v_player.primary_staff_user_id=m.user_id) as is_current_primary,
      (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.owner_user_id=m.user_id and d.status='active')::int as player_active_deals_owned,
      (select coalesce(max(r.access_score),0) from djm_os.relationships r join djm_os.employments e on e.person_id=r.person_id and e.tenant_id=r.tenant_id and e.is_current=true join target_orgs t on t.organisation_id=e.organisation_id where r.tenant_id=p_tenant_id and r.team_member_id=m.user_id)::int as best_target_access,
      (select coalesce(max(r.strength_score),0) from djm_os.relationships r join djm_os.employments e on e.person_id=r.person_id and e.tenant_id=r.tenant_id and e.is_current=true join target_orgs t on t.organisation_id=e.organisation_id where r.tenant_id=p_tenant_id and r.team_member_id=m.user_id)::int as best_target_relationship_strength,
      (select count(distinct e.organisation_id) from djm_os.relationships r join djm_os.employments e on e.person_id=r.person_id and e.tenant_id=r.tenant_id and e.is_current=true join target_orgs t on t.organisation_id=e.organisation_id where r.tenant_id=p_tenant_id and r.team_member_id=m.user_id)::int as target_orgs_with_direct_relationship,
      (select count(*) from public.players p where p.tenant_id=p_tenant_id and p.primary_staff_user_id=m.user_id and coalesce(p.football_status,'active') not in ('retired','inactive'))::int as assigned_players,
      (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.owner_user_id=m.user_id and d.status='active')::int as owned_active_deals,
      (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open')::int as open_tasks,
      (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open' and t.due_at is not null and t.due_at<now())::int as overdue_tasks
    from platform.tenant_memberships m left join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations') and coalesce(tm.is_active,true)=true
  ), ranked as (
    select *,row_number() over(order by is_current_primary desc,player_active_deals_owned desc,best_target_access desc,best_target_relationship_strength desc,overdue_tasks asc,open_tasks asc,assigned_players asc,display_name) as candidate_rank
    from members
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',candidate_rank,'user_id',user_id,'name',display_name,'tenant_role',role,'role_title',role_title,
    'continuity',jsonb_build_object('is_current_primary',is_current_primary,'player_active_deals_owned',player_active_deals_owned),
    'target_network',jsonb_build_object('target_organisations',v_target_org_count,'target_orgs_with_direct_relationship',target_orgs_with_direct_relationship,'best_direct_access_score',best_target_access,'best_relationship_strength',best_target_relationship_strength),
    'load_facts',jsonb_build_object('assigned_players',assigned_players,'owned_active_deals',owned_active_deals,'open_tasks',open_tasks,'overdue_tasks',overdue_tasks),
    'candidate_state',case when is_current_primary then 'current_owner' when player_active_deals_owned>0 then 'deal_continuity_candidate' when best_target_access>=70 then 'strong_target_network_candidate' when best_target_access>0 then 'target_network_candidate' else 'general_assignment_candidate' end,
    'why_ranked_here',case when is_current_primary then 'Already recorded as primary staff owner.' when player_active_deals_owned>0 then 'Already owns a live deal for this player.' when best_target_access>=70 then 'Has strong recorded direct access into a live target organisation.' when best_target_access>0 then 'Has some recorded direct access into a live target organisation.' else 'No stronger player/deal/network continuity signal is recorded; workload facts are used only as tie-breakers.' end
  ) order by candidate_rank),'[]'::jsonb) into v_candidates from ranked where candidate_rank<=greatest(1,least(coalesce(p_limit,10),25));

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,
    'player',jsonb_build_object('name',coalesce(nullif(trim(v_player.preferred_name),''),nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),'Player'),'current_primary_staff_user_id',v_player.primary_staff_user_id,'current_primary_staff_name',v_current_owner_name),
    'target_organisation_count',v_target_org_count,'candidates',v_candidates,
    'assignment_policy',jsonb_build_object('automatic_assignment',false,'ranking_order',jsonb_build_array('current ownership continuity','live deal ownership continuity','direct target-club access','relationship strength','fewer overdue tasks','fewer open tasks','fewer assigned players')),
    'truth_contract',jsonb_build_object('ranking','Lexicographic operating ranking, not a score of agent quality.','load','Task/player counts are tie-breakers only because actual effort and working hours are not measured.','network','Only recorded direct relationships to current target organisations are counted. Warm-introduction routes remain visible elsewhere and are not silently treated as direct access.','assignment','A human must approve any ownership change.')
  );
end;$$;

revoke all on function public.platform_server_player_owner_candidates(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_owner_candidates(uuid,uuid,integer) to service_role;;
