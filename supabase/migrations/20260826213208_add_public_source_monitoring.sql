create table if not exists djm_os.source_monitors (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  source_url text not null,
  source_kind text not null default 'official',
  last_status integer,
  last_hash text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  next_check_at timestamptz not null default now(),
  check_interval_hours integer not null default 168 check (check_interval_hours between 12 and 2160),
  status text not null default 'active' check (status in ('active','paused','broken')),
  consecutive_failures integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type,entity_id,source_url)
);
create index if not exists idx_source_monitors_due on djm_os.source_monitors(status,next_check_at);
alter table djm_os.source_monitors enable row level security;
drop policy if exists team_source_monitors_all on djm_os.source_monitors;
create policy team_source_monitors_all on djm_os.source_monitors for all to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
grant select,insert,update,delete on djm_os.source_monitors to authenticated;

create or replace function djm_os.seed_source_monitors() returns integer language plpgsql set search_path='' as $$
declare v_count integer:=0;v_rows integer;
begin
  insert into djm_os.source_monitors(entity_type,entity_id,source_url,source_kind,check_interval_hours)
  select 'club',o.id,o.website_url,'official',168 from djm_os.organisations o
  where o.website_url is not null and length(trim(o.website_url))>8
  on conflict(entity_type,entity_id,source_url) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  insert into djm_os.source_monitors(entity_type,entity_id,source_url,source_kind,check_interval_hours)
  select 'person',m.person_id,m.source_url,coalesce(m.source_kind,'official'),72 from djm_os.memories m
  where m.person_id is not null and m.source_url is not null and m.status='active'
  on conflict(entity_type,entity_id,source_url) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  insert into djm_os.source_monitors(entity_type,entity_id,source_url,source_kind,check_interval_hours)
  select 'recruitment_target',m.prospect_id,m.source_url,coalesce(m.source_kind,'official'),72 from djm_os.memories m
  where m.prospect_id is not null and m.source_url is not null and m.status='active'
  on conflict(entity_type,entity_id,source_url) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  return v_count;
end $$;

create or replace function public.djm_source_monitor_due(p_limit integer default 25)
returns table(id uuid,entity_type text,entity_id uuid,source_url text,source_kind text,last_hash text,check_interval_hours integer) language sql stable set search_path='' as $$
select sm.id,sm.entity_type,sm.entity_id,sm.source_url,sm.source_kind,sm.last_hash,sm.check_interval_hours
from djm_os.source_monitors sm
where sm.status='active' and sm.next_check_at<=now()
order by sm.next_check_at asc,sm.created_at asc
limit greatest(1,least(coalesce(p_limit,25),100));
$$;
grant execute on function public.djm_source_monitor_due(integer) to authenticated;

create or replace function public.djm_source_monitor_result(p_monitor_id uuid,p_http_status integer,p_hash text,p_changed boolean,p_error text default null)
returns jsonb language plpgsql set search_path='' as $$
declare v_monitor djm_os.source_monitors%rowtype;
begin
 if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
 select * into v_monitor from djm_os.source_monitors where id=p_monitor_id for update;
 if not found then raise exception 'Monitor not found'; end if;
 update djm_os.source_monitors set
   last_status=p_http_status,last_hash=coalesce(nullif(p_hash,''),last_hash),last_checked_at=now(),
   last_changed_at=case when p_changed then now() else last_changed_at end,
   consecutive_failures=case when p_error is null and p_http_status between 200 and 399 then 0 else consecutive_failures+1 end,
   status=case when consecutive_failures+1>=5 and (p_error is not null or p_http_status not between 200 and 399) then 'broken' else status end,
   next_check_at=now()+make_interval(hours=>check_interval_hours),updated_at=now()
 where id=p_monitor_id;
 if p_changed then
   insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,status,reason,next_check_at,source_hint)
   values(v_monitor.entity_type,v_monitor.entity_id,'source_changed',5,'pending','Official/public source content changed and needs semantic re-verification',now(),v_monitor.source_url)
   on conflict do nothing;
   insert into djm_os.review_items(review_type,entity_type,entity_id,title,detail,status,created_at,updated_at)
   values('source_changed',v_monitor.entity_type,v_monitor.entity_id,'Public source changed','Known source changed: '||v_monitor.source_url,'open',now(),now());
 end if;
 return jsonb_build_object('ok',true,'changed',p_changed);
end $$;
grant execute on function public.djm_source_monitor_result(uuid,integer,text,boolean,text) to authenticated;

select djm_os.seed_source_monitors();
