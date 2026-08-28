create table if not exists djm_os.relationship_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references djm_os.team_members(user_id) on delete cascade,
  person_id uuid not null references djm_os.people(id) on delete cascade,
  strength_score smallint not null check (strength_score between 0 and 100),
  access_score smallint not null check (access_score between 0 and 100),
  reciprocity_score smallint not null check (reciprocity_score between 0 and 100),
  recency_score smallint not null check (recency_score between 0 and 100),
  commercial_score smallint not null check (commercial_score between 0 and 100),
  interactions_30d integer not null default 0,
  interactions_180d integer not null default 0,
  meetings_365d integer not null default 0,
  last_meaningful_at timestamptz,
  calculated_at timestamptz not null default now()
);
create index if not exists relationship_snapshots_member_person_idx on djm_os.relationship_snapshots(team_member_id,person_id,calculated_at desc);

create table if not exists djm_os.freshness_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  check_type text not null,
  priority smallint not null default 50 check (priority between 1 and 100),
  status text not null default 'queued',
  reason text,
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  source_hint text,
  attempts integer not null default 0,
  locked_at timestamptz,
  completed_at timestamptz,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type,entity_id,check_type)
);
create index if not exists freshness_queue_due_idx on djm_os.freshness_queue(status,next_check_at,priority desc);

