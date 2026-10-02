begin;

alter table public.players add column if not exists archived_at timestamptz;
alter table djm_os.organisations add column if not exists archived_at timestamptz;
alter table djm_os.people add column if not exists archived_at timestamptz;
alter table djm_os.scouting_prospects add column if not exists archived_at timestamptz;
alter table djm_os.club_needs add column if not exists archived_at timestamptz;
alter table djm_os.deal_rooms add column if not exists archived_at timestamptz;

create index if not exists players_tenant_archived_idx on public.players(tenant_id,archived_at);
create index if not exists organisations_tenant_archived_idx on djm_os.organisations(tenant_id,archived_at);
create index if not exists people_tenant_archived_idx on djm_os.people(tenant_id,archived_at);
create index if not exists prospects_tenant_archived_idx on djm_os.scouting_prospects(tenant_id,archived_at);
create index if not exists club_needs_tenant_archived_idx on djm_os.club_needs(tenant_id,archived_at);
create index if not exists deal_rooms_tenant_archived_idx on djm_os.deal_rooms(tenant_id,archived_at);

create or replace function public.djm_entity_archive_v1(p_entity_type text,p_entity_id uuid,p_archived boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $function$
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
end $function$;

create or replace function public.djm_entity_patch_v1(p_entity_type text,p_entity_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
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
end $function$;

create or replace function public.djm_delete_preview(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
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
end $function$;

create or replace function public.djm_delete_entity(p_entity_type text,p_entity_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $function$
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
end $function$;

revoke all on function public.djm_entity_archive_v1(text,uuid,boolean) from public,anon;
revoke all on function public.djm_entity_patch_v1(text,uuid,jsonb) from public,anon;
revoke all on function public.djm_delete_preview(text,uuid) from public,anon;
revoke all on function public.djm_delete_entity(text,uuid,boolean) from public,anon;
grant execute on function public.djm_entity_archive_v1(text,uuid,boolean) to authenticated,service_role;
grant execute on function public.djm_entity_patch_v1(text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.djm_delete_preview(text,uuid) to authenticated,service_role;
grant execute on function public.djm_delete_entity(text,uuid,boolean) to authenticated,service_role;

create or replace function public.platform_server_players_workspace(
  p_tenant_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,100),200));
  v_player public.players%rowtype;
  v_service jsonb;
  v_representation jsonb;
  v_profile jsonb;
  v_active_opportunities integer;
  v_items jsonb := '[]'::jsonb;
begin
  if not exists(
    select 1 from platform.tenants
    where id=p_tenant_id and status='active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  for v_player in
    select p.*
    from public.players p
    where p.tenant_id=p_tenant_id
      and p.archived_at is null
      and coalesce(p.football_status,'active') not in ('retired')
    order by
      case p.agency_priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      p.next_action_due nulls first,
      p.updated_at desc
    limit v_limit
  loop
    v_service := public.platform_server_player_service_card(p_tenant_id,v_player.id);

    select jsonb_build_object(
      'recorded',true,
      'id',a.id,
      'agreement_type',a.agreement_type,
      'status',a.status,
      'title',a.title,
      'start_date',a.start_date,
      'end_date',a.end_date
    )
    into v_representation
    from public.player_agreements a
    where a.player_id=v_player.id
      and a.status='active'
      and a.agreement_type in ('representation','mandate','placement_authorisation')
    order by a.end_date nulls last,a.updated_at desc
    limit 1;

    if v_representation is null then
      v_representation := jsonb_build_object('recorded',false,'status','not_recorded');
    end if;

    select jsonb_build_object(
      'exists',true,
      'published',pp.published,
      'public_slug',pp.public_slug,
      'display_name',pp.display_name,
      'updated_at',pp.updated_at,
      'verified_at',pp.verified_at
    )
    into v_profile
    from public.player_public_profiles pp
    where pp.player_id=v_player.id
    limit 1;

    if v_profile is null then
      v_profile := jsonb_build_object('exists',false,'published',false);
    end if;

    select count(*)::integer
    into v_active_opportunities
    from public.player_opportunities po
    where po.tenant_id=p_tenant_id
      and po.player_id=v_player.id
      and po.stage not in ('won','lost','paused');

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'player_id',v_player.id,
        'identity',jsonb_build_object(
          'name',coalesce(
            nullif(trim(v_player.preferred_name),''),
            nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),
            'Player'
          ),
          'first_name',v_player.first_name,
          'last_name',v_player.last_name,
          'date_of_birth',v_player.date_of_birth,
          'nationalities',coalesce(to_jsonb(v_player.nationalities),'[]'::jsonb),
          'height_cm',v_player.height_cm,
          'preferred_foot',v_player.preferred_foot,
          'primary_position',v_player.primary_position,
          'secondary_positions',coalesce(to_jsonb(v_player.secondary_positions),'[]'::jsonb),
          'current_club',v_player.current_club,
          'current_league',v_player.current_league,
          'current_country',v_player.current_country,
          'contract_status',v_player.contract_status,
          'contract_expiry',v_player.contract_expiry,
          'football_status',v_player.football_status,
          'profile_photo_path',v_player.profile_photo_path,
          'agency_priority',v_player.agency_priority,
          'next_action',v_player.next_action,
          'next_action_due',v_player.next_action_due,
          'transfermarkt_market_value',v_player.transfermarkt_market_value,
          'transfermarkt_market_value_currency',v_player.transfermarkt_market_value_currency
        ),
        'service',jsonb_build_object(
          'state',v_service#>>'{service_control,state}',
          'next_service_move',v_service->'next_service_move',
          'next_control_fix',v_service->'next_control_fix',
          'career_timing',v_service->'career_timing',
          'market_coverage',v_service->'market_coverage'
        ),
        'representation',v_representation,
        'profile',v_profile,
        'active_opportunities',v_active_opportunities
      )
    );
  end loop;

  return jsonb_build_object(
    'available',true,
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'items',v_items,
    'truth_contract',jsonb_build_object(
      'contact','No last-player-contact claim is made because the current communication ledger is not yet reliable for that purpose.',
      'representation','Representation status reflects records stored in the platform and is not a legal-validity conclusion.',
      'market','Opportunity and market activity reflect recorded agency work only.'
    )
  );
end;
$function$;

create or replace function public.platform_server_player_workspace(
  p_tenant_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_player public.players%rowtype;
  v_service jsonb;
  v_career jsonb;
  v_profile jsonb;
  v_agreements jsonb;
  v_documents jsonb;
  v_opportunities jsonb;
  v_deals jsonb;
  v_activity jsonb;
begin
  select *
  into v_player
  from public.players
  where id=p_player_id and tenant_id=p_tenant_id and archived_at is null;

  if not found then
    raise exception 'player_not_found_for_tenant';
  end if;

  v_service := public.platform_server_player_service_card(p_tenant_id,p_player_id);
  v_career := public.platform_server_player_career_alignment(p_tenant_id,p_player_id);

  select jsonb_build_object(
    'exists',true,
    'published',pp.published,
    'public_slug',pp.public_slug,
    'display_name',pp.display_name,
    'headline',pp.headline,
    'updated_at',pp.updated_at,
    'verified_at',pp.verified_at
  )
  into v_profile
  from public.player_public_profiles pp
  where pp.player_id=p_player_id
  limit 1;

  if v_profile is null then
    v_profile := jsonb_build_object('exists',false,'published',false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'agreement_type',a.agreement_type,
    'status',a.status,
    'title',a.title,
    'start_date',a.start_date,
    'end_date',a.end_date,
    'territory',a.territory
  ) order by case when a.status='active' then 0 else 1 end,a.end_date nulls last,a.updated_at desc),'[]'::jsonb)
  into v_agreements
  from public.player_agreements a
  where a.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'title',d.title,
    'document_type',d.document_type,
    'country',d.country,
    'expires_at',d.expires_at,
    'club_shareable',d.club_shareable,
    'created_at',d.created_at
  ) order by d.expires_at nulls last,d.created_at desc),'[]'::jsonb)
  into v_documents
  from public.player_documents d
  where d.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',po.id,
    'club_name',po.club_name,
    'country',po.country,
    'stage',po.stage,
    'summary',po.summary,
    'next_action',po.next_action,
    'next_action_due',po.next_action_due,
    'last_contacted_at',po.last_contacted_at,
    'updated_at',po.updated_at
  ) order by case when po.stage in ('won','lost','paused') then 1 else 0 end,po.next_action_due nulls last,po.updated_at desc),'[]'::jsonb)
  into v_opportunities
  from public.player_opportunities po
  where po.tenant_id=p_tenant_id and po.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',dr.id,
    'title',dr.title,
    'club_name',o.name,
    'stage',dr.stage,
    'status',dr.status,
    'next_action',coalesce(dr.next_action_text,dr.next_decision),
    'next_action_at',dr.next_action_at,
    'primary_blocker',dr.primary_blocker,
    'updated_at',dr.updated_at
  ) order by case when dr.status='active' then 0 else 1 end,dr.updated_at desc),'[]'::jsonb)
  into v_deals
  from djm_os.deal_rooms dr
  left join djm_os.organisations o
    on o.id=dr.organisation_id and o.tenant_id=dr.tenant_id
  where dr.tenant_id=p_tenant_id and dr.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type',x.event_type,
    'source',x.source,
    'occurred_at',x.occurred_at
  ) order by x.occurred_at desc),'[]'::jsonb)
  into v_activity
  from (
    select e.event_type,e.source,e.occurred_at
    from djm_os.events e
    where e.tenant_id=p_tenant_id and e.player_id=p_player_id
    order by e.occurred_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'available',true,
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'identity',jsonb_build_object(
      'id',v_player.id,
      'name',coalesce(
        nullif(trim(v_player.preferred_name),''),
        nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),
        'Player'
      ),
      'date_of_birth',v_player.date_of_birth,
      'nationalities',coalesce(to_jsonb(v_player.nationalities),'[]'::jsonb),
      'height_cm',v_player.height_cm,
      'preferred_foot',v_player.preferred_foot,
      'primary_position',v_player.primary_position,
      'secondary_positions',coalesce(to_jsonb(v_player.secondary_positions),'[]'::jsonb),
      'current_club',v_player.current_club,
      'current_league',v_player.current_league,
      'current_country',v_player.current_country,
      'contract_status',v_player.contract_status,
      'contract_expiry',v_player.contract_expiry,
      'football_status',v_player.football_status,
      'profile_photo_path',v_player.profile_photo_path,
      'next_action',v_player.next_action,
      'next_action_due',v_player.next_action_due,
      'transfermarkt_market_value',v_player.transfermarkt_market_value,
      'transfermarkt_market_value_currency',v_player.transfermarkt_market_value_currency
    ),
    'service',v_service,
    'career_alignment',v_career,
    'profile',v_profile,
    'agreements',v_agreements,
    'documents',v_documents,
    'opportunities',v_opportunities,
    'deals',v_deals,
    'activity',v_activity,
    'truth_contract',jsonb_build_object(
      'private_data','This contract excludes player_private and private document object paths.',
      'activity','Activity shows recorded event types and dates only, not private event payloads.',
      'contact','No last-player-contact claim is made because the current communication ledger is not yet reliable for that purpose.'
    )
  );
