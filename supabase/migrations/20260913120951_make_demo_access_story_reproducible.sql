alter function public.platform_server_seed_demo_story(uuid) rename to platform_server_seed_demo_story_core_v2;

create or replace function public.platform_server_seed_demo_access_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_meta jsonb;
  v_owner uuid;
  v_westhaven uuid;
  v_nordstadt uuid;
  v_riverton uuid;
  v_milan uuid;
  v_sofia uuid;
  v_klara uuid;
  v_thomas uuid;
begin
  select t.metadata into v_meta from platform.tenants t where t.id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_access_seed_requires_synthetic_tenant'; end if;

  select m.user_id into v_owner
  from platform.tenant_memberships m
  join djm_os.team_members tm on tm.user_id=m.user_id and tm.is_active=true
  where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations')
  order by case m.role when 'owner' then 1 when 'admin' then 2 when 'agent' then 3 else 4 end,m.created_at
  limit 1;
  if v_owner is null then raise exception 'demo_access_seed_requires_active_staff_member'; end if;

  select id into v_westhaven from djm_os.organisations where tenant_id=p_tenant_id and canonical_key='demo:westhaven-fc' limit 1;
  select id into v_nordstadt from djm_os.organisations where tenant_id=p_tenant_id and canonical_key='demo:nordstadt-04' limit 1;
  select id into v_riverton from djm_os.organisations where tenant_id=p_tenant_id and canonical_key='demo:riverton-united' limit 1;
  if v_westhaven is null or v_nordstadt is null or v_riverton is null then raise exception 'demo_core_organisations_missing'; end if;

  insert into djm_os.people(full_name,preferred_name,person_type,country,city,canonical_key,source_confidence,last_verified_at,tenant_id)
  values('Milan de Vries','Milan','club_staff','Netherlands','Rotterdam','synthetic:northstar:westhaven:milan-de-vries',1.0,now(),p_tenant_id)
  on conflict (canonical_key) where canonical_key is not null do update
    set full_name=excluded.full_name,preferred_name=excluded.preferred_name,person_type=excluded.person_type,country=excluded.country,city=excluded.city,source_confidence=1.0,last_verified_at=now(),updated_at=now(),tenant_id=p_tenant_id
  returning id into v_milan;

  insert into djm_os.people(full_name,preferred_name,person_type,country,city,canonical_key,source_confidence,last_verified_at,tenant_id)
  values('Sofia van Dijk','Sofia','club_staff','Netherlands','Rotterdam','synthetic:northstar:westhaven:sofia-van-dijk',1.0,now(),p_tenant_id)
  on conflict (canonical_key) where canonical_key is not null do update
    set full_name=excluded.full_name,preferred_name=excluded.preferred_name,person_type=excluded.person_type,country=excluded.country,city=excluded.city,source_confidence=1.0,last_verified_at=now(),updated_at=now(),tenant_id=p_tenant_id
  returning id into v_sofia;

  insert into djm_os.people(full_name,preferred_name,person_type,country,city,canonical_key,source_confidence,last_verified_at,tenant_id)
  values('Klara Vogt','Klara','club_staff','Germany','Hamburg','synthetic:northstar:nordstadt:klara-vogt',1.0,now(),p_tenant_id)
  on conflict (canonical_key) where canonical_key is not null do update
    set full_name=excluded.full_name,preferred_name=excluded.preferred_name,person_type=excluded.person_type,country=excluded.country,city=excluded.city,source_confidence=1.0,last_verified_at=now(),updated_at=now(),tenant_id=p_tenant_id
  returning id into v_klara;

  insert into djm_os.people(full_name,preferred_name,person_type,country,city,canonical_key,source_confidence,last_verified_at,tenant_id)
  values('Thomas De Smet','Thomas','club_staff','Belgium','Antwerp','synthetic:northstar:riverton:thomas-de-smet',1.0,now(),p_tenant_id)
  on conflict (canonical_key) where canonical_key is not null do update
    set full_name=excluded.full_name,preferred_name=excluded.preferred_name,person_type=excluded.person_type,country=excluded.country,city=excluded.city,source_confidence=1.0,last_verified_at=now(),updated_at=now(),tenant_id=p_tenant_id
  returning id into v_thomas;

  delete from djm_os.employments where tenant_id=p_tenant_id and person_id in (v_milan,v_sofia,v_klara,v_thomas);
  insert into djm_os.employments(person_id,organisation_id,role_title,department,started_on,is_current,confidence,last_verified_at,tenant_id) values
    (v_milan,v_westhaven,'Sporting Director','Football',current_date-900,true,1.0,now(),p_tenant_id),
    (v_sofia,v_westhaven,'Head of Recruitment','Recruitment',current_date-700,true,1.0,now(),p_tenant_id),
    (v_klara,v_nordstadt,'Head of Recruitment','Recruitment',current_date-650,true,1.0,now(),p_tenant_id),
    (v_thomas,v_riverton,'Technical Director','Football',current_date-1000,true,1.0,now(),p_tenant_id);

  insert into djm_os.relationships(team_member_id,person_id,strength_score,access_score,trust_score,last_meaningful_at,first_known_at,relationship_notes,tenant_id)
  values
    (v_owner,v_milan,84,91,86,now()-interval '4 days',now()-interval '420 days','Synthetic Northstar relationship for product demonstration.',p_tenant_id),
    (v_owner,v_sofia,62,70,68,now()-interval '19 days',now()-interval '300 days','Synthetic Northstar relationship for product demonstration.',p_tenant_id),
    (v_owner,v_klara,66,74,71,now()-interval '17 days',now()-interval '270 days','Synthetic Northstar relationship for product demonstration.',p_tenant_id),
    (v_owner,v_thomas,48,57,54,now()-interval '63 days',now()-interval '520 days','Synthetic Northstar relationship for product demonstration.',p_tenant_id)
  on conflict (team_member_id,person_id) do update
    set strength_score=excluded.strength_score,access_score=excluded.access_score,trust_score=excluded.trust_score,
        last_meaningful_at=excluded.last_meaningful_at,first_known_at=excluded.first_known_at,
        relationship_notes=excluded.relationship_notes,tenant_id=p_tenant_id,updated_at=now();

  delete from djm_os.interactions
  where tenant_id=p_tenant_id and source_external_id like 'synthetic:northstar:access:%';

  insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,organisation_id,source_external_id,source_type,raw_text,summary,confidence,tenant_id) values
    (now()-interval '4 days','whatsapp','outgoing',v_owner,v_milan,v_westhaven,'synthetic:northstar:access:westhaven:milan-de-vries','synthetic_demo','Synthetic relationship demonstration interaction.','Recent direct contact about recruitment priorities and player availability.',1.0,p_tenant_id),
    (now()-interval '19 days','whatsapp','outgoing',v_owner,v_sofia,v_westhaven,'synthetic:northstar:access:westhaven:sofia-van-dijk','synthetic_demo','Synthetic relationship demonstration interaction.','Recruitment contact remains usable but is secondary to the sporting director relationship.',1.0,p_tenant_id),
    (now()-interval '17 days','whatsapp','outgoing',v_owner,v_klara,v_nordstadt,'synthetic:northstar:access:nordstadt:klara-vogt','synthetic_demo','Synthetic relationship demonstration interaction.','Recruitment conversation remains warm enough for a direct follow-up.',1.0,p_tenant_id),
    (now()-interval '63 days','whatsapp','outgoing',v_owner,v_thomas,v_riverton,'synthetic:northstar:access:riverton:thomas-de-smet','synthetic_demo','Synthetic relationship demonstration interaction.','Historic technical-director relationship, currently less active.',1.0,p_tenant_id);

  update platform.tenant_customer_lifecycle
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('demo_access_story_version','v1','synthetic_relationships',true),updated_at=now()
  where tenant_id=p_tenant_id;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'synthetic',true,'access_story_version','v1',
    'people',4,'current_employments',4,'relationships',4,'relationship_interactions',4,
    'network_coverage',public.platform_server_network_coverage(p_tenant_id)
  );
end;
$$;

create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_core jsonb;
  v_access jsonb;
begin
  v_core:=public.platform_server_seed_demo_story_core_v2(p_tenant_id);
  v_access:=public.platform_server_seed_demo_access_story(p_tenant_id);
  return v_core || jsonb_build_object(
    'story_version','v3',
    'access_story',v_access,
    'executive_home',public.platform_server_agency_home_executive(p_tenant_id,5)
  );
end;
$$;

revoke all on function public.platform_server_seed_demo_story_core_v2(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_seed_demo_access_story(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_seed_demo_story(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_story_core_v2(uuid) to service_role;
grant execute on function public.platform_server_seed_demo_access_story(uuid) to service_role;
grant execute on function public.platform_server_seed_demo_story(uuid) to service_role;;
