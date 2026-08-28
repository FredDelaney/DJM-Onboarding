create or replace function public.djm_team_members_list() returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',tm.user_id,'display_name',tm.display_name,'role_title',tm.role_title,'timezone',tm.timezone) order by tm.display_name) from djm_os.team_members tm where tm.is_active=true),'[]'::jsonb);
end; $$;

create or replace function public.djm_market_assign_need_owner(p_need_id uuid,p_owner_user_id uuid) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_before uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_owner_user_id is not null and not exists(select 1 from djm_os.team_members where user_id=p_owner_user_id and is_active=true) then raise exception 'Active DJM team member not found'; end if;
  select owner_user_id into v_before from djm_os.club_needs where id=p_need_id;
  if not found then raise exception 'Club need not found'; end if;
  update djm_os.club_needs set owner_user_id=p_owner_user_id,updated_at=now() where id=p_need_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  select 'CLUB_NEED_OWNER_UPDATED',auth.uid(),n.organisation_id,jsonb_build_object('club_need_id',n.id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),'manual_ui',1,now() from djm_os.club_needs n where n.id=p_need_id;
  return jsonb_build_object('need_id',p_need_id,'owner_user_id',p_owner_user_id);
end; $$;

create or replace function public.djm_opportunity_assign_owner(p_opportunity_id uuid,p_owner_user_id uuid) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_before uuid; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_owner_user_id is not null and not exists(select 1 from djm_os.team_members where user_id=p_owner_user_id and is_active=true) then raise exception 'Active DJM team member not found'; end if;
  select owner_user_id,organisation_id into v_before,v_org from djm_os.deal_rooms where id=p_opportunity_id;
  if not found then raise exception 'Opportunity not found'; end if;
  update djm_os.deal_rooms set owner_user_id=p_owner_user_id,updated_at=now() where id=p_opportunity_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values('OPPORTUNITY_OWNER_UPDATED',auth.uid(),v_org,jsonb_build_object('opportunity_id',p_opportunity_id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),'manual_ui',1,now());
  return jsonb_build_object('opportunity_id',p_opportunity_id,'owner_user_id',p_owner_user_id);
end; $$;

create or replace function public.djm_opportunity_update_pitch(p_share_id uuid,p_label text default null,p_message text default null,p_expires_at timestamptz default null,p_selected_sections jsonb default null,p_active boolean default true) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_opportunity uuid; v_player uuid; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  update public.club_share_links s set
    label=coalesce(nullif(trim(coalesce(p_label,'')),''),s.label),
    pitch_message=nullif(trim(coalesce(p_message,'')),''),
    expires_at=p_expires_at,
    selected_sections=coalesce(p_selected_sections,s.selected_sections,'{}'::jsonb),
    active=coalesce(p_active,true),
    revoked_at=case when coalesce(p_active,true)=false then coalesce(s.revoked_at,now()) else null end
  where s.id=p_share_id and s.opportunity_id is not null
  returning s.opportunity_id,s.player_id,s.organisation_id into v_opportunity,v_player,v_org;
  if not found then raise exception 'Opportunity pitch not found'; end if;
  update djm_os.deal_rooms set pitch_status=case when coalesce(p_active,true) then pitch_status else 'revoked' end,updated_at=now() where id=v_opportunity;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values('PITCH_UPDATED',auth.uid(),v_org,v_player,jsonb_build_object('opportunity_id',v_opportunity,'share_id',p_share_id,'active',coalesce(p_active,true),'expires_at',p_expires_at),'manual_ui',1,now());
  return jsonb_build_object('share_id',p_share_id,'opportunity_id',v_opportunity,'active',coalesce(p_active,true));
end; $$;

revoke all on function public.djm_team_members_list() from public,anon;
revoke all on function public.djm_market_assign_need_owner(uuid,uuid) from public,anon;
revoke all on function public.djm_opportunity_assign_owner(uuid,uuid) from public,anon;
revoke all on function public.djm_opportunity_update_pitch(uuid,text,text,timestamptz,jsonb,boolean) from public,anon;
grant execute on function public.djm_team_members_list() to authenticated,service_role;
grant execute on function public.djm_market_assign_need_owner(uuid,uuid) to authenticated,service_role;
grant execute on function public.djm_opportunity_assign_owner(uuid,uuid) to authenticated,service_role;
grant execute on function public.djm_opportunity_update_pitch(uuid,text,text,timestamptz,jsonb,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
