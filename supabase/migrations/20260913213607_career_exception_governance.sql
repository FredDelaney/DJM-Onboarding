create table if not exists platform.player_career_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_match_id uuid not null references djm_os.player_matches(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','confirmed','approved','rejected','withdrawn','expired')),
  reason text not null,
  tradeoff_acknowledgement text,
  decision_note text,
  confirmation_status text not null default 'unconfirmed' check (confirmation_status in ('unconfirmed','confirmed','declined')),
  confirmation_method text,
  confirmed_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  expires_at date not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_career_exceptions_reason_not_blank check (length(trim(reason))>=8),
  constraint player_career_exceptions_confirmation_shape check (
    (confirmation_status='unconfirmed' and confirmed_at is null)
    or (confirmation_status in ('confirmed','declined') and confirmed_at is not null)
  )
);

create unique index if not exists player_career_exceptions_one_active_idx
  on platform.player_career_exceptions(tenant_id,player_match_id)
  where status in ('draft','confirmed','approved');
create index if not exists player_career_exceptions_player_idx on platform.player_career_exceptions(player_id);
create index if not exists player_career_exceptions_match_idx on platform.player_career_exceptions(player_match_id);
create index if not exists player_career_exceptions_expiry_idx on platform.player_career_exceptions(tenant_id,status,expires_at);

alter table platform.player_career_exceptions enable row level security;
revoke all on platform.player_career_exceptions from public,anon,authenticated;
grant select,insert,update,delete on platform.player_career_exceptions to service_role;

drop trigger if exists player_career_exceptions_touch_updated_at on platform.player_career_exceptions;
create trigger player_career_exceptions_touch_updated_at before update on platform.player_career_exceptions for each row execute function platform.touch_updated_at();

create or replace function public.platform_server_career_exception(
  p_tenant_id uuid,
  p_player_match_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_match djm_os.player_matches%rowtype;
  v_e platform.player_career_exceptions%rowtype;
begin
  select * into v_match from djm_os.player_matches pm where pm.id=p_player_match_id and pm.tenant_id=p_tenant_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;

  select * into v_e
  from platform.player_career_exceptions e
  where e.tenant_id=p_tenant_id and e.player_match_id=p_player_match_id and e.status in ('draft','confirmed','approved')
  order by e.created_at desc limit 1;

  if not found then
    return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'player_match_id',p_player_match_id,'player_id',v_match.player_id,'state','missing','exception',null,
      'truth_contract',jsonb_build_object('scope','A career exception applies only to this recorded pursuit and never rewrites the player career strategy.'));
  end if;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'player_match_id',p_player_match_id,'player_id',v_match.player_id,
    'state',case
      when v_e.expires_at<current_date then 'expired'
      when v_e.status='approved' and v_e.confirmation_status='confirmed' then 'approved'
      when v_e.confirmation_status='declined' then 'declined'
      when v_e.status='confirmed' or v_e.confirmation_status='confirmed' then 'awaiting_internal_approval'
      else 'awaiting_player_confirmation'
    end,
    'exception',jsonb_build_object(
      'id',v_e.id,'status',v_e.status,'reason',v_e.reason,'tradeoff_acknowledgement',v_e.tradeoff_acknowledgement,
      'decision_note',v_e.decision_note,'confirmation_status',v_e.confirmation_status,'confirmation_method',v_e.confirmation_method,
      'confirmed_at',v_e.confirmed_at,'approved_by',v_e.approved_by,'approved_at',v_e.approved_at,'expires_at',v_e.expires_at,
      'created_by',v_e.created_by,'created_at',v_e.created_at,'updated_at',v_e.updated_at
    ),
    'truth_contract',jsonb_build_object(
      'scope','A career exception applies only to this recorded pursuit and never rewrites the player career strategy.',
      'approval','External escalation is unlocked only after player confirmation and owner/admin approval.',
      'expiry','Expired exceptions stop opening the pursuit automatically.'
    )
  );
end;
$function$;

