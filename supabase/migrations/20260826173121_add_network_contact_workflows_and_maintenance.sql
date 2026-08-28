create table if not exists djm_os.suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references djm_os.team_members(user_id) on delete cascade,
  suggestion_type text not null,
  title text not null,
  reason text,
  person_id uuid references djm_os.people(id) on delete cascade,
  organisation_id uuid references djm_os.organisations(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  club_need_id uuid references djm_os.club_needs(id) on delete cascade,
  score smallint not null default 50 check (score between 1 and 100),
  status text not null default 'open',
  fingerprint text,
  source text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  actioned_at timestamptz
);
create unique index if not exists djm_os_suggestions_fingerprint_unique on djm_os.suggestions(fingerprint) where fingerprint is not null;
create index if not exists djm_os_suggestions_owner_idx on djm_os.suggestions(owner_user_id,status,score desc,created_at desc);

grant select,insert,update,delete on djm_os.suggestions to authenticated;
alter table djm_os.suggestions enable row level security;
drop policy if exists djm_team_select on djm_os.suggestions;
drop policy if exists djm_team_insert on djm_os.suggestions;
drop policy if exists djm_team_update on djm_os.suggestions;
drop policy if exists djm_team_delete on djm_os.suggestions;
create policy djm_team_select on djm_os.suggestions for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.suggestions for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.suggestions for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.suggestions for delete to authenticated using ((select djm_os.is_team_member()));

