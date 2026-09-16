create table if not exists platform.tenant_operating_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  window_type text not null default 'transfer' check (window_type in ('transfer','renewal','recruitment','preseason','custom')),
  status text not null default 'planned' check (status in ('planned','active','closed','archived')),
  start_date date not null,
  end_date date not null,
  markets jsonb not null default '[]'::jsonb,
  objectives jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date>=start_date)
);
create index if not exists tenant_operating_windows_tenant_dates_idx on platform.tenant_operating_windows(tenant_id,start_date,end_date);
create index if not exists tenant_operating_windows_tenant_status_idx on platform.tenant_operating_windows(tenant_id,status);
alter table platform.tenant_operating_windows enable row level security;
revoke all on platform.tenant_operating_windows from public,anon,authenticated;
grant all on platform.tenant_operating_windows to service_role;

create table if not exists platform.operating_window_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  operating_window_id uuid not null references platform.tenant_operating_windows(id) on delete cascade,
  snapshot_date date not null default current_date,
  snapshot jsonb not null,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  unique(tenant_id,operating_window_id,snapshot_date)
);
create index if not exists operating_window_snapshots_window_date_idx on platform.operating_window_snapshots(operating_window_id,snapshot_date desc);
alter table platform.operating_window_snapshots enable row level security;
revoke all on platform.operating_window_snapshots from public,anon,authenticated;
grant all on platform.operating_window_snapshots to service_role;