create or replace function public.platform_server_save_career_exception(
  p_tenant_id uuid,
  p_player_match_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_tradeoff_acknowledgement text default null,
  p_expires_at date default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_match djm_os.player_matches%rowtype;
  v_e platform.player_career_exceptions%rowtype;
  v_expiry date:=coalesce(p_expires_at,current_date+14);
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if length(trim(coalesce(p_reason,'')))<8 then raise exception 'career_exception_reason_required'; end if;
  if v_expiry<current_date or v_expiry>current_date+90 then raise exception 'career_exception_expiry_must_be_within_90_days'; end if;

  select * into v_match from djm_os.player_matches pm where pm.id=p_player_match_id and pm.tenant_id=p_tenant_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;

  select * into v_e from platform.player_career_exceptions e
  where e.tenant_id=p_tenant_id and e.player_match_id=p_player_match_id and e.status in ('draft','confirmed','approved')
  order by e.created_at desc limit 1 for update;

  if found then
    if v_e.status='approved' then raise exception 'approved_career_exception_must_be_withdrawn_before_editing'; end if;
    update platform.player_career_exceptions
      set reason=trim(p_reason),tradeoff_acknowledgement=nullif(trim(p_tradeoff_acknowledgement),''),expires_at=v_expiry,
          status='draft',confirmation_status='unconfirmed',confirmation_method=null,confirmed_at=null,approved_by=null,approved_at=null,
          updated_by=p_actor_user_id,updated_at=now()
      where id=v_e.id returning * into v_e;
  else
    insert into platform.player_career_exceptions(tenant_id,player_id,player_match_id,status,reason,tradeoff_acknowledgement,expires_at,created_by,updated_by)
    values(p_tenant_id,v_match.player_id,p_player_match_id,'draft',trim(p_reason),nullif(trim(p_tradeoff_acknowledgement),''),v_expiry,p_actor_user_id,p_actor_user_id)
    returning * into v_e;
  end if;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_exception.saved','career_exception',v_e.id::text,to_jsonb(v_e),jsonb_build_object('player_match_id',p_player_match_id,'player_id',v_match.player_id));

  return public.platform_server_career_exception(p_tenant_id,p_player_match_id);
end;
$function$;

create or replace function public.platform_server_confirm_career_exception(
  p_tenant_id uuid,
  p_player_match_id uuid,
  p_actor_user_id uuid,
  p_confirmation_method text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_e platform.player_career_exceptions%rowtype;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if length(trim(coalesce(p_confirmation_method,'')))<3 then raise exception 'confirmation_method_required'; end if;

  select * into v_e from platform.player_career_exceptions e
  where e.tenant_id=p_tenant_id and e.player_match_id=p_player_match_id and e.status='draft' order by e.created_at desc limit 1 for update;
  if not found then raise exception 'draft_career_exception_not_found'; end if;
  if v_e.expires_at<current_date then update platform.player_career_exceptions set status='expired',updated_at=now() where id=v_e.id; raise exception 'career_exception_expired'; end if;

  update platform.player_career_exceptions
    set status='confirmed',confirmation_status='confirmed',confirmation_method=trim(p_confirmation_method),confirmed_at=now(),updated_by=p_actor_user_id,updated_at=now()
    where id=v_e.id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_exception.player_confirmed','career_exception',v_e.id::text,jsonb_build_object('player_match_id',p_player_match_id,'confirmation_method',trim(p_confirmation_method)));

  return public.platform_server_career_exception(p_tenant_id,p_player_match_id);
end;
$function$;

create or replace function public.platform_server_approve_career_exception(
  p_tenant_id uuid,
  p_player_match_id uuid,
  p_actor_user_id uuid,
  p_decision_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_e platform.player_career_exceptions%rowtype;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin') limit 1;
  if v_role is null then raise exception 'owner_or_admin_access_required'; end if;

  select * into v_e from platform.player_career_exceptions e
  where e.tenant_id=p_tenant_id and e.player_match_id=p_player_match_id and e.status='confirmed' and e.confirmation_status='confirmed'
  order by e.created_at desc limit 1 for update;
  if not found then raise exception 'player_confirmed_career_exception_required'; end if;
  if v_e.expires_at<current_date then update platform.player_career_exceptions set status='expired',updated_at=now() where id=v_e.id; raise exception 'career_exception_expired'; end if;

  update platform.player_career_exceptions
    set status='approved',approved_by=p_actor_user_id,approved_at=now(),decision_note=nullif(trim(p_decision_note),''),updated_by=p_actor_user_id,updated_at=now()
    where id=v_e.id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_exception.approved','career_exception',v_e.id::text,jsonb_build_object('player_match_id',p_player_match_id,'decision_note',nullif(trim(p_decision_note),'')));

  return public.platform_server_career_exception(p_tenant_id,p_player_match_id);
end;
$function$;

create or replace function public.platform_server_withdraw_career_exception(
  p_tenant_id uuid,
  p_player_match_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_e platform.player_career_exceptions%rowtype;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_e from platform.player_career_exceptions e
  where e.tenant_id=p_tenant_id and e.player_match_id=p_player_match_id and e.status in ('draft','confirmed','approved')
  order by e.created_at desc limit 1 for update;
  if not found then raise exception 'active_career_exception_not_found'; end if;

  update platform.player_career_exceptions set status='withdrawn',decision_note=coalesce(nullif(trim(p_reason),''),decision_note),updated_by=p_actor_user_id,updated_at=now() where id=v_e.id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
  values(p_tenant_id,p_actor_user_id,'user','career_exception.withdrawn','career_exception',v_e.id::text,jsonb_build_object('player_match_id',p_player_match_id,'reason',nullif(trim(p_reason),'')));
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'player_match_id',p_player_match_id,'state','withdrawn','exception_id',v_e.id);
end;
$function$;

revoke all on function public.platform_server_career_exception(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_save_career_exception(uuid,uuid,uuid,text,text,date) from public,anon,authenticated;
revoke all on function public.platform_server_confirm_career_exception(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.platform_server_approve_career_exception(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.platform_server_withdraw_career_exception(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_server_career_exception(uuid,uuid) to service_role;
grant execute on function public.platform_server_save_career_exception(uuid,uuid,uuid,text,text,date) to service_role;
grant execute on function public.platform_server_confirm_career_exception(uuid,uuid,uuid,text) to service_role;
grant execute on function public.platform_server_approve_career_exception(uuid,uuid,uuid,text) to service_role;
grant execute on function public.platform_server_withdraw_career_exception(uuid,uuid,uuid,text) to service_role;;