end;
$function$;

create or replace function public.platform_server_recruitment_board(
  p_tenant_id uuid,
  p_limit integer default 250
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with items as (
  select
    sp.*,
    case
      when sp.recruitment_stage in ('identified','researching') then 'identified'
      when sp.recruitment_stage in ('ready_to_contact','contacted') then 'contact'
      when sp.recruitment_stage in ('replied','call_booked') then 'relationship'
      when sp.recruitment_stage='interested' then 'evaluation'
      when sp.recruitment_stage='terms_discussed' then 'representation_discussion'
      when sp.recruitment_stage in ('agreement_sent','negotiating') then 'offer'
      when sp.recruitment_stage='signed' then 'represented'
      when sp.recruitment_stage='paused' then 'paused'
      when sp.recruitment_stage='declined' then 'declined'
      when sp.recruitment_stage='lost' then 'lost'
      else 'identified'
    end as ui_stage,
    li.channel as last_interaction_channel,
    li.direction as last_interaction_direction,
    li.summary as last_interaction_summary,
    li.occurred_at as last_interaction_at,
    (
      sp.recruitment_stage not in ('signed','paused','declined','lost')
      and sp.next_action_at is not null
      and sp.next_action_at<now()
    ) as follow_up_overdue
  from djm_os.scouting_prospects sp
  left join lateral (
    select ri.channel,ri.direction,ri.summary,ri.occurred_at
    from djm_os.recruitment_interactions ri
    where ri.tenant_id=p_tenant_id and ri.prospect_id=sp.id
    order by ri.occurred_at desc
    limit 1
  ) li on true
  where sp.tenant_id=p_tenant_id and sp.archived_at is null and sp.linked_player_id is null
  order by follow_up_overdue desc,sp.next_action_at nulls last,sp.recruitment_priority desc,sp.updated_at desc
  limit greatest(1,least(coalesce(p_limit,250),500))
)
select jsonb_build_object(
  'available',true,
  'tenant_id',p_tenant_id,
  'generated_at',now(),
  'items',coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'full_name',i.full_name,
    'date_of_birth',i.date_of_birth,
    'nationality',i.nationality,
    'current_club',i.current_club,
    'current_country',i.current_country,
    'primary_position',i.primary_position,
    'preferred_foot',i.preferred_foot,
    'contract_expiry',i.contract_expiry,
    'transfermarkt_url',i.transfermarkt_url,
    'wyscout_url',i.wyscout_url,
    'instagram_url',i.instagram_url,
    'agent_status',i.agent_status,
    'agent_name',i.agent_name,
    'availability_status',i.availability_status,
    'raw_stage',i.recruitment_stage,
    'ui_stage',i.ui_stage,
    'recruitment_priority',i.recruitment_priority,
    'first_contact_at',i.first_contact_at,
    'last_contact_at',i.last_contact_at,
    'last_reply_at',i.last_reply_at,
    'next_action_at',i.next_action_at,
    'follow_up_overdue',i.follow_up_overdue,
    'last_interaction',case when i.last_interaction_at is null then null else jsonb_build_object(
      'channel',i.last_interaction_channel,
      'direction',i.last_interaction_direction,
      'summary',i.last_interaction_summary,
      'occurred_at',i.last_interaction_at
    ) end
  ) order by i.follow_up_overdue desc,i.next_action_at nulls last,i.recruitment_priority desc,i.updated_at desc),'[]'::jsonb)
)
from items i;
$function$;

