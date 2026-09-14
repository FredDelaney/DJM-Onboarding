create table if not exists platform.deal_state_snapshots(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  deal_room_id uuid not null,
  observed_at timestamptz not null default now(),
  source text not null default 'deal_state_change',
  stage text,
  status text,
  probability smallint,
  expected_commission numeric,
  currency text,
  primary_blocker text,
  next_decision text,
  next_action_text text,
  next_action_at timestamptz,
  last_meaningful_at timestamptz,
  owner_user_id uuid,
  state_hash text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists deal_state_snapshots_tenant_deal_time_idx
  on platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at desc);
create index if not exists deal_state_snapshots_tenant_time_idx
  on platform.deal_state_snapshots(tenant_id,observed_at desc);

alter table platform.deal_state_snapshots enable row level security;
revoke all on platform.deal_state_snapshots from public,anon,authenticated;
grant select,insert,update,delete on platform.deal_state_snapshots to service_role;

create or replace function platform.snapshot_deal_room_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hash text;
  v_latest text;
begin
  v_hash:=md5(concat_ws('|',
    coalesce(new.stage,''),coalesce(new.status,''),coalesce(new.probability,new.manual_probability,new.model_probability)::text,
    coalesce(new.expected_commission::text,''),coalesce(new.currency,''),coalesce(new.primary_blocker,''),coalesce(new.next_decision,''),
    coalesce(new.next_action_text,''),coalesce(new.next_action_at::text,''),coalesce(new.last_meaningful_at::text,''),coalesce(new.owner_user_id::text,'')
  ));

  select s.state_hash into v_latest
  from platform.deal_state_snapshots s
  where s.tenant_id=new.tenant_id and s.deal_room_id=new.id
  order by s.observed_at desc,s.id desc limit 1;

  if v_latest is distinct from v_hash then
    insert into platform.deal_state_snapshots(
      tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata
    ) values(
      new.tenant_id,new.id,now(),'deal_state_change',new.stage,new.status,coalesce(new.probability,new.manual_probability,new.model_probability),
      new.expected_commission,new.currency,new.primary_blocker,new.next_decision,new.next_action_text,new.next_action_at,new.last_meaningful_at,new.owner_user_id,v_hash,
      jsonb_build_object('trigger_op',tg_op)
    );
  end if;
  return new;
end;
$$;

revoke execute on function platform.snapshot_deal_room_state() from public,anon,authenticated;
grant execute on function platform.snapshot_deal_room_state() to service_role;

drop trigger if exists deal_room_state_snapshot on djm_os.deal_rooms;
create trigger deal_room_state_snapshot
after insert or update of stage,status,probability,manual_probability,model_probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id
on djm_os.deal_rooms
for each row execute function platform.snapshot_deal_room_state();