create table if not exists djm_os.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references djm_os.team_members(user_id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  priority smallint not null default 50 check (priority between 1 and 100),
  person_id uuid references djm_os.people(id) on delete cascade,
  organisation_id uuid references djm_os.organisations(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  club_need_id uuid references djm_os.club_needs(id) on delete cascade,
  task_id uuid references djm_os.tasks(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'unread',
  fingerprint text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  expires_at timestamptz
);
create unique index if not exists notifications_fingerprint_unique on djm_os.notifications(fingerprint) where fingerprint is not null;
create index if not exists notifications_user_idx on djm_os.notifications(user_id,status,priority desc,created_at desc);

alter table djm_os.relationship_snapshots enable row level security;
alter table djm_os.freshness_queue enable row level security;
alter table djm_os.notifications enable row level security;
grant select,insert,update,delete on djm_os.relationship_snapshots,djm_os.freshness_queue,djm_os.notifications to authenticated;

drop policy if exists djm_team_select on djm_os.relationship_snapshots;
drop policy if exists djm_team_insert on djm_os.relationship_snapshots;
drop policy if exists djm_team_update on djm_os.relationship_snapshots;
drop policy if exists djm_team_delete on djm_os.relationship_snapshots;
create policy djm_team_select on djm_os.relationship_snapshots for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.relationship_snapshots for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.relationship_snapshots for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.relationship_snapshots for delete to authenticated using ((select djm_os.is_team_member()));

drop policy if exists djm_team_select on djm_os.freshness_queue;
drop policy if exists djm_team_insert on djm_os.freshness_queue;
drop policy if exists djm_team_update on djm_os.freshness_queue;
drop policy if exists djm_team_delete on djm_os.freshness_queue;
create policy djm_team_select on djm_os.freshness_queue for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.freshness_queue for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.freshness_queue for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.freshness_queue for delete to authenticated using ((select djm_os.is_team_member()));

drop policy if exists djm_notification_select on djm_os.notifications;
drop policy if exists djm_notification_update on djm_os.notifications;
create policy djm_notification_select on djm_os.notifications for select to authenticated using ((select djm_os.is_team_member()) and user_id=auth.uid());
create policy djm_notification_update on djm_os.notifications for update to authenticated using ((select djm_os.is_team_member()) and user_id=auth.uid()) with check ((select djm_os.is_team_member()) and user_id=auth.uid());

create or replace function djm_os.refresh_relationship_scores()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r record; v_count integer:=0; v_strength integer; v_access integer; v_recency integer; v_recip integer; v_commercial integer; v_30 integer; v_180 integer; v_meet integer; v_last timestamptz;
begin
  for r in select rel.team_member_id,rel.person_id,coalesce(rel.trust_score,50) trust_score from djm_os.relationships rel loop
    select count(*) filter(where occurred_at>=now()-interval '30 days'), count(*) filter(where occurred_at>=now()-interval '180 days'), max(occurred_at)
      into v_30,v_180,v_last from djm_os.interactions where team_member_id=r.team_member_id and person_id=r.person_id;
    select count(*) into v_meet from djm_os.meetings where owner_user_id=r.team_member_id and person_id=r.person_id and starts_at>=now()-interval '365 days' and status not in ('cancelled');
    v_recency := case when v_last is null then 10 when v_last>=now()-interval '14 days' then 100 when v_last>=now()-interval '30 days' then 85 when v_last>=now()-interval '60 days' then 70 when v_last>=now()-interval '120 days' then 50 when v_last>=now()-interval '240 days' then 30 else 15 end;
    v_access := least(100,20 + least(v_180,10)*5 + least(v_meet,5)*6);
    v_recip := least(100,25 + least(v_30,8)*6 + least(v_meet,4)*7);
    v_commercial := least(100,20 + (select count(*)*10 from djm_os.club_needs n where n.source_person_id=r.person_id and n.owner_user_id=r.team_member_id) + (select count(*)*8 from djm_os.opportunity_links ol where ol.person_id=r.person_id and ol.owner_user_id=r.team_member_id));
    v_strength := round(v_recency*.28 + v_access*.24 + v_recip*.18 + v_commercial*.15 + r.trust_score*.15);
    update djm_os.relationships set strength_score=v_strength::smallint,access_score=v_access::smallint,last_meaningful_at=coalesce(v_last,last_meaningful_at),updated_at=now() where team_member_id=r.team_member_id and person_id=r.person_id;
    insert into djm_os.relationship_snapshots(team_member_id,person_id,strength_score,access_score,reciprocity_score,recency_score,commercial_score,interactions_30d,interactions_180d,meetings_365d,last_meaningful_at)
    values(r.team_member_id,r.person_id,v_strength,v_access,v_recip,v_recency,v_commercial,v_30,v_180,v_meet,v_last);
    v_count:=v_count+1;
  end loop;
  delete from djm_os.relationship_snapshots where calculated_at<now()-interval '400 days';
  return jsonb_build_object('relationships_scored',v_count);
end;$$;
revoke all on function djm_os.refresh_relationship_scores() from public,anon,authenticated;

create or replace function djm_os.seed_freshness_queue()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_people integer:=0; v_needs integer:=0; v_players integer:=0;
begin
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'person',p.id,'employment',case when exists(select 1 from djm_os.relationships r where r.person_id=p.id and coalesce(r.strength_score,0)>=70) then 85 else 55 end,'Keep current club/role accurate',now(),'public_sources'
  from djm_os.people p
  where coalesce(p.last_verified_at,p.updated_at)<now()-interval '60 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),updated_at=now();
  get diagnostics v_people=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'club_need',n.id,'need_status',90,'Club requirements go stale quickly',now(),'relationship_reconfirm'
  from djm_os.club_needs n where n.status in ('active','open','confirmed') and coalesce(n.confirmed_at,n.created_at)<now()-interval '21 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=excluded.priority,reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),updated_at=now();
  get diagnostics v_needs=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'player',p.id,'market_profile',case when p.football_status in ('active','available') then 75 else 55 end,'Keep player club, contract and market status fresh',now(),'player_or_public_sources'
  from public.players p where coalesce(p.updated_at,p.created_at)<now()-interval '45 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),updated_at=now();
  get diagnostics v_players=row_count;
  return jsonb_build_object('people',v_people,'needs',v_needs,'players',v_players);
end;$$;
revoke all on function djm_os.seed_freshness_queue() from public,anon,authenticated;

create or replace function djm_os.generate_notifications()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_count integer:=0; x integer;
begin
  insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,organisation_id,task_id,fingerprint,expires_at)
  select t.owner_user_id,'task_due',case when t.due_at<now() then 'Overdue: ' else 'Due soon: ' end||t.title,
    coalesce(p.full_name,o.name,'DJM task'),case when t.due_at<now() then 95 else 80 end,t.person_id,t.organisation_id,t.id,
    'task:'||t.id::text||':'||to_char(current_date,'YYYYMMDD'),now()+interval '2 days'
  from djm_os.tasks t left join djm_os.people p on p.id=t.person_id left join djm_os.organisations o on o.id=t.organisation_id
  where t.owner_user_id is not null and t.status not in ('done','completed','cancelled') and t.due_at is not null and t.due_at<=now()+interval '24 hours'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics x=row_count; v_count:=v_count+x;
  insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,organisation_id,club_need_id,fingerprint,expires_at)
  select n.owner_user_id,'need_reconfirm','Reconfirm '||coalesce(n.position,'club')||' need',o.name||' has not been reconfirmed recently.',78,n.source_person_id,n.organisation_id,n.id,
    'need-reconfirm:'||n.id::text||':'||to_char(current_date,'IYYY-IW'),now()+interval '7 days'
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
  where n.owner_user_id is not null and n.status in ('active','open','confirmed') and coalesce(n.confirmed_at,n.created_at)<now()-interval '21 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics x=row_count; v_count:=v_count+x;
  insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,fingerprint,expires_at)
  select r.team_member_id,'relationship_cooling','Relationship cooling: '||p.full_name,'Strong relationship with no meaningful contact for more than 75 days.',72,r.person_id,
    'cooling:'||r.team_member_id::text||':'||r.person_id::text||':'||to_char(current_date,'YYYY-MM'),date_trunc('month',now())+interval '1 month'
  from djm_os.relationships r join djm_os.people p on p.id=r.person_id
  where coalesce(r.strength_score,0)>=65 and r.last_meaningful_at<now()-interval '75 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics x=row_count; v_count:=v_count+x;
  return jsonb_build_object('notifications_generated',v_count);
