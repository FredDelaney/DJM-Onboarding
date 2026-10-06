-- Restore only missing staff-boundary prerequisites in older environments.
-- Existing modern definitions and unrelated work are preserved.
begin;
alter table djm_os.messaging_threads add column if not exists bound_player_id uuid references public.players(id) on delete set null;
create index if not exists messaging_threads_bound_player_idx on djm_os.messaging_threads(tenant_id,bound_player_id) where bound_player_id is not null;
do $identity_constraint$
begin
 if not exists(select 1 from pg_constraint where conrelid='djm_os.messaging_threads'::regclass and conname='messaging_threads_single_bound_identity') then
  alter table djm_os.messaging_threads add constraint messaging_threads_single_bound_identity check (num_nonnulls(bound_person_id,bound_player_id)<=1);
 end if;
end;
$identity_constraint$;
alter table djm_os.organisations add column if not exists archived_at timestamptz;
alter table djm_os.scouting_prospects add column if not exists archived_at timestamptz;
alter table djm_os.club_needs add column if not exists archived_at timestamptz;
alter table djm_os.deal_rooms add column if not exists archived_at timestamptz;
do $prerequisite$
begin
  if to_regprocedure('public.redream_opportunity_connected_context(integer)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.redream_opportunity_connected_context(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(
    v_tenant,
    v_user
  ) then
    raise exception 'workspace_access_denied';
  end if;

  return public.platform_server_opportunity_connected_context(
    v_tenant,
    p_limit
  );
end;
$function$
$definition$;
    revoke all on function public.redream_opportunity_connected_context(integer) from public,anon,authenticated;
    grant execute on function public.redream_opportunity_connected_context(integer) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.djm_entity_archive_v1(text,uuid,boolean)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.djm_entity_archive_v1(p_entity_type text, p_entity_id uuid, p_archived boolean DEFAULT true)
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
  if not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then raise exception 'Tenant access required'; end if;
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
end $function$
$definition$;
    revoke all on function public.djm_entity_archive_v1(text,uuid,boolean) from public,anon,authenticated;
    grant execute on function public.djm_entity_archive_v1(text,uuid,boolean) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.djm_entity_patch_v1(text,uuid,jsonb)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.djm_entity_patch_v1(p_entity_type text, p_entity_id uuid, p_patch jsonb)
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
  if not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then raise exception 'Tenant access required'; end if;

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
end $function$
$definition$;
    revoke all on function public.djm_entity_patch_v1(text,uuid,jsonb) from public,anon,authenticated;
    grant execute on function public.djm_entity_patch_v1(text,uuid,jsonb) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.redream_messaging_player_candidates()') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.redream_messaging_player_candidates()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_items jsonb:='[]'::jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id',p.id,
        'player_name',coalesce(
          nullif(trim(p.preferred_name),''),
          nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
          'Player'
        ),
        'primary_position',p.primary_position,
        'current_club',p.current_club,
        'instagram_url',p.instagram_url,
        'instagram_handle',case
          when nullif(trim(coalesce(p.instagram_url,'')),'') is null then null
          else nullif(
            lower(
              regexp_replace(
                regexp_replace(
                  trim(p.instagram_url),
                  '^.*instagram\.com/',
                  '',
                  'i'
                ),
                '[/?#].*$',
                '',
                'g'
              )
            ),
            ''
          )
        end
      )
      order by lower(coalesce(
        nullif(trim(p.preferred_name),''),
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        'Player'
      )),p.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.players p
  where p.tenant_id=v_tenant
    and coalesce(p.football_status,'active') not in ('retired','inactive');

  return jsonb_build_object(
    'players',v_items,
    'truth_contract',jsonb_build_object(
      'scope','Only signed players in the current agency workspace are returned.',
      'instagram','An exact recorded Instagram handle may be shown as a suggestion, but no player is linked automatically.'
    )
  );
