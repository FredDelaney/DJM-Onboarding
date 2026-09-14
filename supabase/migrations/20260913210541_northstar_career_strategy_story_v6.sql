create or replace function public.platform_server_seed_demo_career_strategies(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_meta jsonb;
  v_owner uuid;
  v_elias uuid;
  v_marcus uuid;
  v_leo uuid;
  v_andre uuid;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_seed_requires_synthetic_tenant'; end if;
  select m.user_id into v_owner from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin') order by case when m.role='owner' then 0 else 1 end limit 1;
  if v_owner is null then raise exception 'demo_owner_missing'; end if;

  select id into v_elias from public.players where tenant_id=p_tenant_id and lower(trim(concat_ws(' ',first_name,last_name)))='elias novak' limit 1;
  select id into v_marcus from public.players where tenant_id=p_tenant_id and lower(trim(concat_ws(' ',first_name,last_name)))='marcus bell' limit 1;
  select id into v_leo from public.players where tenant_id=p_tenant_id and lower(trim(concat_ws(' ',first_name,last_name)))='leo martin' limit 1;
  select id into v_andre from public.players where tenant_id=p_tenant_id and lower(trim(concat_ws(' ',first_name,last_name)))='andre costa' limit 1;
  if v_elias is null or v_marcus is null or v_leo is null or v_andre is null then raise exception 'demo_players_missing'; end if;

  delete from platform.player_career_strategies where tenant_id=p_tenant_id;

  insert into platform.player_career_strategies(
    tenant_id,player_id,version,status,confirmation_status,strategy,review_due_at,player_confirmed_at,confirmation_method,created_by,updated_by,approved_by,approved_at
  ) values (
    p_tenant_id,v_elias,1,'approved','confirmed',
    jsonb_build_object(
      'objective','Secure a starting role in a stronger European first division while preserving development continuity.',
      'preferred_pathway','Permanent transfer into a club with a realistic starting-role pathway.',
      'fallback_pathway','Remain at the current club if the sporting role or contract structure is not clearly better.',
      'target_window',jsonb_build_object('start_date','2026-08-01','end_date','2026-09-30'),
      'target_markets',jsonb_build_array('Netherlands','Belgium','Austria'),
      'avoid_markets',jsonb_build_array('Saudi Arabia'),
      'target_club_profile','Top-flight or strong second-tier club with a defined winger role and credible minutes pathway.',
      'development_focus',jsonb_build_array('decision-making in final third','repeat high-intensity actions'),
      'player_priorities',jsonb_build_object('playing_time',5,'development',5,'sporting_level',4,'financial',3,'geography',3),
      'non_negotiables',jsonb_build_array('No move without a credible sporting role'),
      'acceptable_tradeoffs',jsonb_build_array('Moderate short-term salary trade-off for stronger sporting pathway'),
      'next_checkpoint','Resolve the Westhaven process or decide whether to widen the target-club list.',
      'success_signals',jsonb_build_array('Defined role','credible minutes pathway','commercial terms within agreed range'),
      'notes','Synthetic Northstar career strategy for product demonstration only'
    ),
    current_date+7,now(),'synthetic_demo_player_confirmation',v_owner,v_owner,v_owner,now()
  );

  insert into platform.player_career_strategies(
    tenant_id,player_id,version,status,confirmation_status,strategy,review_due_at,player_confirmed_at,confirmation_method,created_by,updated_by,approved_by,approved_at
  ) values (
    p_tenant_id,v_marcus,1,'approved','confirmed',
    jsonb_build_object(
      'objective','Resolve the contract position early enough to protect sporting choice and negotiating leverage before the final contract months.',
      'preferred_pathway','Agree a strong extension or create an organised external market before the contract reaches its final weeks.',
      'fallback_pathway','Prepare for free agency with a defined shortlist and current player pack.',
      'target_window',jsonb_build_object('start_date','2026-09-01','end_date','2026-10-31'),
      'target_markets',jsonb_build_array('Belgium','Netherlands','Denmark'),
      'avoid_markets',jsonb_build_array(),
      'target_club_profile','Club offering a clear first-team role and contract security.',
      'development_focus',jsonb_build_array('role continuity','first-team minutes'),
      'player_priorities',jsonb_build_object('playing_time',5,'development',4,'sporting_level',4,'financial',4,'geography',3),
      'non_negotiables',jsonb_build_array('Do not drift into the final contract period without an explicit strategy'),
      'acceptable_tradeoffs',jsonb_build_array('Consider a lower nominal salary for stronger contract security and role clarity'),
      'next_checkpoint','Decide extension versus active market process with the player.',
      'success_signals',jsonb_build_array('Contract strategy chosen','market process active if extension is not preferred'),
      'notes','Synthetic Northstar career strategy for product demonstration only'
    ),
    current_date+5,now(),'synthetic_demo_player_confirmation',v_owner,v_owner,v_owner,now()
  );

  insert into platform.player_career_strategies(
    tenant_id,player_id,version,status,confirmation_status,strategy,review_due_at,created_by,updated_by
  ) values (
    p_tenant_id,v_leo,1,'draft','unconfirmed',
    jsonb_build_object(
      'objective','Explore a move only if the sporting level and role represent a clear step forward.',
      'preferred_pathway','Selective permanent move with strong role clarity.',
      'fallback_pathway','Stay and reassess after the next sporting block.',
      'target_window',jsonb_build_object('start_date','2026-08-15','end_date','2026-09-30'),
      'target_markets',jsonb_build_array('Belgium','Netherlands'),
      'avoid_markets',jsonb_build_array(),
      'target_club_profile','Club with a clear technical role and realistic progression pathway.',
      'development_focus',jsonb_build_array('role definition','consistent senior minutes'),
      'player_priorities',jsonb_build_object('playing_time',5,'development',4,'sporting_level',4,'financial',3,'geography',3),
      'non_negotiables',jsonb_build_array(),
      'acceptable_tradeoffs',jsonb_build_array(),
      'next_checkpoint','Confirm with Leo whether Belgium remains a preferred market before advancing Riverton.',
      'success_signals',jsonb_build_array('Player confirms market preference','club role is clear'),
      'notes','Synthetic Northstar draft strategy, intentionally awaiting player confirmation'
    ),
    current_date+10,v_owner,v_owner
  );

  return jsonb_build_object(
    'seeded',true,
    'elias',public.platform_server_player_career_alignment(p_tenant_id,v_elias),
    'marcus',public.platform_server_player_career_alignment(p_tenant_id,v_marcus),
    'leo',public.platform_server_player_career_alignment(p_tenant_id,v_leo),
    'andre',public.platform_server_player_career_alignment(p_tenant_id,v_andre)
  );
end;$$;

create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_reset jsonb;
  v_core jsonb;
  v_access jsonb;
  v_history jsonb;
  v_guardrails jsonb;
  v_career jsonb;
begin
  v_reset:=public.platform_server_reset_demo_operating_history(p_tenant_id);
  v_core:=public.platform_server_seed_demo_story_core_v2(p_tenant_id);
  v_access:=public.platform_server_seed_demo_access_story(p_tenant_id);
  v_history:=public.platform_server_seed_demo_deal_history(p_tenant_id);
  v_guardrails:=public.platform_server_seed_demo_guardrails(p_tenant_id);
  v_career:=public.platform_server_seed_demo_career_strategies(p_tenant_id);
  return v_core || jsonb_build_object(
    'story_version','v6',
    'operating_reset',v_reset,
    'access_story',v_access,
    'deal_history',v_history,
    'negotiation_guardrails',v_guardrails,
    'career_strategies',v_career,
    'deal_portfolio',public.platform_server_deal_portfolio_v4(p_tenant_id,10),
    'revenue_command',public.platform_server_revenue_command(p_tenant_id,8),
    'player_service',public.platform_server_player_service_command(p_tenant_id,20),
    'career_strategy_command',public.platform_server_career_strategy_command(p_tenant_id,20),
    'executive_home',public.platform_server_agency_home_executive(p_tenant_id,5)
  );
end;$$;

revoke all on function public.platform_server_seed_demo_career_strategies(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_career_strategies(uuid) to service_role;
revoke all on function public.platform_server_seed_demo_story(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_story(uuid) to service_role;;
