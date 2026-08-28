create table if not exists djm_os.system_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null,
  payload jsonb not null,
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists system_snapshots_type_time_idx on djm_os.system_snapshots(snapshot_type,created_at desc);
alter table djm_os.system_snapshots enable row level security;
grant select on djm_os.system_snapshots to authenticated;
create policy djm_team_select on djm_os.system_snapshots for select to authenticated using ((select djm_os.is_team_member()));

create or replace function djm_os.apply_employment_observation(p_person_id uuid,p_club_name text,p_role_title text,p_country text,p_source_uri text,p_source_name text,p_confidence numeric)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_org uuid; v_old_org uuid; v_old_name text; v_key text; v_obs uuid; v_applied boolean:=false; v_owner uuid; begin
  if p_person_id is null or trim(coalesce(p_club_name,''))='' then raise exception 'Person and club required'; end if;
  select e.organisation_id,o.name into v_old_org,v_old_name from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id and e.is_current=true order by e.created_at desc limit 1;
  v_key:=lower(regexp_replace(trim(p_club_name),'[^a-zA-Z0-9]+','-','g'))||':'||lower(coalesce(nullif(trim(p_country),''),'unknown'));
  select id into v_org from djm_os.organisations where canonical_key=v_key limit 1;
  if v_org is null then insert into djm_os.organisations(name,organisation_type,country,canonical_key,last_verified_at) values(trim(p_club_name),'club',nullif(trim(p_country),''),v_key,now()) returning id into v_org; end if;
  insert into djm_os.change_observations(entity_type,entity_id,change_type,previous_value,observed_value,source_uri,source_name,confidence,status,fingerprint)
  values('person',p_person_id,'employment',jsonb_build_object('organisation_id',v_old_org,'club',v_old_name),jsonb_build_object('organisation_id',v_org,'club',trim(p_club_name),'role_title',nullif(trim(coalesce(p_role_title,'')),''),'country',p_country),p_source_uri,p_source_name,coalesce(p_confidence,0.5),case when coalesce(p_confidence,0)<0.95 then 'pending' else 'applied' end,'employment:'||p_person_id::text||':'||v_org::text)
  on conflict(fingerprint) where fingerprint is not null do update set observed_value=excluded.observed_value,source_uri=excluded.source_uri,source_name=excluded.source_name,confidence=greatest(djm_os.change_observations.confidence,excluded.confidence),detected_at=now() returning id into v_obs;
  if coalesce(p_confidence,0)>=0.95 then
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=p_person_id and is_current=true and organisation_id<>v_org;
    if not exists(select 1 from djm_os.employments where person_id=p_person_id and organisation_id=v_org and is_current=true) then insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at) values(p_person_id,v_org,nullif(trim(coalesce(p_role_title,'')),''),true,p_confidence,now()); else update djm_os.employments set role_title=coalesce(nullif(trim(coalesce(p_role_title,'')),''),role_title),confidence=greatest(confidence,p_confidence),last_verified_at=now(),updated_at=now() where person_id=p_person_id and organisation_id=v_org and is_current=true; end if;
    update djm_os.people set last_verified_at=now(),updated_at=now() where id=p_person_id;
    update djm_os.change_observations set status='applied',applied_at=now() where id=v_obs;
    v_applied:=true;
    select r.team_member_id into v_owner from djm_os.relationships r where r.person_id=p_person_id order by r.strength_score desc nulls last limit 1;
    insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at) values('CONTACT_EMPLOYMENT_CHANGED',null,p_person_id,v_org,jsonb_build_object('old_club',v_old_name,'new_club',trim(p_club_name),'role_title',p_role_title,'source_uri',p_source_uri),'data_freshness',p_confidence,now());
    if v_owner is not null and (v_old_org is distinct from v_org) then insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,organisation_id,fingerprint,expires_at) values(v_owner,'contact_moved',coalesce((select full_name from djm_os.people where id=p_person_id),'Contact')||' changed club',coalesce(v_old_name,'Previous club')||' → '||trim(p_club_name),88,p_person_id,v_org,'move:'||p_person_id::text||':'||v_org::text,now()+interval '14 days') on conflict(fingerprint) where fingerprint is not null do nothing; end if;
  else perform djm_os.queue_change_review_items(); end if;
  return jsonb_build_object('observation_id',v_obs,'organisation_id',v_org,'applied',v_applied,'confidence',p_confidence);
end; $$;
revoke all on function djm_os.apply_employment_observation(uuid,text,text,text,text,text,numeric) from public,anon,authenticated;

create or replace function public.djm_record_employment_observation(p_person_id uuid,p_club_name text,p_role_title text default null,p_country text default null,p_source_uri text default null,p_source_name text default 'manual/public check',p_confidence numeric default 0.8)
returns jsonb language plpgsql security invoker set search_path=''
as $$ begin if not djm_os.is_team_member() then raise exception 'Not authorised'; end if; return djm_os.apply_employment_observation(p_person_id,p_club_name,p_role_title,p_country,p_source_uri,p_source_name,p_confidence); end; $$;
revoke execute on function public.djm_record_employment_observation(uuid,text,text,text,text,text,numeric) from public,anon;
grant execute on function public.djm_record_employment_observation(uuid,text,text,text,text,text,numeric) to authenticated;

create or replace function djm_os.create_system_snapshot()
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_id uuid; begin
 insert into djm_os.system_snapshots(snapshot_type,payload,counts)
 select 'operational',jsonb_build_object(
   'team_members',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select user_id,display_name,role_title,timezone,is_active from djm_os.team_members)x),
   'people',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,full_name,person_type,country,city,linkedin_url,instagram_url,last_verified_at from djm_os.people)x),
   'organisations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,name,organisation_type,country,city,website_url,last_verified_at from djm_os.organisations)x),
   'employments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,person_id,organisation_id,role_title,started_on,ended_on,is_current,confidence,last_verified_at from djm_os.employments)x),
   'relationships',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select team_member_id,person_id,strength_score,access_score,trust_score,last_meaningful_at,first_known_at from djm_os.relationships)x),
   'active_needs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from djm_os.club_needs where status in ('active','open','confirmed'))x),
   'open_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from djm_os.tasks where status not in ('done','completed','cancelled'))x)
 ),jsonb_build_object('people',(select count(*) from djm_os.people),'clubs',(select count(*) from djm_os.organisations where organisation_type='club'),'relationships',(select count(*) from djm_os.relationships),'interactions',(select count(*) from djm_os.interactions),'messages',(select count(*) from djm_os.messages),'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')))
 returning id into v_id;
 delete from djm_os.system_snapshots where snapshot_type='operational' and created_at<now()-interval '90 days';
 return v_id;
end; $$;
revoke all on function djm_os.create_system_snapshot() from public,anon,authenticated;

create or replace function public.djm_system_snapshot_latest()
returns jsonb language sql stable security invoker set search_path=''
as $$ select jsonb_build_object('id',s.id,'created_at',s.created_at,'counts',s.counts,'payload',s.payload) from djm_os.system_snapshots s where s.snapshot_type='operational' order by s.created_at desc limit 1; $$;
revoke execute on function public.djm_system_snapshot_latest() from public,anon;
grant execute on function public.djm_system_snapshot_latest() to authenticated;

select cron.unschedule(jobid) from cron.job where jobname='djm-os-operational-snapshot' limit 1;
select cron.schedule('djm-os-operational-snapshot','7 1 * * *','select djm_os.create_system_snapshot();');
notify pgrst,'reload schema';