create or replace function platform.capture_current_deal_snapshots(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_d record;
  v_inserted integer:=0;
  v_hash text;
  v_latest text;
begin
  for v_d in select * from djm_os.deal_rooms d where d.tenant_id=p_tenant_id loop
    v_hash:=md5(concat_ws('|',
      coalesce(v_d.stage,''),coalesce(v_d.status,''),coalesce(v_d.probability,v_d.manual_probability,v_d.model_probability)::text,
      coalesce(v_d.expected_commission::text,''),coalesce(v_d.currency,''),coalesce(v_d.primary_blocker,''),coalesce(v_d.next_decision,''),
      coalesce(v_d.next_action_text,''),coalesce(v_d.next_action_at::text,''),coalesce(v_d.last_meaningful_at::text,''),coalesce(v_d.owner_user_id::text,'')
    ));
    select s.state_hash into v_latest from platform.deal_state_snapshots s
    where s.tenant_id=p_tenant_id and s.deal_room_id=v_d.id order by s.observed_at desc,s.id desc limit 1;
    if v_latest is distinct from v_hash then
      insert into platform.deal_state_snapshots(
        tenant_id,deal_room_id,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata
      ) values(
        p_tenant_id,v_d.id,'snapshot_capture',v_d.stage,v_d.status,coalesce(v_d.probability,v_d.manual_probability,v_d.model_probability),
        v_d.expected_commission,v_d.currency,v_d.primary_blocker,v_d.next_decision,v_d.next_action_text,v_d.next_action_at,v_d.last_meaningful_at,v_d.owner_user_id,v_hash,
        jsonb_build_object('captured_at',now())
      );
      v_inserted:=v_inserted+1;
    end if;
  end loop;
  return jsonb_build_object('tenant_id',p_tenant_id,'inserted',v_inserted,'captured_at',now());
end;
$$;

revoke execute on function platform.capture_current_deal_snapshots(uuid) from public,anon,authenticated;
grant execute on function platform.capture_current_deal_snapshots(uuid) to service_role;

create or replace function public.platform_server_deal_momentum(p_tenant_id uuid,p_deal_room_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_days integer:=greatest(7,least(coalesce(p_window_days,30),180));
  v_deal djm_os.deal_rooms%rowtype;
  v_org uuid;
  v_latest platform.deal_state_snapshots%rowtype;
  v_first platform.deal_state_snapshots%rowtype;
  v_snapshot_count integer:=0;
  v_interactions_7 integer:=0;
  v_interactions_30 integer:=0;
  v_stage_delta integer:=0;
  v_probability_delta integer:=0;
  v_blocker_changes integer:=0;
  v_decision_changes integer:=0;
  v_action_changes integer:=0;
  v_last_forward timestamptz:=null;
  v_days_since_forward numeric:=null;
  v_days_since_meaningful numeric:=null;
  v_momentum_score integer:=0;
  v_state text;
  v_positive_moves integer:=0;
  v_stage_rank_first integer:=0;
  v_stage_rank_latest integer:=0;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  v_org:=v_deal.organisation_id;

  select * into v_latest from platform.deal_state_snapshots s
  where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id
  order by s.observed_at desc,s.id desc limit 1;
  select * into v_first from platform.deal_state_snapshots s
  where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id and s.observed_at>=now()-make_interval(days=>v_days)
  order by s.observed_at asc,s.id asc limit 1;

  select count(*)::integer into v_snapshot_count from platform.deal_state_snapshots s
  where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id and s.observed_at>=now()-make_interval(days=>v_days);

  select count(*) filter(where i.occurred_at>=now()-interval '7 days')::integer,
         count(*) filter(where i.occurred_at>=now()-interval '30 days')::integer
  into v_interactions_7,v_interactions_30
  from djm_os.interactions i where i.tenant_id=p_tenant_id and i.organisation_id=v_org;

  v_stage_rank_first:=case coalesce(v_first.stage,v_deal.stage) when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
  v_stage_rank_latest:=case coalesce(v_latest.stage,v_deal.stage) when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
  v_stage_delta:=v_stage_rank_latest-v_stage_rank_first;
  v_probability_delta:=coalesce(v_latest.probability,coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability),0)-coalesce(v_first.probability,coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability),0);

  with ordered as (
    select s.*,
           lag(s.stage) over(order by s.observed_at,s.id) prev_stage,
           lag(s.status) over(order by s.observed_at,s.id) prev_status,
           lag(s.probability) over(order by s.observed_at,s.id) prev_probability,
           lag(s.primary_blocker) over(order by s.observed_at,s.id) prev_blocker,
           lag(s.next_decision) over(order by s.observed_at,s.id) prev_decision,
           lag(s.next_action_text) over(order by s.observed_at,s.id) prev_action
    from platform.deal_state_snapshots s
    where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id and s.observed_at>=now()-make_interval(days=>v_days)
  ), changes as (
    select *,
      case
        when prev_stage is not null and (case stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end) >
                                    (case prev_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end) then 1
        when prev_probability is not null and probability>=prev_probability+10 then 1
        when prev_status is distinct from status and status in ('won','lost') then 1
        else 0 end as positive_move,
      case when prev_blocker is distinct from primary_blocker and prev_blocker is not null then 1 else 0 end blocker_change,
      case when prev_decision is distinct from next_decision and prev_decision is not null then 1 else 0 end decision_change,
      case when prev_action is distinct from next_action_text and prev_action is not null then 1 else 0 end action_change
    from ordered
  )
  select coalesce(sum(positive_move),0)::integer,
         coalesce(sum(blocker_change),0)::integer,
         coalesce(sum(decision_change),0)::integer,
         coalesce(sum(action_change),0)::integer,
         max(observed_at) filter(where positive_move=1)
  into v_positive_moves,v_blocker_changes,v_decision_changes,v_action_changes,v_last_forward
  from changes;

  if v_last_forward is not null then v_days_since_forward:=round(extract(epoch from (now()-v_last_forward))/86400.0,1); end if;
  if v_deal.last_meaningful_at is not null then v_days_since_meaningful:=round(extract(epoch from (now()-v_deal.last_meaningful_at))/86400.0,1); end if;

  v_momentum_score:=least(100,greatest(0,
      case when v_last_forward is null then 10 when v_last_forward>=now()-interval '7 days' then 45 when v_last_forward>=now()-interval '14 days' then 30 when v_last_forward>=now()-interval '30 days' then 15 else 5 end
    + greatest(0,least(20,v_stage_delta*10))
    + greatest(0,least(15,v_probability_delta))
    + case when v_blocker_changes>0 then 10 else 0 end
    + case when v_deal.next_action_at is not null and v_deal.next_action_at>now() then 10 else 0 end
  ));

  v_state:=case
    when v_deal.status in ('won','lost') then 'resolved'
    when v_last_forward>=now()-interval '7 days' then 'progressing'
    when v_last_forward>=now()-interval '14 days' then case when v_interactions_7>0 then 'busy_but_cooling' else 'cooling' end
    when coalesce(v_days_since_meaningful,999)>14 then 'stalled'
    when v_interactions_30>=2 and v_positive_moves=0 then 'busy_not_moving'
    when v_deal.next_action_at is not null and v_deal.next_action_at>now() then 'controlled_waiting'
    else 'stalled_or_uncontrolled' end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'window_days',v_days,'state',v_state,'momentum_score',v_momentum_score,
    'movement',jsonb_build_object(
      'snapshot_count',v_snapshot_count,'positive_move_events',v_positive_moves,'stage_delta',v_stage_delta,'probability_delta',v_probability_delta,
      'blocker_changes',v_blocker_changes,'decision_changes',v_decision_changes,'next_action_changes',v_action_changes,
      'last_forward_movement_at',v_last_forward,'days_since_forward_movement',v_days_since_forward
    ),
    'activity',jsonb_build_object('interactions_7d',v_interactions_7,'interactions_30d',v_interactions_30,'last_meaningful_at',v_deal.last_meaningful_at,'days_since_meaningful_activity',v_days_since_meaningful),
    'interpretation','Momentum measures recorded forward movement and process recency. It is not deal probability, and interaction volume alone does not create a high momentum state.'
  );