create or replace function public.platform_server_recruitment_target(
  p_tenant_id uuid,
  p_prospect_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_target jsonb;
  v_interactions jsonb;
begin
  select jsonb_build_object(
    'id',sp.id,
    'full_name',sp.full_name,
    'date_of_birth',sp.date_of_birth,
    'nationality',sp.nationality,
    'current_club',sp.current_club,
    'current_country',sp.current_country,
    'current_league',sp.current_league,
    'primary_position',sp.primary_position,
    'secondary_positions',coalesce(to_jsonb(sp.secondary_positions),'[]'::jsonb),
    'preferred_foot',sp.preferred_foot,
    'contract_expiry',sp.contract_expiry,
    'transfermarkt_url',sp.transfermarkt_url,
    'wyscout_url',sp.wyscout_url,
    'instagram_url',sp.instagram_url,
    'agent_status',sp.agent_status,
    'agent_name',sp.agent_name,
    'availability_status',sp.availability_status,
    'raw_stage',sp.recruitment_stage,
    'ui_stage',case
      when sp.recruitment_stage in ('identified','researching') then 'identified'
      when sp.recruitment_stage in ('ready_to_contact','contacted') then 'contact'
      when sp.recruitment_stage in ('replied','call_booked') then 'relationship'
      when sp.recruitment_stage='interested' then 'evaluation'
      when sp.recruitment_stage='terms_discussed' then 'representation_discussion'
      when sp.recruitment_stage in ('agreement_sent','negotiating') then 'offer'
      when sp.recruitment_stage='signed' then 'represented'
      else sp.recruitment_stage
    end,
    'recruitment_priority',sp.recruitment_priority,
    'first_contact_at',sp.first_contact_at,
    'last_contact_at',sp.last_contact_at,
    'last_reply_at',sp.last_reply_at,
    'next_action_at',sp.next_action_at
  )
  into v_target
  from djm_os.scouting_prospects sp
  where sp.id=p_prospect_id and sp.tenant_id=p_tenant_id and sp.archived_at is null and sp.linked_player_id is null;

  if v_target is null then
    raise exception 'recruitment_target_not_found_for_tenant';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,
    'channel',x.channel,
    'direction',x.direction,
    'summary',x.summary,
    'occurred_at',x.occurred_at
  ) order by x.occurred_at desc),'[]'::jsonb)
  into v_interactions
  from (
    select ri.*
    from djm_os.recruitment_interactions ri
    where ri.tenant_id=p_tenant_id and ri.prospect_id=p_prospect_id
    order by ri.occurred_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'available',true,
    'target',v_target,
    'interactions',v_interactions
  );