end;
$function$
$definition$;
    revoke all on function public.redream_messaging_player_candidates() from public,anon,authenticated;
    grant execute on function public.redream_messaging_player_candidates() to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.redream_messaging_thread_bind_player(text,text,uuid)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.redream_messaging_thread_bind_player(p_provider text, p_external_thread_id text, p_player_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_thread_id uuid;
  v_participant_label text;
  v_player_name text;
  v_current_club text;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  if v_external_thread_id='' then
    raise exception 'thread_required';
  end if;

  select t.id,t.participant_label
  into v_thread_id,v_participant_label
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
  limit 1;

  if v_thread_id is null then
    raise exception 'thread_not_found';
  end if;

  if p_player_id is null then
    update djm_os.messaging_threads
    set
      bound_person_id=null,
      bound_organisation_id=null,
      bound_player_id=null,
      bound_at=null,
      bound_by=null,
      updated_at=now()
    where id=v_thread_id;

    return jsonb_build_object(
      'thread_id',v_thread_id,
      'bound',false,
      'identity_kind',null,
      'bound_player_id',null,
      'bound_player_name',null
    );
  end if;

  select
    coalesce(
      nullif(trim(p.preferred_name),''),
      nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Player'
    ),
    p.current_club
  into v_player_name,v_current_club
  from public.players p
  where p.id=p_player_id
    and p.tenant_id=v_tenant
    and coalesce(p.football_status,'active') not in ('retired','inactive')
  limit 1;

  if v_player_name is null then
    raise exception 'player_not_found';
  end if;

  update djm_os.messaging_threads
  set
    bound_person_id=null,
    bound_organisation_id=null,
    bound_player_id=p_player_id,
    bound_at=now(),
    bound_by=v_user,
    updated_at=now()
  where id=v_thread_id;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,player_id,
    payload,source,confidence,occurred_at
  )
  values(
    v_tenant,'MESSAGING_THREAD_PLAYER_BOUND',v_user,p_player_id,
    jsonb_build_object(
      'provider',v_provider,
      'external_thread_id',v_external_thread_id,
      'participant_label',v_participant_label,
      'player_name',v_player_name,
      'player_current_club',v_current_club,
      'identity_kind','player'
    ),
    'redream_messaging',1,now()
  );

  return jsonb_build_object(
    'thread_id',v_thread_id,
    'bound',true,
    'identity_kind','player',
    'bound_person_id',null,
    'bound_organisation_id',null,
    'bound_player_id',p_player_id,
    'bound_player_name',v_player_name,
    'bound_player_current_club',v_current_club
  );
end;
$function$
$definition$;
    revoke all on function public.redream_messaging_thread_bind_player(text,text,uuid) from public,anon,authenticated;
    grant execute on function public.redream_messaging_thread_bind_player(text,text,uuid) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.redream_entity_action_preview(text,uuid)') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.redream_entity_action_preview(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
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
end $function$
$definition$;
    revoke all on function public.redream_entity_action_preview(text,uuid) from public,anon,authenticated;
    grant execute on function public.redream_entity_action_preview(text,uuid) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.redream_entity_archives()') is null then
    execute $definition$CREATE OR REPLACE FUNCTION public.redream_entity_archives()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_items jsonb;
begin
  if v_tenant is null or v_user is null or not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'Agency staff access required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.archived_at desc),'[]'::jsonb) into v_items
  from (
    select 'player'::text entity_type,id entity_id,archived_at from public.players where tenant_id=v_tenant and archived_at is not null
    union all select 'club',id,archived_at from djm_os.organisations where tenant_id=v_tenant and archived_at is not null
    union all select 'club_contact',id,archived_at from djm_os.people where tenant_id=v_tenant and archived_at is not null
    union all select 'recruitment_target',id,archived_at from djm_os.scouting_prospects where tenant_id=v_tenant and archived_at is not null
    union all select 'club_need',id,archived_at from djm_os.club_needs where tenant_id=v_tenant and archived_at is not null
    union all select 'deal_room',id,archived_at from djm_os.deal_rooms where tenant_id=v_tenant and archived_at is not null
  ) x;

  return jsonb_build_object('items',v_items);