end;$$;
revoke all on function djm_os.generate_notifications() from public,anon,authenticated;

create or replace function public.djm_notifications(p_limit integer default 30)
returns table(id uuid,notification_type text,title text,body text,priority smallint,person_id uuid,organisation_id uuid,player_id uuid,club_need_id uuid,task_id uuid,status text,created_at timestamptz,expires_at timestamptz)
language sql stable security invoker set search_path=''
as $$ select n.id,n.notification_type,n.title,n.body,n.priority,n.person_id,n.organisation_id,n.player_id,n.club_need_id,n.task_id,n.status,n.created_at,n.expires_at from djm_os.notifications n where n.user_id=auth.uid() and n.status<>'dismissed' and (n.expires_at is null or n.expires_at>now()) order by case when n.status='unread' then 0 else 1 end,n.priority desc,n.created_at desc limit greatest(1,least(coalesce(p_limit,30),100)); $$;

create or replace function public.djm_notification_action(p_id uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v text:=lower(trim(p_action)); begin if v not in ('read','unread','dismissed') then raise exception 'Invalid action'; end if; update djm_os.notifications set status=v,read_at=case when v='read' then now() else read_at end where id=p_id and user_id=auth.uid(); if not found then raise exception 'Notification not found'; end if; return jsonb_build_object('id',p_id,'status',v); end; $$;
revoke execute on function public.djm_notifications(integer) from public,anon;
revoke execute on function public.djm_notification_action(uuid,text) from public,anon;
grant execute on function public.djm_notifications(integer),public.djm_notification_action(uuid,text) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname='djm-os-relationship-score' limit 1;
select cron.unschedule(jobid) from cron.job where jobname='djm-os-freshness-seed' limit 1;
select cron.unschedule(jobid) from cron.job where jobname='djm-os-notifications' limit 1;
select cron.schedule('djm-os-relationship-score','11 */6 * * *','select djm_os.refresh_relationship_scores();');
select cron.schedule('djm-os-freshness-seed','23 2 * * *','select djm_os.seed_freshness_queue();');
select cron.schedule('djm-os-notifications','*/30 * * * *','select djm_os.generate_notifications();');
notify pgrst,'reload schema';
