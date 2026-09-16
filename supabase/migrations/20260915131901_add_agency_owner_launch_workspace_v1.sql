create or replace function public.platform_server_owner_launch_workspace(
  p_tenant_slug text,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_slug text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_tenant_slug,'')));
  v_tenant_id uuid;
  v_branding platform.tenant_branding%rowtype;
  v_activation jsonb;
  v_privacy jsonb;
  v_readiness jsonb;
  v_brand_ready boolean:=false;
  v_privacy_ready boolean:=false;
  v_player_ready boolean:=false;
  v_relationship_ready boolean:=false;
  v_opportunity_ready boolean:=false;
  v_owner_side_complete boolean:=false;
  v_next_step text;
  v_hostname text;
  v_stage text;
  v_plan_key text;
  v_player_count integer:=0;
  v_relationship_count integer:=0;
  v_opportunity_count integer:=0;
begin
  select t.id into v_tenant_id
  from platform.tenants t
  where t.slug=v_slug and t.status in ('provisioning','active');

  if v_tenant_id is null then raise exception 'tenant_not_available'; end if;

  if not exists(
    select 1 from platform.tenant_memberships m
    where m.tenant_id=v_tenant_id
      and m.user_id=p_user_id
      and m.role='owner'
      and m.status='active'
  ) then
    raise exception 'tenant_owner_access_required';
  end if;

  select * into v_branding from platform.tenant_branding b where b.tenant_id=v_tenant_id;
  v_activation:=public.platform_server_customer_activation(v_tenant_id);
  v_privacy:=public.platform_server_tenant_privacy_readiness(v_tenant_id);
  v_readiness:=public.platform_server_customer_go_live_readiness(v_tenant_id);

  select count(*)::int into v_player_count from public.players p where p.tenant_id=v_tenant_id;
  select count(*)::int into v_relationship_count from djm_os.relationships r where r.tenant_id=v_tenant_id;
  select (
    (select count(*) from public.player_opportunities o where o.tenant_id=v_tenant_id) +
    (select count(*) from djm_os.club_needs n where n.tenant_id=v_tenant_id and n.status='active')
  )::int into v_opportunity_count;

  v_brand_ready:=
    nullif(pg_catalog.btrim(v_branding.display_name),'') is not null
    and nullif(pg_catalog.btrim(v_branding.portal_name),'') is not null
    and v_branding.primary_color ~* '^#[0-9a-f]{6}$'
    and v_branding.accent_color ~* '^#[0-9a-f]{6}$'
    and nullif(pg_catalog.btrim(v_branding.support_email),'') is not null;
  v_privacy_ready:=coalesce((v_privacy->>'ready_for_player_invites')::boolean,false);
  v_player_ready:=v_player_count>0;
  v_relationship_ready:=v_relationship_count>0;
  v_opportunity_ready:=v_opportunity_count>0;
  v_owner_side_complete:=v_brand_ready and v_privacy_ready and v_player_ready and v_relationship_ready and v_opportunity_ready;

  v_next_step:=case
    when not v_brand_ready then 'branding'
    when not v_privacy_ready then 'privacy'
    when not v_player_ready then 'first_player'
    when not v_relationship_ready then 'first_relationship'
    when not v_opportunity_ready then 'first_opportunity'
    else 'owner_setup_complete'
  end;

  select d.hostname into v_hostname
  from platform.tenant_domains d
  where d.tenant_id=v_tenant_id and d.is_primary and d.status='verified'
  order by d.verified_at desc nulls last,d.created_at desc
  limit 1;

  select l.stage into v_stage from platform.tenant_customer_lifecycle l where l.tenant_id=v_tenant_id;
  select a.plan_key into v_plan_key
  from platform.tenant_plan_assignments a
  where a.tenant_id=v_tenant_id and a.status in ('trialing','active')
  order by a.effective_from desc limit 1;

  return jsonb_build_object(
    'tenant_id',v_tenant_id,
    'tenant_slug',v_slug,
    'stage',v_stage,
    'plan_key',v_plan_key,
    'branding',jsonb_build_object(
      'display_name',v_branding.display_name,
      'short_name',v_branding.short_name,
      'portal_name',v_branding.portal_name,
      'primary_color',v_branding.primary_color,
      'secondary_color',v_branding.secondary_color,
      'accent_color',v_branding.accent_color,
      'support_email',v_branding.support_email,
      'website_url',v_branding.website_url,
      'phone',v_branding.phone,
      'logo_asset',v_branding.logo_asset
    ),
    'privacy',v_privacy,
    'activation',v_activation,
    'go_live_readiness',v_readiness,
    'workspace_hostname',v_hostname,
    'owner_setup',jsonb_build_object(
      'complete',v_owner_side_complete,
      'next_step',v_next_step,
      'completed_count',
        (case when v_brand_ready then 1 else 0 end)+
        (case when v_privacy_ready then 1 else 0 end)+
        (case when v_player_ready then 1 else 0 end)+
        (case when v_relationship_ready then 1 else 0 end)+
        (case when v_opportunity_ready then 1 else 0 end),
      'total_count',5,
      'steps',jsonb_build_array(
        jsonb_build_object('key','branding','label','Confirm your workspace identity','complete',v_brand_ready,'owner_controlled',true),
        jsonb_build_object('key','privacy','label','Add your player privacy notice','complete',v_privacy_ready,'owner_controlled',true),
        jsonb_build_object('key','first_player','label','Load your first real player','complete',v_player_ready,'owner_controlled',true),
        jsonb_build_object('key','first_relationship','label','Add your first club relationship','complete',v_relationship_ready,'owner_controlled',true),
        jsonb_build_object('key','first_opportunity','label','Capture one live opportunity','complete',v_opportunity_ready,'owner_controlled',true)
      )
    ),
    'platform_managed',jsonb_build_object(
      'workspace_address_ready',v_hostname is not null,
      'workspace_hostname',v_hostname,
      'launch_ready',coalesce((v_readiness->>'ready')::boolean,false)
    ),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'name',pg_catalog.btrim(concat_ws(' ',p.preferred_name,p.first_name,p.last_name)),
        'first_name',p.first_name,
        'last_name',p.last_name,
        'primary_position',p.primary_position,
        'current_club',p.current_club
      ) order by p.created_at asc)
      from (select * from public.players where tenant_id=v_tenant_id order by created_at asc limit 20) p
    ),'[]'::jsonb),
    'truth_contract',jsonb_build_object(
      'progress','Owner launch progress is derived from saved workspace evidence, not manually ticked boxes.',
      'legal','The agency supplies and approves its own privacy notice. The platform records the supplied notice identity and version.',
      'first_value','A player, a real club relationship and a live opportunity are required before first working value is claimed.',
      'domain','Workspace address verification is platform-managed and does not block the owner from completing the owner-controlled setup steps.'
    )
  );
