create table if not exists djm_os.memories (
  id uuid primary key default gen_random_uuid(), memory_type text not null default 'observation', statement text not null,
  person_id uuid references djm_os.people(id) on delete cascade, organisation_id uuid references djm_os.organisations(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade, prospect_id uuid references djm_os.scouting_prospects(id) on delete cascade,
  club_need_id uuid references djm_os.club_needs(id) on delete cascade, confidence numeric not null default 0.7 check (confidence between 0 and 1),
  source_url text, source_kind text, source_label text, observed_at timestamptz not null default now(), valid_until timestamptz,
  status text not null default 'active' check (status in ('active','stale','contradicted','archived')),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(person_id,organisation_id,player_id,prospect_id,club_need_id) >= 1)
);
create index if not exists idx_memories_person on djm_os.memories(person_id) where person_id is not null;
create index if not exists idx_memories_org on djm_os.memories(organisation_id) where organisation_id is not null;
create index if not exists idx_memories_player on djm_os.memories(player_id) where player_id is not null;
create index if not exists idx_memories_prospect on djm_os.memories(prospect_id) where prospect_id is not null;
create index if not exists idx_memories_need on djm_os.memories(club_need_id) where club_need_id is not null;
create index if not exists idx_memories_active on djm_os.memories(status,observed_at desc);
alter table djm_os.memories enable row level security;
drop policy if exists team_memories_all on djm_os.memories;
create policy team_memories_all on djm_os.memories for all to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
grant select,insert,update,delete on djm_os.memories to authenticated;

create table if not exists djm_os.relationship_edges (
  id uuid primary key default gen_random_uuid(), from_type text not null, from_id uuid not null, to_type text not null, to_id uuid not null,
  relation_type text not null, strength smallint not null default 50 check (strength between 0 and 100), confidence numeric not null default 0.7 check (confidence between 0 and 1),
  source_url text, source_kind text, observed_at timestamptz not null default now(), valid_until timestamptz,
  status text not null default 'active' check (status in ('active','stale','contradicted','archived')), notes text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(from_type,from_id,to_type,to_id,relation_type)
);
create index if not exists idx_relationship_edges_from on djm_os.relationship_edges(from_type,from_id,status);
create index if not exists idx_relationship_edges_to on djm_os.relationship_edges(to_type,to_id,status);
alter table djm_os.relationship_edges enable row level security;
drop policy if exists team_relationship_edges_all on djm_os.relationship_edges;
create policy team_relationship_edges_all on djm_os.relationship_edges for all to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
grant select,insert,update,delete on djm_os.relationship_edges to authenticated;

