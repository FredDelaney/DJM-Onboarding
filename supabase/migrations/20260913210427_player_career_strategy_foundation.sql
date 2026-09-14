create table if not exists platform.player_career_strategies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  confirmation_status text not null default 'unconfirmed' check (confirmation_status in ('unconfirmed','confirmed','needs_reconfirmation')),
  strategy jsonb not null default '{}'::jsonb,
  review_due_at date,
  player_confirmed_at timestamptz,
  confirmation_method text,
  created_by uuid,
  updated_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  archived_at timestamptz,
  constraint player_career_strategy_object check (jsonb_typeof(strategy)='object')
);

create unique index if not exists player_career_strategies_one_current_idx
  on platform.player_career_strategies(tenant_id,player_id)
  where status in ('draft','approved');
create index if not exists player_career_strategies_review_idx
  on platform.player_career_strategies(tenant_id,status,review_due_at);

alter table platform.player_career_strategies enable row level security;
revoke all on platform.player_career_strategies from public, anon, authenticated;
grant select,insert,update,delete on platform.player_career_strategies to service_role;

create or replace function public.platform_server_player_career_strategy(p_tenant_id uuid,p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_player public.players%rowtype;
  v_s platform.player_career_strategies%rowtype;
begin
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  select * into v_s from platform.player_career_strategies s
   where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status in ('draft','approved')
   order by case when s.status='approved' then 0 else 1 end,s.version desc limit 1;
  return jsonb_build_object(
    'available',true,
    'tenant_id',p_tenant_id,
    'player_id',p_player_id,
    'player',jsonb_build_object('name',coalesce(nullif(trim(v_player.preferred_name),''),nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),'Player'),'football_status',v_player.football_status,'contract_status',v_player.contract_status,'contract_expiry',v_player.contract_expiry),
    'state',case when v_s.id is null then 'missing' else v_s.status end,
    'confirmation_state',case when v_s.id is null then 'missing' else v_s.confirmation_status end,
    'strategy',case when v_s.id is null then null else jsonb_build_object(
      'id',v_s.id,'version',v_s.version,'status',v_s.status,'confirmation_status',v_s.confirmation_status,
      'strategy',v_s.strategy,'review_due_at',v_s.review_due_at,'player_confirmed_at',v_s.player_confirmed_at,
      'confirmation_method',v_s.confirmation_method,'approved_at',v_s.approved_at,'created_at',v_s.created_at,'updated_at',v_s.updated_at
    ) end,
    'truth_contract',jsonb_build_object(
      'ownership','Career strategy is a human-authored agency/player plan. The system does not invent player ambitions, acceptable trade-offs or target markets.',
      'confirmation','Confirmed means the platform records a human confirmation event; it is not inferred from behaviour.',
      'approval','Agency approval is internal operating approval, not a legal instruction or authority to act.'
    )
  );
end;$$;

create or replace function public.platform_server_save_player_career_strategy(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_strategy jsonb,p_review_due_at date default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_role text;
  v_player public.players%rowtype;
  v_current platform.player_career_strategies%rowtype;
  v_row platform.player_career_strategies%rowtype;
  v_allowed text[]:=array['objective','preferred_pathway','fallback_pathway','target_window','target_markets','avoid_markets','target_club_profile','development_focus','player_priorities','non_negotiables','acceptable_tradeoffs','next_checkpoint','success_signals','notes'];
  v_bad_key text;
begin
  if p_strategy is null or jsonb_typeof(p_strategy)<>'object' then raise exception 'strategy_must_be_object'; end if;
  select k into v_bad_key from jsonb_object_keys(p_strategy) k where not (k=any(v_allowed)) limit 1;
  if v_bad_key is not null then raise exception 'unsupported_strategy_key:%',v_bad_key; end if;
  if nullif(trim(p_strategy->>'objective'),'') is null then raise exception 'career_objective_required'; end if;
  if nullif(trim(p_strategy->>'next_checkpoint'),'') is null then raise exception 'career_next_checkpoint_required'; end if;
  if p_review_due_at is null or p_review_due_at<current_date then raise exception 'future_review_due_at_required'; end if;
  if p_strategy ? 'target_markets' and jsonb_typeof(p_strategy->'target_markets')<>'array' then raise exception 'target_markets_must_be_array'; end if;
  if p_strategy ? 'avoid_markets' and jsonb_typeof(p_strategy->'avoid_markets')<>'array' then raise exception 'avoid_markets_must_be_array'; end if;
  if p_strategy ? 'non_negotiables' and jsonb_typeof(p_strategy->'non_negotiables')<>'array' then raise exception 'non_negotiables_must_be_array'; end if;
  if p_strategy ? 'acceptable_tradeoffs' and jsonb_typeof(p_strategy->'acceptable_tradeoffs')<>'array' then raise exception 'acceptable_tradeoffs_must_be_array'; end if;
  if p_strategy ? 'success_signals' and jsonb_typeof(p_strategy->'success_signals')<>'array' then raise exception 'success_signals_must_be_array'; end if;

  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;

  select * into v_current from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status in ('draft','approved') for update;
  if v_current.id is null then
    insert into platform.player_career_strategies(tenant_id,player_id,version,status,confirmation_status,strategy,review_due_at,created_by,updated_by)
    values(p_tenant_id,p_player_id,1,'draft','unconfirmed',p_strategy,p_review_due_at,p_actor_user_id,p_actor_user_id) returning * into v_row;
  else
    update platform.player_career_strategies set
      strategy=p_strategy,review_due_at=p_review_due_at,status='draft',approved_by=null,approved_at=null,
      confirmation_status=case when strategy is distinct from p_strategy then 'needs_reconfirmation' else confirmation_status end,
      updated_by=p_actor_user_id,updated_at=now(),version=version+1
    where id=v_current.id returning * into v_row;
  end if;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_strategy.saved','player',p_player_id::text,
    case when v_current.id is null then null else to_jsonb(v_current) end,to_jsonb(v_row),jsonb_build_object('strategy_id',v_row.id,'version',v_row.version));
  return public.platform_server_player_career_strategy(p_tenant_id,p_player_id);
