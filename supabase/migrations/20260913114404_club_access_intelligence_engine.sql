create or replace function platform.access_role_relevance(p_role text)
returns integer
language sql
immutable
set search_path to ''
as $function$
  select case
    when lower(coalesce(p_role,'')) ~ '(sporting director|director of football|football director|head of recruitment|recruitment director)' then 100
    when lower(coalesce(p_role,'')) ~ '(technical director)' then 95
    when lower(coalesce(p_role,'')) ~ '(chief scout|head scout)' then 85
    when lower(coalesce(p_role,'')) ~ '(chief executive|ceo|general manager|managing director)' then 75
    when lower(coalesce(p_role,'')) ~ '(head coach|manager|coach)' then 65
    when lower(coalesce(p_role,'')) ~ '(scout|recruitment)' then 60
    else 50
  end;
$function$;

create or replace function platform.access_recency_score(p_last_meaningful_at timestamptz)
returns integer
language sql
stable
set search_path to ''
as $function$
  select case
    when p_last_meaningful_at is null then 0
    when p_last_meaningful_at >= now()-interval '7 days' then 100
    when p_last_meaningful_at >= now()-interval '30 days' then 80
    when p_last_meaningful_at >= now()-interval '90 days' then 60
    when p_last_meaningful_at >= now()-interval '180 days' then 40
    else 20
  end;
$function$;

