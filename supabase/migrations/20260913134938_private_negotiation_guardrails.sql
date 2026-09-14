create table if not exists platform.deal_negotiation_guardrails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  deal_room_id uuid not null references djm_os.deal_rooms(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  target_outcome text,
  acceptable_fallback text,
  target_transfer_fee numeric check (target_transfer_fee is null or target_transfer_fee>=0),
  minimum_transfer_fee numeric check (minimum_transfer_fee is null or minimum_transfer_fee>=0),
  player_salary_target numeric check (player_salary_target is null or player_salary_target>=0),
  player_salary_minimum numeric check (player_salary_minimum is null or player_salary_minimum>=0),
  currency text,
  salary_period text,
  salary_tax_basis text,
  commission_guardrail jsonb not null default '{}'::jsonb,
  preferred_structure text,
  concession_order jsonb not null default '[]'::jsonb,
  non_negotiables jsonb not null default '[]'::jsonb,
  walk_away_conditions jsonb not null default '[]'::jsonb,
  open_decisions jsonb not null default '[]'::jsonb,
  notes text,
  version integer not null default 1 check (version>=1),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,deal_room_id),
  check (minimum_transfer_fee is null or target_transfer_fee is null or target_transfer_fee>=minimum_transfer_fee),
  check (player_salary_minimum is null or player_salary_target is null or player_salary_target>=player_salary_minimum),
  check (jsonb_typeof(commission_guardrail)='object'),
  check (jsonb_typeof(concession_order)='array'),
  check (jsonb_typeof(non_negotiables)='array'),
  check (jsonb_typeof(walk_away_conditions)='array'),
  check (jsonb_typeof(open_decisions)='array')
);

create index if not exists deal_negotiation_guardrails_tenant_status_idx on platform.deal_negotiation_guardrails(tenant_id,status);
alter table platform.deal_negotiation_guardrails enable row level security;
revoke all on platform.deal_negotiation_guardrails from public,anon,authenticated;

create or replace function platform.touch_deal_negotiation_guardrails()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.updated_at:=now();
  if tg_op='UPDATE' then new.version:=old.version+1; end if;
  return new;
end;
$$;

drop trigger if exists deal_negotiation_guardrails_touch on platform.deal_negotiation_guardrails;
create trigger deal_negotiation_guardrails_touch before update on platform.deal_negotiation_guardrails
for each row execute function platform.touch_deal_negotiation_guardrails();

create or replace function public.platform_server_deal_guardrails(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_d djm_os.deal_rooms%rowtype;
  v_g platform.deal_negotiation_guardrails%rowtype;
  v_required boolean:=false;
begin
  select * into v_d from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  v_required:=v_d.status='active' and v_d.stage in ('negotiating','offer','contracting');
  select * into v_g from platform.deal_negotiation_guardrails g where g.tenant_id=p_tenant_id and g.deal_room_id=p_deal_room_id and g.status<>'archived';
  if not found then
    return jsonb_build_object(
      'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'exists',false,
      'state',case when v_required then 'required_not_set' else 'not_required_yet' end,
      'required_for_stage',v_required,'current_stage',v_d.stage,
      'guardrails',null,
      'truth_contract','Negotiation guardrails are private human-set operating limits. The platform never invents them, and their presence is not proof of legal authority or client consent.'
    );
  end if;
  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'exists',true,
    'state',case when v_g.status='approved' then 'approved' when v_required then 'draft_requires_approval' else 'draft' end,
    'required_for_stage',v_required,'current_stage',v_d.stage,
    'guardrails',jsonb_build_object(
      'id',v_g.id,'status',v_g.status,'version',v_g.version,
      'target_outcome',v_g.target_outcome,'acceptable_fallback',v_g.acceptable_fallback,
      'target_transfer_fee',v_g.target_transfer_fee,'minimum_transfer_fee',v_g.minimum_transfer_fee,
      'player_salary_target',v_g.player_salary_target,'player_salary_minimum',v_g.player_salary_minimum,
      'currency',v_g.currency,'salary_period',v_g.salary_period,'salary_tax_basis',v_g.salary_tax_basis,
      'commission_guardrail',v_g.commission_guardrail,'preferred_structure',v_g.preferred_structure,
      'concession_order',v_g.concession_order,'non_negotiables',v_g.non_negotiables,'walk_away_conditions',v_g.walk_away_conditions,
      'open_decisions',v_g.open_decisions,'notes',v_g.notes,
      'created_by',v_g.created_by,'updated_by',v_g.updated_by,'approved_by',v_g.approved_by,'approved_at',v_g.approved_at,
      'created_at',v_g.created_at,'updated_at',v_g.updated_at
    ),
    'truth_contract','Negotiation guardrails are private human-set operating limits. The platform never invents them, and their presence is not proof of legal authority or client consent.'
  );
