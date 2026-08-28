create or replace function public.djm_network_tasks(p_scope text default 'mine')
returns table(
  id uuid, title text, task_type text, owner_user_id uuid, owner_name text,
  person_id uuid, person_name text, organisation_id uuid, organisation_name text,
  due_at timestamptz, status text, priority smallint, source text, created_at timestamptz
)
language sql stable security invoker set search_path=''
as $$
  select t.id,t.title,t.task_type,t.owner_user_id,tm.display_name,
         t.person_id,p.full_name,t.organisation_id,o.name,t.due_at,t.status,t.priority,t.source,t.created_at
  from djm_os.tasks t
  left join djm_os.team_members tm on tm.user_id=t.owner_user_id
  left join djm_os.people p on p.id=t.person_id
  left join djm_os.organisations o on o.id=t.organisation_id
  where p_scope='all' or t.owner_user_id is null or t.owner_user_id=auth.uid()
  order by case when t.status in ('done','completed','cancelled') then 1 else 0 end,
           t.priority desc,t.due_at asc nulls last,t.created_at desc;
$$;

create or replace function public.djm_network_create_task(
  p_title text,
  p_due_at timestamptz default null,
  p_person_id uuid default null,
  p_organisation_id uuid default null,
  p_owner_user_id uuid default null,
  p_priority smallint default 3,
  p_task_type text default 'manual'
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_id uuid; v_owner uuid;
begin
  if p_title is null or length(trim(p_title))<2 then raise exception 'Task title is required'; end if;
  if p_priority<1 or p_priority>5 then raise exception 'Priority must be between 1 and 5'; end if;
  v_owner:=coalesce(p_owner_user_id,auth.uid());
  if not exists(select 1 from djm_os.team_members where user_id=v_owner and is_active=true) then raise exception 'Task owner must be an active DJM team member'; end if;
  insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,due_at,status,priority,source)
  values(trim(p_title),coalesce(nullif(trim(p_task_type),''),'manual'),v_owner,p_person_id,p_organisation_id,p_due_at,'open',p_priority,'manual')
  returning id into v_id;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('TASK_CREATED',auth.uid(),p_person_id,p_organisation_id,jsonb_build_object('task_id',v_id,'owner_user_id',v_owner),'network',1,now());
  return jsonb_build_object('task_id',v_id);
end;
$$;

create or replace function public.djm_network_activity(p_limit integer default 50)
returns table(
  id uuid,event_type text,actor_user_id uuid,actor_name text,person_id uuid,person_name text,
  organisation_id uuid,organisation_name text,player_id uuid,interaction_id uuid,payload jsonb,
  source text,confidence numeric,occurred_at timestamptz
)
language sql stable security invoker set search_path=''
as $$
  select e.id,e.event_type,e.actor_user_id,tm.display_name,e.person_id,p.full_name,e.organisation_id,o.name,
         e.player_id,e.interaction_id,e.payload,e.source,e.confidence,e.occurred_at
  from djm_os.events e
  left join djm_os.team_members tm on tm.user_id=e.actor_user_id
  left join djm_os.people p on p.id=e.person_id
  left join djm_os.organisations o on o.id=e.organisation_id
  order by e.occurred_at desc
  limit greatest(1,least(coalesce(p_limit,50),250));
$$;

create or replace function public.djm_network_club(p_organisation_id uuid)
returns jsonb
language sql stable security invoker set search_path=''
as $$
select jsonb_build_object(
  'organisation',(select to_jsonb(o) from (select id,name,organisation_type,country,city,website_url,last_verified_at,created_at,updated_at from djm_os.organisations where id=p_organisation_id) o),
  'people',coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name) from (
    select p.id,p.full_name,e.role_title,e.department,e.started_on,e.last_verified_at,
           (select max(r.strength_score) from djm_os.relationships r where r.person_id=p.id) as best_relationship_score
    from djm_os.employments e join djm_os.people p on p.id=e.person_id
    where e.organisation_id=p_organisation_id and e.is_current=true
  ) x),'[]'::jsonb),
  'needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select n.id,n.title,n.position,n.preferred_foot,n.min_age,n.max_age,n.transfer_type,n.transfer_budget,n.salary_budget,n.currency,n.status,n.confidence,n.confirmed_at,n.expires_at,n.updated_at,
      (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) as match_count
    from djm_os.club_needs n where n.organisation_id=p_organisation_id
  ) x),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
    select i.id,i.occurred_at,i.channel,i.summary,i.person_id,p.full_name as person_name,tm.display_name as team_member_name
    from djm_os.interactions i
    left join djm_os.people p on p.id=i.person_id
    left join djm_os.team_members tm on tm.user_id=i.team_member_id
    where i.organisation_id=p_organisation_id order by i.occurred_at desc limit 40
  ) x),'[]'::jsonb)
);
$$;