end;$$;

create or replace function public.platform_server_confirm_player_career_strategy(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_method text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_role text; v_row platform.player_career_strategies%rowtype; begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if nullif(trim(p_method),'') is null then raise exception 'confirmation_method_required'; end if;
  update platform.player_career_strategies set confirmation_status='confirmed',player_confirmed_at=now(),confirmation_method=left(trim(p_method),120),updated_by=p_actor_user_id,updated_at=now()
   where tenant_id=p_tenant_id and player_id=p_player_id and status in ('draft','approved') returning * into v_row;
  if v_row.id is null then raise exception 'career_strategy_not_found'; end if;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_strategy.player_confirmed','player',p_player_id::text,null,to_jsonb(v_row),jsonb_build_object('method',v_row.confirmation_method));
  return public.platform_server_player_career_strategy(p_tenant_id,p_player_id);
end;$$;

create or replace function public.platform_server_approve_player_career_strategy(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_role text; v_row platform.player_career_strategies%rowtype; begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin') limit 1;
  if v_role is null then raise exception 'owner_or_admin_required'; end if;
  select * into v_row from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status='draft' for update;
  if v_row.id is null then raise exception 'draft_career_strategy_not_found'; end if;
  if nullif(trim(v_row.strategy->>'objective'),'') is null or nullif(trim(v_row.strategy->>'preferred_pathway'),'') is null or nullif(trim(v_row.strategy->>'fallback_pathway'),'') is null or nullif(trim(v_row.strategy->>'next_checkpoint'),'') is null then raise exception 'career_strategy_incomplete_for_approval'; end if;
  if v_row.confirmation_status<>'confirmed' then raise exception 'player_confirmation_required_before_approval'; end if;
  update platform.player_career_strategies set status='approved',approved_by=p_actor_user_id,approved_at=now(),updated_by=p_actor_user_id,updated_at=now() where id=v_row.id returning * into v_row;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_strategy.approved','player',p_player_id::text,null,to_jsonb(v_row),jsonb_build_object('strategy_id',v_row.id,'version',v_row.version));
  return public.platform_server_player_career_strategy(p_tenant_id,p_player_id);
end;$$;

create or replace function public.platform_server_archive_player_career_strategy(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_role text; v_row platform.player_career_strategies%rowtype; begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin') limit 1;
  if v_role is null then raise exception 'owner_or_admin_required'; end if;
  update platform.player_career_strategies set status='archived',archived_at=now(),updated_by=p_actor_user_id,updated_at=now()
   where tenant_id=p_tenant_id and player_id=p_player_id and status in ('draft','approved') returning * into v_row;
  if v_row.id is null then raise exception 'career_strategy_not_found'; end if;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_strategy.archived','player',p_player_id::text,null,to_jsonb(v_row),jsonb_build_object('strategy_id',v_row.id));
  return public.platform_server_player_career_strategy(p_tenant_id,p_player_id);
end;$$;

revoke all on function public.platform_server_player_career_strategy(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_save_player_career_strategy(uuid,uuid,uuid,jsonb,date) from public,anon,authenticated;
revoke all on function public.platform_server_confirm_player_career_strategy(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.platform_server_approve_player_career_strategy(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_archive_player_career_strategy(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_career_strategy(uuid,uuid) to service_role;
grant execute on function public.platform_server_save_player_career_strategy(uuid,uuid,uuid,jsonb,date) to service_role;
grant execute on function public.platform_server_confirm_player_career_strategy(uuid,uuid,uuid,text) to service_role;
grant execute on function public.platform_server_approve_player_career_strategy(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_archive_player_career_strategy(uuid,uuid,uuid) to service_role;;