end;
$$;

create or replace function public.platform_server_save_deal_guardrails(
  p_tenant_id uuid,p_deal_room_id uuid,p_actor_user_id uuid,p_guardrails jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_d djm_os.deal_rooms%rowtype;
  v_old jsonb;
  v_g platform.deal_negotiation_guardrails%rowtype;
  v_target_fee numeric;
  v_min_fee numeric;
  v_salary_target numeric;
  v_salary_min numeric;
  v_currency text;
  v_concessions jsonb;
  v_nonneg jsonb;
  v_walk jsonb;
  v_open jsonb;
  v_commission jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent') limit 1;
  if v_role is null then raise exception 'agency_negotiation_access_required'; end if;
  select * into v_d from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;

  begin v_target_fee:=nullif(p_guardrails->>'target_transfer_fee','')::numeric; exception when others then raise exception 'invalid_target_transfer_fee'; end;
  begin v_min_fee:=nullif(p_guardrails->>'minimum_transfer_fee','')::numeric; exception when others then raise exception 'invalid_minimum_transfer_fee'; end;
  begin v_salary_target:=nullif(p_guardrails->>'player_salary_target','')::numeric; exception when others then raise exception 'invalid_player_salary_target'; end;
  begin v_salary_min:=nullif(p_guardrails->>'player_salary_minimum','')::numeric; exception when others then raise exception 'invalid_player_salary_minimum'; end;
  if coalesce(v_target_fee,0)<0 or coalesce(v_min_fee,0)<0 or coalesce(v_salary_target,0)<0 or coalesce(v_salary_min,0)<0 then raise exception 'guardrail_values_must_be_non_negative'; end if;
  if v_target_fee is not null and v_min_fee is not null and v_target_fee<v_min_fee then raise exception 'target_transfer_fee_must_be_at_least_minimum'; end if;
  if v_salary_target is not null and v_salary_min is not null and v_salary_target<v_salary_min then raise exception 'salary_target_must_be_at_least_minimum'; end if;
  v_currency:=nullif(upper(trim(p_guardrails->>'currency')),'');
  if (v_target_fee is not null or v_min_fee is not null or v_salary_target is not null or v_salary_min is not null) and v_currency is null then raise exception 'currency_required_for_numeric_guardrails'; end if;
  v_concessions:=coalesce(p_guardrails->'concession_order','[]'::jsonb);
  v_nonneg:=coalesce(p_guardrails->'non_negotiables','[]'::jsonb);
  v_walk:=coalesce(p_guardrails->'walk_away_conditions','[]'::jsonb);
  v_open:=coalesce(p_guardrails->'open_decisions','[]'::jsonb);
  v_commission:=coalesce(p_guardrails->'commission_guardrail','{}'::jsonb);
  if jsonb_typeof(v_concessions)<>'array' or jsonb_typeof(v_nonneg)<>'array' or jsonb_typeof(v_walk)<>'array' or jsonb_typeof(v_open)<>'array' or jsonb_typeof(v_commission)<>'object' then raise exception 'invalid_guardrail_json_shape'; end if;

  select to_jsonb(g) into v_old from platform.deal_negotiation_guardrails g where g.tenant_id=p_tenant_id and g.deal_room_id=p_deal_room_id for update;
  insert into platform.deal_negotiation_guardrails(
    tenant_id,deal_room_id,status,target_outcome,acceptable_fallback,target_transfer_fee,minimum_transfer_fee,
    player_salary_target,player_salary_minimum,currency,salary_period,salary_tax_basis,commission_guardrail,preferred_structure,
    concession_order,non_negotiables,walk_away_conditions,open_decisions,notes,created_by,updated_by,approved_by,approved_at
  ) values(
    p_tenant_id,p_deal_room_id,'draft',nullif(trim(p_guardrails->>'target_outcome'),''),nullif(trim(p_guardrails->>'acceptable_fallback'),''),v_target_fee,v_min_fee,
    v_salary_target,v_salary_min,v_currency,nullif(trim(p_guardrails->>'salary_period'),''),nullif(trim(p_guardrails->>'salary_tax_basis'),''),v_commission,nullif(trim(p_guardrails->>'preferred_structure'),''),
    v_concessions,v_nonneg,v_walk,v_open,nullif(trim(p_guardrails->>'notes'),''),p_actor_user_id,p_actor_user_id,null,null
  ) on conflict (tenant_id,deal_room_id) do update set
    status='draft',target_outcome=excluded.target_outcome,acceptable_fallback=excluded.acceptable_fallback,
    target_transfer_fee=excluded.target_transfer_fee,minimum_transfer_fee=excluded.minimum_transfer_fee,
    player_salary_target=excluded.player_salary_target,player_salary_minimum=excluded.player_salary_minimum,
    currency=excluded.currency,salary_period=excluded.salary_period,salary_tax_basis=excluded.salary_tax_basis,
    commission_guardrail=excluded.commission_guardrail,preferred_structure=excluded.preferred_structure,
    concession_order=excluded.concession_order,non_negotiables=excluded.non_negotiables,walk_away_conditions=excluded.walk_away_conditions,
    open_decisions=excluded.open_decisions,notes=excluded.notes,updated_by=p_actor_user_id,approved_by=null,approved_at=null
  returning * into v_g;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_guardrails.saved','deal_room',p_deal_room_id::text,v_old,to_jsonb(v_g),jsonb_build_object('guardrails_id',v_g.id,'version',v_g.version,'status','draft'));
  return public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id);