end;
$function$;

create or replace function public.platform_server_owner_update_branding(
  p_tenant_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_portal_name text,
  p_primary_color text,
  p_accent_color text,
  p_support_email text,
  p_website_url text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_display_name text:=nullif(pg_catalog.btrim(p_display_name),'');
  v_portal_name text:=nullif(pg_catalog.btrim(p_portal_name),'');
  v_primary text:=upper(pg_catalog.btrim(coalesce(p_primary_color,'')));
  v_accent text:=upper(pg_catalog.btrim(coalesce(p_accent_color,'')));
  v_email text:=nullif(lower(pg_catalog.btrim(p_support_email)),'');
  v_website text:=nullif(pg_catalog.btrim(p_website_url),'');
  v_phone text:=nullif(pg_catalog.btrim(p_phone),'');
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.role='owner' and m.status='active') then raise exception 'tenant_owner_access_required'; end if;
  if v_display_name is null or char_length(v_display_name)>120 then raise exception 'invalid_display_name'; end if;
  if v_portal_name is null or char_length(v_portal_name)>120 then raise exception 'invalid_portal_name'; end if;
  if v_primary !~ '^#[0-9A-F]{6}$' or v_accent !~ '^#[0-9A-F]{6}$' then raise exception 'invalid_brand_colour'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'invalid_support_email'; end if;
  if v_website is not null and v_website !~* '^https?://[^[:space:]]+$' then raise exception 'invalid_website_url'; end if;
  if v_phone is not null and char_length(v_phone)>50 then raise exception 'invalid_phone'; end if;

  select to_jsonb(b) into v_before from platform.tenant_branding b where b.tenant_id=p_tenant_id;

  update platform.tenant_branding
  set display_name=v_display_name,portal_name=v_portal_name,primary_color=v_primary,accent_color=v_accent,
      support_email=v_email,website_url=v_website,phone=v_phone,updated_at=now()
  where tenant_id=p_tenant_id;
  if not found then raise exception 'tenant_branding_not_found'; end if;

  select to_jsonb(b) into v_after from platform.tenant_branding b where b.tenant_id=p_tenant_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_user_id,'user','platform.owner.branding_updated','tenant_branding',p_tenant_id::text,v_before,v_after,jsonb_build_object('source','agency_launch'));

  return v_after;