end;
$function$;

create or replace function public.platform_server_club_accounts(p_tenant_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
  v_items jsonb;
  v_total integer:=0;
  v_commercial integer:=0;
  v_demand integer:=0;
  v_underconnected integer:=0;
  v_intro integer:=0;
  v_strong_direct integer:=0;
  v_exposure jsonb;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  with relevant_orgs as (
    select distinct d.organisation_id as organisation_id
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active' and d.organisation_id is not null
    union
    select distinct n.organisation_id
    from djm_os.club_needs n
    where n.tenant_id=p_tenant_id and n.archived_at is null and n.status='active' and n.organisation_id is not null
    union
    select distinct e.organisation_id
    from djm_os.employments e
    join djm_os.relationships r on r.person_id=e.person_id and r.tenant_id=e.tenant_id
    where e.tenant_id=p_tenant_id and e.is_current=true and e.organisation_id is not null
    union
    select distinct i.organisation_id
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id and i.organisation_id is not null and i.occurred_at>=now()-interval '180 days'
  ), orgs as (
    select o.* from djm_os.organisations o join relevant_orgs r on r.organisation_id=o.id where o.tenant_id=p_tenant_id and o.archived_at is null
  ), deal_agg as (
    select d.organisation_id,count(*)::integer as active_deals,
           max(coalesce(d.probability,d.manual_probability,d.model_probability,0))::integer as highest_probability,
           count(*) filter(where d.next_action_at is null or d.next_action_at<now())::integer as deals_needing_action,
           jsonb_agg(jsonb_build_object('deal_room_id',d.id,'title',d.title,'stage',d.stage,'probability',coalesce(d.probability,d.manual_probability,d.model_probability,0),'expected_commission',d.expected_commission,'currency',d.currency,'primary_blocker',d.primary_blocker,'next_action_at',d.next_action_at) order by d.expected_commission desc nulls last) as deals
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active' and d.organisation_id is not null
    group by d.organisation_id
  ), deal_currency as (
    select organisation_id,jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',round(weighted_commission,2)) order by currency) as by_currency
    from (
      select d.organisation_id,coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,count(*)::integer as active_deals,
             coalesce(sum(d.expected_commission),0) as expected_commission,
             coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0) as weighted_commission
      from djm_os.deal_rooms d
      where d.tenant_id=p_tenant_id and d.status='active' and d.organisation_id is not null
      group by d.organisation_id,coalesce(nullif(trim(d.currency),''),'UNKNOWN')
    ) x group by organisation_id
  ), need_agg as (
    select n.organisation_id,count(*)::integer as active_needs,count(*) filter(where n.need_type='confirmed')::integer as confirmed_needs,
           max(coalesce(n.priority,0))::integer as highest_need_priority,
           min(n.expires_at) filter(where n.expires_at is not null) as earliest_expiry
    from djm_os.club_needs n
    where n.tenant_id=p_tenant_id and n.archived_at is null and n.status='active' and n.organisation_id is not null
    group by n.organisation_id
  ), activity as (
    select i.organisation_id,count(*) filter(where i.occurred_at>=now()-interval '30 days')::integer as interactions_30d,
           count(*) filter(where i.occurred_at>=now()-interval '180 days')::integer as interactions_180d,
           max(i.occurred_at) as last_interaction_at
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id and i.organisation_id is not null
    group by i.organisation_id
  ), playbook as (
    select public.platform_server_agency_playbook(p_tenant_id,20)->'plays' as plays
  ), plays as (
    select x.value as play,
           coalesce(
             x.value->'evidence'->>'organisation_id',
             x.value->'evidence'->'pursuit'->'club'->>'organisation_id',
             x.value->'evidence'->'access'->'organisation'->>'organisation_id'
           )::uuid as organisation_id
    from playbook p cross join lateral jsonb_array_elements(coalesce(p.plays,'[]'::jsonb)) x
    where coalesce(
      x.value->'evidence'->>'organisation_id',
      x.value->'evidence'->'pursuit'->'club'->>'organisation_id',
      x.value->'evidence'->'access'->'organisation'->>'organisation_id'
    ) is not null
  ), top_play as (
    select distinct on (organisation_id) organisation_id,play
    from plays
    order by organisation_id,(play->>'play_score')::integer desc,(play->>'rank')::integer
  ), pursuit_board as (
    select public.platform_server_pursuit_board(p_tenant_id,50)->'items' as items
  ), pursuit_agg as (
    select (x.value->'club'->>'organisation_id')::uuid as organisation_id,
           count(*)::integer as pursuit_count,
           max((x.value->>'readiness_score')::integer) as best_pursuit_score,
           count(*) filter(where x.value->>'pursuit_operating_mode'='use_warm_introduction_then_review')::integer as pursuits_with_warm_intro
    from pursuit_board p cross join lateral jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) x
    group by (x.value->'club'->>'organisation_id')::uuid
  ), account_rows as (
    select o.id,o.name,o.country,o.city,o.league_name,
           coalesce(da.active_deals,0) as active_deals,
           coalesce(da.highest_probability,0) as highest_probability,
           coalesce(da.deals_needing_action,0) as deals_needing_action,
           coalesce(dc.by_currency,'[]'::jsonb) as commercial_by_currency,
           coalesce(na.active_needs,0) as active_needs,
           coalesce(na.confirmed_needs,0) as confirmed_needs,
           coalesce(na.highest_need_priority,0) as highest_need_priority,
           na.earliest_expiry,
           coalesce(ac.interactions_30d,0) as interactions_30d,
           coalesce(ac.interactions_180d,0) as interactions_180d,
           ac.last_interaction_at,
           coalesce(pa.pursuit_count,0) as pursuit_count,
           pa.best_pursuit_score,
           coalesce(pa.pursuits_with_warm_intro,0) as pursuits_with_warm_intro,
           tp.play as top_play,
           direct.access as direct,
           intro.access as intro
    from orgs o
    left join deal_agg da on da.organisation_id=o.id
    left join deal_currency dc on dc.organisation_id=o.id
    left join need_agg na on na.organisation_id=o.id
    left join activity ac on ac.organisation_id=o.id
    left join pursuit_agg pa on pa.organisation_id=o.id
    left join top_play tp on tp.organisation_id=o.id
    cross join lateral (select public.platform_server_access_routes(p_tenant_id,o.id,3) as access) direct
    cross join lateral (select public.platform_server_introduction_routes(p_tenant_id,o.id,3) as access) intro
  ), scored as (
    select *,
      coalesce((top_play->>'play_score')::integer,
        least(100,
          case when active_deals>0 then 65 else 0 end +
          case when confirmed_needs>0 then 15 when active_needs>0 then 8 else 0 end +
          case when coalesce((direct->'best_route'->>'route_score')::integer,0)>=75 then 10 when coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 8 else 0 end +
          case when interactions_30d>0 then 5 else 0 end
        )) as account_priority_score,
      coalesce((direct->'best_route'->>'route_score')::integer,0) as direct_score,
      coalesce((intro->'best_route'->>'introduction_score')::integer,0) as intro_score,
      case
        when active_deals>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)>=75 then 'commercially_active_well_connected'
        when active_deals>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)<60 and coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 'commercially_active_warm_introduction_available'
        when active_deals>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)<60 then 'commercially_active_underconnected'
        when confirmed_needs>0 and coalesce((direct->'best_route'->>'route_score')::integer,0)>=60 then 'live_demand_connected'
        when confirmed_needs>0 and coalesce((intro->'best_route'->>'introduction_score')::integer,0)>=80 then 'live_demand_warm_introduction_available'
        when confirmed_needs>0 then 'live_demand_access_gap'
        when coalesce((direct->'best_route'->>'route_score')::integer,0)>=75 then 'relationship_strong_no_live_business'
        else 'relationship_development' end as account_state
    from account_rows
  ), ranked as (
    select *,row_number() over(order by account_priority_score desc,active_deals desc,confirmed_needs desc,name) as account_rank
    from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',account_rank,
    'organisation_id',id,'name',name,'country',country,'city',city,'league_name',league_name,
    'account_state',account_state,'account_priority_score',account_priority_score,
    'commercial',jsonb_build_object('active_deals',active_deals,'deals_needing_action',deals_needing_action,'highest_probability',highest_probability,'by_currency',commercial_by_currency),
    'demand',jsonb_build_object('active_needs',active_needs,'confirmed_needs',confirmed_needs,'highest_need_priority',highest_need_priority,'earliest_expiry',earliest_expiry),
    'pursuits',jsonb_build_object('count',pursuit_count,'best_readiness_score',best_pursuit_score,'warm_introduction_available_count',pursuits_with_warm_intro),
    'access',jsonb_build_object(
      'direct_score',direct_score,'direct_state',direct->'best_route'->>'route_state','best_direct_contact',direct->'best_route'->>'person_name','best_direct_role',direct->'best_route'->>'role_title',
      'introduction_score',intro_score,'introduction_state',intro->'best_route'->>'introduction_state','introduction_via',intro->'best_route'->'intermediary'->>'name','introduction_target',intro->'best_route'->'target_contact'->>'name'
    ),
    'activity',jsonb_build_object('interactions_30d',interactions_30d,'interactions_180d',interactions_180d,'last_interaction_at',last_interaction_at),
    'top_play',case when top_play is null then null else jsonb_build_object('play_id',top_play->>'play_id','play_type',top_play->>'play_type','play_score',(top_play->>'play_score')::integer,'title',top_play->>'title','recommended_action',top_play->>'recommended_action','access_route_mode',top_play->>'access_route_mode','evidence_gate',top_play->>'evidence_gate') end
  ) order by account_rank) filter(where account_rank<=v_limit),'[]'::jsonb),
  count(*)::integer,
  count(*) filter(where active_deals>0)::integer,
  count(*) filter(where confirmed_needs>0)::integer,
  count(*) filter(where account_state in ('commercially_active_underconnected','live_demand_access_gap'))::integer,
  count(*) filter(where account_state in ('commercially_active_warm_introduction_available','live_demand_warm_introduction_available'))::integer,
  count(*) filter(where direct_score>=75)::integer
  into v_items,v_total,v_commercial,v_demand,v_underconnected,v_intro,v_strong_direct
  from ranked;

  with g as (
    select coalesce(nullif(trim(d.currency),''),'UNKNOWN') as currency,count(*)::integer as active_deals,
           coalesce(sum(d.expected_commission),0) as expected_commission,
           coalesce(sum(d.expected_commission*coalesce(d.probability,d.manual_probability,d.model_probability,0)/100.0),0) as weighted_commission
    from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active'
    group by coalesce(nullif(trim(d.currency),''),'UNKNOWN')
  )
  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',round(weighted_commission,2)) order by currency),'[]'::jsonb)
  into v_exposure from g;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'clubs',v_items,
    'summary',jsonb_build_object(
      'relevant_clubs',v_total,'visible_clubs',jsonb_array_length(v_items),'hidden_by_limit',greatest(v_total-jsonb_array_length(v_items),0),
      'clubs_with_active_deals',v_commercial,'clubs_with_confirmed_demand',v_demand,
      'underconnected_live_accounts',v_underconnected,'live_accounts_with_strong_introduction_option',v_intro,
      'clubs_with_strong_direct_access',v_strong_direct,'commercial_exposure_by_currency',v_exposure
    ),
    'principle','Rank club accounts by recorded live business, demand and strategic plays. Direct access and introduction access remain separate.'
  );
