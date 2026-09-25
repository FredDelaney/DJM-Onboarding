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
  where id=p_player_id and tenant_id=p_tenant_id;

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
  where sp.tenant_id=p_tenant_id and sp.linked_player_id is null
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
  where sp.id=p_prospect_id and sp.tenant_id=p_tenant_id and sp.linked_player_id is null;

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

create or replace function public.platform_server_recruitment_create_target(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_full_name text,
  p_current_club text default null,
  p_current_country text default null,
  p_primary_position text default null,
  p_contract_expiry date default null,
  p_transfermarkt_url text default null,
  p_recruitment_priority smallint default 3
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_name text:=nullif(trim(coalesce(p_full_name,'')),'');
  v_key text;
  v_owner uuid:=null;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  perform private.platform_server_ensure_team_member(p_actor_user_id);

  if v_name is null then raise exception 'player_name_required'; end if;
  if coalesce(p_recruitment_priority,3) not between 1 and 5 then raise exception 'invalid_priority'; end if;

  if exists(
    select 1 from djm_os.scouting_prospects sp
    where sp.tenant_id=p_tenant_id
      and sp.linked_player_id is null
      and (
        lower(trim(sp.full_name))=lower(v_name)
        or (
          nullif(trim(coalesce(p_transfermarkt_url,'')),'') is not null
          and lower(trim(coalesce(sp.transfermarkt_url,'')))=lower(trim(p_transfermarkt_url))
        )
      )
  ) then
    raise exception 'recruitment_target_already_exists';
  end if;

  if exists(select 1 from djm_os.team_members where user_id=p_actor_user_id and is_active) then
    v_owner:=p_actor_user_id;
  end if;

  v_key:=p_tenant_id::text||':'||lower(regexp_replace(v_name,'[^a-zA-Z0-9]+','-','g'))||':unknown';

  insert into djm_os.scouting_prospects(
    tenant_id,full_name,current_club,current_country,primary_position,contract_expiry,
    transfermarkt_url,availability_status,source,recruitment_source,source_confidence,
    owner_user_id,canonical_key,last_verified_at,recruitment_priority,recruitment_stage
  )
  values(
    p_tenant_id,v_name,nullif(trim(coalesce(p_current_club,'')),''),
    nullif(trim(coalesce(p_current_country,'')),''),nullif(trim(coalesce(p_primary_position,'')),''),
    p_contract_expiry,nullif(trim(coalesce(p_transfermarkt_url,'')),''),
    'unknown','recruitment','agency_workspace',1,v_owner,v_key,now(),
    coalesce(p_recruitment_priority,3),'identified'
  )
  returning id into v_id;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(p_tenant_id,'RECRUITMENT_TARGET_CREATED',p_actor_user_id,
    jsonb_build_object('prospect_id',v_id,'full_name',v_name),'agency_workspace',1,now());

  return jsonb_build_object('prospect_id',v_id,'created',true);
end;
$function$;

create or replace function public.platform_server_recruitment_set_stage(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_stage text:=lower(trim(coalesce(p_stage,'')));
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  perform private.platform_server_ensure_team_member(p_actor_user_id);

  if v_stage not in (
    'identified','researching','ready_to_contact','contacted','replied','call_booked',
    'interested','terms_discussed','agreement_sent','negotiating','signed','paused','declined','lost'
  ) then raise exception 'unsupported_recruitment_stage'; end if;

  update djm_os.scouting_prospects
  set recruitment_stage=v_stage,
      signed_at=case when v_stage='signed' then coalesce(signed_at,now()) else signed_at end,
      next_action_at=case when v_stage in ('signed','paused','declined','lost') then null else next_action_at end,
      updated_at=now()
  where id=p_prospect_id and tenant_id=p_tenant_id and linked_player_id is null;

  if not found then raise exception 'active_recruitment_target_not_found'; end if;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(p_tenant_id,'RECRUITMENT_STAGE_UPDATED',p_actor_user_id,
    jsonb_build_object('prospect_id',p_prospect_id,'stage',v_stage),'agency_workspace',1,now());

  return jsonb_build_object('prospect_id',p_prospect_id,'stage',v_stage);
end;
$function$;

create or replace function public.platform_server_recruitment_set_next_action(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid,
  p_next_action_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  perform private.platform_server_ensure_team_member(p_actor_user_id);

  update djm_os.scouting_prospects
  set next_action_at=p_next_action_at,updated_at=now()
  where id=p_prospect_id and tenant_id=p_tenant_id and linked_player_id is null
    and recruitment_stage not in ('signed','paused','declined','lost');

  if not found then raise exception 'active_recruitment_target_not_found'; end if;

  return jsonb_build_object('prospect_id',p_prospect_id,'next_action_at',p_next_action_at);
end;
$function$;

create or replace function public.platform_server_recruitment_log_interaction(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid,
  p_channel text,
  p_direction text,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_channel text:=lower(trim(coalesce(p_channel,'')));
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_summary text:=nullif(trim(coalesce(p_summary,'')),'');
  v_interaction_id uuid;
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  perform private.platform_server_ensure_team_member(p_actor_user_id);

  if v_channel not in ('whatsapp','instagram','linkedin','email','phone','meeting','other') then
    raise exception 'unsupported_recruitment_channel';
  end if;
  if v_direction not in ('inbound','outbound','mutual') then
    raise exception 'unsupported_recruitment_direction';
  end if;
  if v_summary is null then raise exception 'interaction_summary_required'; end if;

  if not exists(
    select 1 from djm_os.scouting_prospects
    where id=p_prospect_id and tenant_id=p_tenant_id and linked_player_id is null
  ) then raise exception 'active_recruitment_target_not_found'; end if;

  insert into djm_os.recruitment_interactions(
    tenant_id,prospect_id,owner_user_id,channel,direction,summary,occurred_at,source
  )
  values(p_tenant_id,p_prospect_id,p_actor_user_id,v_channel,v_direction,v_summary,now(),'agency_workspace')
  returning id into v_interaction_id;

  update djm_os.scouting_prospects
  set
    first_contact_at=case when first_contact_at is null and v_direction in ('outbound','mutual') then now() else first_contact_at end,
    last_contact_at=case when v_direction in ('outbound','mutual') then now() else last_contact_at end,
    last_reply_at=case when v_direction in ('inbound','mutual') then now() else last_reply_at end,
    recruitment_stage=case
      when recruitment_stage in ('identified','researching','ready_to_contact') and v_direction='outbound' then 'contacted'
      when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and v_direction in ('inbound','mutual') then 'replied'
      else recruitment_stage
    end,
    preferred_contact_channel=coalesce(preferred_contact_channel,v_channel),
    updated_at=now()
  where id=p_prospect_id and tenant_id=p_tenant_id;

  return jsonb_build_object('prospect_id',p_prospect_id,'interaction_id',v_interaction_id);
end;
$function$;

create or replace function public.platform_server_recruitment_promote_player(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_prospect djm_os.scouting_prospects%rowtype;
  v_player_id uuid;
  v_first_name text;
  v_last_name text;
  v_space integer;
begin
  if not exists(
    select 1 from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent')
  ) then
    raise exception 'agent_access_required' using errcode='42501';
  end if;

  perform private.platform_server_ensure_team_member(p_actor_user_id);

  select *
  into v_prospect
  from djm_os.scouting_prospects
  where id=p_prospect_id and tenant_id=p_tenant_id
  for update;

  if not found then raise exception 'recruitment_target_not_found_for_tenant'; end if;

  if v_prospect.linked_player_id is not null then
    return jsonb_build_object('player_id',v_prospect.linked_player_id,'already_promoted',true);
  end if;

  if v_prospect.recruitment_stage<>'signed' then
    raise exception 'target_must_be_represented_before_player_creation';
  end if;

  v_space:=strpos(trim(v_prospect.full_name),' ');
  if v_space>0 then
    v_first_name:=left(trim(v_prospect.full_name),v_space-1);
    v_last_name:=nullif(trim(substr(trim(v_prospect.full_name),v_space+1)),'');
  else
    v_first_name:=trim(v_prospect.full_name);
    v_last_name:=null;
  end if;

  insert into public.players(
    tenant_id,first_name,last_name,date_of_birth,nationalities,preferred_foot,
    primary_position,secondary_positions,current_club,current_country,contract_expiry,
    transfermarkt_url,wyscout_url,stats_url,instagram_url,football_status,
    onboarding_status,verification_status,agency_priority,next_action,next_action_due,
    review_required_at,review_reason,primary_staff_user_id
  )
  values(
    p_tenant_id,v_first_name,v_last_name,v_prospect.date_of_birth,
    case when nullif(trim(coalesce(v_prospect.nationality,'')),'') is null then '{}'::text[] else array[trim(v_prospect.nationality)] end,
    case lower(trim(coalesce(v_prospect.preferred_foot,'')))
      when 'left' then 'Left'
      when 'right' then 'Right'
      when 'both' then 'Both'
      else null
    end,
    v_prospect.primary_position,coalesce(v_prospect.secondary_positions,'{}'::text[]),
    v_prospect.current_club,v_prospect.current_country,v_prospect.contract_expiry,
    v_prospect.transfermarkt_url,v_prospect.wyscout_url,v_prospect.stats_url,v_prospect.instagram_url,
    'active','not_started','unverified','high','Complete player onboarding',current_date+7,now(),
    'Promoted from recruitment after representation was confirmed',p_actor_user_id
  )
  returning id into v_player_id;

  update djm_os.scouting_prospects
  set linked_player_id=v_player_id,signed_player_id=v_player_id,signed_at=coalesce(signed_at,now()),
      recruitment_stage='signed',next_action_at=null,updated_at=now()
  where id=p_prospect_id and tenant_id=p_tenant_id;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(p_tenant_id,'RECRUITMENT_PROMOTED_TO_PLAYER',p_actor_user_id,v_player_id,
    jsonb_build_object('prospect_id',p_prospect_id,'player_id',v_player_id),'agency_workspace',1,now());

  return jsonb_build_object(
    'player_id',v_player_id,
    'prospect_id',p_prospect_id,
    'already_promoted',false,
    'representation_agreement_recorded',false
  );
end;
$function$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'platform_server_players_workspace',
        'platform_server_player_workspace',
        'platform_server_recruitment_board',
        'platform_server_recruitment_target',
        'platform_server_recruitment_create_target',
        'platform_server_recruitment_set_stage',
        'platform_server_recruitment_set_next_action',
        'platform_server_recruitment_log_interaction',
        'platform_server_recruitment_promote_player'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated',r.signature);
    execute format('grant execute on function %s to service_role',r.signature);
  end loop;
end
$$;