end;
$function$;

create or replace function public.platform_server_owner_create_first_player(
  p_tenant_id uuid,
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_primary_position text,
  p_current_club text default null,
  p_current_country text default null,
  p_transfermarkt_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_first text:=nullif(pg_catalog.btrim(p_first_name),'');
  v_last text:=nullif(pg_catalog.btrim(p_last_name),'');
  v_position text:=nullif(pg_catalog.btrim(p_primary_position),'');
  v_club text:=nullif(pg_catalog.btrim(p_current_club),'');
  v_country text:=nullif(pg_catalog.btrim(p_current_country),'');
  v_tm text:=nullif(pg_catalog.btrim(p_transfermarkt_url),'');
  v_id uuid;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.role='owner' and m.status='active') then raise exception 'tenant_owner_access_required'; end if;
  if exists(select 1 from public.players p where p.tenant_id=p_tenant_id) then raise exception 'first_player_already_exists'; end if;
  if v_first is null or v_last is null or v_position is null then raise exception 'player_name_and_position_required'; end if;
  if char_length(v_first)>80 or char_length(v_last)>80 or char_length(v_position)>80 then raise exception 'player_field_too_long'; end if;
  if v_tm is not null and v_tm !~* '^https?://[^[:space:]]+$' then raise exception 'invalid_transfermarkt_url'; end if;

  insert into public.players(tenant_id,first_name,last_name,primary_position,current_club,current_country,transfermarkt_url,football_status,verification_status,onboarding_status)
  values(p_tenant_id,v_first,v_last,v_position,v_club,v_country,v_tm,'active','unverified','not_started')
  returning id into v_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_user_id,'user','platform.owner.first_player_created','player',v_id::text,jsonb_build_object('first_name',v_first,'last_name',v_last,'primary_position',v_position,'current_club',v_club),jsonb_build_object('source','agency_launch'));

  return jsonb_build_object('id',v_id,'first_name',v_first,'last_name',v_last,'primary_position',v_position,'current_club',v_club,'verification_status','unverified');
end;
$function$;