end;
$$;

create or replace function public.platform_server_relationship_contacts(
  p_tenant_id uuid,
  p_limit integer default 250,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer :=
    greatest(1, least(coalesce(p_limit, 250), 500));

  v_search text :=
    nullif(lower(trim(coalesce(p_search, ''))), '');

  v_items jsonb;
  v_total integer := 0;
  v_live_business integer := 0;
  v_confirmed_demand integer := 0;
  v_strong_direct integer := 0;
  v_follow_up integer := 0;
begin
  if not exists (
    select 1
    from platform.tenants t
    where t.id = p_tenant_id
      and t.status = 'active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  with current_employment_ranked as (
    select
      e.person_id,
      e.organisation_id,
      e.role_title,
      e.department,
      e.started_on,
      e.last_verified_at,
      row_number() over (
        partition by e.person_id
        order by
          e.started_on desc nulls last,
          e.updated_at desc,
          e.id
      ) as rn
    from djm_os.employments e
    where e.tenant_id = p_tenant_id
      and e.is_current = true
  ),
  current_employment as (
    select
      person_id,
      organisation_id,
      role_title,
      department,
      started_on,
      last_verified_at
    from current_employment_ranked
    where rn = 1
  ),
  interaction_facts as (
    select
      i.person_id,
      max(i.occurred_at) as last_interaction_at,
      count(*) filter (
        where i.occurred_at >= now() - interval '30 days'
      )::integer as interactions_30d,
      count(*) filter (
        where i.occurred_at >= now() - interval '180 days'
      )::integer as interactions_180d
    from djm_os.interactions i
    where i.tenant_id = p_tenant_id
      and i.person_id is not null
    group by i.person_id
  ),
  relationship_candidates as (
    select
      r.person_id,
      r.team_member_id,
      tm.display_name as relationship_owner_name,
      coalesce(r.strength_score, 0)::integer as strength_score,
      coalesce(r.access_score, 0)::integer as access_score,
      coalesce(r.trust_score, 0)::integer as trust_score,
      greatest(
        r.last_meaningful_at,
        ix.last_interaction_at
      ) as last_meaningful_at,
      round(
        coalesce(r.strength_score, 0)::numeric * 0.30 +
        coalesce(r.access_score, 0)::numeric * 0.25 +
        coalesce(r.trust_score, 0)::numeric * 0.20 +
        platform.access_recency_score(
          greatest(
            r.last_meaningful_at,
            ix.last_interaction_at
          )
        )::numeric * 0.15 +
        platform.access_role_relevance(
          ce.role_title
        )::numeric * 0.10
      )::integer as route_score,
      row_number() over (
        partition by r.person_id
        order by
          round(
            coalesce(r.strength_score, 0)::numeric * 0.30 +
            coalesce(r.access_score, 0)::numeric * 0.25 +
            coalesce(r.trust_score, 0)::numeric * 0.20 +
            platform.access_recency_score(
              greatest(
                r.last_meaningful_at,
                ix.last_interaction_at
              )
            )::numeric * 0.15 +
            platform.access_role_relevance(
              ce.role_title
            )::numeric * 0.10
          ) desc,
          greatest(
            r.last_meaningful_at,
            ix.last_interaction_at
          ) desc nulls last,
          r.updated_at desc
      ) as rn
    from djm_os.relationships r
    join platform.tenant_memberships membership
      on membership.tenant_id = p_tenant_id
     and membership.user_id = r.team_member_id
     and membership.status = 'active'
     and membership.role in (
       'owner',
       'admin',
       'agent',
       'scout',
       'operations'
     )
    left join djm_os.team_members tm
      on tm.user_id = r.team_member_id
    left join current_employment ce
      on ce.person_id = r.person_id
    left join interaction_facts ix
      on ix.person_id = r.person_id
    where r.tenant_id = p_tenant_id
  ),
  best_relationship as (
    select
      person_id,
      team_member_id,
      relationship_owner_name,
      strength_score,
      access_score,
      trust_score,
      last_meaningful_at,
      route_score
    from relationship_candidates
    where rn = 1
  ),
  need_facts as (
    select
      n.organisation_id,
      count(*) filter (
        where n.status in ('active', 'open', 'confirmed')
      )::integer as active_needs,
      count(*) filter (
        where n.status in ('active', 'open', 'confirmed')
          and (
            n.need_type = 'confirmed'
            or n.status = 'confirmed'
          )
      )::integer as confirmed_needs,
      min(n.expires_at) filter (
        where n.status in ('active', 'open', 'confirmed')
          and n.expires_at is not null
      ) as earliest_expiry
    from djm_os.club_needs n
    where n.tenant_id = p_tenant_id
      and n.archived_at is null
      and n.organisation_id is not null
    group by n.organisation_id
  ),
  deal_facts as (
    select
      d.organisation_id,
      count(*) filter (
        where d.status = 'active'
      )::integer as active_deals,
      count(*) filter (
        where d.status = 'active'
          and (
            d.next_action_at is null
            or d.next_action_at < now()
          )
      )::integer as deals_needing_action
    from djm_os.deal_rooms d
    where d.tenant_id = p_tenant_id
      and d.organisation_id is not null
    group by d.organisation_id
  ),
  task_facts as (
    select
      t.person_id,
      count(*) filter (
        where t.status not in (
          'done',
          'completed',
          'cancelled'
        )
      )::integer as open_tasks,
      count(*) filter (
        where t.status not in (
          'done',
          'completed',
          'cancelled'
        )
          and t.due_at is not null
          and t.due_at < now()
      )::integer as overdue_tasks,
      min(t.due_at) filter (
        where t.status not in (
          'done',
          'completed',
          'cancelled'
        )
          and t.due_at is not null
      ) as next_task_due
    from djm_os.tasks t
    where t.tenant_id = p_tenant_id
      and t.person_id is not null
    group by t.person_id
  ),
  contact_rows as (
    select
      p.id as person_id,
      p.full_name,
      p.preferred_name,
      p.person_type,
      p.country as person_country,
      p.city as person_city,
      p.photo_url,
      p.linkedin_url,

      ce.role_title,
      ce.department,

      o.id as organisation_id,
      o.name as organisation_name,
      o.country as organisation_country,
      o.city as organisation_city,
      o.league_name,

      br.team_member_id as relationship_owner_user_id,
      br.relationship_owner_name,
      coalesce(br.strength_score, 0) as strength_score,
      coalesce(br.access_score, 0) as access_score,
      coalesce(br.trust_score, 0) as trust_score,
      coalesce(br.route_score, 0) as route_score,
      br.last_meaningful_at,

      ix.last_interaction_at,
      coalesce(ix.interactions_30d, 0) as interactions_30d,
      coalesce(ix.interactions_180d, 0) as interactions_180d,

      coalesce(nf.active_needs, 0) as active_needs,
      coalesce(nf.confirmed_needs, 0) as confirmed_needs,
      nf.earliest_expiry,

      coalesce(df.active_deals, 0) as active_deals,
      coalesce(
        df.deals_needing_action,
        0
      ) as deals_needing_action,

      coalesce(tf.open_tasks, 0) as open_tasks,
      coalesce(tf.overdue_tasks, 0) as overdue_tasks,
      tf.next_task_due,

      whatsapp.value as whatsapp,
      email.value as email,

      case
        when coalesce(df.active_deals, 0) > 0
          and coalesce(tf.open_tasks, 0) > 0
          then 'protect_live_business'
        when coalesce(df.active_deals, 0) > 0
          then 'live_business'
        when coalesce(nf.confirmed_needs, 0) > 0
          then 'confirmed_demand'
        when coalesce(nf.active_needs, 0) > 0
          then 'live_demand'
        when coalesce(br.route_score, 0) >= 75
          then 'strong_relationship'
        when ix.last_interaction_at >=
          now() - interval '90 days'
          then 'active_relationship'
        else 'relationship_development'
      end as operating_state
    from djm_os.people p
    join current_employment ce
      on ce.person_id = p.id
    join djm_os.organisations o
      on o.id = ce.organisation_id
     and o.tenant_id = p_tenant_id
    left join best_relationship br
      on br.person_id = p.id
    left join interaction_facts ix
      on ix.person_id = p.id
    left join need_facts nf
      on nf.organisation_id = o.id
    left join deal_facts df
      on df.organisation_id = o.id
    left join task_facts tf
      on tf.person_id = p.id
    left join lateral (
      select cm.value
      from djm_os.contact_methods cm
      where cm.tenant_id = p_tenant_id
        and cm.person_id = p.id
        and cm.channel = 'whatsapp'
      order by
        cm.is_primary desc,
        cm.is_verified desc nulls last,
        cm.updated_at desc
      limit 1
    ) whatsapp on true
    left join lateral (
      select cm.value
      from djm_os.contact_methods cm
      where cm.tenant_id = p_tenant_id
        and cm.person_id = p.id
        and cm.channel = 'email'
      order by
        cm.is_primary desc,
        cm.is_verified desc nulls last,
        cm.updated_at desc
      limit 1
    ) email on true
    where p.tenant_id = p_tenant_id
      and p.archived_at is null
      and (
        o.organisation_type = 'club'
        or p.person_type = 'club_contact'
      )
      and (
        v_search is null
        or lower(
          concat_ws(
            ' ',
            p.full_name,
            p.preferred_name,
            ce.role_title,
            ce.department,
            o.name,
            o.country,
            o.city,
            p.country,
            p.city
          )
        ) like '%' || v_search || '%'
      )
  ),
  ranked as (
    select
      contact_rows.*,
      row_number() over (
        order by
          case operating_state
            when 'protect_live_business' then 1
            when 'live_business' then 2
            when 'confirmed_demand' then 3
            when 'live_demand' then 4
            when 'strong_relationship' then 5
            when 'active_relationship' then 6
            else 7
          end,
          overdue_tasks desc,
          active_deals desc,
          confirmed_needs desc,
          route_score desc,
          last_interaction_at desc nulls last,
          full_name
      ) as contact_rank
    from contact_rows
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank',
          contact_rank,

          'person_id',
          person_id,

          'person',
          jsonb_build_object(
            'full_name',
            full_name,
            'preferred_name',
            preferred_name,
            'person_type',
            person_type,
            'country',
            person_country,
            'city',
            person_city,
            'photo_url',
            photo_url,
            'linkedin_url',
            linkedin_url
          ),

          'employment',
          jsonb_build_object(
            'organisation_id',
            organisation_id,
            'organisation_name',
            organisation_name,
            'role_title',
            role_title,
            'department',
            department,
            'organisation_country',
            organisation_country,
            'organisation_city',
            organisation_city,
            'league_name',
            league_name
          ),

          'contact',
          jsonb_build_object(
            'whatsapp',
            whatsapp,
            'email',
            email
          ),

          'relationship',
          jsonb_build_object(
            'owner_user_id',
            relationship_owner_user_id,
            'owner_name',
            relationship_owner_name,
            'strength_score',
            strength_score,
            'access_score',
            access_score,
            'trust_score',
            trust_score,
            'route_score',
            route_score,
            'route_state',
            case
              when relationship_owner_user_id is null
                then 'not_recorded'
              when route_score >= 75
                then 'warm'
              when route_score >= 60
                then 'usable'
              when route_score >= 45
                then 'developing'
              else 'cold'
            end,
            'last_meaningful_at',
            last_meaningful_at
          ),

          'activity',
          jsonb_build_object(
            'last_interaction_at',
            last_interaction_at,
            'interactions_30d',
            interactions_30d,
            'interactions_180d',
            interactions_180d
          ),

          'club_context',
          jsonb_build_object(
            'active_deals',
            active_deals,
            'deals_needing_action',
            deals_needing_action,
            'active_needs',
            active_needs,
            'confirmed_needs',
            confirmed_needs,
            'earliest_need_expiry',
            earliest_expiry
          ),

          'work',
          jsonb_build_object(
            'open_tasks',
            open_tasks,
            'overdue_tasks',
            overdue_tasks,
            'next_task_due',
            next_task_due
          ),

          'operating_state',
          operating_state
        )
        order by contact_rank
      ) filter (
        where contact_rank <= v_limit
      ),
      '[]'::jsonb
    ),

    count(*)::integer,

    count(*) filter (
      where active_deals > 0
    )::integer,

    count(*) filter (
      where confirmed_needs > 0
    )::integer,

    count(*) filter (
      where route_score >= 75
    )::integer,

    count(*) filter (
      where open_tasks > 0
    )::integer
  into
    v_items,
    v_total,
    v_live_business,
    v_confirmed_demand,
    v_strong_direct,
    v_follow_up
  from ranked;

  return jsonb_build_object(
    'available',
    true,

    'tenant_id',
    p_tenant_id,

    'generated_at',
    now(),

    'summary',
    jsonb_build_object(
      'club_contacts',
      v_total,

      'visible_contacts',
      jsonb_array_length(v_items),

      'hidden_by_limit',
      greatest(
        v_total - jsonb_array_length(v_items),
        0
      ),

      'contacts_at_live_business_clubs',
      v_live_business,

      'contacts_at_confirmed_demand_clubs',
      v_confirmed_demand,

      'strong_recorded_direct_relationships',
      v_strong_direct,

      'contacts_with_open_follow_up',
      v_follow_up
    ),

    'contacts',
    v_items,

    'truth_contract',
    jsonb_build_object(
      'relationship',
      'Relationship scores describe recorded agency evidence. They are not predictions of influence, response or deal success.',

      'activity',
      'Interaction recency reflects activity recorded in the agency. Offline conversations that were not captured remain invisible.',

      'club_context',
      'Live deals and club needs explain current commercial relevance. They do not imply that every contact at the club is involved in that business.',

      'ownership',
      'Relationship ownership identifies the strongest recorded agency route to the contact. It does not assign exclusive ownership of the person.'
    )
  );
