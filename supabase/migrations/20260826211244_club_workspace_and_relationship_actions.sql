create or replace function public.djm_network_club_workspace(p_organisation_id uuid)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v jsonb;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  select jsonb_build_object(
    'organisation',(select to_jsonb(x) from (select o.id,o.name,o.organisation_type,o.country,o.city,o.website_url,o.last_verified_at,o.created_at,o.updated_at from djm_os.organisations o where o.id=p_organisation_id) x),
    'contacts',coalesce((select jsonb_agg(to_jsonb(x) order by x.route_score desc,x.full_name) from (
      select p.id,p.full_name,e.role_title,e.department,p.country,p.city,
        (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='whatsapp' order by cm.is_primary desc,cm.updated_at desc limit 1) as whatsapp,
        (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='email' order by cm.is_primary desc,cm.updated_at desc limit 1) as email,
        coalesce((select max(r.strength_score) from djm_os.relationships r where r.person_id=p.id),0)::int as relationship_strength,
        coalesce((select max(r.access_score) from djm_os.relationships r where r.person_id=p.id),0)::int as access_score,
        coalesce((select max(r.strength_score+r.access_score) from djm_os.relationships r where r.person_id=p.id),0)::int as route_score,
        (select tm.display_name from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id where r.person_id=p.id order by (r.strength_score+r.access_score) desc,r.last_meaningful_at desc nulls last limit 1) as best_owner,
        (select max(i.occurred_at) from djm_os.interactions i where i.person_id=p.id) as last_interaction_at
      from djm_os.employments e join djm_os.people p on p.id=e.person_id
      where e.organisation_id=p_organisation_id and e.is_current=true and coalesce(p.person_type,'club_contact')<>'player'
    ) x),'[]'::jsonb),
    'needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
      select n.id,n.title,n.position,n.preferred_foot,n.min_age,n.max_age,n.transfer_type,n.transfer_budget,n.salary_budget,n.currency,n.status,n.confidence,n.confirmed_at,n.expires_at,n.updated_at,
        (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) as match_count,
        (select max(m.overall_score) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) as top_match_score
      from djm_os.club_needs n where n.organisation_id=p_organisation_id
    ) x),'[]'::jsonb),
    'open_tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at nulls last) from (
      select t.id,t.title,t.due_at,t.priority,t.status,t.owner_user_id,tm.display_name as owner_name,t.person_id,p.full_name as person_name
      from djm_os.tasks t left join djm_os.team_members tm on tm.user_id=t.owner_user_id left join djm_os.people p on p.id=t.person_id
      where t.organisation_id=p_organisation_id and t.status not in ('completed','cancelled')
    ) x),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
      select i.id,'interaction'::text as item_type,i.occurred_at,i.channel as subtype,i.summary,i.person_id,p.full_name as person_name,tm.display_name as team_member_name
      from djm_os.interactions i left join djm_os.people p on p.id=i.person_id left join djm_os.team_members tm on tm.user_id=i.team_member_id
      where i.organisation_id=p_organisation_id
      union all
      select e.id,'event'::text,e.occurred_at,e.event_type,coalesce(e.payload->>'summary',replace(lower(e.event_type),'_',' ')),e.person_id,p.full_name,tm.display_name
      from djm_os.events e left join djm_os.people p on p.id=e.person_id left join djm_os.team_members tm on tm.user_id=e.actor_user_id
      where e.organisation_id=p_organisation_id
      order by occurred_at desc limit 100
    ) x),'[]'::jsonb),
    'best_routes',coalesce((select jsonb_agg(to_jsonb(x) order by x.route_score desc) from (select * from public.djm_best_route_to_club(p_organisation_id) limit 8) x),'[]'::jsonb),
    'summary',jsonb_build_object(
      'contact_count',(select count(*) from djm_os.employments e join djm_os.people p on p.id=e.person_id where e.organisation_id=p_organisation_id and e.is_current=true and coalesce(p.person_type,'club_contact')<>'player'),
      'active_need_count',(select count(*) from djm_os.club_needs n where n.organisation_id=p_organisation_id and n.status in ('active','open','confirmed')),
      'open_task_count',(select count(*) from djm_os.tasks t where t.organisation_id=p_organisation_id and t.status not in ('completed','cancelled')),
      'last_interaction_at',(select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=p_organisation_id)
    )
  ) into v;
  return v;
