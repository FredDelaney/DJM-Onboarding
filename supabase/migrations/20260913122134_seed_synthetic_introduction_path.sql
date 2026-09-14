alter function public.platform_server_seed_demo_access_story(uuid) rename to platform_server_seed_demo_access_story_core_v1;

create or replace function public.platform_server_seed_demo_access_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_core jsonb;
  v_meta jsonb;
  v_owner uuid;
  v_thomas uuid;
  v_luca uuid;
  v_riverton uuid;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_access_seed_requires_synthetic_tenant'; end if;

  v_core:=public.platform_server_seed_demo_access_story_core_v1(p_tenant_id);

  select m.user_id into v_owner
  from platform.tenant_memberships m
  join djm_os.team_members tm on tm.user_id=m.user_id and tm.is_active=true
  where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations')
  order by case m.role when 'owner' then 1 when 'admin' then 2 when 'agent' then 3 else 4 end,m.created_at
  limit 1;

  select id into v_thomas from djm_os.people where tenant_id=p_tenant_id and canonical_key='synthetic:northstar:riverton:thomas-de-smet' limit 1;
  select id into v_riverton from djm_os.organisations where tenant_id=p_tenant_id and canonical_key='demo:riverton-united' limit 1;
  if v_owner is null or v_thomas is null or v_riverton is null then raise exception 'demo_introduction_seed_dependencies_missing'; end if;

  insert into djm_os.people(full_name,preferred_name,person_type,country,city,canonical_key,source_confidence,last_verified_at,tenant_id)
  values('Luca Moretti','Luca','intermediary','Italy','Milan','synthetic:northstar:intro:luca-moretti',1.0,now(),p_tenant_id)
  on conflict (canonical_key) where canonical_key is not null do update
    set full_name=excluded.full_name,preferred_name=excluded.preferred_name,person_type=excluded.person_type,country=excluded.country,city=excluded.city,
        source_confidence=1.0,last_verified_at=now(),updated_at=now(),tenant_id=p_tenant_id
  returning id into v_luca;

  insert into djm_os.relationships(team_member_id,person_id,strength_score,access_score,trust_score,last_meaningful_at,first_known_at,relationship_notes,tenant_id)
  values(v_owner,v_luca,84,88,86,now()-interval '9 days',now()-interval '600 days','Synthetic Northstar intermediary relationship for product demonstration.',p_tenant_id)
  on conflict (team_member_id,person_id) do update
    set strength_score=excluded.strength_score,access_score=excluded.access_score,trust_score=excluded.trust_score,
        last_meaningful_at=excluded.last_meaningful_at,first_known_at=excluded.first_known_at,
        relationship_notes=excluded.relationship_notes,tenant_id=p_tenant_id,updated_at=now();

  insert into djm_os.relationship_edges(tenant_id,from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_kind,observed_at,status,notes,created_by)
  values(p_tenant_id,'person',v_luca,'person',v_thomas,'professional_relationship',88,0.95,'synthetic_demo',now()-interval '20 days','active','Synthetic professional relationship used to demonstrate a warm introduction path.',v_owner)
  on conflict (tenant_id,from_type,from_id,to_type,to_id,relation_type) do update
    set strength=excluded.strength,confidence=excluded.confidence,source_kind=excluded.source_kind,observed_at=excluded.observed_at,status='active',notes=excluded.notes,created_by=excluded.created_by,updated_at=now();

  delete from djm_os.interactions where tenant_id=p_tenant_id and source_external_id='synthetic:northstar:access:intro:luca-moretti';
  insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,source_external_id,source_type,raw_text,summary,confidence,tenant_id)
  values(now()-interval '9 days','whatsapp','outgoing',v_owner,v_luca,'synthetic:northstar:access:intro:luca-moretti','synthetic_demo',
    'Synthetic relationship demonstration interaction.','Warm intermediary relationship with a credible route to Riverton technical leadership.',1.0,p_tenant_id);

  return v_core || jsonb_build_object(
    'introduction_story',jsonb_build_object(
      'synthetic',true,'intermediary_person_id',v_luca,'target_person_id',v_thomas,'target_organisation_id',v_riverton,
      'relationship_edge_strength',88,'relationship_edge_confidence',0.95
    )
  );
end;
$$;

revoke all on function public.platform_server_seed_demo_access_story_core_v1(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_seed_demo_access_story(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_access_story_core_v1(uuid) to service_role;
grant execute on function public.platform_server_seed_demo_access_story(uuid) to service_role;;