end $function$
$definition$;
    revoke all on function public.redream_entity_archives() from public,anon,authenticated;
    grant execute on function public.redream_entity_archives() to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.djm_delete_entity(text,uuid,boolean)') is null or md5(pg_get_functiondef(to_regprocedure('public.djm_delete_entity(text,uuid,boolean)')))='6556d348c97653cd3eb07c73d0e36a79' then
    execute $definition$CREATE OR REPLACE FUNCTION public.djm_delete_entity(p_entity_type text, p_entity_id uuid, p_confirm boolean DEFAULT false)
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
  if not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then raise exception 'Tenant access required'; end if;
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
end $function$
$definition$;
    revoke all on function public.djm_delete_entity(text,uuid,boolean) from public,anon,authenticated;
    grant execute on function public.djm_delete_entity(text,uuid,boolean) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
  if to_regprocedure('public.djm_delete_preview(text,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.djm_delete_preview(text,uuid)')))='0d6bd7070aa24dca44b1765bede99527' then
    execute $definition$CREATE OR REPLACE FUNCTION public.djm_delete_preview(p_entity_type text, p_entity_id uuid)
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
  if not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then raise exception 'Tenant access required'; end if;
  if p_entity_type='club' then return jsonb_build_object('entity_type','club','contacts',(select count(*) from djm_os.employments where organisation_id=p_entity_id),'needs',(select count(*) from djm_os.club_needs where organisation_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where organisation_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where organisation_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where organisation_id=p_entity_id));
  elsif p_entity_type='club_contact' then return jsonb_build_object('entity_type','club_contact','relationships',(select count(*) from djm_os.relationships where person_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where person_id=p_entity_id),'employments',(select count(*) from djm_os.employments where person_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where person_id=p_entity_id));
  elsif p_entity_type='recruitment_target' then return jsonb_build_object('entity_type','recruitment_target','interactions',(select count(*) from djm_os.recruitment_interactions where prospect_id=p_entity_id),'reports',(select count(*) from djm_os.scouting_reports where prospect_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where prospect_id=p_entity_id),'linked_player_id',(select linked_player_id from djm_os.scouting_prospects where id=p_entity_id));
  elsif p_entity_type='club_need' then return jsonb_build_object('entity_type','club_need','matches',(select count(*) from djm_os.player_matches where club_need_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where club_need_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where club_need_id=p_entity_id));
  elsif p_entity_type='deal_room' then return jsonb_build_object('entity_type','deal_room','exists',exists(select 1 from djm_os.deal_rooms where id=p_entity_id));
  else return jsonb_build_object('entity_type','player','agreements',(select count(*) from public.player_agreements where player_id=p_entity_id),'opportunities',(select count(*) from public.player_opportunities where player_id=p_entity_id),'matches',(select count(*) from djm_os.player_matches where player_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where player_id=p_entity_id),'documents',(select count(*) from public.player_documents where player_id=p_entity_id)); end if;
end $function$
$definition$;
    revoke all on function public.djm_delete_preview(text,uuid) from public,anon,authenticated;
    grant execute on function public.djm_delete_preview(text,uuid) to service_role;
  end if;
end;
$prerequisite$;

do $prerequisite$
begin
 if to_regprocedure('private.redream_latest_connected_contact(uuid,uuid)') is null then
  execute $definition$CREATE OR REPLACE FUNCTION private.redream_latest_connected_contact(p_tenant_id uuid, p_person_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    case
      when i.id is null then null
      else jsonb_build_object(
        'interaction_id',i.id,
        'channel',i.channel,
        'direction',i.direction,
        'summary',i.summary,
        'occurred_at',i.occurred_at,
        'person_id',i.person_id,
        'person_name',p.full_name,
        'organisation_id',i.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',i.team_member_id,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          case
            when membership.user_id is not null
              then 'Agency member'
            else null
          end
        ),
        'owner_state',
          case
            when i.team_member_id is null
              then 'unassigned'
            when membership.user_id is not null
              then 'active_staff'
            else 'inactive_or_invalid_staff'
          end
      )
    end
  from (select 1) seed
  left join lateral (
    select ix.*
    from djm_os.interactions ix
    where ix.tenant_id=p_tenant_id
      and ix.person_id=p_person_id
      and ix.channel in (
        'google_email',
        'microsoft_email',
        'instagram_selected_chat',
        'whatsapp_selected_chat'
      )
    order by ix.occurred_at desc,ix.created_at desc
    limit 1
  ) i on true
  left join djm_os.people p
    on p.id=i.person_id
   and p.tenant_id=p_tenant_id
  left join djm_os.organisations o
    on o.id=i.organisation_id
   and o.tenant_id=p_tenant_id
  left join platform.tenant_memberships membership
    on membership.tenant_id=p_tenant_id
   and membership.user_id=i.team_member_id
   and membership.status='active'
   and membership.role in (
     'owner',
     'admin',
     'agent',
     'operations',
     'scout'
   )
  left join djm_os.team_members tm
    on tm.user_id=membership.user_id
   and tm.is_active;