create table if not exists djm_os.market_signals (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null check (signal_type in ('confirmed_need','likely_need','player_move','squad_gap','contract_signal','club_change','djm_hypothesis','other')),
  organisation_id uuid references djm_os.organisations(id) on delete cascade, person_id uuid references djm_os.people(id) on delete set null,
  player_id uuid references public.players(id) on delete set null, prospect_id uuid references djm_os.scouting_prospects(id) on delete set null,
  title text not null, detail text, confidence numeric not null default 0.5 check (confidence between 0 and 1), urgency smallint not null default 3 check (urgency between 1 and 5),
  status text not null default 'active' check (status in ('active','watching','converted','dismissed','expired')),
  source_url text, source_kind text, observed_at timestamptz not null default now(), expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_market_signals_active on djm_os.market_signals(status,urgency desc,confidence desc,observed_at desc);
create index if not exists idx_market_signals_org on djm_os.market_signals(organisation_id) where organisation_id is not null;
alter table djm_os.market_signals enable row level security;
drop policy if exists team_market_signals_all on djm_os.market_signals;
create policy team_market_signals_all on djm_os.market_signals for all to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
grant select,insert,update,delete on djm_os.market_signals to authenticated;

create or replace function public.djm_add_memory(p_statement text,p_memory_type text default 'observation',p_person_id uuid default null,p_organisation_id uuid default null,p_player_id uuid default null,p_prospect_id uuid default null,p_club_need_id uuid default null,p_confidence numeric default 0.7,p_source_url text default null,p_source_kind text default null,p_source_label text default null,p_observed_at timestamptz default now(),p_valid_until timestamptz default null)
returns jsonb language plpgsql set search_path='' as $$ declare v_id uuid; begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if coalesce(length(trim(p_statement)),0)<3 then raise exception 'Memory statement is required'; end if;
  insert into djm_os.memories(memory_type,statement,person_id,organisation_id,player_id,prospect_id,club_need_id,confidence,source_url,source_kind,source_label,observed_at,valid_until,created_by)
  values(coalesce(nullif(trim(p_memory_type),''),'observation'),trim(p_statement),p_person_id,p_organisation_id,p_player_id,p_prospect_id,p_club_need_id,greatest(0,least(1,coalesce(p_confidence,0.7))),nullif(trim(p_source_url),''),nullif(trim(p_source_kind),''),nullif(trim(p_source_label),''),coalesce(p_observed_at,now()),p_valid_until,(select auth.uid())) returning id into v_id;
  return jsonb_build_object('memory_id',v_id);
end $$;
grant execute on function public.djm_add_memory(text,text,uuid,uuid,uuid,uuid,uuid,numeric,text,text,text,timestamptz,timestamptz) to authenticated;

create or replace function public.djm_add_relationship_edge(p_from_type text,p_from_id uuid,p_to_type text,p_to_id uuid,p_relation_type text,p_strength smallint default 50,p_confidence numeric default 0.7,p_source_url text default null,p_source_kind text default null,p_notes text default null)
returns jsonb language plpgsql set search_path='' as $$ declare v_id uuid; begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  insert into djm_os.relationship_edges(from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_url,source_kind,notes,created_by)
  values(trim(p_from_type),p_from_id,trim(p_to_type),p_to_id,trim(p_relation_type),greatest(0,least(100,p_strength)),greatest(0,least(1,p_confidence)),nullif(trim(p_source_url),''),nullif(trim(p_source_kind),''),nullif(trim(p_notes),''),(select auth.uid()))
  on conflict(from_type,from_id,to_type,to_id,relation_type) do update set strength=excluded.strength,confidence=excluded.confidence,source_url=coalesce(excluded.source_url,djm_os.relationship_edges.source_url),source_kind=coalesce(excluded.source_kind,djm_os.relationship_edges.source_kind),notes=coalesce(excluded.notes,djm_os.relationship_edges.notes),observed_at=now(),updated_at=now(),status='active' returning id into v_id;
  return jsonb_build_object('edge_id',v_id);
end $$;
grant execute on function public.djm_add_relationship_edge(text,uuid,text,uuid,text,smallint,numeric,text,text,text) to authenticated;

create or replace function public.djm_universal_search(p_query text,p_limit integer default 30)
returns table(entity_type text,entity_id uuid,title text,subtitle text,detail text,score integer) language sql stable set search_path='' as $$
with q as (select lower(trim(coalesce(p_query,''))) v), results(entity_type,entity_id,title,subtitle,detail,score) as (
 select 'club_contact'::text,p.id,p.full_name,coalesce(e.role_title,'')||case when o.name is not null then ' · '||o.name else '' end,coalesce(cm.value,''),case when lower(p.full_name)=q.v then 100 when lower(p.full_name) like q.v||'%' then 90 else 70 end
 from djm_os.people p cross join q left join lateral (select e.* from djm_os.employments e where e.person_id=p.id and e.is_current order by e.updated_at desc limit 1) e on true left join djm_os.organisations o on o.id=e.organisation_id left join lateral (select value from djm_os.contact_methods c where c.person_id=p.id and c.channel='whatsapp' limit 1) cm on true
 where p.person_type in ('club_contact','contact','club_staff','coach','sporting_director','recruitment') and (q.v='' or lower(coalesce(p.full_name,'')||' '||coalesce(e.role_title,'')||' '||coalesce(o.name,'')||' '||coalesce(cm.value,'')) like '%'||q.v||'%')
 union all select 'club',o.id,o.name,coalesce(o.city,'')||case when o.country is not null then ', '||o.country else '' end,coalesce(o.website_url,''),case when lower(o.name)=q.v then 100 when lower(o.name) like q.v||'%' then 90 else 70 end from djm_os.organisations o cross join q where q.v='' or lower(coalesce(o.name,'')||' '||coalesce(o.city,'')||' '||coalesce(o.country,'')) like '%'||q.v||'%'
 union all select 'signed_player',p.id,coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,''))),coalesce(p.primary_position,'')||case when p.current_club is not null then ' · '||p.current_club else '' end,coalesce(p.current_country,''),80 from public.players p cross join q where q.v='' or lower(coalesce(p.preferred_name,'')||' '||coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')||' '||coalesce(p.current_club,'')||' '||coalesce(p.primary_position,'')) like '%'||q.v||'%'
 union all select 'recruitment_target',s.id,s.full_name,coalesce(s.primary_position,'')||case when s.current_club is not null then ' · '||s.current_club else '' end,coalesce(s.recruitment_stage,''),75 from djm_os.scouting_prospects s cross join q where s.linked_player_id is null and coalesce(s.availability_status,'')<>'signed_djm' and (q.v='' or lower(coalesce(s.full_name,'')||' '||coalesce(s.current_club,'')||' '||coalesce(s.primary_position,'')||' '||coalesce(s.notes,'')) like '%'||q.v||'%')
 union all select 'memory',m.id,left(m.statement,90),coalesce(m.memory_type,'memory'),coalesce(m.source_label,m.source_kind,''),65 from djm_os.memories m cross join q where m.status='active' and (q.v='' or lower(m.statement) like '%'||q.v||'%')
 union all select 'club_need',n.id,coalesce(n.title,n.position),coalesce(o.name,'')||case when n.position is not null then ' · '||n.position else '' end,coalesce(n.profile_notes,''),70 from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id cross join q where n.status in ('active','open','confirmed') and (q.v='' or lower(coalesce(n.title,'')||' '||coalesce(n.position,'')||' '||coalesce(o.name,'')||' '||coalesce(n.profile_notes,'')) like '%'||q.v||'%')
)
select entity_type,entity_id,title,subtitle,detail,score from results order by score desc,title limit greatest(1,least(coalesce(p_limit,30),100));
$$;
grant execute on function public.djm_universal_search(text,integer) to authenticated;

