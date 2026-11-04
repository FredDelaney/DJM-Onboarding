-- Explicit multi-agent teams are distinct from a player's single accountable
-- lead, notification tags, and independently granted record permissions.
create table if not exists platform.player_agent_teams (
 tenant_id uuid not null references platform.tenants(id) on delete cascade,
 player_id uuid primary key references public.players(id) on delete cascade,
 user_ids uuid[] not null default '{}'::uuid[],
 revision integer not null default 1 check (revision>0),
 updated_by uuid,
 updated_at timestamptz not null default now(),
 check (cardinality(user_ids)<=25)
);
alter table platform.player_agent_teams enable row level security;
revoke all on platform.player_agent_teams from public,anon,authenticated;
drop policy if exists player_agent_teams_no_direct_access on platform.player_agent_teams;
create policy player_agent_teams_no_direct_access on platform.player_agent_teams
 for all to authenticated using(false) with check(false);
create index if not exists player_agent_teams_tenant on platform.player_agent_teams(tenant_id);

-- Internal read helper: include the primary lead once, with assigned teammates.
-- All names and avatars originate from the actual agency user profiles.
create or replace function private.redream_player_agent_people(
 p_tenant_id uuid,p_player_id uuid,p_lead_user_id uuid
) returns jsonb
language sql stable set search_path='' as $function$
 with agent_ids as (
  select distinct user_id from (
   select unnest(team.user_ids) as user_id from platform.player_agent_teams team
    where team.tenant_id=p_tenant_id and team.player_id=p_player_id
   union all select p_lead_user_id
  ) ids where user_id is not null
 )
 select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',ids.user_id,
    'name',coalesce(nullif(trim(pr.display_name),''),'Team member'),
    'avatar_path',pr.avatar_path,
    'is_lead',ids.user_id=p_lead_user_id
 ) order by case when ids.user_id=p_lead_user_id then 0 else 1 end,
    coalesce(pr.display_name,'Team member'),ids.user_id),'[]'::jsonb)
 from agent_ids ids
 join platform.tenant_memberships m on m.user_id=ids.user_id
  and m.tenant_id=p_tenant_id and m.status='active'
  and m.role in ('owner','admin','agent','operations','scout')
 left join public.profiles pr on pr.id=ids.user_id;
$function$;
revoke all on function private.redream_player_agent_people(uuid,uuid,uuid) from public,anon,authenticated;


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
          'assigned_agents',private.redream_player_agent_people(v_player.tenant_id,v_player.id,v_player.primary_staff_user_id),
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
          'assigned_agents',private.redream_player_agent_people(v_player.tenant_id,v_player.id,v_player.primary_staff_user_id),
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
          'assigned_agents',private.redream_player_agent_people(v_player.tenant_id,v_player.id,v_player.primary_staff_user_id),
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
          'identity',(v_item->'identity') - array['assigned_agents','primary_agent','contract_status','contract_expiry','transfermarkt_market_value','transfermarkt_market_value_currency','agency_priority','next_action','next_action_due'],
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


