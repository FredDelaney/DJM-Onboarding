create table if not exists djm_os.change_observations (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  change_type text not null,
  previous_value jsonb,
  observed_value jsonb not null,
  source_uri text,
  source_name text,
  confidence numeric(5,4) not null default 0.5,
  status text not null default 'pending',
  detected_at timestamptz not null default now(),
  reviewed_by uuid references djm_os.team_members(user_id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  fingerprint text
);
create unique index if not exists change_observations_fingerprint_unique on djm_os.change_observations(fingerprint) where fingerprint is not null;
create index if not exists change_observations_pending_idx on djm_os.change_observations(status,confidence desc,detected_at desc);

create table if not exists djm_os.merge_candidates (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  left_id uuid not null,
  right_id uuid not null,
  confidence numeric(5,4) not null,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references djm_os.team_members(user_id) on delete set null,
  unique(entity_type,left_id,right_id)
);
create index if not exists merge_candidates_pending_idx on djm_os.merge_candidates(status,confidence desc);

alter table djm_os.change_observations enable row level security;
alter table djm_os.merge_candidates enable row level security;
grant select,insert,update,delete on djm_os.change_observations,djm_os.merge_candidates to authenticated;
do $$ declare t text; begin foreach t in array array['change_observations','merge_candidates'] loop execute format('create policy djm_team_select on djm_os.%I for select to authenticated using ((select djm_os.is_team_member()))',t); execute format('create policy djm_team_insert on djm_os.%I for insert to authenticated with check ((select djm_os.is_team_member()))',t); execute format('create policy djm_team_update on djm_os.%I for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()))',t); execute format('create policy djm_team_delete on djm_os.%I for delete to authenticated using ((select djm_os.is_team_member()))',t); end loop; end $$;

create extension if not exists pg_trgm with schema extensions;

create or replace function djm_os.generate_merge_candidates()
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v integer:=0; begin
  insert into djm_os.merge_candidates(entity_type,left_id,right_id,confidence,reasons)
  select 'person',a.id,b.id,
    case when exists(select 1 from djm_os.contact_methods ca join djm_os.contact_methods cb on ca.normalised_value=cb.normalised_value and ca.channel=cb.channel where ca.person_id=a.id and cb.person_id=b.id) then 0.99 else 0.82 end,
    jsonb_build_array(case when lower(trim(a.full_name))=lower(trim(b.full_name)) then 'same_name' else 'similar_name' end)
  from djm_os.people a join djm_os.people b on a.id<b.id and extensions.similarity(lower(a.full_name),lower(b.full_name))>=0.82
  where not exists(select 1 from djm_os.merge_candidates m where m.entity_type='person' and ((m.left_id=a.id and m.right_id=b.id) or (m.left_id=b.id and m.right_id=a.id)))
  on conflict(entity_type,left_id,right_id) do nothing;
  get diagnostics v=row_count;
  return jsonb_build_object('candidates',v);
end; $$;
revoke all on function djm_os.generate_merge_candidates() from public,anon,authenticated;

create or replace function djm_os.queue_change_review_items()
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v integer:=0; begin
  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,confidence,payload,status)
  select coalesce((select r.team_member_id from djm_os.relationships r where r.person_id=case when c.entity_type='person' then c.entity_id else null end order by r.strength_score desc nulls last limit 1),null),
         'entity_change',
         case when c.entity_type='person' then 'Possible contact change' else 'Possible data change' end,
         c.change_type||' detected from '||coalesce(c.source_name,'external source'),
         case when c.entity_type='person' then c.entity_id else null end,
         case when c.entity_type='organisation' then c.entity_id else null end,
         c.confidence,
         jsonb_build_object('change_observation_id',c.id,'previous',c.previous_value,'observed',c.observed_value,'source_uri',c.source_uri),
         'open'
  from djm_os.change_observations c
  where c.status='pending' and c.confidence<0.95 and not exists(select 1 from djm_os.review_items r where r.review_type='entity_change' and r.payload->>'change_observation_id'=c.id::text and r.status='open');
  get diagnostics v=row_count;
  return jsonb_build_object('review_items',v);
end; $$;
revoke all on function djm_os.queue_change_review_items() from public,anon,authenticated;

create or replace function public.djm_best_route_to_person(p_person_id uuid)
returns table(team_member_id uuid,team_member_name text,relationship_strength smallint,access_score smallint,last_meaningful_at timestamptz,route_reason text)
language sql stable security invoker set search_path=''
as $$
 select r.team_member_id,tm.display_name,r.strength_score,r.access_score,r.last_meaningful_at,
   case when coalesce(r.strength_score,0)>=80 then 'Strongest direct DJM relationship' when coalesce(r.access_score,0)>=70 then 'Good direct access' when r.last_meaningful_at>=now()-interval '30 days' then 'Most recent meaningful contact' else 'Best available direct route' end
 from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id
 where r.person_id=p_person_id and tm.is_active=true
 order by coalesce(r.strength_score,0) desc,coalesce(r.access_score,0) desc,r.last_meaningful_at desc nulls last;
$$;

create or replace function public.djm_best_route_to_club(p_organisation_id uuid)
returns table(person_id uuid,person_name text,role_title text,team_member_id uuid,team_member_name text,relationship_strength smallint,access_score smallint,last_meaningful_at timestamptz,route_score integer)
language sql stable security invoker set search_path=''
as $$
 with routes as (
   select p.id as person_id,p.full_name as person_name,e.role_title,r.team_member_id,tm.display_name as team_member_name,r.strength_score,r.access_score,r.last_meaningful_at,
     (coalesce(r.strength_score,0)*0.55 + coalesce(r.access_score,0)*0.25 + case when r.last_meaningful_at>=now()-interval '30 days' then 20 when r.last_meaningful_at>=now()-interval '90 days' then 12 when r.last_meaningful_at is not null then 5 else 0 end)::int route_score
   from djm_os.employments e join djm_os.people p on p.id=e.person_id join djm_os.relationships r on r.person_id=p.id join djm_os.team_members tm on tm.user_id=r.team_member_id
   where e.organisation_id=p_organisation_id and e.is_current=true and tm.is_active=true
 ) select routes.person_id,routes.person_name,routes.role_title,routes.team_member_id,routes.team_member_name,routes.strength_score,routes.access_score,routes.last_meaningful_at,routes.route_score from routes order by routes.route_score desc,routes.person_name;
$$;

revoke execute on function public.djm_best_route_to_person(uuid),public.djm_best_route_to_club(uuid) from public,anon;
grant execute on function public.djm_best_route_to_person(uuid),public.djm_best_route_to_club(uuid) to authenticated;
select cron.unschedule(jobid) from cron.job where jobname='djm-os-merge-candidates' limit 1;
select cron.unschedule(jobid) from cron.job where jobname='djm-os-change-review' limit 1;
select cron.schedule('djm-os-merge-candidates','43 4 * * *','select djm_os.generate_merge_candidates();');
select cron.schedule('djm-os-change-review','13 */3 * * *','select djm_os.queue_change_review_items();');
notify pgrst,'reload schema';