$function$
$definition$;
  revoke all on function private.redream_latest_connected_contact(uuid,uuid) from public,anon,authenticated;
  grant execute on function private.redream_latest_connected_contact(uuid,uuid) to service_role;
 end if;
end;
$prerequisite$;

do $prerequisite$
begin
 if to_regprocedure('private.redream_need_connected_followup(uuid,uuid)') is null then
  execute $definition$CREATE OR REPLACE FUNCTION private.redream_need_connected_followup(p_tenant_id uuid, p_club_need_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    case
      when t.id is null then null
      else jsonb_build_object(
        'task_id',t.id,
        'title',t.title,
        'due_at',t.due_at,
        'priority',t.priority,
        'owner_user_id',t.owner_user_id,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          case
            when membership.user_id is not null
              then 'Agency member'
            else null
          end
        ),
        'owner_state',
          case
            when t.owner_user_id is null
              then 'unassigned'
            when membership.user_id is not null
              then 'active_staff'
            else 'inactive_or_invalid_staff'
          end
      )
    end
  from (select 1) seed
  left join lateral (
    select tx.*
    from djm_os.tasks tx
    where tx.tenant_id=p_tenant_id
      and tx.club_need_id=p_club_need_id
      and tx.status not in (
        'done','completed','cancelled'
      )
    order by tx.due_at nulls last,tx.created_at desc
    limit 1
  ) t on true
  left join platform.tenant_memberships membership
    on membership.tenant_id=p_tenant_id
   and membership.user_id=t.owner_user_id
   and membership.status='active'
   and membership.role in (
     'owner',
     'admin',
     'agent',
     'operations',
     'scout'
   )
  left join djm_os.team_members tm
    on tm.user_id=membership.user_id
   and tm.is_active;
$function$
$definition$;
  revoke all on function private.redream_need_connected_followup(uuid,uuid) from public,anon,authenticated;
  grant execute on function private.redream_need_connected_followup(uuid,uuid) to service_role;
 end if;
end;
$prerequisite$;

do $prerequisite$
begin
 if to_regprocedure('public.platform_server_opportunity_connected_context(uuid,integer)') is null then
  execute $definition$CREATE OR REPLACE FUNCTION public.platform_server_opportunity_connected_context(p_tenant_id uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),250));
  v_needs jsonb:='[]'::jsonb;
  v_routes jsonb:='[]'::jsonb;
  v_deals jsonb:='[]'::jsonb;