create or replace function public.djm_network_upsert_person(
  p_full_name text,
  p_person_type text default 'club_contact',
  p_whatsapp text default null,
  p_email text default null,
  p_linkedin_url text default null,
  p_country text default null,
  p_city text default null,
  p_club_name text default null,
  p_role_title text default null,
  p_club_country text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_person_id uuid;
  v_org_id uuid;
  v_phone_norm text;
  v_email_norm text;
  v_org_key text;
  v_created boolean := false;
begin
  if p_full_name is null or length(trim(p_full_name)) < 2 then raise exception 'Name is required'; end if;
  v_phone_norm := nullif(regexp_replace(coalesce(p_whatsapp,''),'[^0-9+]','','g'),'');
  v_email_norm := nullif(lower(trim(coalesce(p_email,''))),'');

  if v_phone_norm is not null then
    select person_id into v_person_id from djm_os.contact_methods where channel='whatsapp' and normalised_value=v_phone_norm limit 1;
  end if;
  if v_person_id is null and v_email_norm is not null then
    select person_id into v_person_id from djm_os.contact_methods where channel='email' and normalised_value=v_email_norm limit 1;
  end if;

  if v_person_id is null then
    insert into djm_os.people(full_name,person_type,country,city,linkedin_url,source_confidence,last_verified_at)
    values(trim(p_full_name),coalesce(nullif(trim(p_person_type),''),'club_contact'),nullif(trim(p_country),''),nullif(trim(p_city),''),nullif(trim(p_linkedin_url),''),1,now())
    returning id into v_person_id;
    v_created := true;
  else
    update djm_os.people set
      full_name=coalesce(nullif(trim(p_full_name),''),full_name),
      country=coalesce(nullif(trim(p_country),''),country),
      city=coalesce(nullif(trim(p_city),''),city),
      linkedin_url=coalesce(nullif(trim(p_linkedin_url),''),linkedin_url),
      updated_at=now()
    where id=v_person_id;
  end if;

  if v_phone_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
    values(v_person_id,'whatsapp',trim(p_whatsapp),v_phone_norm,true,false,now())
    on conflict (channel,normalised_value) where normalised_value is not null do update set value=excluded.value,updated_at=now();
  end if;
  if v_email_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
    values(v_person_id,'email',trim(p_email),v_email_norm,true,false,now())
    on conflict (channel,normalised_value) where normalised_value is not null do update set value=excluded.value,updated_at=now();
  end if;

  if p_club_name is not null and length(trim(p_club_name)) > 1 then
    v_org_key := lower(regexp_replace(trim(p_club_name),'[^a-zA-Z0-9]+','-','g')) || ':' || lower(coalesce(nullif(trim(p_club_country),''),'unknown'));
    select id into v_org_id from djm_os.organisations where canonical_key=v_org_key limit 1;
    if v_org_id is null then
      insert into djm_os.organisations(name,organisation_type,country,canonical_key,last_verified_at)
      values(trim(p_club_name),'club',nullif(trim(p_club_country),''),v_org_key,now()) returning id into v_org_id;
    end if;

    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now()
    where person_id=v_person_id and is_current=true and organisation_id<>v_org_id;

    if not exists(select 1 from djm_os.employments where person_id=v_person_id and organisation_id=v_org_id and is_current=true) then
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      values(v_person_id,v_org_id,nullif(trim(p_role_title),''),true,1,now());
    elsif p_role_title is not null then
      update djm_os.employments set role_title=coalesce(nullif(trim(p_role_title),''),role_title),updated_at=now(),last_verified_at=now()
      where person_id=v_person_id and organisation_id=v_org_id and is_current=true;
    end if;
  end if;

  insert into djm_os.relationships(team_member_id,person_id,first_known_at,strength_score)
  values(auth.uid(),v_person_id,now(),case when v_created then 20 else 25 end)
  on conflict(team_member_id,person_id) do nothing;

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values(case when v_created then 'CONTACT_CREATED' else 'CONTACT_UPDATED' end,auth.uid(),v_person_id,v_org_id,jsonb_build_object('name',trim(p_full_name),'created',v_created),'network',1,now());

  return jsonb_build_object('person_id',v_person_id,'organisation_id',v_org_id,'created',v_created);
end;
$$;

create or replace function public.djm_network_person(p_person_id uuid)
returns jsonb
language sql stable security invoker set search_path=''
as $$
select jsonb_build_object(
  'person',(select to_jsonb(p) from (select id,full_name,preferred_name,person_type,country,city,linkedin_url,instagram_url,photo_url,last_verified_at,created_at,updated_at from djm_os.people where id=p_person_id) p),
  'contacts',coalesce((select jsonb_agg(to_jsonb(c) order by c.is_primary desc,c.channel) from (select id,channel,value,is_primary,is_verified,last_verified_at from djm_os.contact_methods where person_id=p_person_id) c),'[]'::jsonb),
  'employment',coalesce((select jsonb_agg(to_jsonb(e) order by e.is_current desc,e.started_on desc nulls last) from (select e.id,e.role_title,e.department,e.started_on,e.ended_on,e.is_current,e.confidence,e.last_verified_at,o.id organisation_id,o.name organisation_name,o.country organisation_country from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id) e),'[]'::jsonb),
  'relationships',coalesce((select jsonb_agg(to_jsonb(r) order by r.strength_score desc nulls last) from (select r.team_member_id,tm.display_name,r.strength_score,r.access_score,r.trust_score,r.first_known_at,r.last_meaningful_at,r.relationship_notes from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id where r.person_id=p_person_id) r),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(to_jsonb(i) order by i.occurred_at desc) from (select i.id,i.occurred_at,i.channel,i.direction,i.summary,i.sentiment,i.source_type,i.organisation_id,o.name organisation_name,tm.display_name team_member_name from djm_os.interactions i left join djm_os.organisations o on o.id=i.organisation_id left join djm_os.team_members tm on tm.user_id=i.team_member_id where i.person_id=p_person_id order by i.occurred_at desc limit 40) i),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at asc nulls last,t.priority desc) from (select id,title,task_type,owner_user_id,due_at,status,priority,source from djm_os.tasks where person_id=p_person_id and status not in ('done','completed','cancelled')) t),'[]'::jsonb)
);
$$;

