create table if not exists djm_os.source_trust (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_key text not null,
  source_label text,
  reliability_score smallint not null default 50 check (reliability_score between 0 and 100),
  verified_claims integer not null default 0,
  contradicted_claims integer not null default 0,
  notes text,
  last_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_key)
);

alter table djm_os.claims add column if not exists verification_status text not null default 'unverified';
alter table djm_os.claims add column if not exists verified_by uuid references djm_os.team_members(user_id) on delete set null;
alter table djm_os.claims add column if not exists verified_at timestamptz;
alter table djm_os.claims add column if not exists source_key text;

alter table djm_os.source_trust enable row level security;
grant select,insert,update,delete on djm_os.source_trust to authenticated;
create policy djm_team_select on djm_os.source_trust for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.source_trust for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.source_trust for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.source_trust for delete to authenticated using ((select djm_os.is_team_member()));

create or replace function djm_os.refresh_source_trust()
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v integer:=0; begin
  insert into djm_os.source_trust(source_type,source_key,reliability_score,verified_claims,contradicted_claims,last_calculated_at)
  select coalesce(c.claim_type,'claim'),c.source_key,
    greatest(5,least(98,50 + count(*) filter(where c.verification_status='verified')*5 - count(*) filter(where c.verification_status='contradicted')*8))::smallint,
    count(*) filter(where c.verification_status='verified')::int,
    count(*) filter(where c.verification_status='contradicted')::int,
    now()
  from djm_os.claims c where c.source_key is not null group by coalesce(c.claim_type,'claim'),c.source_key
  on conflict(source_type,source_key) do update set reliability_score=excluded.reliability_score,verified_claims=excluded.verified_claims,contradicted_claims=excluded.contradicted_claims,last_calculated_at=now(),updated_at=now();
  get diagnostics v=row_count; return jsonb_build_object('sources_refreshed',v);
end;$$;
revoke all on function djm_os.refresh_source_trust() from public,anon,authenticated;

create or replace function public.djm_verify_claim(p_claim_id uuid,p_status text)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v text:=lower(trim(p_status)); begin if v not in ('verified','contradicted','unverified','stale') then raise exception 'Invalid verification status'; end if; update djm_os.claims set verification_status=v,verified_by=case when v in ('verified','contradicted') then auth.uid() else null end,verified_at=case when v in ('verified','contradicted') then now() else null end,last_verified_at=case when v='verified' then now() else last_verified_at end where id=p_claim_id; if not found then raise exception 'Claim not found'; end if; return jsonb_build_object('claim_id',p_claim_id,'status',v); end; $$;

create or replace function public.djm_search(p_query text,p_limit integer default 30)
returns table(entity_type text,entity_id uuid,title text,subtitle text,score numeric,metadata jsonb)
language sql stable security invoker set search_path=''
as $$
 with q as (select lower(trim(coalesce(p_query,''))) s), results as (
  select 'person'::text as entity_type,p.id as entity_id,p.full_name as title,concat_ws(' · ',e.role_title,o.name,p.country) as subtitle,
    (case when lower(p.full_name)=q.s then 100 when lower(p.full_name) like q.s||'%' then 90 when lower(p.full_name) like '%'||q.s||'%' then 80 else extensions.similarity(lower(p.full_name),q.s)*70 end)::numeric as score,
    jsonb_build_object('club',o.name,'role',e.role_title,'country',p.country) as metadata
  from djm_os.people p cross join q left join lateral(select * from djm_os.employments x where x.person_id=p.id and x.is_current=true order by x.created_at desc limit 1)e on true left join djm_os.organisations o on o.id=e.organisation_id
  where q.s<>'' and (lower(p.full_name) like '%'||q.s||'%' or extensions.similarity(lower(p.full_name),q.s)>=0.35)
  union all
  select 'club'::text,o.id,o.name,concat_ws(' · ',o.city,o.country),(case when lower(o.name)=q.s then 100 when lower(o.name) like q.s||'%' then 90 when lower(o.name) like '%'||q.s||'%' then 80 else extensions.similarity(lower(o.name),q.s)*70 end)::numeric,
    jsonb_build_object('country',o.country,'city',o.city,'active_needs',(select count(*) from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')))
  from djm_os.organisations o cross join q where q.s<>'' and (lower(o.name) like '%'||q.s||'%' or extensions.similarity(lower(o.name),q.s)>=0.35)
  union all
  select 'player'::text,p.id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player'),concat_ws(' · ',p.current_club,p.primary_position,p.current_country),
    (case when lower(coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'')) like '%'||q.s||'%' then 85 else 50 end)::numeric,
    jsonb_build_object('club',p.current_club,'position',p.primary_position,'country',p.current_country)
  from public.players p cross join q where q.s<>'' and lower(coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'')) like '%'||q.s||'%'
  union all
  select 'prospect'::text,s.id,s.full_name,concat_ws(' · ',s.current_club,s.primary_position,s.current_country),(case when lower(s.full_name) like '%'||q.s||'%' then 82 else 45 end)::numeric,jsonb_build_object('club',s.current_club,'position',s.primary_position,'status',s.availability_status)
  from djm_os.scouting_prospects s cross join q where q.s<>'' and lower(s.full_name) like '%'||q.s||'%'
 ) select results.entity_type,results.entity_id,results.title,results.subtitle,results.score,results.metadata from results order by results.score desc,results.title limit greatest(1,least(coalesce(p_limit,30),100));