create or replace function public.djm_market_set_need_status(p_need_id uuid,p_status text)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_status text;
begin
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('active','open','confirmed','stale','filled','closed','cancelled') then raise exception 'Invalid club need status'; end if;
  update djm_os.club_needs set status=v_status,updated_at=now(),
    confirmed_at=case when v_status in ('active','open','confirmed') then coalesce(confirmed_at,now()) else confirmed_at end
  where id=p_need_id;
  if not found then raise exception 'Club need not found'; end if;
  insert into djm_os.events(event_type,actor_user_id,club_need_id,payload,source,confidence,occurred_at)
  values('CLUB_NEED_STATUS_CHANGED',auth.uid(),p_need_id,jsonb_build_object('status',v_status),'market',1,now());
  return jsonb_build_object('need_id',p_need_id,'status',v_status);
end;
$$;

create or replace function public.djm_market_set_match_status(p_match_id uuid,p_status text)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_status text; v_need uuid; v_player uuid;
begin
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('suggested','reviewing','contacted','available','presented','interested','rejected','negotiating','placed','dismissed') then raise exception 'Invalid match status'; end if;
  update djm_os.player_matches set status=v_status,updated_at=now()
  where id=p_match_id returning club_need_id,player_id into v_need,v_player;
  if not found then raise exception 'Player match not found'; end if;
  insert into djm_os.events(event_type,actor_user_id,club_need_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_MATCH_STATUS_CHANGED',auth.uid(),v_need,v_player,jsonb_build_object('match_id',p_match_id,'status',v_status),'market',1,now());
  return jsonb_build_object('match_id',p_match_id,'status',v_status);
end;
$$;

create or replace function public.djm_market_create_need(
  p_organisation_id uuid,
  p_title text,
  p_position text,
  p_source_person_id uuid default null,
  p_preferred_foot text default null,
  p_min_age smallint default null,
  p_max_age smallint default null,
  p_transfer_type text default null,
  p_transfer_budget numeric default null,
  p_salary_budget numeric default null,
  p_currency text default null,
  p_salary_period text default null,
  p_profile_notes text default null,
  p_registration_notes text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
  if p_organisation_id is null then raise exception 'Club is required'; end if;
  if p_position is null or length(trim(p_position))<1 then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age>p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;
  insert into djm_os.club_needs(organisation_id,source_person_id,owner_user_id,title,position,preferred_foot,min_age,max_age,transfer_type,transfer_budget,salary_budget,currency,salary_period,profile_notes,registration_notes,status,confidence,confirmed_at,expires_at)
  values(p_organisation_id,p_source_person_id,auth.uid(),coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement'),trim(p_position),nullif(trim(p_preferred_foot),''),p_min_age,p_max_age,nullif(trim(p_transfer_type),''),p_transfer_budget,p_salary_budget,nullif(trim(p_currency),''),nullif(trim(p_salary_period),''),nullif(trim(p_profile_notes),''),nullif(trim(p_registration_notes),''),'active',1,now(),coalesce(p_expires_at,now()+interval '45 days'))
  returning id into v_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,person_id,club_need_id,payload,source,confidence,occurred_at)
  values('CLUB_NEED_CREATED',auth.uid(),p_organisation_id,p_source_person_id,v_id,jsonb_build_object('position',trim(p_position)),'market',1,now());
  return jsonb_build_object('need_id',v_id);
end;
$$;

revoke execute on function public.djm_network_tasks(text) from public,anon;
revoke execute on function public.djm_network_create_task(text,timestamptz,uuid,uuid,uuid,smallint,text) from public,anon;
revoke execute on function public.djm_network_activity(integer) from public,anon;
revoke execute on function public.djm_network_club(uuid) from public,anon;
revoke execute on function public.djm_market_set_need_status(uuid,text) from public,anon;
revoke execute on function public.djm_market_set_match_status(uuid,text) from public,anon;
revoke execute on function public.djm_market_create_need(uuid,text,text,uuid,text,smallint,smallint,text,numeric,numeric,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.djm_network_tasks(text) to authenticated;
grant execute on function public.djm_network_create_task(text,timestamptz,uuid,uuid,uuid,smallint,text) to authenticated;
grant execute on function public.djm_network_activity(integer) to authenticated;
grant execute on function public.djm_network_club(uuid) to authenticated;
grant execute on function public.djm_market_set_need_status(uuid,text) to authenticated;
grant execute on function public.djm_market_set_match_status(uuid,text) to authenticated;
grant execute on function public.djm_market_create_need(uuid,text,text,uuid,text,smallint,smallint,text,numeric,numeric,text,text,text,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