begin
  if not exists(
    select 1
    from platform.tenants t
    where t.id=p_tenant_id
      and t.status='active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  select coalesce(
    jsonb_agg(item order by updated_at desc),
    '[]'::jsonb
  )
  into v_needs
  from (
    select
      jsonb_build_object(
        'club_need_id',cn.id,
        'scope','need_source_contact',
        'source_person_id',cn.source_person_id,
        'source_person_name',p.full_name,
        'latest_contact',
          private.redream_latest_connected_contact(
            p_tenant_id,
            cn.source_person_id
          ),
        'open_followup',
          private.redream_need_connected_followup(
            p_tenant_id,
            cn.id
          ),
        'need_owner_user_id',cn.owner_user_id,
        'need_owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          case
            when cn.owner_user_id is not null
              then 'Agency member'
            else null
          end
        )
      ) as item,
      cn.updated_at
    from djm_os.club_needs cn
    left join djm_os.people p
      on p.id=cn.source_person_id
     and p.tenant_id=cn.tenant_id
    left join djm_os.team_members tm
      on tm.user_id=cn.owner_user_id
     and tm.is_active
    where cn.tenant_id=p_tenant_id
      and cn.status in ('active','confirmed')
      and cn.source_person_id is not null
    order by cn.updated_at desc
    limit v_limit
  ) q;
  select coalesce(
    jsonb_agg(item order by updated_at desc),
    '[]'::jsonb
  )
  into v_routes
  from (
    select
      jsonb_build_object(
        'player_match_id',pm.id,
        'club_need_id',pm.club_need_id,
        'scope','need_source_contact',
        'source_person_id',cn.source_person_id,
        'source_person_name',p.full_name,
        'latest_contact',
          private.redream_latest_connected_contact(
            p_tenant_id,
            cn.source_person_id
          )
      ) as item,
      pm.updated_at
    from djm_os.player_matches pm
    join djm_os.club_needs cn
      on cn.id=pm.club_need_id
     and cn.tenant_id=pm.tenant_id
    left join djm_os.people p
      on p.id=cn.source_person_id
     and p.tenant_id=cn.tenant_id
    where pm.tenant_id=p_tenant_id
      and pm.status not in ('rejected','closed','withdrawn')
      and cn.source_person_id is not null
    order by pm.updated_at desc
    limit v_limit
  ) q;

  select coalesce(
    jsonb_agg(item order by updated_at desc),
    '[]'::jsonb
  )
  into v_deals
  from (
    select
      jsonb_build_object(
        'deal_room_id',d.id,
        'scope',
          case
            when d.source_person_id is not null
              then 'deal_source_contact'
            when cn.source_person_id is not null
              then 'need_source_contact'
            else null
          end,
        'source_person_id',
          coalesce(
            d.source_person_id,
            cn.source_person_id
          ),
        'source_person_name',p.full_name,
        'latest_contact',
          private.redream_latest_connected_contact(
            p_tenant_id,
            coalesce(
              d.source_person_id,
              cn.source_person_id
            )
          ),
        'deal_owner_user_id',d.owner_user_id,
        'deal_owner_name',coalesce(
          nullif(trim(owner_tm.display_name),''),
          case
            when d.owner_user_id is not null
              then 'Agency member'
            else null
          end
        )
      ) as item,
      d.updated_at
    from djm_os.deal_rooms d
    left join djm_os.club_needs cn
      on cn.id=d.club_need_id
     and cn.tenant_id=d.tenant_id
    left join djm_os.people p
      on p.id=coalesce(
        d.source_person_id,
        cn.source_person_id
      )
     and p.tenant_id=d.tenant_id
    left join djm_os.team_members owner_tm
      on owner_tm.user_id=d.owner_user_id
     and owner_tm.is_active
    where d.tenant_id=p_tenant_id
      and d.status='active'
      and coalesce(
        d.source_person_id,
        cn.source_person_id
      ) is not null
    order by d.updated_at desc
    limit v_limit
  ) q;
  return jsonb_build_object(
    'contract_version',
      'redream_opportunity_connected_context_v1',
    'generated_at',now(),
    'needs',v_needs,
    'routes',v_routes,
    'deals',v_deals,
    'truth_contract',jsonb_build_object(
      'need_scope',
        'Club-need communication is anchored to the recorded source person for that need.',
      'route_scope',
        'Player-route communication reflects the source contact for the underlying club need, not proof that the player was discussed.',
      'deal_scope',
        'Deal communication uses the recorded deal source person, falling back only to the linked club-need source person.',
      'absence',
        'No connected context is shown when there is no defensible source person.',
      'ownership',
        'Communication owner and opportunity owner remain separate recorded facts.',
      'external_action',
        'Connected context never sends an external message automatically.'
    )
  );
end;
$function$
$definition$;
  revoke all on function public.platform_server_opportunity_connected_context(uuid,integer) from public,anon,authenticated;
  grant execute on function public.platform_server_opportunity_connected_context(uuid,integer) to service_role;
 end if;
end;
$prerequisite$;

commit;
