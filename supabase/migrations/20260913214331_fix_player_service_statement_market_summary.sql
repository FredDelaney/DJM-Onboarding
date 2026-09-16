create or replace function public.platform_server_player_service_statement(p_tenant_id uuid,p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_p public.players%rowtype;
  v_owner jsonb;
  v_strategy platform.player_career_strategies%rowtype;
  v_market jsonb;
  v_requests jsonb;
  v_assurance jsonb;
  v_player_assurance jsonb;
  v_last timestamptz;
begin
  select * into v_p from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;

  select jsonb_build_object('user_id',m.user_id,'name',coalesce(tm.display_name,u.email),'role_title',tm.role_title)
  into v_owner
  from platform.tenant_memberships m
  join auth.users u on u.id=m.user_id
  left join djm_os.team_members tm on tm.user_id=m.user_id
  where m.tenant_id=p_tenant_id and m.user_id=v_p.primary_staff_user_id and m.status='active' limit 1;

  select * into v_strategy from platform.player_career_strategies s
  where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status in ('draft','approved')
  order by case when s.status='approved' then 0 else 1 end,s.version desc limit 1;

  select jsonb_build_object(
    'active_deals',coalesce(sum(cnt),0),
    'stages',coalesce(jsonb_object_agg(stage,cnt) filter(where stage is not null),'{}'::jsonb),
    'market_matches',(select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')),
    'active_opportunities',(select count(*) from public.player_opportunities po where po.player_id=p_player_id and po.stage not in ('won','lost')),
    'club_names_hidden',true
  ) into v_market
  from (
    select d.stage,count(*)::integer cnt
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active'
    group by d.stage
  ) x;

  select jsonb_build_object(
    'open',count(*) filter(where pr.status<>'completed'),
    'overdue',count(*) filter(where pr.status<>'completed' and pr.due_at is not null and pr.due_at<now())
  ) into v_requests from public.player_requests pr where pr.player_id=p_player_id;

  v_assurance:=public.platform_server_service_assurance_v2(p_tenant_id,500);
  select value into v_player_assurance from jsonb_array_elements(coalesce(v_assurance->'players','[]'::jsonb)) where value->>'player_id'=p_player_id::text limit 1;

  select max(ts) into v_last from (
    values
      (v_p.updated_at),
      (v_strategy.updated_at),
      ((select max(coalesce(d.last_meaningful_at,d.updated_at)) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id)),
      ((select max(t.updated_at) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p_player_id)),
      ((select max(pr.updated_at) from public.player_requests pr where pr.player_id=p_player_id))
  ) a(ts);

  return jsonb_build_object(
    'available',true,'version','player_safe_v1','tenant_id',p_tenant_id,'generated_at',now(),
    'player',jsonb_build_object('player_id',v_p.id,'name',trim(concat_ws(' ',v_p.first_name,v_p.last_name)),'current_club',v_p.current_club,'football_status',v_p.football_status,'contract_status',v_p.contract_status,'contract_expiry',v_p.contract_expiry),
    'primary_staff',v_owner,
    'service_plan',jsonb_build_object('next_action',v_p.next_action,'next_action_due',v_p.next_action_due),
    'career_plan',case when v_strategy.id is null then jsonb_build_object('state','missing') else jsonb_build_object(
      'state',v_strategy.status,'player_confirmation',v_strategy.confirmation_status,'review_due_at',v_strategy.review_due_at,
      'objective',v_strategy.strategy->>'objective','preferred_pathway',v_strategy.strategy->>'preferred_pathway','fallback_pathway',v_strategy.strategy->>'fallback_pathway',
      'next_checkpoint',v_strategy.strategy->>'next_checkpoint','target_window',v_strategy.strategy->'target_window','target_markets',coalesce(v_strategy.strategy->'target_markets','[]'::jsonb)
    ) end,
    'market_activity',coalesce(v_market,jsonb_build_object('active_deals',0,'stages','{}'::jsonb,'market_matches',0,'active_opportunities',0,'club_names_hidden',true)),
    'player_requests',coalesce(v_requests,jsonb_build_object('open',0,'overdue',0)),
    'service_standard',jsonb_build_object('policy_name',v_assurance#>>'{policy,policy_name}','policy_version',v_assurance#>>'{policy,version}','state',coalesce(v_player_assurance->>'state','not_evaluated'),'breaches',coalesce(v_player_assurance->'breaches','[]'::jsonb)),
    'last_recorded_agency_activity_at',v_last,
    'privacy_contract',jsonb_build_object('purpose','Player-facing service transparency without exposing internal negotiation or relationship intelligence.','excluded',jsonb_build_array('fees and commission forecasts','negotiation guardrails','club contact identities','relationship-route intelligence','internal agent notes'),'market_names_hidden',true),
    'truth_contract',jsonb_build_object('activity','Only recorded agency activity is shown; offline work that has not been captured cannot appear.','market_activity','Counts are operating records, not promises of transfer or club interest.')
  );
end;
$function$;

revoke all on function public.platform_server_player_service_statement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_service_statement(uuid,uuid) to service_role;;
