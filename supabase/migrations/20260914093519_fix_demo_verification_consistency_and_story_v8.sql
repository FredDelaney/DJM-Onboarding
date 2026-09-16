create or replace function public.platform_server_seed_demo_verification_consistency(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_updated int:=0; begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false)=true) then
    raise exception 'synthetic_demo_tenant_required';
  end if;
  update public.players p
  set verified_at=coalesce(p.verified_at,p.created_at,now())
  where p.tenant_id=p_tenant_id and p.verification_status='verified' and p.verified_at is null;
  get diagnostics v_updated=row_count;
  return jsonb_build_object('updated_players',v_updated,'truth_contract',jsonb_build_object('scope','Synthetic demo data only. This does not verify any real player.'));
end;
$function$;

create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reset jsonb; v_core jsonb; v_access jsonb; v_history jsonb; v_guardrails jsonb; v_career jsonb; v_origins jsonb; v_verification jsonb;
begin
  v_reset:=public.platform_server_reset_demo_operating_history(p_tenant_id);
  v_core:=public.platform_server_seed_demo_story_core_v2(p_tenant_id);
  v_verification:=public.platform_server_seed_demo_verification_consistency(p_tenant_id);
  v_access:=public.platform_server_seed_demo_access_story(p_tenant_id);
  v_history:=public.platform_server_seed_demo_deal_history(p_tenant_id);
  v_guardrails:=public.platform_server_seed_demo_guardrails(p_tenant_id);
  v_career:=public.platform_server_seed_demo_career_strategies(p_tenant_id);
  v_origins:=public.platform_server_seed_demo_deal_origins(p_tenant_id);
  return v_core || jsonb_build_object(
    'story_version','v8','operating_reset',v_reset,'verification_consistency',v_verification,'access_story',v_access,'deal_history',v_history,'negotiation_guardrails',v_guardrails,
    'career_strategies',v_career,'deal_origins',v_origins,'deal_portfolio',public.platform_server_deal_portfolio_v4(p_tenant_id,10),
    'revenue_command',public.platform_server_revenue_command(p_tenant_id,8),'player_service',public.platform_server_player_service_command(p_tenant_id,20),
    'career_strategy_command',public.platform_server_career_strategy_command(p_tenant_id,20),'route_learning',public.platform_server_route_learning(p_tenant_id,730),
    'market_learning',public.platform_server_market_learning(p_tenant_id,730),'agency_learning',public.platform_server_agency_learning_v2(p_tenant_id,365),
    'executive_home',public.platform_server_agency_home_executive(p_tenant_id,5)
  );
end;$function$;

revoke all on function public.platform_server_seed_demo_verification_consistency(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_seed_demo_story(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_verification_consistency(uuid) to service_role;
grant execute on function public.platform_server_seed_demo_story(uuid) to service_role;;
