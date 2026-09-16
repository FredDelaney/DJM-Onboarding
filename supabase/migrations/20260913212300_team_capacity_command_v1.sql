create or replace function public.platform_server_team_capacity(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_members jsonb;
  v_active_members integer:=0;
  v_unassigned_players integer:=0;
  v_unowned_deals integer:=0;
  v_unowned_tasks integer:=0;
  v_top_player_share numeric:=null;
  v_top_deal_share numeric:=null;
  v_assigned_players integer:=0;
  v_owned_deals integer:=0;
  v_state text;
  v_next jsonb;
begin
  if not exists(select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_found'; end if;

  with members as (
    select m.user_id,m.role,coalesce(tm.display_name,m.user_id::text) as display_name,tm.role_title,tm.timezone,
      (select count(*) from public.players p where p.tenant_id=p_tenant_id and p.primary_staff_user_id=m.user_id and coalesce(p.football_status,'active') not in ('retired','inactive'))::int as assigned_players,
      (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.owner_user_id=m.user_id and d.status='active')::int as owned_active_deals,
      (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open')::int as open_tasks,
      (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=m.user_id and t.status='open' and t.due_at is not null and t.due_at<now())::int as overdue_tasks,
      (select count(*) from platform.agency_commitments c where c.tenant_id=p_tenant_id and c.owner_user_id=m.user_id and c.status='active')::int as active_commitments,
      (select count(*) from platform.agency_commitments c where c.tenant_id=p_tenant_id and c.owner_user_id=m.user_id and c.status='overdue')::int as overdue_commitments,
      (select count(*) from djm_os.relationships r where r.tenant_id=p_tenant_id and r.team_member_id=m.user_id)::int as recorded_relationships,
      (select count(*) from djm_os.relationships r where r.tenant_id=p_tenant_id and r.team_member_id=m.user_id and r.strength_score>=75)::int as strong_recorded_relationships,
      (select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'expected_commission',expected_commission,'weighted_commission',weighted_commission) order by currency),'[]'::jsonb)
       from (select d.currency,round(sum(coalesce(d.expected_commission,0)),2) expected_commission,round(sum(coalesce(d.expected_commission,0)*d.probability/100.0),2) weighted_commission from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.owner_user_id=m.user_id and d.status='active' group by d.currency) q) as commercial_by_currency
    from platform.tenant_memberships m
    left join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=p_tenant_id and m.status='active' and coalesce(tm.is_active,true)=true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',user_id,'name',display_name,'tenant_role',role,'role_title',role_title,'timezone',timezone,
    'load_facts',jsonb_build_object('assigned_players',assigned_players,'owned_active_deals',owned_active_deals,'open_tasks',open_tasks,'overdue_tasks',overdue_tasks,'active_commitments',active_commitments,'overdue_commitments',overdue_commitments),
    'network_facts',jsonb_build_object('recorded_relationships',recorded_relationships,'strong_recorded_relationships',strong_recorded_relationships),
    'commercial_by_currency',commercial_by_currency,
    'attention_state',case when overdue_tasks>0 or overdue_commitments>0 then 'overdue_work_present' when open_tasks>0 or active_commitments>0 or assigned_players>0 or owned_active_deals>0 then 'active_load' else 'no_recorded_load' end
  ) order by overdue_tasks desc,overdue_commitments desc,open_tasks desc,assigned_players desc,display_name),'[]'::jsonb),
  count(*)::int,coalesce(sum(assigned_players),0)::int,coalesce(sum(owned_active_deals),0)::int
  into v_members,v_active_members,v_assigned_players,v_owned_deals from members;

  select count(*)::int into v_unassigned_players from public.players p where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive') and p.primary_staff_user_id is null;
  select count(*)::int into v_unowned_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active' and d.owner_user_id is null;
  select count(*)::int into v_unowned_tasks from djm_os.tasks t where t.tenant_id=p_tenant_id and t.status='open' and t.owner_user_id is null;

  if v_assigned_players>0 then select max(cnt)::numeric/v_assigned_players into v_top_player_share from (select count(*) cnt from public.players p where p.tenant_id=p_tenant_id and p.primary_staff_user_id is not null and coalesce(p.football_status,'active') not in ('retired','inactive') group by p.primary_staff_user_id) x; end if;
  if v_owned_deals>0 then select max(cnt)::numeric/v_owned_deals into v_top_deal_share from (select count(*) cnt from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active' and d.owner_user_id is not null group by d.owner_user_id) x; end if;

  if v_active_members=1 then v_state:='single_active_staff_dependency';
  elsif v_unassigned_players>0 or v_unowned_deals>0 then v_state:='ownership_gaps';
  else v_state:='ownership_recorded'; end if;
  v_next:=case
    when v_unassigned_players>0 then jsonb_build_object('action','assign_primary_player_owners','count',v_unassigned_players,'reason','Active players without one accountable primary staff owner weaken service continuity and workload visibility.')
    when v_unowned_deals>0 then jsonb_build_object('action','assign_active_deal_owners','count',v_unowned_deals,'reason','Active deals without a recorded owner weaken process accountability.')
    when v_unowned_tasks>0 then jsonb_build_object('action','assign_open_work','count',v_unowned_tasks,'reason','Open tasks without an owner can fall between team members.')
    else jsonb_build_object('action','review_overdue_load','reason','Ownership is recorded. Review overdue work and concentration before redistributing workload.') end;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,'members',v_members,
    'summary',jsonb_build_object('active_members',v_active_members,'active_players_without_primary_owner',v_unassigned_players,'active_deals_without_owner',v_unowned_deals,'open_tasks_without_owner',v_unowned_tasks,'assigned_players',v_assigned_players,'owned_active_deals',v_owned_deals),
    'concentration',jsonb_build_object('top_member_share_of_assigned_players',case when v_top_player_share is null then null else round(v_top_player_share,4) end,'top_member_share_of_owned_active_deals',case when v_top_deal_share is null then null else round(v_top_deal_share,4) end,'interpretation',case when v_assigned_players=0 and v_owned_deals=0 then 'Ownership records are not yet being used enough to measure concentration.' else 'Concentration is a factual ownership share, not a judgement about team design.' end),
    'next_capacity_action',v_next,
    'principle','Show accountable ownership and factual workload without inventing working-hour capacity or declaring someone overloaded from task counts alone.',
    'truth_contract',jsonb_build_object('capacity','No percentage capacity is calculated because actual working hours and effort per task are not recorded.','relationships','Relationship counts measure recorded network ownership, not relationship quality beyond the stored scores.','commercial','Commercial exposure remains separated by currency.','single_member','A single active tenant member is reported as dependency, not automatically as a business problem.')
  );
end;$$;

revoke all on function public.platform_server_team_capacity(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_team_capacity(uuid) to service_role;;
