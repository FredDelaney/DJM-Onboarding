-- Scoped views keep personal work and shared contact identity usable.
-- Retrieve permitted fields directly; never hydrate hidden commercial DTOs.
begin;
create or replace function public.platform_server_staff_club_identity(p_tenant_id uuid,p_user_id uuid,p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_club jsonb;
begin
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;
  select jsonb_build_object('id',o.id,'organisation_id',o.id,'name',o.name,
    'country',o.country,'city',o.city,'league_name',o.league_name,'website_url',o.website_url)
  into v_club from djm_os.organisations o
  where o.id=p_organisation_id and o.tenant_id=p_tenant_id and o.archived_at is null;
  if v_club is null then raise exception 'club_not_found'; end if;
  return jsonb_build_object('club',v_club,'access',jsonb_build_object('scope','identity','restricted',true));
end;
$$;
revoke all on function public.platform_server_staff_club_identity(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_staff_club_identity(uuid,uuid,uuid) to service_role;

create or replace function public.platform_server_staff_network(p_tenant_id uuid,p_user_id uuid,p_limit integer default 100,p_contact_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_clubs jsonb; v_contacts jsonb;
begin
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'organisation_id',o.id,'name',o.name,'country',o.country,'city',o.city,
    'league_name',o.league_name,'website_url',o.website_url,
    'access',jsonb_build_object('scope','identity','restricted',true)) order by o.name,o.id),'[]'::jsonb)
  into v_clubs from (
    select id,name,country,city,league_name,website_url from djm_os.organisations
    where tenant_id=p_tenant_id and organisation_type='club' and archived_at is null
    order by name,id limit greatest(1,least(coalesce(p_limit,100),500))
  ) o;
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id',p.id,'person',jsonb_build_object(
      'full_name',p.full_name,'preferred_name',p.preferred_name,'country',p.country,
      'city',p.city,'photo_url',p.photo_url,'linkedin_url',p.linkedin_url),
    'employment',jsonb_build_object(
      'organisation_id',e.organisation_id,'organisation_name',o.name,
      'organisation_country',o.country,'role_title',e.role_title,'department',e.department),
    'contact',jsonb_build_object('email',email.value,'whatsapp',whatsapp.value),
    'access',jsonb_build_object('scope','identity','restricted',true)
  ) order by p.full_name,p.id),'[]'::jsonb)
  into v_contacts
  from (
    select id,full_name,preferred_name,country,city,photo_url,linkedin_url
    from djm_os.people where tenant_id=p_tenant_id and archived_at is null and coalesce(person_type,'contact')<>'player'
    order by full_name,id limit greatest(1,least(coalesce(p_contact_limit,250),500))
  ) p
  left join lateral (
    select organisation_id,role_title,department from djm_os.employments
    where person_id=p.id and tenant_id=p_tenant_id and is_current
    order by started_on desc nulls last,updated_at desc,id limit 1
  ) e on true
  left join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=p_tenant_id and o.archived_at is null
  left join lateral (
    select value from djm_os.contact_methods where person_id=p.id and tenant_id=p_tenant_id and channel='email'
    order by is_primary desc,is_verified desc nulls last,updated_at desc,id limit 1
  ) email on true
  left join lateral (
    select value from djm_os.contact_methods where person_id=p.id and tenant_id=p_tenant_id and channel='whatsapp'
    order by is_primary desc,is_verified desc nulls last,updated_at desc,id limit 1
  ) whatsapp on true;
  return jsonb_build_object('generated_at',now(),'access',jsonb_build_object('scope','identity','restricted',true),
    'accounts',jsonb_build_object('clubs',v_clubs),
    'contacts',jsonb_build_object('items',v_contacts),
    'truth_contract',jsonb_build_object('scope','Shared clubs and contacts. Commercial records require administrator access.'));