-- Atomic multi-agent selection with optimistic concurrency and tenant checks.
-- Adding gives restricted player visibility, not blanket edit permission.
-- Removing does not revoke access granted independently for other work.
create or replace function public.redream_player_agents_v1(
 p_player_id uuid,
 p_input jsonb default null,
 p_expected_revision integer default null,
 p_tenant_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare
 v_tenant uuid:=private.calendar_staff_tenant(p_tenant_id);
 v_lead uuid;
 v_revision integer:=0;
 v_ids uuid[]:='{}'::uuid[];
 v_requested uuid[];
 v_people jsonb;
 v_available jsonb;
 v_saved boolean:=false;
begin
 if auth.uid() is null or not private.user_is_tenant_admin(v_tenant,auth.uid()) then
  raise exception 'Agency administrator access required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_tenant::text||':player_agent_team:'||p_player_id::text,0));
 select p.primary_staff_user_id into v_lead
 from public.players p
 where p.tenant_id=v_tenant and p.id=p_player_id and p.archived_at is null
 for update;
 if not found then raise exception 'Player unavailable in this agency' using errcode='42501';end if;
 select team.user_ids,team.revision into v_ids,v_revision
 from platform.player_agent_teams team
 where team.tenant_id=v_tenant and team.player_id=p_player_id;
 if not found then v_ids:='{}'::uuid[];v_revision:=0;end if;

 if p_input is not null then
  if p_expected_revision is distinct from v_revision then
   raise exception 'Agent assignments changed; reload before saving' using errcode='40001';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object'
     or not (p_input ? 'user_ids')
     or jsonb_typeof(p_input->'user_ids') is distinct from 'array'
     or exists(select 1 from jsonb_object_keys(p_input) k where k<>'user_ids')
     or jsonb_array_length(p_input->'user_ids')>25 then
    raise exception 'Select up to 25 valid agency agents' using errcode='22023';
  end if;
  select coalesce(array_agg(item.value::uuid order by item.value::uuid),'{}'::uuid[])
   into v_requested
   from jsonb_array_elements_text(p_input->'user_ids') as item(value);
  if cardinality(v_requested) is distinct from
      (select count(distinct x.user_id) from unnest(v_requested) as x(user_id)) then
   raise exception 'Duplicate agents are not allowed' using errcode='22023';
  end if;
  -- The lead remains assigned until separately changed in the Lead agent editor.
  v_requested:=array(
    select x.user_id from unnest(v_requested) as x(user_id)
    where x.user_id is distinct from v_lead order by x.user_id
  );
  if exists(
    select 1 from unnest(v_requested) as selected(user_id)
    where not exists(
      select 1 from platform.tenant_memberships m
      where m.tenant_id=v_tenant and m.user_id=selected.user_id
        and m.status='active'
        and m.role in ('owner','admin','agent','operations','scout')
    )
  ) then
   raise exception 'Only active agency teammates may be assigned' using errcode='22023';
  end if;
  if v_requested is distinct from v_ids then
   insert into platform.player_agent_teams(tenant_id,player_id,user_ids,revision,updated_by)
    values(v_tenant,p_player_id,v_requested,v_revision+1,auth.uid())
   on conflict(player_id) do update
    set user_ids=excluded.user_ids,revision=excluded.revision,
      updated_by=excluded.updated_by,updated_at=now();
   insert into public.staff_player_access(staff_user_id,player_id,can_edit)
    select selected.user_id,p_player_id,false
    from unnest(v_requested) as selected(user_id)
    on conflict(staff_user_id,player_id) do nothing;
   insert into platform.audit_events(
     tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
   values(
     v_tenant,auth.uid(),'user','player.agent_team_updated','player',p_player_id::text,
     jsonb_build_object('previous_user_ids',to_jsonb(v_ids),
       'user_ids',to_jsonb(v_requested),'revision',v_revision+1)
   );
   v_ids:=v_requested;v_revision:=v_revision+1;
  end if;
  v_saved:=true;
 end if;
 v_people:=private.redream_player_agent_people(v_tenant,p_player_id,v_lead);
 select coalesce(jsonb_agg(jsonb_build_object(
   'user_id',m.user_id,
   'name',coalesce(nullif(trim(pr.display_name),''),'Team member'),
   'avatar_path',pr.avatar_path
 ) order by coalesce(pr.display_name,'Team member'),m.user_id),'[]'::jsonb)
 into v_available from platform.tenant_memberships m
 left join public.profiles pr on pr.id=m.user_id
 where m.tenant_id=v_tenant and m.status='active'
  and m.role in ('owner','admin','agent','operations','scout');
 return jsonb_build_object(
   'player_id',p_player_id,
   'assigned_agents',v_people,
   'available_agents',v_available,
   'lead_agent_id',v_lead,
   'user_ids',to_jsonb(v_ids),
   'revision',v_revision,
   'saved',v_saved,
   'can_edit',true,
   'access_note','New teammates gain restricted player visibility. Removing a team member does not revoke independently granted access.'
 );
end;
$function$;
revoke all on function public.redream_player_agents_v1(uuid,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.redream_player_agents_v1(uuid,jsonb,integer,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