create or replace function public.djm_entity_memories(p_entity_type text,p_entity_id uuid,p_limit integer default 25)
returns table(id uuid,memory_type text,statement text,confidence numeric,source_url text,source_kind text,source_label text,observed_at timestamptz,valid_until timestamptz,status text) language sql stable set search_path='' as $$
select m.id,m.memory_type,m.statement,m.confidence,m.source_url,m.source_kind,m.source_label,m.observed_at,m.valid_until,m.status from djm_os.memories m
where (p_entity_type='person' and m.person_id=p_entity_id) or (p_entity_type='club' and m.organisation_id=p_entity_id) or (p_entity_type='signed_player' and m.player_id=p_entity_id) or (p_entity_type='recruitment_target' and m.prospect_id=p_entity_id) or (p_entity_type='club_need' and m.club_need_id=p_entity_id)
order by m.observed_at desc limit greatest(1,least(coalesce(p_limit,25),100));
$$;
grant execute on function public.djm_entity_memories(text,uuid,integer) to authenticated;

create or replace function public.djm_market_deal_probability(p_need_id uuid,p_player_id uuid default null,p_prospect_id uuid default null)
returns jsonb language plpgsql stable set search_path='' as $$ declare v_fit numeric:=50;v_access numeric:=40;v_demand numeric:=60;v_timing numeric:=55;v_willing numeric:=55;v_total numeric;v_org uuid; begin
  select organisation_id,coalesce(confidence,0.6)*100 into v_org,v_demand from djm_os.club_needs where id=p_need_id;
  if p_player_id is not null then select coalesce(overall_score,50) into v_fit from djm_os.player_matches where club_need_id=p_need_id and player_id=p_player_id order by updated_at desc limit 1; select case when pmf.market_preferences is not null then 75 else 55 end into v_willing from djm_os.player_market_facts pmf where pmf.player_id=p_player_id limit 1;
  elsif p_prospect_id is not null then select coalesce(match_score,50) into v_fit from public.djm_scout_need_matches(p_need_id) where prospect_id=p_prospect_id limit 1; select case when availability_status in ('available','approachable') then 75 when availability_status='not_interested' then 20 else 50 end into v_willing from djm_os.scouting_prospects where id=p_prospect_id; end if;
  select coalesce(max(route_score),40) into v_access from public.djm_best_route_to_club(v_org);
  v_timing:=case when exists(select 1 from djm_os.club_needs n where n.id=p_need_id and n.expires_at is not null and n.expires_at < now()+interval '14 days') then 80 else 60 end;
  v_total:=round(v_fit*0.35+v_access*0.2+v_demand*0.2+v_willing*0.15+v_timing*0.1);
  return jsonb_build_object('probability',greatest(0,least(95,v_total)),'football_fit',round(v_fit),'djm_access',round(v_access),'demand_confidence',round(v_demand),'player_willingness',round(v_willing),'timing',round(v_timing),'model','heuristic_v1');
