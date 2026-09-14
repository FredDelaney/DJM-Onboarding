create table if not exists platform.deal_origin_attributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  deal_room_id uuid not null references djm_os.deal_rooms(id) on delete cascade,
  route_type text not null check (route_type in ('direct_relationship','warm_introduction','inbound_club','club_need_match','player_outreach','scout_originated','partner_referral','other')),
  source_person_id uuid references djm_os.people(id) on delete set null,
  intermediary_person_id uuid references djm_os.people(id) on delete set null,
  origin_note text,
  originated_at timestamptz,
  confirmation_status text not null default 'confirmed' check (confirmation_status in ('unconfirmed','confirmed')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,deal_room_id)
);
create index if not exists deal_origin_attributions_deal_room_idx on platform.deal_origin_attributions(deal_room_id);
create index if not exists deal_origin_attributions_source_person_idx on platform.deal_origin_attributions(source_person_id);
create index if not exists deal_origin_attributions_intermediary_idx on platform.deal_origin_attributions(intermediary_person_id);
create index if not exists deal_origin_attributions_confirmed_by_idx on platform.deal_origin_attributions(confirmed_by);
create index if not exists deal_origin_attributions_created_by_idx on platform.deal_origin_attributions(created_by);
create index if not exists deal_origin_attributions_updated_by_idx on platform.deal_origin_attributions(updated_by);
create index if not exists deal_origin_attributions_tenant_route_idx on platform.deal_origin_attributions(tenant_id,route_type,confirmation_status);
alter table platform.deal_origin_attributions enable row level security;
revoke all on platform.deal_origin_attributions from public,anon,authenticated;
grant select,insert,update,delete on platform.deal_origin_attributions to service_role;

create or replace function public.platform_server_deal_origin(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_d djm_os.deal_rooms%rowtype; v_a platform.deal_origin_attributions%rowtype; v_source text; v_intermediary text; begin
  select * into v_d from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  select * into v_a from platform.deal_origin_attributions a where a.tenant_id=p_tenant_id and a.deal_room_id=p_deal_room_id;
  if v_a.source_person_id is not null then select full_name into v_source from djm_os.people where id=v_a.source_person_id and tenant_id=p_tenant_id; end if;
  if v_a.intermediary_person_id is not null then select full_name into v_intermediary from djm_os.people where id=v_a.intermediary_person_id and tenant_id=p_tenant_id; end if;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'deal_title',v_d.title,
    'state',case when v_a.id is null then 'missing' else v_a.confirmation_status end,
    'origin',case when v_a.id is null then null else jsonb_build_object(
      'id',v_a.id,'route_type',v_a.route_type,'source_person_id',v_a.source_person_id,'source_person_name',v_source,
      'intermediary_person_id',v_a.intermediary_person_id,'intermediary_person_name',v_intermediary,'origin_note',v_a.origin_note,
      'originated_at',v_a.originated_at,'confirmation_status',v_a.confirmation_status,'confirmed_at',v_a.confirmed_at,'updated_at',v_a.updated_at
    ) end,
    'truth_contract',jsonb_build_object(
      'origin','Deal origin is explicit provenance recorded by agency staff. It is not inferred from the contact currently attached to the deal.',
      'route_effectiveness','A route type describes how the opportunity entered the agency, not why the deal succeeded or failed.',
      'confirmation','Confirmed means a staff member explicitly recorded the attribution.'
    )
  );
end;$$;