end;
$$;

revoke execute on function public.platform_server_deal_momentum(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_deal_momentum(uuid,uuid,integer) to service_role;

create or replace function public.platform_server_seed_demo_deal_history(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_meta jsonb;
  v_west djm_os.deal_rooms%rowtype;
  v_riv djm_os.deal_rooms%rowtype;
  v_count integer:=0;
  v_hash text;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null or not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_history_requires_synthetic_tenant'; end if;

  select * into v_west from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Elias Novak to Westhaven FC' limit 1;
  select * into v_riv from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Leo Martin exploratory move' limit 1;
  if v_west.id is null or v_riv.id is null then raise exception 'northstar_demo_deals_missing'; end if;

  delete from platform.deal_state_snapshots where tenant_id=p_tenant_id;

  v_hash:=md5(concat_ws('|','contacted','active','35',coalesce(v_west.expected_commission::text,''),coalesce(v_west.currency,''),'Club reviewing initial profile','Decide whether to request an updated pack','Send initial profile and clips',(now()-interval '9 days')::text,(now()-interval '10 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_west.id,now()-interval '10 days','synthetic_demo_history','contacted','active',35,v_west.expected_commission,v_west.currency,'Club reviewing initial profile','Decide whether to request an updated pack','Send initial profile and clips',now()-interval '9 days',now()-interval '10 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|','interest','active','50',coalesce(v_west.expected_commission::text,''),coalesce(v_west.currency,''),coalesce(v_west.primary_blocker,''),coalesce(v_west.next_decision,''),'Send refreshed clips and availability',(now()-interval '3 days')::text,(now()-interval '4 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_west.id,now()-interval '4 days','synthetic_demo_history','interest','active',50,v_west.expected_commission,v_west.currency,v_west.primary_blocker,v_west.next_decision,'Send refreshed clips and availability',now()-interval '3 days',now()-interval '4 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|',coalesce(v_west.stage,''),coalesce(v_west.status,''),coalesce(v_west.probability,v_west.manual_probability,v_west.model_probability)::text,coalesce(v_west.expected_commission::text,''),coalesce(v_west.currency,''),coalesce(v_west.primary_blocker,''),coalesce(v_west.next_decision,''),coalesce(v_west.next_action_text,''),coalesce(v_west.next_action_at::text,''),coalesce(v_west.last_meaningful_at::text,''),coalesce(v_west.owner_user_id::text,'')));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_west.id,now(),'synthetic_demo_history',v_west.stage,v_west.status,coalesce(v_west.probability,v_west.manual_probability,v_west.model_probability),v_west.expected_commission,v_west.currency,v_west.primary_blocker,v_west.next_decision,v_west.next_action_text,v_west.next_action_at,v_west.last_meaningful_at,v_west.owner_user_id,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|','qualifying','active','20',coalesce(v_riv.expected_commission::text,''),coalesce(v_riv.currency,''),'Need first sporting response','Decide whether there is genuine club interest','Send exploratory profile',(now()-interval '13 days')::text,(now()-interval '14 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaning_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_riv.id,now()-interval '14 days','synthetic_demo_history','qualifying','active',20,v_riv.expected_commission,v_riv.currency,'Need first sporting response','Decide whether there is genuine club interest','Send exploratory profile',now()-interval '13 days',now()-interval '14 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  return jsonb_build_object('tenant_id',p_tenant_id,'snapshots_seeded',v_count,'note','Synthetic deal history is intentionally separated from real agency history.');
end;
$$;;