end $$;
grant execute on function public.djm_market_deal_probability(uuid,uuid,uuid) to authenticated;

create or replace function public.djm_home()
returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object(
 'network',jsonb_build_object('clubs',(select count(*) from djm_os.organisations),'club_contacts',(select count(*) from djm_os.people where person_type in ('club_contact','contact','club_staff','coach','sporting_director','recruitment')),'open_tasks',(select count(*) from djm_os.tasks where status not in ('done','completed','cancelled')),'review_items',(select count(*) from djm_os.review_items where status='open')),
 'recruitment',jsonb_build_object('active',(select count(*) from djm_os.scouting_prospects where linked_player_id is null and recruitment_stage not in ('signed','declined','lost')),'hot',(select count(*) from djm_os.scouting_prospects where linked_player_id is null and recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')),'overdue',(select count(*) from djm_os.scouting_prospects where linked_player_id is null and next_action_at<now() and recruitment_stage not in ('signed','declined','lost'))),
 'market',jsonb_build_object('active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),'active_signals',(select count(*) from djm_os.market_signals where status in ('active','watching')),'strong_matches',(select count(*) from djm_os.player_matches where status not in ('dismissed','rejected') and overall_score>=80)),
 'top_actions',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from (
   select 'task'::text kind,t.id entity_id,t.title,(coalesce(t.priority,3)*20)::integer score,t.due_at action_at from djm_os.tasks t where t.status not in ('done','completed','cancelled')
   union all select 'recruitment',s.id,'Follow up: '||s.full_name,(coalesce(s.recruitment_priority,3)*20)::integer,s.next_action_at from djm_os.scouting_prospects s where s.linked_player_id is null and s.next_action_at is not null and s.recruitment_stage not in ('signed','declined','lost')
   union all select 'signal',ms.id,ms.title,(ms.urgency*20)::integer,ms.observed_at from djm_os.market_signals ms where ms.status in ('active','watching')
 ) u order by score desc,action_at nulls last limit 12) x),'[]'::jsonb)
);
$$;
grant execute on function public.djm_home() to authenticated;
