create or replace function public.platform_server_deal_owner_candidates(
  p_tenant_id uuid,
  p_deal_room_id uuid,
  p_limit integer default 10
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),25));
  v_deal djm_os.deal_rooms%rowtype;
  v_access jsonb;
  v_items jsonb;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  v_access:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,25);

  with members as (
    select m.user_id,m.role,coalesce(tm.display_name,u.email,m.user_id::text) display_name,tm.role_title
    from platform.tenant_memberships m
    join auth.users u on u.id=m.user_id
    left join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations')
  ), access_facts as (
    select (x.value->>'team_member_id')::uuid user_id,
      max(coalesce((x.value->>'route_score')::integer,0)) club_access_score,
      max(coalesce((x.value->'factor_breakdown'->'relationship_strength'->>'score')::integer,0)) relationship_strength,
      (array_agg(x.value order by coalesce((x.value->>'route_score')::integer,0) desc))[1] best_route
    from jsonb_array_elements(coalesce(v_access->'routes','[]'::jsonb)) x
    where nullif(x.value->>'team_member_id','') is not null
    group by (x.value->>'team_member_id')::uuid
  ), facts as (
    select m.*,
      coalesce(v_deal.owner_user_id=m.user_id,false) is_current_deal_owner,
      coalesce(v_deal.player_id is not null and exists(select 1 from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id and p.primary_staff_user_id=m.user_id),false) is_player_primary,
      coalesce(a.club_access_score,0)::integer club_access_score,
      coalesce(a.relationship_strength,0)::integer relationship_strength,
      a.best_route,
      coalesce(i.interactions_90d,0)::integer interactions_90d,
      i.last_interaction_at,
      coalesce(w.active_deals,0)::integer active_deals_owned,
      coalesce(w.open_commitments,0)::integer open_commitments,
      coalesce(w.overdue_commitments,0)::integer overdue_commitments,
      coalesce(w.open_tasks,0)::integer open_tasks,
      coalesce(w.overdue_tasks,0)::integer overdue_tasks
    from members m
    left join access_facts a on a.user_id=m.user_id
    left join lateral (
      select count(*) filter(where d.status='active')::integer active_deals,
        (select count(*) from platform.agency_commitments c where c.tenant_id=p_tenant_id and c.owner_user_id=m.user_id and c.status in ('active','overdue'))::integer open_commitments,
        (select count(*) from platform.agency_commitments c where c.tenant_id=p_tenant_id and c.owner_user_id=m.user_id and c.status='overdue')::integer overdue_commitments,
        (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open')::integer open_tasks,
        (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open' and t.due_at is not null and t.due_at<now())::integer overdue_tasks
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.owner_user_id=m.user_id
    ) w on true
    left join lateral (
      select count(*) filter(where x.occurred_at>=now()-interval '90 days')::integer interactions_90d,max(x.occurred_at) last_interaction_at
      from djm_os.interactions x where x.tenant_id=p_tenant_id and x.organisation_id=v_deal.organisation_id and x.team_member_id=m.user_id
    ) i on true
  ), ranked as (
    select *,row_number() over(order by is_current_deal_owner desc,is_player_primary desc,club_access_score desc,interactions_90d desc,relationship_strength desc,overdue_commitments asc,overdue_tasks asc,active_deals_owned asc,open_commitments asc,open_tasks asc,display_name asc,user_id) rank
    from facts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,'user_id',user_id,'display_name',display_name,'role',role,'role_title',role_title,
    'candidate_state',case when is_current_deal_owner then 'current_owner_continuity' when is_player_primary and club_access_score>=75 then 'player_owner_with_strong_club_access' when is_player_primary then 'player_owner_continuity' when club_access_score>=75 then 'strong_direct_access_candidate' when club_access_score>=50 then 'direct_access_candidate' when interactions_90d>0 then 'recent_club_activity_candidate' else 'available_operator' end,
    'continuity',jsonb_build_object('is_current_deal_owner',is_current_deal_owner,'is_player_primary',is_player_primary),
    'club_network',jsonb_build_object('direct_access_score',club_access_score,'relationship_strength',relationship_strength,'recent_interactions_90d',interactions_90d,'last_interaction_at',last_interaction_at,'best_route',best_route),
    'load_facts',jsonb_build_object('active_deals_owned',active_deals_owned,'open_commitments',open_commitments,'overdue_commitments',overdue_commitments,'open_tasks',open_tasks,'overdue_tasks',overdue_tasks),
    'why_ranked_here',concat_ws(' ',case when is_current_deal_owner then 'Already owns this deal.' end,case when is_player_primary then 'Already owns the player relationship internally.' end,case when club_access_score>=75 then 'Has strong recorded direct access into the target club.' when club_access_score>=50 then 'Has usable recorded direct access into the target club.' when club_access_score>0 then 'Has some recorded direct access into the target club.' else 'No direct target-club route is recorded.' end,case when interactions_90d>0 then 'Has recent recorded interaction with the club.' end,case when overdue_commitments=0 and overdue_tasks=0 then 'No overdue recorded commitments or tasks.' else 'Has overdue recorded work, used only as a tie-break.' end)
  ) order by rank) filter(where rank<=v_limit),'[]'::jsonb) into v_items from ranked;

  return jsonb_build_object('tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'candidates',v_items,'best_candidate',case when jsonb_array_length(v_items)>0 then v_items->0 else null end,
    'assignment_policy',jsonb_build_object('automatic_assignment',false,'ranking_order',jsonb_build_array('current deal ownership continuity','player ownership continuity','direct target-club access','recent target-club activity','relationship strength','fewer overdue commitments/tasks','lighter recorded load as final tie-break')),
    'truth_contract',jsonb_build_object('ranking','Lexicographic operating ranking, not a score of human quality or agent performance.','capacity','Recorded workload is only a tie-break because actual working hours and effort are not measured.','network','Only recorded direct access is treated as direct access. Introduction routes are not silently promoted.','assignment','A human must approve any ownership change.'));
end;
$function$;

revoke all on function public.platform_server_deal_owner_candidates(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_owner_candidates(uuid,uuid,integer) to service_role;;
