create or replace function public.platform_server_seed_demo_deal_origins(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_meta jsonb; v_owner uuid; v_elias_deal uuid; v_leo_deal uuid; v_milan uuid; v_thomas uuid; v_luca uuid;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_seed_requires_synthetic_tenant'; end if;
  select m.user_id into v_owner from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin') order by case when m.role='owner' then 0 else 1 end limit 1;
  select id into v_elias_deal from djm_os.deal_rooms where tenant_id=p_tenant_id and lower(title) like 'elias novak%' limit 1;
  select id into v_leo_deal from djm_os.deal_rooms where tenant_id=p_tenant_id and lower(title) like 'leo martin%' limit 1;
  select id into v_milan from djm_os.people where tenant_id=p_tenant_id and lower(full_name)='milan de vries' limit 1;
  select id into v_thomas from djm_os.people where tenant_id=p_tenant_id and lower(full_name)='thomas de smet' limit 1;
  select id into v_luca from djm_os.people where tenant_id=p_tenant_id and lower(full_name)='luca moretti' limit 1;
  if v_owner is null or v_elias_deal is null or v_leo_deal is null or v_milan is null or v_thomas is null or v_luca is null then raise exception 'demo_origin_dependencies_missing'; end if;
  delete from platform.deal_origin_attributions where tenant_id=p_tenant_id;
  insert into platform.deal_origin_attributions(tenant_id,deal_room_id,route_type,source_person_id,origin_note,originated_at,confirmation_status,confirmed_at,confirmed_by,created_by,updated_by)
  select p_tenant_id,v_elias_deal,'direct_relationship',v_milan,'Synthetic Northstar: opportunity originated through the recorded direct club relationship.',d.created_at,'confirmed',now(),v_owner,v_owner,v_owner from djm_os.deal_rooms d where d.id=v_elias_deal;
  insert into platform.deal_origin_attributions(tenant_id,deal_room_id,route_type,source_person_id,intermediary_person_id,origin_note,originated_at,confirmation_status,confirmed_at,confirmed_by,created_by,updated_by)
  select p_tenant_id,v_leo_deal,'warm_introduction',v_thomas,v_luca,'Synthetic Northstar: opportunity originated through the recorded Luca Moretti introduction route.',d.created_at,'confirmed',now(),v_owner,v_owner,v_owner from djm_os.deal_rooms d where d.id=v_leo_deal;
  return jsonb_build_object('seeded',true,'elias',public.platform_server_deal_origin(p_tenant_id,v_elias_deal),'leo',public.platform_server_deal_origin(p_tenant_id,v_leo_deal));
end;$$;

create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_reset jsonb; v_core jsonb; v_access jsonb; v_history jsonb; v_guardrails jsonb; v_career jsonb; v_origins jsonb;
begin
  v_reset:=public.platform_server_reset_demo_operating_history(p_tenant_id);
  v_core:=public.platform_server_seed_demo_story_core_v2(p_tenant_id);
  v_access:=public.platform_server_seed_demo_access_story(p_tenant_id);
  v_history:=public.platform_server_seed_demo_deal_history(p_tenant_id);
  v_guardrails:=public.platform_server_seed_demo_guardrails(p_tenant_id);
  v_career:=public.platform_server_seed_demo_career_strategies(p_tenant_id);
  v_origins:=public.platform_server_seed_demo_deal_origins(p_tenant_id);
  return v_core || jsonb_build_object(
    'story_version','v7','operating_reset',v_reset,'access_story',v_access,'deal_history',v_history,'negotiation_guardrails',v_guardrails,
    'career_strategies',v_career,'deal_origins',v_origins,'deal_portfolio',public.platform_server_deal_portfolio_v4(p_tenant_id,10),
    'revenue_command',public.platform_server_revenue_command(p_tenant_id,8),'player_service',public.platform_server_player_service_command(p_tenant_id,20),
    'career_strategy_command',public.platform_server_career_strategy_command(p_tenant_id,20),'route_learning',public.platform_server_route_learning(p_tenant_id,730),
    'market_learning',public.platform_server_market_learning(p_tenant_id,730),'agency_learning',public.platform_server_agency_learning_v2(p_tenant_id,365),
    'executive_home',public.platform_server_agency_home_executive(p_tenant_id,5)
  );
end;$$;

revoke all on function public.platform_server_seed_demo_deal_origins(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_seed_demo_story(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_deal_origins(uuid) to service_role;
grant execute on function public.platform_server_seed_demo_story(uuid) to service_role;;