end;
$$;

create or replace function public.platform_server_approve_deal_guardrails(p_tenant_id uuid,p_deal_room_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_g platform.deal_negotiation_guardrails%rowtype;
  v_before jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin') limit 1;
  if v_role is null then raise exception 'owner_or_admin_required_to_approve_guardrails'; end if;
  select * into v_g from platform.deal_negotiation_guardrails g where g.tenant_id=p_tenant_id and g.deal_room_id=p_deal_room_id and g.status='draft' for update;
  if not found then raise exception 'draft_guardrails_not_found'; end if;
  if nullif(trim(v_g.target_outcome),'') is null and jsonb_array_length(v_g.non_negotiables)=0 and jsonb_array_length(v_g.walk_away_conditions)=0 then
    raise exception 'guardrails_need_target_or_non_negotiable_or_walk_away_condition';
  end if;
  v_before:=to_jsonb(v_g);
  update platform.deal_negotiation_guardrails
  set status='approved',approved_by=p_actor_user_id,approved_at=now(),updated_by=p_actor_user_id
  where id=v_g.id returning * into v_g;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_guardrails.approved','deal_room',p_deal_room_id::text,v_before,to_jsonb(v_g),jsonb_build_object('guardrails_id',v_g.id,'version',v_g.version,'status','approved'));
  return public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id);
end;
$$;

create or replace function public.platform_server_archive_deal_guardrails(p_tenant_id uuid,p_deal_room_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_g platform.deal_negotiation_guardrails%rowtype;
  v_before jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin') limit 1;
  if v_role is null then raise exception 'owner_or_admin_required_to_archive_guardrails'; end if;
  select * into v_g from platform.deal_negotiation_guardrails g where g.tenant_id=p_tenant_id and g.deal_room_id=p_deal_room_id and g.status<>'archived' for update;
  if not found then raise exception 'active_guardrails_not_found'; end if;
  v_before:=to_jsonb(v_g);
  update platform.deal_negotiation_guardrails set status='archived',updated_by=p_actor_user_id where id=v_g.id returning * into v_g;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_guardrails.archived','deal_room',p_deal_room_id::text,v_before,to_jsonb(v_g),jsonb_build_object('guardrails_id',v_g.id,'version',v_g.version,'status','archived'));
  return public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id);
end;
$$;

revoke all on function public.platform_server_deal_guardrails(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_save_deal_guardrails(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_approve_deal_guardrails(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_archive_deal_guardrails(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_guardrails(uuid,uuid) to service_role;
grant execute on function public.platform_server_save_deal_guardrails(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.platform_server_approve_deal_guardrails(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_archive_deal_guardrails(uuid,uuid,uuid) to service_role;;
