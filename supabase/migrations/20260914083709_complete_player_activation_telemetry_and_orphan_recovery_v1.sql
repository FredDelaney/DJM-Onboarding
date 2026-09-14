create or replace function public.platform_server_recoverable_invite_auth_user(p_token uuid,p_email text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user auth.users%rowtype; v_email text:=lower(trim(p_email)); v_invite public.player_invites%rowtype;
begin
  select * into v_invite from public.player_invites pi where pi.token=p_token and pi.status='pending' and pi.expires_at>now() and lower(pi.email)=v_email;
  if not found then return jsonb_build_object('recoverable',false,'reason','invite_invalid_or_expired'); end if;
  select * into v_user from auth.users u where lower(u.email)=v_email and coalesce(u.raw_user_meta_data->>'invite_token','')=p_token::text limit 1;
  if not found then return jsonb_build_object('recoverable',false,'reason','no_matching_invite_auth_user'); end if;
  return jsonb_build_object('recoverable',true,'user_id',v_user.id,'email',v_user.email,'truth_contract',jsonb_build_object('recovery','Only an Auth user whose stored invite_token exactly matches this valid pending invite can be recovered.'));
end;$$;

create or replace function public.platform_server_player_create_request(p_user_id uuid,p_tenant_id uuid,p_title text,p_message text default null,p_request_type text default 'action')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player public.players%rowtype; v_id uuid; v_event_id uuid; v_title text:=nullif(trim(p_title),''); v_type text:=coalesce(nullif(trim(p_request_type),''),'action');
begin
  select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active' where p.user_id=p_user_id and p.tenant_id=p_tenant_id and p.football_status<>'retired' limit 1;
  if not found then raise exception 'player_workspace_not_found'; end if;
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

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_recoverable_invite_auth_user','platform_server_player_create_request') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;;
