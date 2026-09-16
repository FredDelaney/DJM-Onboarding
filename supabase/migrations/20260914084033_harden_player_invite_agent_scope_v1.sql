create or replace function public.platform_server_create_player_portal_invite(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text; v_player public.players%rowtype; v_email text:=lower(trim(p_email)); v_token uuid; v_invite_id uuid; v_existing_user uuid;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','agent','operations') then raise exception 'agency_operator_access_required'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'valid_player_email_required'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id and p.football_status<>'retired' for update;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  if v_role='agent' and v_player.primary_staff_user_id is distinct from p_actor_user_id then raise exception 'agent_may_only_invite_owned_player'; end if;
  if v_player.user_id is not null then raise exception 'player_account_already_linked'; end if;
  select u.id into v_existing_user from auth.users u where lower(u.email)=v_email limit 1;
  if v_existing_user is not null then raise exception 'email_already_registered'; end if;
  select pi.id,pi.token into v_invite_id,v_token from public.player_invites pi
   where pi.player_id=p_player_id and pi.status='pending' and pi.expires_at>now() and lower(pi.email)=v_email
   order by pi.created_at desc limit 1;
  if v_token is not null then
    return jsonb_build_object('created',false,'existing',true,'invite_id',v_invite_id,'token',v_token,'player_id',p_player_id,'email',v_email,'truth_contract',jsonb_build_object('scope','The existing valid invite belongs to this exact player record. No player or account was created implicitly.'));
  end if;
  update public.player_invites set status='revoked' where player_id=p_player_id and status='pending';
  insert into public.player_invites(email,player_id,invited_by) values(v_email,p_player_id,p_actor_user_id) returning id,token into v_invite_id,v_token;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','player_portal.invite_created','player',p_player_id::text,jsonb_build_object('invite_id',v_invite_id,'email',v_email),jsonb_build_object('player_id',p_player_id,'actor_role',v_role));
  return jsonb_build_object('created',true,'existing',false,'invite_id',v_invite_id,'token',v_token,'player_id',p_player_id,'email',v_email,'truth_contract',jsonb_build_object('scope','The invite is tenant-validated and linked to an existing player. Agents may only invite players they are recorded as primarily responsible for. DJM never creates a player implicitly from an email in the white-label invite flow.'));
end;$$;
revoke all on function public.platform_server_create_player_portal_invite(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_server_create_player_portal_invite(uuid,uuid,uuid,text) to service_role;;