create or replace function public.platform_server_owner_create_first_relationship(
  p_tenant_id uuid,
  p_user_id uuid,
  p_contact_name text,
  p_club_name text,
  p_contact_role text default null,
  p_country text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_contact text:=nullif(pg_catalog.btrim(p_contact_name),'');
  v_club text:=nullif(pg_catalog.btrim(p_club_name),'');
  v_role text:=nullif(pg_catalog.btrim(p_contact_role),'');
  v_country text:=nullif(pg_catalog.btrim(p_country),'');
  v_notes text:=nullif(pg_catalog.btrim(p_notes),'');
  v_display text;
  v_person_id uuid;
  v_org_id uuid;
  v_relationship_id uuid;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.role='owner' and m.status='active') then raise exception 'tenant_owner_access_required'; end if;
  if exists(select 1 from djm_os.relationships r where r.tenant_id=p_tenant_id) then raise exception 'first_relationship_already_exists'; end if;
  if v_contact is null or v_club is null then raise exception 'contact_and_club_required'; end if;
  if char_length(v_contact)>160 or char_length(v_club)>160 or coalesce(char_length(v_role),0)>120 or coalesce(char_length(v_notes),0)>1000 then raise exception 'relationship_field_too_long'; end if;

  select coalesce(nullif(p.display_name,''),nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Agency owner') into v_display
  from auth.users u left join public.profiles p on p.id=u.id where u.id=p_user_id;

  insert into djm_os.team_members(user_id,display_name,role_title,is_active)
  values(p_user_id,coalesce(v_display,'Agency owner'),'Agency owner',true)
  on conflict(user_id) do nothing;

  insert into djm_os.organisations(tenant_id,name,organisation_type,country)
  values(p_tenant_id,v_club,'club',v_country)
  returning id into v_org_id;

  insert into djm_os.people(tenant_id,full_name,person_type,country)
  values(p_tenant_id,v_contact,'contact',v_country)
  returning id into v_person_id;

  insert into djm_os.employments(tenant_id,person_id,organisation_id,role_title,is_current,confidence)
  values(p_tenant_id,v_person_id,v_org_id,v_role,true,1.0);

  insert into djm_os.relationships(tenant_id,team_member_id,person_id,relationship_notes,first_known_at,last_meaningful_at)
  values(p_tenant_id,p_user_id,v_person_id,v_notes,now(),now())
  returning id into v_relationship_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_user_id,'user','platform.owner.first_relationship_created','relationship',v_relationship_id::text,jsonb_build_object('contact_name',v_contact,'club_name',v_club,'contact_role',v_role),jsonb_build_object('source','agency_launch'));

  return jsonb_build_object('id',v_relationship_id,'person_id',v_person_id,'organisation_id',v_org_id,'contact_name',v_contact,'club_name',v_club,'contact_role',v_role);
end;
$function$;

create or replace function public.platform_server_owner_create_first_opportunity(
  p_tenant_id uuid,
  p_user_id uuid,
  p_player_id uuid,
  p_club_name text,
  p_country text default null,
  p_summary text default null,
  p_next_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_club text:=nullif(pg_catalog.btrim(p_club_name),'');
  v_country text:=nullif(pg_catalog.btrim(p_country),'');
  v_summary text:=nullif(pg_catalog.btrim(p_summary),'');
  v_next text:=nullif(pg_catalog.btrim(p_next_action),'');
  v_id uuid;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.role='owner' and m.status='active') then raise exception 'tenant_owner_access_required'; end if;
  if not exists(select 1 from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id) then raise exception 'player_not_in_tenant'; end if;
  if exists(select 1 from public.player_opportunities o where o.tenant_id=p_tenant_id) or exists(select 1 from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.status='active') then raise exception 'first_opportunity_already_exists'; end if;
  if v_club is null then raise exception 'club_name_required'; end if;
  if char_length(v_club)>160 or coalesce(char_length(v_summary),0)>1200 or coalesce(char_length(v_next),0)>500 then raise exception 'opportunity_field_too_long'; end if;

  insert into public.player_opportunities(tenant_id,player_id,club_name,country,stage,summary,next_action,owner_id)
  values(p_tenant_id,p_player_id,v_club,v_country,'targeted',v_summary,v_next,p_user_id)
  returning id into v_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_user_id,'user','platform.owner.first_opportunity_created','player_opportunity',v_id::text,jsonb_build_object('player_id',p_player_id,'club_name',v_club,'summary',v_summary,'next_action',v_next),jsonb_build_object('source','agency_launch'));

  return jsonb_build_object('id',v_id,'player_id',p_player_id,'club_name',v_club,'stage','targeted');
end;
$function$;

revoke all on function public.platform_server_owner_launch_workspace(text,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.platform_server_owner_create_first_player(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.platform_server_owner_create_first_relationship(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.platform_server_owner_create_first_opportunity(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;

grant execute on function public.platform_server_owner_launch_workspace(text,uuid) to service_role;
grant execute on function public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text) to service_role;
grant execute on function public.platform_server_owner_create_first_player(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.platform_server_owner_create_first_relationship(uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.platform_server_owner_create_first_opportunity(uuid,uuid,uuid,text,text,text,text) to service_role;
