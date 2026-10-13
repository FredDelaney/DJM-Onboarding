-- Restore the existing owned-player request and telemetry contract in environments where it was never installed.
create table if not exists platform.player_portal_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('portal_opened','review_viewed','request_created','document_viewed','career_plan_viewed')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists player_portal_events_tenant_player_time_idx on platform.player_portal_events(tenant_id,player_id,occurred_at desc);
create index if not exists player_portal_events_user_time_idx on platform.player_portal_events(user_id,occurred_at desc);
alter table platform.player_portal_events enable row level security;
revoke all on platform.player_portal_events from public,anon,authenticated;
grant all on platform.player_portal_events to service_role;

create or replace function public.platform_server_record_player_portal_event(p_user_id uuid,p_tenant_id uuid,p_event_type text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player public.players%rowtype; v_type text:=lower(trim(p_event_type)); v_id uuid;
begin
  if v_type not in ('portal_opened','review_viewed','request_created','document_viewed','career_plan_viewed') then raise exception 'invalid_player_portal_event_type'; end if;
  select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active'
   where p.user_id=p_user_id and p.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.football_status,'active')<>'retired' limit 1;
  if not found then raise exception 'player_workspace_not_found' using errcode='42501'; end if;
  insert into platform.player_portal_events(tenant_id,player_id,user_id,event_type,metadata) values(p_tenant_id,v_player.id,p_user_id,v_type,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  return jsonb_build_object('recorded',true,'event_id',v_id);
end;$$;

create or replace function public.platform_server_player_create_request(p_user_id uuid,p_tenant_id uuid,p_title text,p_message text default null,p_request_type text default 'action')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player public.players%rowtype; v_id uuid; v_event_id uuid; v_title text:=nullif(trim(p_title),''); v_type text:=coalesce(nullif(trim(p_request_type),''),'action');
begin
  select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active' where p.user_id=p_user_id and p.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.football_status,'active')<>'retired' limit 1;
  if not found then raise exception 'player_workspace_not_found' using errcode='42501'; end if;
  if v_type not in ('action','information','document','video','checkin','message','signal') then raise exception 'invalid_player_request_type'; end if;
  if v_title is null then raise exception 'request_title_required'; end if;
  if length(v_title)>200 then raise exception 'request_title_too_long'; end if;
  if p_message is not null and length(p_message)>5000 then raise exception 'request_message_too_long'; end if;
  insert into public.player_requests(player_id,title,message,request_type,status,created_by)
  values(v_player.id,v_title,nullif(trim(p_message),''),v_type,'open',p_user_id) returning id into v_id;
  insert into platform.player_portal_events(tenant_id,player_id,user_id,event_type,metadata)
  values(v_player.tenant_id,v_player.id,p_user_id,'request_created',jsonb_build_object('request_id',v_id,'request_type',v_type)) returning id into v_event_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(v_player.tenant_id,p_user_id,'user','player_request.created','player_request',v_id::text,jsonb_build_object('title',v_title,'request_type',v_type),jsonb_build_object('player_id',v_player.id,'portal_event_id',v_event_id));
  return jsonb_build_object('created',true,'request_id',v_id,'truth_contract',jsonb_build_object('routing','Creating a request records the player request; it does not guarantee an immediate response time unless the agency has separately configured a service standard.'));
end;$$;

revoke all on function public.platform_server_player_create_request(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.platform_server_record_player_portal_event(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_player_create_request(uuid,uuid,text,text,text) to service_role;
grant execute on function public.platform_server_record_player_portal_event(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
