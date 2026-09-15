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
  v_position text;
  v_org_id uuid;
  v_need_id uuid;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.role='owner' and m.status='active') then raise exception 'tenant_owner_access_required'; end if;
  select p.primary_position into v_position from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_in_tenant'; end if;
  if exists(select 1 from public.player_opportunities o where o.tenant_id=p_tenant_id) or exists(select 1 from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.status='active') then raise exception 'first_opportunity_already_exists'; end if;
  if v_club is null then raise exception 'club_name_required'; end if;
  if char_length(v_club)>160 or coalesce(char_length(v_summary),0)>1200 or coalesce(char_length(v_next),0)>500 then raise exception 'opportunity_field_too_long'; end if;

  select o.id into v_org_id
  from djm_os.organisations o
  where o.tenant_id=p_tenant_id and lower(pg_catalog.btrim(o.name))=lower(v_club)
  order by o.created_at asc limit 1;

  if v_org_id is null then
    insert into djm_os.organisations(tenant_id,name,organisation_type,country)
    values(p_tenant_id,v_club,'club',v_country)
    returning id into v_org_id;
  end if;

  insert into djm_os.club_needs(
    tenant_id,organisation_id,owner_user_id,title,position,status,confidence,
    confirmed_at,profile_notes,raw_request,source_context,priority,need_type
  ) values (
    p_tenant_id,v_org_id,p_user_id,'Live opportunity - '||v_club,v_position,'active',1.0,
    now(),v_summary,v_summary,coalesce(v_next,'Owner launch capture'),3,'confirmed'
  ) returning id into v_need_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_user_id,'user','platform.owner.first_opportunity_created','club_need',v_need_id::text,jsonb_build_object('player_context_id',p_player_id,'club_name',v_club,'position',v_position,'summary',v_summary,'next_action',v_next),jsonb_build_object('source','agency_launch'));

  return jsonb_build_object('id',v_need_id,'player_context_id',p_player_id,'club_name',v_club,'position',v_position,'status','active','capture_type','club_need');
end;
$function$;

revoke all on function public.platform_server_owner_create_first_opportunity(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.platform_server_owner_create_first_opportunity(uuid,uuid,uuid,text,text,text,text) to service_role;
