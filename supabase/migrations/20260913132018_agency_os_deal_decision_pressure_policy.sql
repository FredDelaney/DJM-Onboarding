create table if not exists platform.tenant_deal_operating_policy(
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  stage_review_days jsonb not null default '{}'::jsonb,
  force_decision_after_days integer,
  enabled boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_deal_operating_policy_force_days_check check(force_decision_after_days is null or force_decision_after_days between 1 and 180),
  constraint tenant_deal_operating_policy_stage_json_check check(jsonb_typeof(stage_review_days)='object')
);
alter table platform.tenant_deal_operating_policy enable row level security;
revoke all on platform.tenant_deal_operating_policy from public,anon,authenticated;
grant select,insert,update,delete on platform.tenant_deal_operating_policy to service_role;

create or replace function public.platform_server_deal_operating_policy(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_row platform.tenant_deal_operating_policy%rowtype;
  v_defaults jsonb:=jsonb_build_object(
    'qualifying',14,'contacted',10,'interest',7,'negotiating',5,'offer',3,'contracting',3
  );
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;
  select * into v_row from platform.tenant_deal_operating_policy p where p.tenant_id=p_tenant_id;
  if found and v_row.enabled then
    return jsonb_build_object(
      'tenant_id',p_tenant_id,'enabled',true,'source','tenant_override',
      'stage_review_days',v_defaults||coalesce(v_row.stage_review_days,'{}'::jsonb),
      'force_decision_after_days',coalesce(v_row.force_decision_after_days,21),
      'updated_at',v_row.updated_at,
      'interpretation','Internal agency operating policy for when a deal should be reviewed. These values are not industry benchmarks or transfer probabilities.'
    );
  elsif found and not v_row.enabled then
    return jsonb_build_object('tenant_id',p_tenant_id,'enabled',false,'source','tenant_override','stage_review_days','{}'::jsonb,'force_decision_after_days',null,
      'interpretation','Deal decision-pressure policy is disabled for this tenant.');
  end if;
  return jsonb_build_object(
    'tenant_id',p_tenant_id,'enabled',true,'source','system_default',
    'stage_review_days',v_defaults,'force_decision_after_days',21,
    'interpretation','System operating defaults for review cadence. These values are workflow defaults, not industry benchmarks or transfer probabilities, and may be overridden per tenant.'
  );
end;
$$;

create or replace function public.platform_server_set_deal_operating_policy(p_tenant_id uuid,p_actor_user_id uuid,p_policy jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_stage jsonb;
  v_force integer;
  v_enabled boolean;
  v_key text;
  v_val integer;
begin
  if jsonb_typeof(coalesce(p_policy,'{}'::jsonb))<>'object' then raise exception 'policy_must_be_object'; end if;
  select m.role into v_role from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin') limit 1;
  if v_role is null then raise exception 'owner_or_admin_required'; end if;

  v_stage:=coalesce(p_policy->'stage_review_days','{}'::jsonb);
  if jsonb_typeof(v_stage)<>'object' then raise exception 'stage_review_days_must_be_object'; end if;
  for v_key in select jsonb_object_keys(v_stage) loop
    if v_key not in ('qualifying','contacted','interest','negotiating','offer','contracting') then raise exception 'unsupported_deal_stage_policy:%',v_key; end if;
    begin v_val:=(v_stage->>v_key)::integer; exception when others then raise exception 'invalid_stage_review_days:%',v_key; end;
    if v_val<1 or v_val>90 then raise exception 'stage_review_days_out_of_range:%',v_key; end if;
  end loop;
  begin v_force:=nullif(p_policy->>'force_decision_after_days','')::integer; exception when others then raise exception 'invalid_force_decision_after_days'; end;
  if v_force is not null and (v_force<1 or v_force>180) then raise exception 'force_decision_after_days_out_of_range'; end if;
  v_enabled:=coalesce((p_policy->>'enabled')::boolean,true);

  insert into platform.tenant_deal_operating_policy(tenant_id,stage_review_days,force_decision_after_days,enabled,updated_by)
  values(p_tenant_id,v_stage,v_force,v_enabled,p_actor_user_id)
  on conflict (tenant_id) do update set stage_review_days=excluded.stage_review_days,force_decision_after_days=excluded.force_decision_after_days,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_policy.updated','tenant_deal_operating_policy',p_tenant_id::text,
    jsonb_build_object('stage_review_days',v_stage,'force_decision_after_days',v_force,'enabled',v_enabled),jsonb_build_object('source','agency_os'));

  return public.platform_server_deal_operating_policy(p_tenant_id);
end;
$$;

create or replace function public.platform_server_deal_decision_pressure(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_policy jsonb;
  v_age jsonb;
  v_momentum jsonb;
  v_stage text;
  v_threshold integer;
  v_force integer;
  v_days numeric;
  v_ratio numeric:=0;
  v_state text;
  v_history text;
  v_due timestamptz;
begin
  v_policy:=public.platform_server_deal_operating_policy(p_tenant_id);
  v_age:=public.platform_server_deal_ageing(p_tenant_id,p_deal_room_id);
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_stage:=v_age->>'current_stage';
  v_history:=v_age->>'history_mode';
  begin v_days:=(v_age->>'observed_days_in_current_stage')::numeric; exception when others then v_days:=null; end;
  begin v_threshold:=(v_policy->'stage_review_days'->>v_stage)::integer; exception when others then v_threshold:=null; end;
  begin v_force:=(v_policy->>'force_decision_after_days')::integer; exception when others then v_force:=null; end;

  if coalesce((v_policy->>'enabled')::boolean,false)=false then
    v_state:='policy_disabled';
  elsif v_age->>'current_status' in ('won','lost','parked') then
    v_state:='not_applicable_resolved';
  elsif v_history='no_history' or v_days is null then
    v_state:='insufficient_history';
  elsif v_threshold is null then
    v_state:='no_stage_threshold';
  else
    v_ratio:=round(v_days/v_threshold,3);
    if v_history='baseline_only' and v_days<v_threshold then
      v_state:='observing_from_baseline';
    elsif v_force is not null and v_days>=v_force and v_momentum->>'state' in ('stalled','busy_not_moving','stalled_or_uncontrolled','cooling','busy_but_cooling') then
      v_state:='force_decision_due';
    elsif v_days>=v_threshold and v_momentum->>'state' in ('stalled','busy_not_moving','stalled_or_uncontrolled','cooling','busy_but_cooling') then
      v_state:='stage_review_due';
    elsif v_days>=v_threshold then
      v_state:='stage_review_due_but_progressing';
    elsif v_ratio>=0.7 then
      v_state:='review_approaching';
    else
      v_state:='within_policy';
    end if;
    begin v_due:=(v_age->>'observed_stage_since')::timestamptz+make_interval(days=>v_threshold); exception when others then v_due:=null; end;
  end if;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'state',v_state,'current_stage',v_stage,
    'observed_days_in_stage',v_days,'stage_review_days',v_threshold,'force_decision_after_days',v_force,'review_ratio',v_ratio,'observed_review_due_at',v_due,
    'history_mode',v_history,'momentum_state',v_momentum->>'state','momentum_score',v_momentum->>'momentum_score',
    'recommended_action',case
      when v_state='force_decision_due' then 'Force an advance, a materially different route, or an explicit park/close decision.'
      when v_state='stage_review_due' then 'Run a deal review now and define the next decision-producing action.'
      when v_state='stage_review_due_but_progressing' then 'Review the stage label and next decision while protecting current momentum.'
      when v_state='review_approaching' then 'Prepare the next decision before the internal review threshold is reached.'
      else null end,
    'policy',v_policy,
    'truth_contract','Decision pressure is generated from an internal operating policy and observed platform history. It is not a market benchmark, transfer probability or proof that a deal is stale before the observation window began.'
  );
end;
$$;

revoke execute on function public.platform_server_deal_operating_policy(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_operating_policy(uuid) to service_role;
revoke execute on function public.platform_server_set_deal_operating_policy(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_set_deal_operating_policy(uuid,uuid,jsonb) to service_role;
revoke execute on function public.platform_server_deal_decision_pressure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_decision_pressure(uuid,uuid) to service_role;;
