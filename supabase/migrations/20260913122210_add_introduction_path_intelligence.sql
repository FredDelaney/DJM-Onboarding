create or replace function public.platform_server_introduction_routes(p_tenant_id uuid, p_organisation_id uuid, p_limit integer default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),20));
  v_routes jsonb;
  v_org djm_os.organisations%rowtype;
begin
  select * into v_org from djm_os.organisations o where o.id=p_organisation_id and o.tenant_id=p_tenant_id;
  if not found then raise exception 'organisation_not_found_for_tenant'; end if;

  with target_staff as (
    select p.id as target_person_id,p.full_name as target_name,e.role_title,
           case
             when lower(coalesce(e.role_title,'')) like '%sporting director%' then 100
             when lower(coalesce(e.role_title,'')) like '%football director%' then 100
             when lower(coalesce(e.role_title,'')) like '%head of recruitment%' then 100
             when lower(coalesce(e.role_title,'')) like '%technical director%' then 95
             when lower(coalesce(e.role_title,'')) like '%recruit%' then 90
             when lower(coalesce(e.role_title,'')) like '%director%' then 85
             when lower(coalesce(e.role_title,'')) like '%coach%' then 70
             else 55 end as role_relevance
    from djm_os.employments e
    join djm_os.people p on p.id=e.person_id and p.tenant_id=p_tenant_id
    where e.tenant_id=p_tenant_id and e.organisation_id=p_organisation_id and e.is_current=true
  ), agency_relationships as (
    select r.team_member_id,r.person_id as intermediary_id,p.full_name as intermediary_name,
           coalesce(r.strength_score,0) as agency_strength,
           coalesce(r.access_score,0) as agency_access,
           coalesce(r.trust_score,0) as agency_trust,
           r.last_meaningful_at,
           tm.display_name as relationship_owner,
           case
             when r.last_meaningful_at is null then 20
             when r.last_meaning_at is not null then 20
             else 20 end as placeholder
    from djm_os.relationships r
    join djm_os.people p on p.id=r.person_id and p.tenant_id=p_tenant_id
    left join djm_os.team_members tm on tm.user_id=r.team_member_id
    where r.tenant_id=p_tenant_id
  ), candidate_paths as (
    select ar.*,ts.target_person_id,ts.target_name,ts.role_title,ts.role_relevance,
           edge.id as edge_id,edge.relation_type,edge.strength as edge_strength,edge.confidence as edge_confidence,edge.observed_at as edge_observed_at,
           coalesce(direct_rel.access_score,0) as direct_access_to_target,
           case
             when ar.last_meaningful_at is null then 20
             when ar.last_meaningful_at>=now()-interval '30 days' then 100
             when ar.last_meaningful_at>=now()-interval '90 days' then 75
             when ar.last_meaningful_at>=now()-interval '180 days' then 50
             else 25 end as agency_recency,
           case
             when edge.observed_at is null then 40
             when edge.observed_at>=now()-interval '30 days' then 100
             when edge.observed_at>=now()-interval '90 days' then 80
             when edge.observed_at>=now()-interval '180 days' then 60
             when edge.observed_at>=now()-interval '365 days' then 40
             else 20 end as edge_recency
    from agency_relationships ar
    join target_staff ts on ts.target_person_id<>ar.intermediary_id
    join djm_os.relationship_edges edge
      on edge.tenant_id=p_tenant_id and edge.status='active'
      and (edge.valid_until is null or edge.valid_until>now())
      and edge.from_type='person' and edge.to_type='person'
      and ((edge.from_id=ar.intermediary_id and edge.to_id=ts.target_person_id)
        or (edge.to_id=ar.intermediary_id and edge.from_id=ts.target_person_id))
    left join djm_os.relationships direct_rel
      on direct_rel.tenant_id=p_tenant_id and direct_rel.team_member_id=ar.team_member_id and direct_rel.person_id=ts.target_person_id
  ), scored as (
    select *,least(100,round(
      agency_access*0.25 + agency_strength*0.20 + agency_trust*0.15 + edge_strength*0.20 +
      (edge_confidence*100)*0.05 + role_relevance*0.10 + least(agency_recency,edge_recency)*0.05
    ))::integer as intro_score
    from candidate_paths
  ), ranked as (
    select *,row_number() over(order by intro_score desc,intermediary_name,target_name) as route_rank
    from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',route_rank,
    'introduction_score',intro_score,
    'introduction_state',case when intro_score>=80 then 'strong_intro' when intro_score>=65 then 'usable_intro' when intro_score>=50 then 'developing_intro' else 'weak_intro' end,
    'intermediary',jsonb_build_object('person_id',intermediary_id,'name',intermediary_name,'relationship_owner_user_id',team_member_id,'relationship_owner_name',relationship_owner),
    'target_contact',jsonb_build_object('person_id',target_person_id,'name',target_name,'role_title',role_title,'role_relevance',role_relevance),
    'target_organisation',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name),
    'agency_relationship',jsonb_build_object('strength',agency_strength,'access',agency_access,'trust',agency_trust,'last_meaningful_at',last_meaningful_at),
    'bridge_relationship',jsonb_build_object('edge_id',edge_id,'relation_type',relation_type,'strength',edge_strength,'confidence',edge_confidence,'observed_at',edge_observed_at),
    'direct_access_to_target',direct_access_to_target,
    'introduction_advantage_points',intro_score-direct_access_to_target,
    'improves_direct_access',intro_score>=direct_access_to_target+15,
    'recommended_action','Ask '||intermediary_name||' for an introduction to '||target_name||case when nullif(trim(role_title),'') is not null then ' ('||role_title||')' else '' end||' at '||v_org.name||'.',
    'why_this_path',case
      when intro_score>=80 then 'The agency relationship and bridge relationship are both strong enough to make this a credible warm-introduction route.'
      when intro_score>=65 then 'A usable introduction route is recorded, but the relationship should be handled deliberately.'
      else 'The path exists, but it is not strong enough to rely on without warming it first.' end,
    'factor_breakdown',jsonb_build_object(
      'agency_access',jsonb_build_object('score',agency_access,'weight',0.25),
      'agency_strength',jsonb_build_object('score',agency_strength,'weight',0.20),
      'agency_trust',jsonb_build_object('score',agency_trust,'weight',0.15),
      'bridge_strength',jsonb_build_object('score',edge_strength,'weight',0.20),
      'bridge_confidence',jsonb_build_object('score',round(edge_confidence*100),'weight',0.05),
      'target_role_relevance',jsonb_build_object('score',role_relevance,'weight',0.10),
      'path_recency',jsonb_build_object('score',least(agency_recency,edge_recency),'weight',0.05)
    )
  ) order by route_rank) filter(where route_rank<=v_limit),'[]'::jsonb)
  into v_routes
  from ranked;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'organisation',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'league_name',v_org.league_name),
    'routes',v_routes,'route_count',jsonb_array_length(v_routes),'best_route',case when jsonb_array_length(v_routes)>0 then v_routes->0 else null end,
    'method',jsonb_build_object(
      'interpretation','Ranks recorded two-hop introduction paths. It measures the strength of a possible introduction, not direct access and not the probability that the introduction will be made.',
      'tenant_isolation','Both intermediary and target people must resolve inside the requested tenant before a graph edge is eligible.'
    )
  );
end;
$$;

revoke all on function public.platform_server_introduction_routes(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_introduction_routes(uuid,uuid,integer) to service_role;;