$$;

create or replace function public.djm_catch_me_up(p_person_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$
 select jsonb_build_object(
  'person',(select to_jsonb(x) from (select p.id,p.full_name,p.country,p.city,p.linkedin_url,p.instagram_url from djm_os.people p where p.id=p_person_id)x),
  'current_role',(select to_jsonb(x) from (select e.role_title,o.id organisation_id,o.name organisation_name,o.country from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id and e.is_current=true order by e.created_at desc limit 1)x),
  'employment_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.is_current desc,x.started_on desc nulls last) from (select e.role_title,o.name organisation_name,e.started_on,e.ended_on,e.is_current from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id)x),'[]'::jsonb),
  'relationships',coalesce((select jsonb_agg(to_jsonb(x) order by x.strength_score desc nulls last) from (select tm.display_name,r.strength_score,r.access_score,r.trust_score,r.last_meaningful_at,r.first_known_at from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id where r.person_id=p_person_id)x),'[]'::jsonb),
  'interaction_count',(select count(*) from djm_os.interactions i where i.person_id=p_person_id),
  'last_interaction',(select to_jsonb(x) from (select i.occurred_at,i.channel,i.summary,tm.display_name team_member from djm_os.interactions i left join djm_os.team_members tm on tm.user_id=i.team_member_id where i.person_id=p_person_id order by i.occurred_at desc limit 1)x),
  'recent_interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select i.occurred_at,i.channel,i.summary,tm.display_name team_member,o.name organisation_name from djm_os.interactions i left join djm_os.team_members tm on tm.user_id=i.team_member_id left join djm_os.organisations o on o.id=i.organisation_id where i.person_id=p_person_id order by i.occurred_at desc limit 8)x),'[]'::jsonb),
  'open_needs',coalesce((select jsonb_agg(to_jsonb(x)) from (select n.id,n.title,n.position,n.status,n.confirmed_at,o.name organisation_name from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id where n.source_person_id=p_person_id and n.status in ('active','open','confirmed'))x),'[]'::jsonb),
  'open_tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at asc nulls last) from (select t.id,t.title,t.due_at,t.priority,t.owner_user_id from djm_os.tasks t where t.person_id=p_person_id and t.status not in ('done','completed','cancelled'))x),'[]'::jsonb),
  'best_route',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.djm_best_route_to_person(p_person_id) limit 3)x),'[]'::jsonb)
 );
$$;

create or replace function public.djm_prepare_me(p_person_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$
 select (public.djm_catch_me_up(p_person_id) || jsonb_build_object(
  'recent_claims',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select c.claim_type,c.claim_key,c.value_json,c.confidence,c.verification_status,c.created_at,c.valid_until from djm_os.claims c where c.person_id=p_person_id and (c.valid_until is null or c.valid_until>now()) order by c.created_at desc limit 12)x),'[]'::jsonb),
  'upcoming_meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select m.id,m.title,m.starts_at,m.ends_at,m.meeting_url,m.status from djm_os.meetings m where m.person_id=p_person_id and m.starts_at>=now() and m.status not in ('cancelled') order by m.starts_at limit 5)x),'[]'::jsonb)
 ));
$$;

revoke execute on function public.djm_verify_claim(uuid,text),public.djm_search(text,integer),public.djm_catch_me_up(uuid),public.djm_prepare_me(uuid) from public,anon;
grant execute on function public.djm_verify_claim(uuid,text),public.djm_search(text,integer),public.djm_catch_me_up(uuid),public.djm_prepare_me(uuid) to authenticated;
select cron.unschedule(jobid) from cron.job where jobname='djm-os-source-trust' limit 1;
select cron.schedule('djm-os-source-trust','53 4 * * *','select djm_os.refresh_source_trust();');
notify pgrst,'reload schema';