create or replace function public.platform_server_save_operating_window(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text; v_id uuid:=nullif(p_input->>'id','')::uuid; v_name text:=nullif(trim(p_input->>'name'),'');
  v_type text:=coalesce(nullif(trim(p_input->>'window_type'),''),'transfer'); v_status text:=coalesce(nullif(trim(p_input->>'status'),''),'planned');
  v_start date:=nullif(p_input->>'start_date','')::date; v_end date:=nullif(p_input->>'end_date','')::date; v_row jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  if v_name is null or v_start is null or v_end is null then raise exception 'name_start_date_end_date_required'; end if;
  if v_end<v_start then raise exception 'operating_window_end_before_start'; end if;
  if v_type not in ('transfer','renewal','recruitment','preseason','custom') then raise exception 'invalid_operating_window_type'; end if;
  if v_status not in ('planned','active','closed','archived') then raise exception 'invalid_operating_window_status'; end if;
  if v_id is null then
    insert into platform.tenant_operating_windows(tenant_id,name,window_type,status,start_date,end_date,markets,objectives,notes,created_by,updated_by)
    values(p_tenant_id,v_name,v_type,v_status,v_start,v_end,coalesce(p_input->'markets','[]'::jsonb),coalesce(p_input->'objectives','{}'::jsonb),nullif(trim(p_input->>'notes'),''),p_actor_user_id,p_actor_user_id) returning id into v_id;
  else
    update platform.tenant_operating_windows set name=v_name,window_type=v_type,status=v_status,start_date=v_start,end_date=v_end,markets=coalesce(p_input->'markets',markets),objectives=coalesce(p_input->'objectives',objectives),notes=coalesce(nullif(trim(p_input->>'notes'),''),notes),updated_by=p_actor_user_id,updated_at=now() where id=v_id and tenant_id=p_tenant_id;
    if not found then raise exception 'operating_window_not_found_for_tenant'; end if;
  end if;
  select to_jsonb(w) into v_row from platform.tenant_operating_windows w where w.id=v_id and w.tenant_id=p_tenant_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','operating_window.saved','operating_window',v_id::text,v_row,jsonb_build_object('status',v_status,'window_type',v_type));
  return jsonb_build_object('saved',true,'operating_window',v_row,'truth_contract',jsonb_build_object('dates','This is an agency-defined operating period. DJM does not claim these dates are league, federation or regulatory registration dates.','objectives','Objectives are human-configured operating goals, not AI-generated commitments.'));
end;$$;

create or replace function public.platform_server_operating_window_command(p_tenant_id uuid,p_operating_window_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_w platform.tenant_operating_windows%rowtype; v_deadlines jsonb; v_receivables jsonb; v_closeout jsonb;
  v_players jsonb; v_needs jsonb; v_live_deals integer:=0; v_players_in_scope integer:=0; v_strategy_gaps integer:=0; v_need_count integer:=0;
begin
  if p_operating_window_id is not null then select * into v_w from platform.tenant_operating_windows w where w.id=p_operating_window_id and w.tenant_id=p_tenant_id;
  else
    select * into v_w from platform.tenant_operating_windows w where w.tenant_id=p_tenant_id and w.status in ('active','planned') order by case when current_date between w.start_date and w.end_date then 0 when w.start_date>current_date then 1 else 2 end,abs(w.start_date-current_date),w.created_at desc limit 1;
  end if;
  if v_w.id is null then return jsonb_build_object('available',false,'tenant_id',p_tenant_id,'reason','no_operating_window_configured','truth_contract',jsonb_build_object('setup','DJM will not invent transfer-window dates. Configure an agency operating window first.')); end if;
  v_deadlines:=public.platform_server_execution_deadline_command(p_tenant_id,greatest(1,least((v_w.end_date-current_date),366)),200);
  v_receivables:=public.platform_server_receivables_command(p_tenant_id,greatest(1,least((v_w.end_date-current_date),366)),100);
  v_closeout:=public.platform_server_deal_closeout_command(p_tenant_id,100);

  with base as (
    select p.id,coalesce(nullif(trim(p.preferred_name),''),trim(concat_ws(' ',p.first_name,p.last_name))) player_name,p.football_status,p.contract_status,p.contract_expiry,p.primary_staff_user_id,
      cs.status strategy_status,cs.review_due_at,cs.strategy->'target_window' target_window,
      coalesce((select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id and d.status='active'),0)::int active_deals,
      coalesce((select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p.id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')),0)::int active_matches
    from public.players p
    left join lateral (select s.* from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p.id and s.status in ('draft','approved') order by case when s.status='approved' then 0 else 1 end,s.updated_at desc limit 1) cs on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), scoped as (
    select b.*,
      case
        when active_deals>0 then 'protect_live_deal'
        when target_window is not null and nullif(target_window->>'start_date','') is not null and nullif(target_window->>'end_date','') is not null and (target_window->>'start_date')::date<=v_w.end_date and (target_window->>'end_date')::date>=v_w.start_date then 'execute_player_market_plan'
        when football_status='free_agent' then 'free_agent_market_work'
        when strategy_status is null then 'career_strategy_missing'
        else 'maintain_outside_window_plan' end lane
    from base b
  ), ranked as (
    select s.*,row_number() over(order by case lane when 'protect_live_deal' then 1 when 'free_agent_market_work' then 2 when 'execute_player_market_plan' then 3 when 'career_strategy_missing' then 4 else 5 end,contract_expiry nulls last,player_name) rn from scoped s
  )
  select coalesce(jsonb_agg(jsonb_build_object('rank',rn,'player_id',id,'player_name',player_name,'lane',lane,'football_status',football_status,'contract_status',contract_status,'contract_expiry',contract_expiry,'has_primary_owner',primary_staff_user_id is not null,'strategy_status',strategy_status,'target_window',target_window,'active_deals',active_deals,'active_matches',active_matches,'next_action',case when lane='protect_live_deal' then jsonb_build_object('api_action','deal_portfolio','instruction','Protect and progress the live deal before opening lower-priority market work.') when lane='execute_player_market_plan' then jsonb_build_object('api_action','career_alignment','player_id',id,'instruction','Review execution against the player-confirmed target window.') when lane='free_agent_market_work' then jsonb_build_object('api_action','player_service_card','player_id',id,'instruction','Keep the free-agent market plan current and actively serviced.') when lane='career_strategy_missing' then jsonb_build_object('api_action','career_strategy','player_id',id,'instruction','Create the human-owned career strategy before treating the player as in-window.') else jsonb_build_object('api_action','player_service_card','player_id',id,'instruction','Maintain service; no window-specific market action is forced by recorded data.') end) order by rn) filter(where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),count(*),count(*) filter(where active_deals>0),count(*) filter(where strategy_status is null)
  into v_players,v_players_in_scope,v_live_deals,v_strategy_gaps from ranked;

  select coalesce(jsonb_agg(jsonb_build_object('club_need_id',n.id,'title',n.title,'need_type',n.need_type,'priority',n.priority,'expires_at',n.expires_at,'club_name',o.name,'status',n.status,'next_action',jsonb_build_object('api_action','demand_control_fast','club_need_id',n.id,'instruction','Resolve or deliberately park the need before its recorded expiry.')) order by n.expires_at,n.priority desc),'[]'::jsonb),count(*)
  into v_needs,v_need_count
  from djm_os.club_needs n left join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id and n.status in ('open','active','confirmed','predicted') and n.expires_at is not null and n.expires_at::date between v_w.start_date and v_w.end_date;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'operating_window',jsonb_build_object('id',v_w.id,'name',v_w.name,'window_type',v_w.window_type,'status',v_w.status,'start_date',v_w.start_date,'end_date',v_w.end_date,'days_until_start',v_w.start_date-current_date,'days_remaining',v_w.end_date-current_date,'markets',v_w.markets,'objectives',v_w.objectives),
    'summary',jsonb_build_object('active_players',v_players_in_scope,'players_with_live_deals',v_live_deals,'players_missing_career_strategy',v_strategy_gaps,'club_needs_expiring_in_window',v_need_count,'overdue_recorded_deadlines',coalesce((v_deadlines#>>'{summary,overdue}')::int,0),'open_receivables',coalesce((v_receivables#>>'{summary,open_receivables}')::int,0),'closeout_deals',coalesce((v_closeout->>'deal_count')::int,0)),
    'player_execution',v_players,'club_demand_expiring_in_window',v_needs,'execution_deadlines',v_deadlines,'cash_collection',v_receivables,'deal_closeout',v_closeout,
    'truth_contract',jsonb_build_object('window','The operating window is human-configured. DJM does not infer federation or league registration windows.','player_scope','Players are classified from recorded career strategy, free-agent status and live deal activity. This is not a transfer recommendation.','priority','Execution lanes organise recorded work; humans still decide strategic trade-offs.','cash','Collections remain human-recorded and currency-separated.'));
end;$$;

create or replace function public.platform_server_capture_operating_window_snapshot(p_tenant_id uuid,p_operating_window_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text; v_snapshot jsonb; v_id uuid;
begin
  select m.role into v_role from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  v_snapshot:=public.platform_server_operating_window_command(p_tenant_id,p_operating_window_id,500);
  if coalesce((v_snapshot->>'available')::boolean,false)=false then raise exception 'operating_window_not_available'; end if;
  insert into platform.operating_window_snapshots(tenant_id,operating_window_id,snapshot_date,snapshot,captured_by)
  values(p_tenant_id,p_operating_window_id,current_date,v_snapshot,p_actor_user_id)
  on conflict (tenant_id,operating_window_id,snapshot_date) do update set snapshot=excluded.snapshot,captured_by=p_actor_user_id,captured_at=now()
  returning id into v_id;
  return jsonb_build_object('captured',true,'snapshot_id',v_id,'snapshot_date',current_date,'truth_contract',jsonb_build_object('history','The snapshot preserves what DJM recorded on that date; it does not backfill missing offline work.'));
end;$$;

create or replace function public.platform_server_operating_window_history(p_tenant_id uuid,p_operating_window_id uuid,p_limit integer default 12)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('available',true,'tenant_id',p_tenant_id,'operating_window_id',p_operating_window_id,'history',coalesce((select jsonb_agg(jsonb_build_object('snapshot_id',s.id,'snapshot_date',s.snapshot_date,'captured_at',s.captured_at,'summary',s.snapshot->'summary') order by s.snapshot_date desc) from (select * from platform.operating_window_snapshots where tenant_id=p_tenant_id and operating_window_id=p_operating_window_id order by snapshot_date desc limit greatest(1,least(coalesce(p_limit,12),120))) s),'[]'::jsonb),'truth_contract',jsonb_build_object('comparison','Snapshots are historical operating records; DJM does not infer causes for changes between snapshots.'));$$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_save_operating_window','platform_server_operating_window_command','platform_server_capture_operating_window_snapshot','platform_server_operating_window_history') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;;