end $$;

grant execute on function public.djm_network_club_workspace(uuid) to authenticated;

create or replace function public.djm_network_update_relationship(
  p_person_id uuid,
  p_strength_score smallint default null,
  p_access_score smallint default null,
  p_trust_score smallint default null,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_strength_score is not null and (p_strength_score<0 or p_strength_score>100) then raise exception 'Strength must be 0-100'; end if;
  if p_access_score is not null and (p_access_score<0 or p_access_score>100) then raise exception 'Access must be 0-100'; end if;
  if p_trust_score is not null and (p_trust_score<0 or p_trust_score>100) then raise exception 'Trust must be 0-100'; end if;

  insert into djm_os.relationships(team_member_id,person_id,strength_score,access_score,trust_score,relationship_notes,first_known_at,updated_at)
  values(v_uid,p_person_id,coalesce(p_strength_score,20),coalesce(p_access_score,20),coalesce(p_trust_score,50),nullif(trim(coalesce(p_notes,'')),''),now(),now())
  on conflict(team_member_id,person_id) do update set
    strength_score=coalesce(p_strength_score,djm_os.relationships.strength_score),
    access_score=coalesce(p_access_score,djm_os.relationships.access_score),
    trust_score=coalesce(p_trust_score,djm_os.relationships.trust_score),
    relationship_notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),djm_os.relationships.relationship_notes),
    updated_at=now();

  insert into djm_os.events(event_type,actor_user_id,person_id,payload,source,confidence,occurred_at)
  values('RELATIONSHIP_UPDATED',v_uid,p_person_id,jsonb_build_object('strength',p_strength_score,'access',p_access_score,'trust',p_trust_score,'notes',p_notes),'network',1,now());
  return jsonb_build_object('ok',true,'person_id',p_person_id);
end $$;

grant execute on function public.djm_network_update_relationship(uuid,smallint,smallint,smallint,text) to authenticated;

create or replace function public.djm_network_log_contact_interaction(
  p_person_id uuid,
  p_channel text,
  p_summary text,
  p_organisation_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_create_followup_at timestamptz default null,
  p_followup_title text default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid:=p_organisation_id; v_i uuid; v_name text;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_channel not in ('whatsapp','linkedin','email','phone','meeting','instagram','other') then raise exception 'Unsupported channel'; end if;
  if length(trim(coalesce(p_summary,'')))<2 then raise exception 'Summary is required'; end if;
  select full_name into v_name from djm_os.people where id=p_person_id and coalesce(person_type,'club_contact')<>'player';
  if v_name is null then raise exception 'Club contact not found'; end if;
  if v_org is null then select organisation_id into v_org from djm_os.employments where person_id=p_person_id and is_current=true order by last_verified_at desc nulls last,updated_at desc limit 1; end if;
  insert into djm_os.interactions(team_member_id,person_id,organisation_id,channel,summary,occurred_at,source)
  values(v_uid,p_person_id,v_org,p_channel,trim(p_summary),coalesce(p_occurred_at,now()),'network_manual') returning id into v_i;
  update djm_os.relationships set last_meaningful_at=greatest(coalesce(last_meaningful_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),updated_at=now() where team_member_id=v_uid and person_id=p_person_id;
  if p_create_followup_at is not null then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(coalesce(nullif(trim(coalesce(p_followup_title,'')),''),'Follow up with '||v_name),'relationship_followup',v_uid,p_person_id,v_org,v_i,p_create_followup_at,'open',3,'network_manual');
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values('CONTACT_INTERACTION_LOGGED',v_uid,p_person_id,v_org,v_i,jsonb_build_object('channel',p_channel,'summary',trim(p_summary)),'network',1,coalesce(p_occurred_at,now()));
  return jsonb_build_object('interaction_id',v_i,'organisation_id',v_org);
end $$;

grant execute on function public.djm_network_log_contact_interaction(uuid,text,text,uuid,timestamptz,timestamptz,text) to authenticated;
