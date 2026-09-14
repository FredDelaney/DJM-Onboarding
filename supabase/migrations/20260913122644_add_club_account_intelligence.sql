create or replace function public.platform_server_club_account(p_tenant_id uuid, p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_org djm_os.organisations%rowtype;
  v_direct jsonb;
  v_intro jsonb;
  v_network jsonb;
  v_network_item jsonb;
  v_pursuits jsonb;
  v_playbook jsonb;
  v_plays jsonb;
  v_needs jsonb;
  v_deals jsonb;
  v_commercial jsonb;
  v_interactions jsonb;
  v_tasks jsonb;
  v_commitments jsonb;
  v_evidence jsonb;
  v_active_deals integer:=0;
  v_active_needs integer:=0;
  v_confirmed_needs integer:=0;
  v_direct_score integer:=0;
  v_intro_score integer:=0;
  v_account_state text;
  v_top_play jsonb;
  v_interactions_30d integer:=0;
  v_interactions_180d integer:=0;
begin
  select * into v_org from djm_os.organisations o where o.id=p_organisation_id and o.tenant_id=p_tenant_id;
  if not found then raise exception 'organisation_not_found_for_tenant'; end if;

  v_direct:=public.platform_server_access_routes(p_tenant_id,p_organisation_id,5);
  v_intro:=public.platform_server_introduction_routes(p_tenant_id,p_organisation_id,5);
  begin v_direct_score:=coalesce((v_direct->'best_route'->>'route_score')::integer,0); exception when others then v_direct_score:=0; end;
  begin v_intro_score:=coalesce((v_intro->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro_score:=0; end;

  select count(*)::integer,count(*) filter(where n.need_type='confirmed')::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'club_need_id',n.id,'title',n.title,'position',n.position,'need_type',n.need_type,'priority',n.priority,
           'status',n.status,'confidence',n.confidence,'confirmed_at',n.confirmed_at,'expires_at',n.expires_at,
           'transfer_type',n.transfer_type,'salary_budget',n.salary_budget,'transfer_budget',n.transfer_budget,'currency',n.currency,
           'profile_notes',n.profile_notes,'updated_at',n.updated_at
         ) order by n.priority desc nulls last,n.expires_at nulls last,n.updated_at desc),'[]'::jsonb)
  into v_active_needs,v_confirmed_needs,v_needs
  from djm_os.club_needs n
  where n.tenant_id=p_tenant_id and n.organisation_id=p_organisation_id and n.status='active';

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'deal_room_id',d.id,'title',d.title,'player_id',d.player_id,'club_need_id',d.club_need_id,'stage',d.stage,
           'probability',coalesce(d.probability,d.manual_probability,d.model_probability,0),'expected_commission',d.expected_commission,'currency',d.currency,
           'primary_blocker',d.primary_blocker,'next_action_text',d.next_action_text,'next_action_at',d.next_action_at,
           'last_meaningful_at',d.last_meaningful_at,'updated_at',d.updated_at
         ) order by d.expected_commission desc nulls last,d.updated_at desc),'[]'::jsonb)
  into v_active_deals,v_deals
  from djm_os.deal_rooms d
  where d.tenant_id=p_tenant_id and d.organisation_id=p_organisation_id and d.status='active';

  with g as (
    select coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,
           count(*)::integer as active_deals,
           coalesce(sum(d.expected_commission),0) as expected_commission,
           coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0) as weighted_commission
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.organisation_id=p_organisation_id and d.status='active'
    group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
  )
  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',round(weighted_commission,2)) order by currency),'[]'::jsonb)
  into v_commercial from g;

  v_pursuits:=public.platform_server_pursuit_board(p_tenant_id,50);
  select coalesce(jsonb_agg(x.value order by (x.value->>'rank')::integer),'[]'::jsonb)
  into v_pursuits
  from jsonb_array_elements(coalesce(v_pursuits->'items','[]'::jsonb)) x
  where x.value->'club'->>'organisation_id'=p_organisation_id::text;

  v_playbook:=public.platform_server_agency_playbook(p_tenant_id,20);
  select coalesce(jsonb_agg(x.value order by (x.value->>'rank')::integer),'[]'::jsonb)
  into v_plays
  from jsonb_array_elements(coalesce(v_playbook->'plays','[]'::jsonb)) x
  where coalesce(
    x.value->'evidence'->>'organisation_id',
    x.value->'evidence'->'pursuit'->'club'->>'organisation_id',
    x.value->'evidence'->'access'->'organisation'->>'organisation_id'
  )=p_organisation_id::text;
  if jsonb_array_length(v_plays)>0 then v_top_play:=v_plays->0; end if;

  select count(*) filter(where i.occurred_at>=now()-interval '30 days')::integer,
         count(*) filter(where i.occurred_at>=now()-interval '180 days')::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'interaction_id',i.id,'occurred_at',i.occurred_at,'channel',i.channel,'direction',i.direction,
           'person_id',i.person_id,'person_name',p.full_name,'team_member_id',i.team_member_id,'team_member_name',tm.display_name,
           'summary',i.summary,'source_type',i.source_type,'confidence',i.confidence
         ) order by i.occurred_at desc) filter(where rn<=10),'[]'::jsonb)
  into v_interactions_30d,v_interactions_180d,v_interactions
  from (
    select i.*,row_number() over(order by i.occurred_at desc) rn
    from djm_os.interactions i where i.tenant_id=p_tenant_id and i.organisation_id=p_organisation_id
  ) i
  left join djm_os.people p on p.id=i.person_id and p.tenant_id=p_tenant_id
  left join djm_os.team_members tm on tm.user_id=i.team_member_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id',t.id,'title',t.title,'task_type',t.task_type,'priority',t.priority,'due_at',t.due_at,'status',t.status,
    'owner_user_id',t.owner_user_id,'owner_name',tm.display_name,'player_id',t.player_id,'club_need_id',t.club_need_id,'source',t.source
  ) order by t.priority desc,t.due_at nulls last,t.created_at desc),'[]'::jsonb)
  into v_tasks
  from djm_os.tasks t
  left join djm_os.team_members tm on tm.user_id=t.owner_user_id
  where t.tenant_id=p_tenant_id and t.status='open'
    and (t.organisation_id=p_organisation_id or exists(select 1 from djm_os.club_needs n where n.id=t.club_need_id and n.tenant_id=p_tenant_id and n.organisation_id=p_organisation_id));

  select coalesce(jsonb_agg(jsonb_build_object(
    'commitment_id',c.id,'proposal_id',c.proposal_id,'command_id',c.command_id,'task_id',c.task_id,'status',c.status,'due_at',c.due_at,'owner_user_id',c.owner_user_id,'metadata',c.metadata
  ) order by c.due_at nulls last,c.created_at desc),'[]'::jsonb)
  into v_commitments
  from platform.agency_commitments c
  join djm_os.tasks t on t.id=c.task_id and t.tenant_id=c.tenant_id
  where c.tenant_id=p_tenant_id and c.status in ('active','overdue')
    and (t.organisation_id=p_organisation_id or exists(select 1 from djm_os.club_needs n where n.id=t.club_need_id and n.tenant_id=p_tenant_id and n.organisation_id=p_organisation_id));

  with commands as (
    select x.value as command
    from jsonb_array_elements(public.platform_server_agency_decisions(p_tenant_id,25)->'commands') x
  ), related as (
    select command
    from commands c
    where (c.command->>'source_type'='deal_room' and exists(select 1 from djm_os.deal_rooms d where d.id=(c.command->>'source_id')::uuid and d.tenant_id=p_tenant_id and d.organisation_id=p_organisation_id))
       or (c.command->>'source_type'='club_need' and exists(select 1 from djm_os.club_needs n where n.id=(c.command->>'source_id')::uuid and n.tenant_id=p_tenant_id and n.organisation_id=p_organisation_id))
       or (c.command->>'source_type'='task' and exists(select 1 from djm_os.tasks t left join djm_os.club_needs n on n.id=t.club_need_id and n.tenant_id=t.tenant_id where t.id=(c.command->>'source_id')::uuid and t.tenant_id=p_tenant_id and (t.organisation_id=p_organisation_id or n.organisation_id=p_organisation_id)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'command_id',command->>'command_id','title',command->>'title','priority_score',(command->>'priority_score')::integer,'priority_band',command->>'priority_band',
    'evidence_score',(command->'evidence_health'->>'score')::integer,'evidence_state',command->'evidence_health'->>'state','evidence_gate',command->'actionability'->>'evidence_gate','verify_reasons',command->'evidence_health'->'verify_reasons'
  ) order by (command->>'priority_score')::integer desc),'[]'::jsonb)
  into v_evidence from related;

  v_network:=public.platform_server_network_coverage(p_tenant_id);
  select x.value into v_network_item from jsonb_array_elements(coalesce(v_network->'clubs','[]'::jsonb)) x where x.value->>'organisation_id'=p_organisation_id::text limit 1;

  v_account_state:=case
    when v_active_deals>0 and v_direct_score>=75 then 'commercially_active_well_connected'
    when v_active_deals>0 and v_direct_score<60 and v_intro_score>=80 then 'commercially_active_warm_introduction_available'
    when v_active_deals>0 and v_direct_score<60 then 'commercially_active_underconnected'
    when v_confirmed_needs>0 and v_direct_score>=60 then 'live_demand_connected'
    when v_confirmed_needs>0 and v_intro_score>=80 then 'live_demand_warm_introduction_available'
    when v_confirmed_needs>0 then 'live_demand_access_gap'
    when v_direct_score>=75 then 'relationship_strong_no_live_business'
    else 'relationship_development' end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),
    'club',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'city',v_org.city,'league_name',v_org.league_name,'website_url',v_org.website_url,'transfermarkt_url',v_org.transfermarkt_url),
    'account_state',v_account_state,
    'account_priority_score',case when v_top_play is null then null else (v_top_play->>'play_score')::integer end,
    'top_strategic_play',v_top_play,
    'strategic_plays',v_plays,
    'demand',jsonb_build_object('active_needs',v_active_needs,'confirmed_needs',v_confirmed_needs,'items',v_needs),
    'commercial',jsonb_build_object('active_deals',v_active_deals,'by_currency',v_commercial,'deals',v_deals),
    'pursuits',v_pursuits,
    'access',jsonb_build_object('direct',v_direct,'introductions',v_intro,'network_coverage',v_network_item),
    'relationship_activity',jsonb_build_object('interactions_30d',v_interactions_30d,'interactions_180d',v_interactions_180d,'recent',v_interactions),
    'open_work',jsonb_build_object('tasks',v_tasks,'commitments',v_commitments),
    'evidence_risk',v_evidence,
    'truth_contract',jsonb_build_object(
      'commercial','recorded_deal_rooms_only','demand','recorded_club_needs_only','direct_access','recorded_relationships_only','introduction_paths','recorded_tenant_scoped_relationship_graph_only',
      'pursuit_readiness','deterministic_fit_and_feasibility_score_not_transfer_probability','account_priority','top_strategic_play_score_not_probability'
    )
  );
end;
$$;

revoke all on function public.platform_server_club_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_club_account(uuid,uuid) to service_role;;