end;
$function$;

notify pgrst,'reload schema';
create or replace function public.redream_entity_archives()
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
end $$;

create or replace function public.redream_entity_archive(p_entity_type text,p_entity_id uuid,p_archived boolean default true)
returns jsonb language sql security definer set search_path='' as $$
  select public.djm_entity_archive_v1(p_entity_type,p_entity_id,p_archived);
$$;

create or replace function public.redream_entity_patch(p_entity_type text,p_entity_id uuid,p_patch jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select public.djm_entity_patch_v1(p_entity_type,p_entity_id,p_patch);
$$;

create or replace function public.redream_entity_action_preview(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
end $$;

create or replace function public.redream_entity_delete(p_entity_type text,p_entity_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_tenant is null or v_user is null or not private.user_is_tenant_admin(v_tenant,v_user) then raise exception 'Only a workspace owner or admin can permanently delete records'; end if;
  return public.djm_delete_entity(p_entity_type,p_entity_id,p_confirm);
end $$;

revoke all on function public.redream_entity_archives() from public,anon;
revoke all on function public.redream_entity_archive(text,uuid,boolean) from public,anon;
revoke all on function public.redream_entity_patch(text,uuid,jsonb) from public,anon;
revoke all on function public.redream_entity_action_preview(text,uuid) from public,anon;
revoke all on function public.redream_entity_delete(text,uuid,boolean) from public,anon;
grant execute on function public.redream_entity_archives() to authenticated,service_role;
grant execute on function public.redream_entity_archive(text,uuid,boolean) to authenticated,service_role;
grant execute on function public.redream_entity_patch(text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.redream_entity_action_preview(text,uuid) to authenticated,service_role;
grant execute on function public.redream_entity_delete(text,uuid,boolean) to authenticated,service_role;

commit;