end;
$$;
revoke all on function public.platform_server_staff_network(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_staff_network(uuid,uuid,integer,integer) to service_role;

create or replace function public.platform_server_staff_contact(p_tenant_id uuid,p_user_id uuid,p_person_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_person jsonb; v_methods jsonb; v_reach jsonb; v_profiles jsonb; v_employment jsonb; v_interactions jsonb; v_tasks jsonb; v_meetings jsonb; v_route jsonb; v_last_meaningful timestamptz;
begin
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;
  select jsonb_build_object('person_id',p.id,'full_name',p.full_name,'preferred_name',p.preferred_name,
    'country',p.country,'city',p.city,'photo_url',p.photo_url,'linkedin_url',p.linkedin_url)
  into v_person from djm_os.people p where p.id=p_person_id and p.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.person_type,'contact')<>'player';
  if v_person is null then raise exception 'contact_not_found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'channel',c.channel,'value',c.value,
    'is_primary',c.is_primary,'is_verified',c.is_verified,'last_verified_at',c.last_verified_at) order by c.is_primary desc,c.updated_at desc),'[]'::jsonb)
  into v_methods from djm_os.contact_methods c where c.tenant_id=p_tenant_id and c.person_id=p_person_id;
  select coalesce(jsonb_object_agg(c.channel,jsonb_build_object('id',c.id,'value',c.value,
    'is_primary',c.is_primary,'is_verified',c.is_verified,'last_verified_at',c.last_verified_at)),'{}'::jsonb)
  into v_reach from (
    select distinct on (channel) id,channel,value,is_primary,is_verified,last_verified_at
    from djm_os.contact_methods where tenant_id=p_tenant_id and person_id=p_person_id
    order by channel,is_primary desc,is_verified desc nulls last,updated_at desc,id
  ) c;
  select coalesce(jsonb_object_agg(x.provider,jsonb_build_object('id',x.id,'url',x.profile_url,
    'external_id',x.external_id,'is_verified',x.is_verified)),'{}'::jsonb)
  into v_profiles from (
    select distinct on (provider) id,provider,profile_url,external_id,is_verified
    from djm_os.person_external_profiles where tenant_id=p_tenant_id and person_id=p_person_id
    order by provider,is_primary desc,is_verified desc nulls last,updated_at desc,id
  ) x;
  select jsonb_build_object('organisation_id',o.id,'organisation_name',o.name,'organisation_country',o.country,
    'role_title',e.role_title,'department',e.department,'employment_id',e.id,
    'started_on',e.started_on,'last_verified_at',e.last_verified_at,'source_url',e.source_url,
    'verification_state',case when e.last_verified_at is null then 'not_verified'
      when e.last_verified_at>=now()-interval '60 days' then 'recently_verified' else 'verification_due' end)
  into v_employment from djm_os.employments e
  join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=e.tenant_id and o.archived_at is null
  where e.person_id=p_person_id and e.tenant_id=p_tenant_id and e.is_current
  order by e.started_on desc nulls last,e.updated_at desc,e.id limit 1;
  select coalesce(jsonb_agg(x.item order by x.occurred_at desc),'[]'::jsonb) into v_interactions from (
    select i.occurred_at,jsonb_build_object('interaction_id',i.id,'summary',i.summary,'occurred_at',i.occurred_at,'channel',i.channel) item
    from djm_os.interactions i where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id and i.person_id=p_person_id
    order by i.occurred_at desc limit 20
  ) x;
  select coalesce(jsonb_agg(x.item order by x.due_at nulls last),'[]'::jsonb) into v_tasks from (
    select t.due_at,jsonb_build_object('task_id',t.id,'title',t.title,'due_at',t.due_at,'status',t.status) item
    from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=p_user_id and t.person_id=p_person_id
      and t.status not in ('completed','done','cancelled') order by t.due_at nulls last limit 20
  ) x;
  select coalesce(jsonb_agg(x.item order by x.starts_at),'[]'::jsonb) into v_meetings from (
    select m.starts_at,jsonb_build_object('meeting_id',m.id,'title',m.title,'starts_at',m.starts_at,'meeting_url',m.meeting_url) item
    from djm_os.meetings m where m.tenant_id=p_tenant_id and m.owner_user_id=p_user_id and m.person_id=p_person_id
      and m.status='scheduled' order by m.starts_at limit 20
  ) x;
  select jsonb_build_object('owner_user_id',r.team_member_id,'owner_name',tm.display_name,
    'strength_score',r.strength_score,'access_score',r.access_score,'trust_score',r.trust_score,
    'first_known_at',r.first_known_at,'last_meaningful_at',r.last_meaningful_at,'notes',r.relationship_notes)
  into v_route from djm_os.relationships r
  left join djm_os.team_members tm on tm.user_id=r.team_member_id
  where r.tenant_id=p_tenant_id and r.person_id=p_person_id and r.team_member_id=p_user_id;
  select max(occurred_at) into v_last_meaningful from (
    select i.occurred_at from djm_os.interactions i where i.tenant_id=p_tenant_id and i.person_id=p_person_id and i.team_member_id=p_user_id
    union all select r.last_meaningful_at from djm_os.relationships r where r.tenant_id=p_tenant_id and r.person_id=p_person_id and r.team_member_id=p_user_id
  ) own_activity;
  return jsonb_build_object('person_id',p_person_id,'person',v_person,'employment',v_employment,
    'reach',v_reach,'contact_methods',v_methods,'external_profiles',v_profiles,
    'relationship_memory',jsonb_build_object(
      'best_route',v_route,'routes',case when v_route is null then '[]'::jsonb else jsonb_build_array(v_route) end,
      'last_meaningful_at',v_last_meaningful,'state',case when v_last_meaningful is null then 'not_recorded'
        when v_last_meaningful>=now()-interval '45 days' then 'current'
        when v_last_meaningful>=now()-interval '90 days' then 'cooling' else 'cold' end,
      'recent_interactions',v_interactions,'open_tasks',v_tasks,'upcoming_meetings',v_meetings,'active_commitments','[]'::jsonb),
    'access',jsonb_build_object('scope','identity_and_personal','restricted',true));
