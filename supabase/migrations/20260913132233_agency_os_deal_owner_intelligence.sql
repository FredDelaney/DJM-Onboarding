create or replace function public.platform_server_deal_owner_candidates(p_tenant_id uuid,p_deal_room_id uuid,p_limit integer default 10)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),25));
  v_deal djm_os.deal_rooms%rowtype;
  v_access jsonb;
  v_items jsonb;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  v_access:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,10);

  with members as (
    select m.user_id,m.role,tm.display_name
    from platform.tenant_memberships m
    left join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations')
  ), access_scores as (
    select (x.value->>'team_member_id')::uuid user_id,max((x.value->>'route_score')::integer) club_access_score,
           (array_agg(x.value order by (x.value->>'route_score')::integer desc))[1] best_route
    from jsonb_array_elements(coalesce(v_access->'routes','[]'::jsonb)) x
    where nullif(x.value->>'team_member_id','') is not null
    group by (x.value->>'team_member_id')::uuid
  ), metrics as (
    select m.*,
      coalesce(a.club_access_score,0)::integer club_access_score,a.best_route,
      case when v_deal.player_id is not null and exists(
        select 1 from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id and p.primary_staff_user_id=m.user_id
      ) then 100 else 0 end as player_responsibility_score,
      coalesce(w.active_deals,0)::integer active_deals_owned,
      coalesce(w.open_commitments,0)::integer open_commitments,
      coalesce(w.open_tasks,0)::integer open_tasks,
      greatest(20,100-coalesce(w.active_deals,0)*15-coalesce(w.open_commitments,0)*10-coalesce(w.open_tasks,0)*3)::integer as workload_headroom_proxy,
      least(100,coalesce(i.interactions_90d,0)*20)::integer as recent_club_activity_score,
      coalesce(i.interactions_90d,0)::integer interactions_90d,
      i.last_interaction_at,
      case m.role when 'owner' then 100 when 'admin' then 95 when 'agent' then 100 when 'operations' then 70 else 50 end role_fit_score
    from members m
    left join access_scores a on a.user_id=m.user_id
    left join lateral (
      select count(*) filter(where d.status='active')::integer active_deals,
             (select count(*) from platform.agency_commitments c where c.tenant_id=p_tenant_id and c.owner_user_id=m.user_id and c.status in ('active','overdue'))::integer open_commitments,
             (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open')::integer open_tasks
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.owner_user_id=m.user_id
    ) w on true
    left join lateral (
      select count(*) filter(where x.occurred_at>=now()-interval '90 days')::integer interactions_90d,max(x.occurred_at) last_interaction_at
      from djm_os.interactions x
      where x.tenant_id=p_tenant_id and x.organisation_id=v_deal.organisation_id and x.team_member_id=m.user_id
    ) i on true
  ), scored as (
    select *,round(
      club_access_score*0.35 +
      player_responsibility_score*0.25 +
      workload_headroom_proxy*0.20 +
      recent_club_activity_score*0.10 +
      role_fit_score*0.10
    )::integer suitability_score
    from metrics
  ), ranked as (
    select *,row_number() over(order by suitability_score desc,club_access_score desc,display_name nulls last,user_id) rank from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,'user_id',user_id,'display_name',display_name,'role',role,'suitability_score',suitability_score,
    'factors',jsonb_build_object(
      'club_access',jsonb_build_object('score',club_access_score,'weight',0.35,'best_route',best_route),
      'player_responsibility',jsonb_build_object('score',player_responsibility_score,'weight',0.25),
      'workload_headroom_proxy',jsonb_build_object('score',workload_headroom_proxy,'weight',0.20,'active_deals_owned',active_deals_owned,'open_commitments',open_commitments,'open_tasks',open_tasks),
      'recent_club_activity',jsonb_build_object('score',recent_club_activity_score,'weight',0.10,'interactions_90d',interactions_90d,'last_interaction_at',last_interaction_at),
      'role_fit',jsonb_build_object('score',role_fit_score,'weight',0.10)
    ),
    'why',concat_ws(' ',
      case when club_access_score>=75 then 'Strong recorded club access.' when club_access_score>=60 then 'Usable recorded club access.' when club_access_score>0 then 'Some recorded club access.' else 'No direct club route is recorded for this person.' end,
      case when player_responsibility_score=100 then 'Already recorded as the player’s primary staff owner.' else null end,
      case when workload_headroom_proxy>=80 then 'Current recorded workload is relatively light.' when workload_headroom_proxy>=50 then 'Current recorded workload is moderate.' else 'Current recorded workload is comparatively heavy.' end
    )
  ) order by rank) filter(where rank<=v_limit),'[]'::jsonb)
  into v_items from ranked;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'candidates',v_items,
    'best_candidate',case when jsonb_array_length(v_items)>0 then v_items->0 else null end,
    'method',jsonb_build_object(
      'club_access_weight',0.35,'player_responsibility_weight',0.25,'workload_headroom_proxy_weight',0.20,'recent_club_activity_weight',0.10,'role_fit_weight',0.10,
      'interpretation','Deterministic internal assignment aid. It does not measure human capability, availability, seniority or performance beyond the recorded factors.',
      'workload_warning','Workload headroom is only a proxy derived from recorded active deals, commitments and open tasks. It must not be treated as a full capacity measure.'
    )
  );
end;
$$;

revoke execute on function public.platform_server_deal_owner_candidates(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_owner_candidates(uuid,uuid,integer) to service_role;;
