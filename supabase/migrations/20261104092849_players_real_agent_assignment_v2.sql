-- Read existing accountable agent names through tenant-guarded projections.

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
          'agency_status',v_player.agency_status,
          'primary_agent',(select jsonb_build_object('user_id',v_player.primary_staff_user_id,'name',coalesce(nullif(trim(pr.display_name),''),'Team member')) from public.profiles pr where pr.id=v_player.primary_staff_user_id),
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
      'agency_status',v_player.agency_status,
          'primary_agent',(select jsonb_build_object('user_id',v_player.primary_staff_user_id,'name',coalesce(nullif(trim(pr.display_name),''),'Team member')) from public.profiles pr where pr.id=v_player.primary_staff_user_id),
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

create or replace function public.platform_server_players_workspace_page(
  p_tenant_id uuid,
  p_user_id uuid,
  p_offset integer default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,100),100));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_total integer;
  v_admin boolean;
  v_item jsonb;
  v_player public.players%rowtype;
  v_service jsonb;
  v_representation jsonb;
  v_profile jsonb;
  v_active_opportunities integer;
  v_items jsonb := '[]'::jsonb;
begin
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'staff_tenant_access_required' using errcode='42501';
  end if;
  v_admin := private.user_is_tenant_admin(p_tenant_id,p_user_id);
  select count(*)::integer into v_total from public.players p
    where p.tenant_id=p_tenant_id and p.archived_at is null
      and coalesce(p.football_status,'active')<>'retired'
      and (v_admin or exists(select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=p_user_id));
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
      and (v_admin or exists(select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=p_user_id))
    order by
      case p.agency_priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      p.next_action_due nulls first,
      p.updated_at desc,
      p.id
    offset v_offset limit v_limit
  loop
    if v_admin then
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

    else
      v_service := '{}'::jsonb;
      v_representation := '{}'::jsonb;
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

    if v_admin then
    select count(*)::integer
    into v_active_opportunities
    from public.player_opportunities po
    where po.tenant_id=p_tenant_id
      and po.player_id=v_player.id
      and po.stage not in ('won','lost','paused');

    else
      v_active_opportunities := null;
    end if;

    v_item := jsonb_build_object(
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
          'agency_status',v_player.agency_status,
          'primary_agent',case when v_admin then (select jsonb_build_object('user_id',v_player.primary_staff_user_id,'name',coalesce(nullif(trim(pr.display_name),''),'Team member')) from public.profiles pr where pr.id=v_player.primary_staff_user_id) else null end,
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
      );
    if not v_admin then
      v_item := (v_item - 'service' - 'representation' - 'active_opportunities')
        || jsonb_build_object(
          'identity',(v_item->'identity') - array['primary_agent','contract_status','contract_expiry','transfermarkt_market_value','transfermarkt_market_value_currency','agency_priority','next_action','next_action_due'],
          'access',jsonb_build_object('scope','assigned','restricted',true)
        );
    end if;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  return jsonb_build_object(
    'available',true,
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'items',v_items,
    'total',v_total,
    'access',jsonb_build_object('scope',case when v_admin then 'agency' else 'assigned' end),
    'next_offset',v_offset+jsonb_array_length(v_items),
    'has_more',v_offset+jsonb_array_length(v_items)<v_total,
    'truth_contract',jsonb_build_object(
      'contact','No last-player-contact claim is made because the current communication ledger is not yet reliable for that purpose.',
      'representation','Representation status reflects records stored in the platform and is not a legal-validity conclusion.',
      'market','Opportunity and market activity reflect recorded agency work only.'
    )
  );
end;
$function$;

-- The primary agent is accountable for this player. Assignment is not the same
-- as staff tags, which only control notifications. Only agency admins can edit.
-- New leads receive existing restricted player access; former access is not
-- silently revoked because it may be needed for ongoing deals and handovers.
create or replace function public.redream_player_lead_agent_v1(
  p_player_id uuid,
  p_new_agent_id uuid default null,
  p_save boolean default false,
  p_expected_agent_id uuid default null,
  p_tenant_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_tenant uuid:=private.calendar_staff_tenant(p_tenant_id);
  v_previous uuid;
  v_result jsonb;
  v_current jsonb;
  v_staff jsonb;
begin
  if auth.uid() is null or not private.user_is_tenant_admin(v_tenant,auth.uid()) then
    raise exception 'Agency administrator access required' using errcode='42501';
  end if;
  select p.primary_staff_user_id into v_previous
  from public.players p
  where p.id=p_player_id and p.tenant_id=v_tenant and p.archived_at is null
  for update;
  if not found then
    raise exception 'Player not found in this agency' using errcode='42501';
  end if;
  if p_save then
    if v_previous is distinct from p_expected_agent_id then
      raise exception 'Player lead changed. Reload before saving again' using errcode='40001';
    end if;
    if p_new_agent_id is not null and not exists(
      select 1 from platform.tenant_memberships m
      where m.tenant_id=v_tenant and m.user_id=p_new_agent_id
        and m.status='active' and m.role in ('owner','admin','agent','operations','scout')
    ) then
      raise exception 'Select an active agency team member' using errcode='22023';
    end if;
    if p_new_agent_id is distinct from v_previous then
      v_result:=public.djm_assign_player(p_player_id,p_new_agent_id);
      if v_result->>'player_id' is distinct from p_player_id::text
         or v_result->>'assigned_to_user_id' is distinct from p_new_agent_id::text then
        raise exception 'Player assignment could not be confirmed';
      end if;
      if p_new_agent_id is not null then
        insert into public.staff_player_access(staff_user_id,player_id,can_edit)
        values(p_new_agent_id,p_player_id,false)
        on conflict (staff_user_id,player_id) do nothing;
      end if;
    end if;
  end if;
  select jsonb_build_object(
    'user_id',p.primary_staff_user_id,
    'name',coalesce(nullif(trim(pr.display_name),''),'Team member')
  ) into v_current
  from public.players p left join public.profiles pr on pr.id=p.primary_staff_user_id
  where p.id=p_player_id and p.tenant_id=v_tenant and p.archived_at is null;
  if v_current->>'user_id' is null then v_current:=null;end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,
    'display_name',coalesce(nullif(trim(pr.display_name),''),'Team member')
  ) order by pr.display_name,m.user_id),'[]'::jsonb)
  into v_staff
  from platform.tenant_memberships m
  left join public.profiles pr on pr.id=m.user_id
  where m.tenant_id=v_tenant and m.status='active'
    and m.role in ('owner','admin','agent','operations','scout');
  return jsonb_build_object(
    'player_id',p_player_id,
    'primary_agent',v_current,
    'members',v_staff,
    'can_edit',true,
    'saved',p_save,
    'access_note','Assigning a new lead grants that teammate restricted player access. Previous teammate access is preserved.'
  );
end;
$function$;

revoke all on function public.redream_player_lead_agent_v1(uuid,uuid,boolean,uuid,uuid) from public,anon,authenticated;
grant execute on function public.redream_player_lead_agent_v1(uuid,uuid,boolean,uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