create or replace function public.djm_network_set_task_status(p_task_id uuid,p_status text)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_owner uuid; v_new text;
begin
  v_new:=lower(trim(coalesce(p_status,'')));
  if v_new not in ('open','in_progress','done','completed','cancelled','snoozed') then raise exception 'Invalid task status'; end if;
  select owner_user_id into v_owner from djm_os.tasks where id=p_task_id;
  if not found then raise exception 'Task not found'; end if;
  if v_owner is not null and v_owner<>auth.uid() then raise exception 'Only the task owner can change this task'; end if;
  update djm_os.tasks set status=v_new,completed_at=case when v_new in ('done','completed') then now() else null end,updated_at=now() where id=p_task_id;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at) values('TASK_STATUS_CHANGED',auth.uid(),jsonb_build_object('task_id',p_task_id,'status',v_new),'network',1,now());
  return jsonb_build_object('task_id',p_task_id,'status',v_new);
end;
$$;

create or replace function public.djm_network_suggestions()
returns table(id uuid,suggestion_type text,title text,reason text,score smallint,person_id uuid,person_name text,organisation_id uuid,organisation_name text,player_id uuid,club_need_id uuid,created_at timestamptz,expires_at timestamptz)
language sql stable security invoker set search_path=''
as $$
  select s.id,s.suggestion_type,s.title,s.reason,s.score,s.person_id,p.full_name,s.organisation_id,o.name,s.player_id,s.club_need_id,s.created_at,s.expires_at
  from djm_os.suggestions s
  left join djm_os.people p on p.id=s.person_id
  left join djm_os.organisations o on o.id=s.organisation_id
  where s.status='open' and (s.owner_user_id is null or s.owner_user_id=auth.uid()) and (s.expires_at is null or s.expires_at>now())
  order by s.score desc,s.created_at desc;
$$;

create or replace function djm_os.maintenance_tick()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_stale_needs int:=0; v_suggestions int:=0; v_review int:=0;
begin
  with changed as (
    update djm_os.club_needs set status='stale',updated_at=now()
    where status in ('active','open','confirmed') and expires_at is not null and expires_at<now()
    returning id
  ) select count(*) into v_stale_needs from changed;

  with changed as (
    update djm_os.captures set status='needs_review',error_message=coalesce(error_message,'Automatic processing has not completed'),processed_at=coalesce(processed_at,now())
    where status='queued' and created_at<now()-interval '24 hours'
    returning id
  ) select count(*) into v_review from changed;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,person_id,score,status,fingerprint,source,expires_at)
  select r.team_member_id,'relationship_reengage','Reconnect with '||p.full_name,
         'Strong DJM relationship with no meaningful interaction for '||greatest(1,floor(extract(epoch from (now()-r.last_meaningful_at))/86400))::int||' days.',
         r.person_id,
         least(95,greatest(55,coalesce(r.strength_score,50)))::smallint,
         'open',
         'reengage:'||r.team_member_id::text||':'||r.person_id::text||':'||to_char(current_date,'YYYY-MM'),
         'maintenance',
         date_trunc('month',now())+interval '1 month'
  from djm_os.relationships r join djm_os.people p on p.id=r.person_id
  where coalesce(r.strength_score,0)>=50 and r.last_meaningful_at is not null and r.last_meaningful_at<now()-interval '60 days'
  on conflict (fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_suggestions = row_count;

  return jsonb_build_object('stale_needs',v_stale_needs,'captures_for_review',v_review,'relationship_suggestions',v_suggestions);
end;
$$;
revoke all on function djm_os.maintenance_tick() from public,anon,authenticated;

revoke execute on function public.djm_network_upsert_person(text,text,text,text,text,text,text,text,text,text) from public,anon;
revoke execute on function public.djm_network_person(uuid) from public,anon;
revoke execute on function public.djm_network_set_task_status(uuid,text) from public,anon;
revoke execute on function public.djm_network_suggestions() from public,anon;
grant execute on function public.djm_network_upsert_person(text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.djm_network_person(uuid) to authenticated;
grant execute on function public.djm_network_set_task_status(uuid,text) to authenticated;
grant execute on function public.djm_network_suggestions() to authenticated;

select cron.unschedule(jobid) from cron.job where jobname='djm-os-maintenance-daily';
select cron.schedule('djm-os-maintenance-daily','17 3 * * *','select djm_os.maintenance_tick();');
notify pgrst,'reload schema';