create or replace function public.platform_server_access_routes(
  p_tenant_id uuid,
  p_organisation_id uuid,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,5),10));
  v_org djm_os.organisations%rowtype;
  v_routes jsonb;
  v_count integer;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then
    raise exception 'tenant_not_found';
  end if;

  select * into v_org
  from djm_os.organisations o
  where o.id=p_organisation_id and o.tenant_id=p_tenant_id;
  if not found then raise exception 'organisation_not_found_for_tenant'; end if;

  with candidates as (
    select
      r.team_member_id,
      tm.display_name as team_member_name,
      p.id as person_id,
      p.full_name as person_name,
      e.role_title,
      coalesce(r.strength_score,0)::integer as strength_score,
      coalesce(r.access_score,0)::integer as access_score,
      coalesce(r.trust_score,0)::integer as trust_score,
      greatest(r.last_meaningful_at, li.last_interaction_at) as last_meaningful_at,
      platform.access_recency_score(greatest(r.last_meaningful_at,li.last_interaction_at)) as recency_score,
      platform.access_role_relevance(e.role_title) as role_relevance_score,
      coalesce(li.interactions_30d,0)::integer as interactions_30d,
      coalesce(li.interactions_180d,0)::integer as interactions_180d,
      li.last_interaction_at,
      r.relationship_notes,
      round(
        coalesce(r.strength_score,0)::numeric*0.30 +
        coalesce(r.access_score,0)::numeric*0.25 +
        coalesce(r.trust_score,0)::numeric*0.20 +
        platform.access_recency_score(greatest(r.last_meaningful_at,li.last_interaction_at))::numeric*0.15 +
        platform.access_role_relevance(e.role_title)::numeric*0.10
      )::integer as route_score
    from djm_os.employments e
    join djm_os.people p
      on p.id=e.person_id and p.tenant_id=p_tenant_id
    join djm_os.relationships r
      on r.person_id=p.id and r.tenant_id=p_tenant_id
    join platform.tenant_memberships m
      on m.tenant_id=p_tenant_id
     and m.user_id=r.team_member_id
     and m.status='active'
     and m.role in ('owner','admin','agent','scout','operations')
    left join djm_os.team_members tm on tm.user_id=r.team_member_id
    left join lateral (
      select
        max(i.occurred_at) as last_interaction_at,
        count(*) filter(where i.occurred_at>=now()-interval '30 days')::integer as interactions_30d,
        count(*) filter(where i.occurred_at>=now()-interval '180 days')::integer as interactions_180d
      from djm_os.interactions i
      where i.tenant_id=p_tenant_id
        and i.person_id=p.id
        and i.team_member_id=r.team_member_id
    ) li on true
    where e.tenant_id=p_tenant_id
      and e.organisation_id=p_organisation_id
      and e.is_current=true
  ), ranked as (
    select *,row_number() over(order by route_score desc,last_meaningful_at desc nulls last,person_name) as route_rank
    from candidates
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank',route_rank,
      'person_id',person_id,
      'person_name',person_name,
      'role_title',role_title,
      'team_member_id',team_member_id,
      'team_member_name',team_member_name,
      'route_score',route_score,
      'route_state',case when route_score>=75 then 'warm' when route_score>=60 then 'usable' when route_score>=45 then 'developing' else 'cold' end,
      'last_meaningful_at',last_meaningful_at,
      'last_interaction_at',last_interaction_at,
      'interactions_30d',interactions_30d,
      'interactions_180d',interactions_180d,
      'factor_breakdown',jsonb_build_object(
        'relationship_strength',jsonb_build_object('score',strength_score,'weight',0.30,'weighted_points',round(strength_score*0.30,1)),
        'access',jsonb_build_object('score',access_score,'weight',0.25,'weighted_points',round(access_score*0.25,1)),
        'trust',jsonb_build_object('score',trust_score,'weight',0.20,'weighted_points',round(trust_score*0.20,1)),
        'recency',jsonb_build_object('score',recency_score,'weight',0.15,'weighted_points',round(recency_score*0.15,1)),
        'role_relevance',jsonb_build_object('score',role_relevance_score,'weight',0.10,'weighted_points',round(role_relevance_score*0.10,1))
      ),
      'why_this_route',concat_ws(' ',
        case when access_score>=80 then 'Direct access is strong.' when access_score>=60 then 'Access is usable.' else 'Access is limited.' end,
        case when recency_score>=80 then 'The relationship is recent.' when recency_score>=60 then 'The relationship is still reasonably current.' else 'The relationship may need warming.' end,
        case when role_relevance_score>=95 then 'The contact sits close to football decision-making.' when role_relevance_score>=75 then 'The contact has useful organisational influence.' else 'Role relevance is secondary.' end
      ),
      'relationship_notes',relationship_notes
    ) order by route_rank) filter(where route_rank<=v_limit),'[]'::jsonb),
    count(*)::integer
  into v_routes,v_count
  from ranked;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'organisation',jsonb_build_object(
      'organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'city',v_org.city,'league_name',v_org.league_name
    ),
    'available',v_count>0,
    'route_count',v_count,
    'best_route',case when jsonb_array_length(v_routes)>0 then v_routes->0 else null end,
    'routes',v_routes,
    'method',jsonb_build_object(
      'relationship_strength_weight',0.30,
      'access_weight',0.25,
      'trust_weight',0.20,
      'recency_weight',0.15,
      'role_relevance_weight',0.10,
      'interpretation','Deterministic access-route ranking based on recorded agency relationships. This is not a probability or AI prediction.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_access_routes(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_access_routes(uuid,uuid,integer) to service_role;

create or replace function public.platform_server_command_access_context(
  p_tenant_id uuid,
  p_command_id text,
  p_limit integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_feed jsonb;
  v_command jsonb;
  v_source_type text;
  v_source_id uuid;
  v_org_id uuid;
  v_club_need_id uuid;
  v_routes jsonb;
begin
  if trim(coalesce(p_command_id,''))='' then raise exception 'command_id_required'; end if;
  v_feed := public.platform_server_agency_decisions(p_tenant_id,25);
  select c.value into v_command
  from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
  where c.value->>'command_id'=p_command_id
  limit 1;
  if v_command is null then
    return jsonb_build_object('tenant_id',p_tenant_id,'command_id',p_command_id,'available',false,'reason','command_not_found_or_not_actionable');
  end if;

  v_source_type := v_command->>'source_type';
  begin v_source_id := nullif(v_command->>'source_id','')::uuid; exception when others then v_source_id:=null; end;

  if v_source_type='deal_room' then
    select d.organisation_id into v_org_id from djm_os.deal_rooms d where d.id=v_source_id and d.tenant_id=p_tenant_id;
  elsif v_source_type='club_need' then
    select n.organisation_id into v_org_id from djm_os.club_needs n where n.id=v_source_id and n.tenant_id=p_tenant_id;
  elsif v_source_type='task' then
    begin
      v_club_need_id := nullif(v_command->'evidence'->'tasks'->0->>'club_need_id','')::uuid;
    exception when others then v_club_need_id:=null; end;
    if v_club_need_id is not null then
      select n.organisation_id into v_org_id from djm_os.club_needs n where n.id=v_club_need_id and n.tenant_id=p_tenant_id;
    else
      select t.organisation_id into v_org_id from djm_os.tasks t where t.id=v_source_id and t.tenant_id=p_tenant_id;
    end if;
  end if;

  if v_org_id is null then
    return jsonb_build_object(
      'tenant_id',p_tenant_id,'command_id',p_command_id,'available',false,
      'reason','no_club_context_for_command','command_type',v_command->>'command_type','source_type',v_source_type
    );
  end if;

  v_routes := public.platform_server_access_routes(p_tenant_id,v_org_id,p_limit);
  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'command_id',p_command_id,
    'command_type',v_command->>'command_type',
    'organisation_id',v_org_id,
    'available',coalesce((v_routes->>'available')::boolean,false),
    'best_route',v_routes->'best_route',
    'routes',v_routes->'routes',
    'method',v_routes->'method'
  );
end;
$function$;

revoke all on function public.platform_server_command_access_context(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.platform_server_command_access_context(uuid,text,integer) to service_role;;
