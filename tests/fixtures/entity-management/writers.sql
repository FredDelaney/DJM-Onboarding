-- Frozen staging canonical functions, 28 October 2026. Test input only; never a deployment migration.
CREATE OR REPLACE FUNCTION public.redream_entity_action_preview(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid:=private.redream_admin_tenant();
  v_user uuid:=auth.uid();
  v_raw jsonb;
begin
  if v_tenant is null or v_user is null or not private.user_has_staff_tenant_access(v_tenant,v_user) then raise exception 'Agency staff access required'; end if;
  v_raw:=public.djm_delete_preview(p_entity_type,p_entity_id);
  return jsonb_build_object(
    'entity_type',p_entity_type,
    'entity_id',p_entity_id,
    'impact',v_raw-'entity_type',
    'can_delete',private.user_is_tenant_admin(v_tenant,v_user)
      and not (p_entity_type='recruitment_target' and nullif(v_raw->>'linked_player_id','') is not null),
    'delete_requires_confirmation',true
  );
end $function$;
CREATE OR REPLACE FUNCTION public.djm_delete_entity(p_entity_type text, p_entity_id uuid, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid; v_name text; v_linked uuid;
begin
  if not p_confirm then raise exception 'Deletion requires explicit confirmation'; end if;
  case p_entity_type
    when 'club' then select tenant_id,name into v_tenant,v_name from djm_os.organisations where id=p_entity_id;
    when 'club_contact' then select tenant_id,full_name into v_tenant,v_name from djm_os.people where id=p_entity_id;
    when 'recruitment_target' then select tenant_id,full_name,linked_player_id into v_tenant,v_name,v_linked from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then select tenant_id,coalesce(title,position) into v_tenant,v_name from djm_os.club_needs where id=p_entity_id;
    when 'deal_room' then select tenant_id,title into v_tenant,v_name from djm_os.deal_rooms where id=p_entity_id;
    when 'player' then select tenant_id,coalesce(nullif(trim(preferred_name),''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player') into v_tenant,v_name from public.players where id=p_entity_id;
    else raise exception 'Unsupported entity type';
  end case;
  if v_tenant is null then raise exception 'Entity not found'; end if;
  if not private.user_is_tenant_admin(v_tenant,auth.uid()) or v_tenant is distinct from private.redream_request_tenant() then
    raise exception 'agency_admin_access_required' using errcode='42501'; end if;
  if p_entity_type='recruitment_target' and v_linked is not null then raise exception 'This target is linked to a Signed Player. Archive it instead of deleting representation history.'; end if;
  if p_entity_type='club' then delete from djm_os.organisations where id=p_entity_id and tenant_id=v_tenant;
  elsif p_entity_type='club_contact' then delete from djm_os.people where id=p_entity_id and tenant_id=v_tenant;
  elsif p_entity_type='recruitment_target' then delete from djm_os.freshness_queue where entity_type='recruitment_target' and entity_id=p_entity_id; delete from djm_os.scouting_prospects where id=p_entity_id and tenant_id=v_tenant;
  elsif p_entity_type='club_need' then delete from djm_os.club_needs where id=p_entity_id and tenant_id=v_tenant;
  elsif p_entity_type='deal_room' then delete from djm_os.deal_rooms where id=p_entity_id and tenant_id=v_tenant;
  else delete from public.players where id=p_entity_id and tenant_id=v_tenant; end if;
  insert into djm_os.events(event_type,actor_user_id,tenant_id,payload,source,confidence,occurred_at)
  values('ENTITY_DELETED',auth.uid(),v_tenant,jsonb_build_object('entity_type',p_entity_type,'deleted_id',p_entity_id,'name',v_name),'manual_delete',1,now());
  return jsonb_build_object('deleted',true,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $function$;

CREATE OR REPLACE FUNCTION public.djm_delete_preview(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid;
begin
  case p_entity_type
    when 'club' then select tenant_id into v_tenant from djm_os.organisations where id=p_entity_id;
    when 'club_contact' then select tenant_id into v_tenant from djm_os.people where id=p_entity_id;
    when 'recruitment_target' then select tenant_id into v_tenant from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then select tenant_id into v_tenant from djm_os.club_needs where id=p_entity_id;
    when 'deal_room' then select tenant_id into v_tenant from djm_os.deal_rooms where id=p_entity_id;
    when 'player' then select tenant_id into v_tenant from public.players where id=p_entity_id;
    else raise exception 'Unsupported entity type';
  end case;
  if v_tenant is null then raise exception 'Entity not found'; end if;
  if not private.user_is_tenant_admin(v_tenant,auth.uid()) or v_tenant is distinct from private.redream_request_tenant() then raise exception 'agency_admin_access_required' using errcode='42501'; end if;
  if p_entity_type='club' then return jsonb_build_object('entity_type','club','contacts',(select count(*) from djm_os.employments where organisation_id=p_entity_id),'needs',(select count(*) from djm_os.club_needs where organisation_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where organisation_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where organisation_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where organisation_id=p_entity_id));
  elsif p_entity_type='club_contact' then return jsonb_build_object('entity_type','club_contact','relationships',(select count(*) from djm_os.relationships where person_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where person_id=p_entity_id),'employments',(select count(*) from djm_os.employments where person_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where person_id=p_entity_id));
  elsif p_entity_type='recruitment_target' then return jsonb_build_object('entity_type','recruitment_target','interactions',(select count(*) from djm_os.recruitment_interactions where prospect_id=p_entity_id),'reports',(select count(*) from djm_os.scouting_reports where prospect_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where prospect_id=p_entity_id),'linked_player_id',(select linked_player_id from djm_os.scouting_prospects where id=p_entity_id));
  elsif p_entity_type='club_need' then return jsonb_build_object('entity_type','club_need','matches',(select count(*) from djm_os.player_matches where club_need_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where club_need_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where club_need_id=p_entity_id));
  elsif p_entity_type='deal_room' then return jsonb_build_object('entity_type','deal_room','exists',exists(select 1 from djm_os.deal_rooms where id=p_entity_id));
  else return jsonb_build_object('entity_type','player','agreements',(select count(*) from public.player_agreements where player_id=p_entity_id),'opportunities',(select count(*) from public.player_opportunities where player_id=p_entity_id),'matches',(select count(*) from djm_os.player_matches where player_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where player_id=p_entity_id),'documents',(select count(*) from public.player_documents where player_id=p_entity_id)); end if;
end $function$;

CREATE OR REPLACE FUNCTION public.djm_entity_archive_v1(p_entity_type text, p_entity_id uuid, p_archived boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid; v_name text; v_at timestamptz:=case when p_archived then now() else null end;
begin
  case p_entity_type
    when 'player' then select tenant_id,coalesce(nullif(trim(preferred_name),''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player') into v_tenant,v_name from public.players where id=p_entity_id;
    when 'club' then select tenant_id,name into v_tenant,v_name from djm_os.organisations where id=p_entity_id and organisation_type='club';
    when 'club_contact' then select tenant_id,full_name into v_tenant,v_name from djm_os.people where id=p_entity_id and coalesce(person_type,'contact')<>'player';
    when 'recruitment_target' then select tenant_id,full_name into v_tenant,v_name from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then select tenant_id,coalesce(title,position,'Club need') into v_tenant,v_name from djm_os.club_needs where id=p_entity_id;
    when 'deal_room' then select tenant_id,coalesce(title,'Deal') into v_tenant,v_name from djm_os.deal_rooms where id=p_entity_id;
    else raise exception 'Unsupported entity type';
  end case;
  if v_tenant is null then raise exception 'Entity not found'; end if;
  if not private.user_is_tenant_admin(v_tenant,auth.uid()) or v_tenant is distinct from private.redream_request_tenant() then raise exception 'agency_admin_access_required' using errcode='42501'; end if;
  case p_entity_type
    when 'player' then update public.players set archived_at=v_at,updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    when 'club' then update djm_os.organisations set archived_at=v_at,updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    when 'club_contact' then update djm_os.people set archived_at=v_at,updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    when 'recruitment_target' then update djm_os.scouting_prospects set archived_at=v_at,updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    when 'club_need' then update djm_os.club_needs set archived_at=v_at,updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    when 'deal_room' then update djm_os.deal_rooms set archived_at=v_at,updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
  end case;
  insert into djm_os.events(event_type,actor_user_id,tenant_id,payload,source,confidence,occurred_at)
  values(case when p_archived then 'ENTITY_ARCHIVED' else 'ENTITY_UNARCHIVED' end,auth.uid(),v_tenant,jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'name',v_name),'manual_ui',1,now());
  return jsonb_build_object('ok',true,'archived',p_archived,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $function$;

CREATE OR REPLACE FUNCTION public.djm_entity_patch_v1(p_entity_type text, p_entity_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid; v_name text; v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
begin
  if jsonb_typeof(v_patch)<>'object' then raise exception 'Patch must be an object'; end if;
  case p_entity_type
    when 'player' then select tenant_id into v_tenant from public.players where id=p_entity_id;
    when 'club' then select tenant_id into v_tenant from djm_os.organisations where id=p_entity_id and organisation_type='club';
    when 'club_contact' then select tenant_id into v_tenant from djm_os.people where id=p_entity_id and coalesce(person_type,'contact')<>'player';
    when 'recruitment_target' then select tenant_id into v_tenant from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then select tenant_id into v_tenant from djm_os.club_needs where id=p_entity_id;
    when 'deal_room' then select tenant_id into v_tenant from djm_os.deal_rooms where id=p_entity_id;
    else raise exception 'Unsupported entity type';
  end case;
  if v_tenant is null then raise exception 'Entity not found'; end if;
  if not private.user_is_tenant_admin(v_tenant,auth.uid()) or v_tenant is distinct from private.redream_request_tenant() then raise exception 'agency_admin_access_required' using errcode='42501'; end if;

  if p_entity_type='club' then
    update djm_os.organisations set
      name=case when v_patch?'name' then coalesce(nullif(trim(v_patch->>'name'),''),name) else name end,
      country=case when v_patch?'country' then nullif(trim(v_patch->>'country'),'') else country end,
      city=case when v_patch?'city' then nullif(trim(v_patch->>'city'),'') else city end,
      website_url=case when v_patch?'website_url' then nullif(trim(v_patch->>'website_url'),'') else website_url end,
      updated_at=now(),last_verified_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select name into v_name from djm_os.organisations where id=p_entity_id;
  elsif p_entity_type='club_contact' then
    update djm_os.people set
      full_name=case when v_patch?'full_name' then coalesce(nullif(trim(v_patch->>'full_name'),''),full_name) else full_name end,
      preferred_name=case when v_patch?'preferred_name' then nullif(trim(v_patch->>'preferred_name'),'') else preferred_name end,
      country=case when v_patch?'country' then nullif(trim(v_patch->>'country'),'') else country end,
      city=case when v_patch?'city' then nullif(trim(v_patch->>'city'),'') else city end,
      updated_at=now(),last_verified_at=now() where id=p_entity_id and tenant_id=v_tenant;
    if v_patch?'role_title' then
      update djm_os.employments set
        role_title=nullif(trim(v_patch->>'role_title'),''),updated_at=now()
      where tenant_id=v_tenant and person_id=p_entity_id and is_current=true;
    end if;
    select full_name into v_name from djm_os.people where id=p_entity_id;
  elsif p_entity_type='recruitment_target' then
    update djm_os.scouting_prospects set
      full_name=case when v_patch?'full_name' then coalesce(nullif(trim(v_patch->>'full_name'),''),full_name) else full_name end,
      primary_position=case when v_patch?'primary_position' then nullif(trim(v_patch->>'primary_position'),'') else primary_position end,
      current_club=case when v_patch?'current_club' then nullif(trim(v_patch->>'current_club'),'') else current_club end,
      current_country=case when v_patch?'current_country' then nullif(trim(v_patch->>'current_country'),'') else current_country end,
      contract_expiry=case when v_patch?'contract_expiry' then nullif(v_patch->>'contract_expiry','')::date else contract_expiry end,
      transfermarkt_url=case when v_patch?'transfermarkt_url' then nullif(trim(v_patch->>'transfermarkt_url'),'') else transfermarkt_url end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select full_name into v_name from djm_os.scouting_prospects where id=p_entity_id;
  elsif p_entity_type='club_need' then
    perform private.platform_club_need_brief_patch(v_tenant,p_entity_id,v_patch);
    update djm_os.club_needs set
      title=case when v_patch?'title' then coalesce(nullif(trim(v_patch->>'title'),''),title) else title end,
      position=case when v_patch?'position' then nullif(trim(v_patch->>'position'),'') else position end,
      profile_notes=case when v_patch?'profile_notes' then nullif(trim(v_patch->>'profile_notes'),'') else profile_notes end,
      expires_at=case when v_patch?'expires_at' then nullif(v_patch->>'expires_at','')::timestamptz else expires_at end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select coalesce(title,position) into v_name from djm_os.club_needs where id=p_entity_id;
  elsif p_entity_type='deal_room' then
    update djm_os.deal_rooms set
      title=case when v_patch?'title' then coalesce(nullif(trim(v_patch->>'title'),''),title) else title end,
      next_action_text=case when v_patch?'next_action_text' then nullif(trim(v_patch->>'next_action_text'),'') else next_action_text end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select coalesce(title,'Deal') into v_name from djm_os.deal_rooms where id=p_entity_id;
  else
    update public.players set
      first_name=case when v_patch?'first_name' then nullif(trim(v_patch->>'first_name'),'') else first_name end,
      last_name=case when v_patch?'last_name' then nullif(trim(v_patch->>'last_name'),'') else last_name end,
      preferred_name=case when v_patch?'preferred_name' then nullif(trim(v_patch->>'preferred_name'),'') else preferred_name end,
      primary_position=case when v_patch?'primary_position' then nullif(trim(v_patch->>'primary_position'),'') else primary_position end,
      current_club=case when v_patch?'current_club' then nullif(trim(v_patch->>'current_club'),'') else current_club end,
      current_country=case when v_patch?'current_country' then nullif(trim(v_patch->>'current_country'),'') else current_country end,
      contract_expiry=case when v_patch?'contract_expiry' then nullif(v_patch->>'contract_expiry','')::date else contract_expiry end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select coalesce(nullif(trim(preferred_name),''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player') into v_name from public.players where id=p_entity_id;
  end if;

  insert into djm_os.events(event_type,actor_user_id,tenant_id,payload,source,confidence,occurred_at)
  values('ENTITY_EDITED',auth.uid(),v_tenant,jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'name',v_name,'fields',v_patch),'manual_ui',1,now());
  return jsonb_build_object('ok',true,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $function$;