create or replace function public.platform_server_save_deal_origin(p_tenant_id uuid,p_deal_room_id uuid,p_actor_user_id uuid,p_route_type text,p_source_person_id uuid default null,p_intermediary_person_id uuid default null,p_origin_note text default null,p_originated_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_role text; v_d djm_os.deal_rooms%rowtype; v_existing platform.deal_origin_attributions%rowtype; v_row platform.deal_origin_attributions%rowtype; begin
  if p_route_type not in ('direct_relationship','warm_introduction','inbound_club','club_need_match','player_outreach','scout_originated','partner_referral','other') then raise exception 'invalid_route_type'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_d from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people p where p.id=p_source_person_id and p.tenant_id=p_tenant_id) then raise exception 'source_person_not_found_for_tenant'; end if;
  if p_intermediary_person_id is not null and not exists(select 1 from djm_os.people p where p.id=p_intermediary_person_id and p.tenant_id=p_tenant_id) then raise exception 'intermediary_not_found_for_tenant'; end if;
  if p_route_type='warm_introduction' and p_intermediary_person_id is null then raise exception 'warm_introduction_requires_intermediary'; end if;
  if p_route_type='club_need_match' and v_d.club_need_id is null then raise exception 'club_need_match_requires_linked_club_need'; end if;
  select * into v_existing from platform.deal_origin_attributions a where a.tenant_id=p_tenant_id and a.deal_room_id=p_deal_room_id for update;
  insert into platform.deal_origin_attributions(tenant_id,deal_room_id,route_type,source_person_id,intermediary_person_id,origin_note,originated_at,confirmation_status,confirmed_at,confirmed_by,created_by,updated_by)
  values(p_tenant_id,p_deal_room_id,p_route_type,p_source_person_id,p_intermediary_person_id,nullif(trim(p_origin_note),''),coalesce(p_originated_at,v_d.created_at),'confirmed',now(),p_actor_user_id,p_actor_user_id,p_actor_user_id)
  on conflict (tenant_id,deal_room_id) do update set route_type=excluded.route_type,source_person_id=excluded.source_person_id,intermediary_person_id=excluded.intermediary_person_id,origin_note=excluded.origin_note,originated_at=excluded.originated_at,confirmation_status='confirmed',confirmed_at=now(),confirmed_by=p_actor_user_id,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_origin.saved','deal',p_deal_room_id::text,case when v_existing.id is null then null else to_jsonb(v_existing) end,to_jsonb(v_row),jsonb_build_object('route_type',p_route_type));
  return public.platform_server_deal_origin(p_tenant_id,p_deal_room_id);
end;$$;