end;
$$;
revoke all on function public.platform_server_staff_contact(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_staff_contact(uuid,uuid,uuid) to service_role;

create or replace function pg_temp.patch_staff_boundary(p_target regprocedure,p_before text,p_after text)
returns void language plpgsql as $$
declare v_definition text;
begin
  select pg_get_functiondef(p_target::oid) into v_definition;
  if (length(v_definition)-length(replace(v_definition,p_before,'')))/length(p_before)<>1 then
    raise exception 'staff_boundary_definition_drift: %',p_target;
  end if;
  execute replace(v_definition,p_before,p_after);
end;
$$;

select pg_temp.patch_staff_boundary('public.redream_autopilot_home(integer)'::regprocedure,
$boundary$  v_home:=public.platform_server_agency_home(
    v_tenant,
    v_limit
  );$boundary$,
$boundary$  v_home:='{}'::jsonb;
  if private.user_is_tenant_admin(v_tenant,v_user) then
    v_home:=public.platform_server_agency_home(v_tenant,v_limit);
  end if;$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_home(integer)'::regprocedure,
$boundary$  v_policy:=
    public.platform_server_autonomy_policy(
      v_tenant
    );$boundary$,
$boundary$  v_policy:='{}'::jsonb;
  if private.user_is_tenant_admin(v_tenant,v_user) then
    v_policy:=public.platform_server_autonomy_policy(v_tenant);
  end if;$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_home(integer)'::regprocedure,
$boundary$    'generated_at',now(),$boundary$,
$boundary$    'access',jsonb_build_object('scope',case when private.user_is_tenant_admin(v_tenant,v_user) then 'agency' else 'assigned' end,
      'restricted',not private.user_is_tenant_admin(v_tenant,v_user)),
    'generated_at',now(),$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_home(integer)'::regprocedure,
$boundary$Player, club, market and deal signals remain shared agency evidence until they become assigned work.$boundary$,
$boundary$Agency signals require administrator access. Personal tasks and commitments remain owned by the signed-in user.$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_relationships(integer,integer)'::regprocedure,
$boundary$  v_clubs :=
    public.redream_autopilot_clubs($boundary$,
$boundary$  if not private.user_is_tenant_admin(v_tenant,auth.uid()) then
    return public.platform_server_staff_network(v_tenant,auth.uid(),p_limit,p_contact_limit);
  end if;
  v_clubs :=
    public.redream_autopilot_clubs($boundary$);

select pg_temp.patch_staff_boundary('public.redream_club_account(uuid)'::regprocedure,
$boundary$  return public.platform_server_club_account(v_tenant,p_organisation_id);$boundary$,
$boundary$  if not private.user_is_tenant_admin(v_tenant,auth.uid()) then
    return public.platform_server_staff_club_identity(v_tenant,auth.uid(),p_organisation_id);
  end if;
  return public.platform_server_club_account(v_tenant,p_organisation_id);$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_calendar(integer,integer)'::regprocedure,
$boundary$  v_operations := public.redream_autopilot_operations(
    v_horizon,
    v_limit
  );$boundary$,
$boundary$  v_operations:=jsonb_build_object('access',jsonb_build_object('scope','personal','restricted',true));
  if private.user_is_tenant_admin(v_tenant,v_user) then
    v_operations:=public.redream_autopilot_operations(v_horizon,v_limit);
  end if;$boundary$);

select pg_temp.patch_staff_boundary('public.redream_calendar_range(date,date,text)'::regprocedure,
$boundary$  v_operations := public.redream_autopilot_operations(
    v_horizon,
    v_limit
  );$boundary$,
$boundary$  v_operations:=jsonb_build_object('access',jsonb_build_object('scope','personal','restricted',true));
  if private.user_is_tenant_admin(v_tenant,v_user) then
    v_operations:=public.redream_autopilot_operations(v_horizon,v_limit);
  end if;$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_meeting_brief(uuid,uuid,uuid)'::regprocedure,
$boundary$  if v_meeting.person_id is not null then$boundary$,
$boundary$  if not private.user_is_tenant_admin(p_tenant_id,p_user_id) then
    return jsonb_build_object(
      'contract_version','redream_meeting_personal_brief_v2',
      'access',jsonb_build_object('scope','personal','restricted',true),
      'meeting',(to_jsonb(v_meeting)-'id')||jsonb_build_object('meeting_id',v_meeting.id),
      'relationship_memory',jsonb_build_object(
        'recent_interactions',coalesce((select jsonb_agg(x.item order by x.occurred_at desc) from (
          select i.occurred_at,jsonb_build_object('interaction_id',i.id,'summary',i.summary,'occurred_at',i.occurred_at,'channel',i.channel) item
          from djm_os.interactions i where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id and i.person_id=v_meeting.person_id
          order by i.occurred_at desc limit 3
        ) x),'[]'::jsonb),
        'open_tasks',coalesce((select jsonb_agg(x.item order by x.due_at nulls last) from (
          select t.due_at,jsonb_build_object('task_id',t.id,'title',t.title,'due_at',t.due_at) item
          from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=p_user_id and t.person_id=v_meeting.person_id
            and t.status not in ('done','completed','cancelled') order by t.due_at nulls last limit 3
        ) x),'[]'::jsonb)
      )
    );
  end if;
  if v_meeting.person_id is not null then$boundary$);

select pg_temp.patch_staff_boundary('public.redream_relationship_person(uuid)'::regprocedure,
$boundary$  return public.platform_server_relationship_person($boundary$,
$boundary$  if not private.user_is_tenant_admin(v_tenant,auth.uid()) then
    return public.platform_server_staff_contact(v_tenant,auth.uid(),p_person_id);
  end if;
  return public.platform_server_relationship_person($boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_relationship_add_work(uuid,uuid,uuid,text,text,timestamp with time zone)'::regprocedure,
$boundary$  return public.platform_server_relationship_person($boundary$,
$boundary$  if not private.user_is_tenant_admin(p_tenant_id,p_actor_user_id) then
    return public.platform_server_staff_contact(p_tenant_id,p_actor_user_id,p_person_id);
  end if;
  return public.platform_server_relationship_person($boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_relationship_record_interaction(uuid,uuid,uuid,text,text,timestamp with time zone)'::regprocedure,
$boundary$  return public.platform_server_relationship_person($boundary$,
$boundary$  if not private.user_is_tenant_admin(p_tenant_id,p_actor_user_id) then
    return public.platform_server_staff_contact(p_tenant_id,p_actor_user_id,p_person_id);
  end if;
  return public.platform_server_relationship_person($boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_relationship_update_route(uuid,uuid,uuid,smallint,smallint,smallint,text)'::regprocedure,
$boundary$  return public.platform_server_relationship_person($boundary$,
$boundary$  if not private.user_is_tenant_admin(p_tenant_id,p_actor_user_id) then
    return public.platform_server_staff_contact(p_tenant_id,p_actor_user_id,p_person_id);
  end if;
  return public.platform_server_relationship_person($boundary$);

commit;