create or replace function public.platform_server_route_learning(p_tenant_id uuid,p_window_days integer default 730)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_days integer:=greatest(90,least(coalesce(p_window_days,730),1460)); v_tenant platform.tenants%rowtype; v_routes jsonb; v_active integer:=0; v_attributed integer:=0; v_policy_eligible boolean:=false; begin
  select * into v_tenant from platform.tenants where id=p_tenant_id and status='active'; if not found then raise exception 'tenant_not_found'; end if;
  v_policy_eligible:=not coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);
  select count(*),count(*) filter(where a.confirmation_status='confirmed') into v_active,v_attributed
    from djm_os.deal_rooms d left join platform.deal_origin_attributions a on a.tenant_id=d.tenant_id and a.deal_room_id=d.id
    where d.tenant_id=p_tenant_id and d.status='active';
  with base as (
    select d.id,d.status,d.stage,a.route_type,
      greatest(
        case d.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end,
        coalesce((select max(case s.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end) from platform.deal_state_snapshots s where s.tenant_id=d.tenant_id and s.deal_room_id=d.id),0)
      ) as max_stage_rank
    from djm_os.deal_rooms d join platform.deal_origin_attributions a on a.tenant_id=d.tenant_id and a.deal_room_id=d.id and a.confirmation_status='confirmed'
    where d.tenant_id=p_tenant_id and d.created_at>=now()-make_interval(days=>v_days)
  ), stats as (
    select route_type,count(*)::int as deal_count,count(*) filter(where max_stage_rank>=3)::int as serious_count,count(*) filter(where max_stage_rank>=4)::int as negotiation_count,count(*) filter(where status='won')::int as won_count,count(*) filter(where status='lost')::int as lost_count,count(*) filter(where status in ('won','lost'))::int as resolved_count from base group by route_type
  ), rates as (
    select s.*,serious_count::numeric/nullif(deal_count,0) as serious_rate,won_count::numeric/nullif(resolved_count,0) as win_rate,
      case when deal_count<10 then 'insufficient' when deal_count<25 then 'emerging' else 'usable' end as funnel_evidence_state,
      case when resolved_count<8 then 'insufficient' when resolved_count<20 then 'emerging' else 'usable' end as close_evidence_state from stats s
  ), intervals as (
    select r.*,
      case when deal_count=0 then null else greatest(0::numeric,((serious_rate+3.8416/(2*deal_count))/(1+3.8416/deal_count))-(1.96*sqrt((serious_rate*(1-serious_rate)+3.8416/(4*deal_count))/deal_count)/(1+3.8416/deal_count))) end as serious_low,
      case when deal_count=0 then null else least(1::numeric,((serious_rate+3.8416/(2*deal_count))/(1+3.8416/deal_count))+(1.96*sqrt((serious_rate*(1-serious_rate)+3.8416/(4*deal_count))/deal_count)/(1+3.8416/deal_count))) end as serious_high,
      case when resolved_count=0 then null else greatest(0::numeric,((win_rate+3.8416/(2*resolved_count))/(1+3.8416/resolved_count))-(1.96*sqrt((win_rate*(1-win_rate)+3.8416/(4*resolved_count))/resolved_count)/(1+3.8416/resolved_count))) end as win_low,
      case when resolved_count=0 then null else least(1::numeric,((win_rate+3.8416/(2*resolved_count))/(1+3.8416/resolved_count))+(1.96*sqrt((win_rate*(1-win_rate)+3.8416/(4*resolved_count))/resolved_count)/(1+3.8416/resolved_count))) end as win_high
    from rates r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'route_type',route_type,'deal_count',deal_count,'serious_interest_count',serious_count,'negotiation_count',negotiation_count,'resolved_count',resolved_count,'won_count',won_count,'lost_count',lost_count,
    'funnel_evidence_state',funnel_evidence_state,'close_evidence_state',close_evidence_state,
    'decision_serious_interest_rate',case when deal_count>=10 then round(serious_rate,4) else null end,
    'serious_interest_wilson_95',case when deal_count>=10 then jsonb_build_object('low',round(serious_low,4),'high',round(serious_high,4)) else null end,
    'decision_resolved_win_rate',case when resolved_count>=8 then round(win_rate,4) else null end,
    'resolved_win_wilson_95',case when resolved_count>=8 then jsonb_build_object('low',round(win_low,4),'high',round(win_high,4)) else null end,
    'recommendation',case when not v_policy_eligible then 'synthetic_demo_only' when funnel_evidence_state='usable' and serious_low>=0.55 and close_evidence_state='usable' and win_low>=0.50 then 'stronger_origin_route_candidate' when funnel_evidence_state='usable' and serious_high<=0.45 and close_evidence_state='usable' and win_high<=0.40 then 'weaker_origin_route_candidate' else 'keep_learning_or_mixed' end,
    'policy_change_allowed',false
  ) order by deal_count desc,route_type),'[]'::jsonb) into v_routes from intervals;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'window_days',v_days,
    'coverage',jsonb_build_object('active_deals',v_active,'active_deals_with_confirmed_origin',v_attributed,'active_deals_missing_confirmed_origin',greatest(v_active-v_attributed,0)),
    'routes',v_routes,
    'evidence_policy',jsonb_build_object('funnel_minimum',10,'funnel_usable',25,'close_minimum',8,'close_usable',20,'confidence_interval','95% Wilson score interval','automatic_policy_changes',false),
    'truth_contract',jsonb_build_object('provenance','Only human-confirmed deal origin attribution enters route learning.','causality','Observed route outcomes do not prove the route caused the result.','selection_bias','Different routes may be used for different player or club contexts.','missing_history','Deals without confirmed origin attribution are excluded rather than guessed.')
  );
end;$$;

revoke all on function public.platform_server_deal_origin(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_save_deal_origin(uuid,uuid,uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.platform_server_route_learning(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_origin(uuid,uuid) to service_role;
grant execute on function public.platform_server_save_deal_origin(uuid,uuid,uuid,text,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.platform_server_route_learning(uuid,integer) to service_role;;
