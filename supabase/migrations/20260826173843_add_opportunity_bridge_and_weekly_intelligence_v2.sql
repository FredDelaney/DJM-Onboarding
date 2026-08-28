create table if not exists djm_os.opportunity_links (
  opportunity_id uuid primary key references public.player_opportunities(id) on delete cascade,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  person_id uuid references djm_os.people(id) on delete set null,
  club_need_id uuid references djm_os.club_needs(id) on delete set null,
  confidence numeric(5,4) not null default 1,
  linked_by uuid references djm_os.team_members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunity_links_org_idx on djm_os.opportunity_links(organisation_id);
create index if not exists opportunity_links_person_idx on djm_os.opportunity_links(person_id);
create index if not exists opportunity_links_need_idx on djm_os.opportunity_links(club_need_id);

grant select,insert,update,delete on djm_os.opportunity_links to authenticated;
alter table djm_os.opportunity_links enable row level security;
drop policy if exists djm_team_select on djm_os.opportunity_links;
drop policy if exists djm_team_insert on djm_os.opportunity_links;
drop policy if exists djm_team_update on djm_os.opportunity_links;
drop policy if exists djm_team_delete on djm_os.opportunity_links;
create policy djm_team_select on djm_os.opportunity_links for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.opportunity_links for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.opportunity_links for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.opportunity_links for delete to authenticated using ((select djm_os.is_team_member()));

create or replace function djm_os.opportunity_event_bridge()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_changed jsonb:='{}'::jsonb; v_link djm_os.opportunity_links%rowtype;
begin
  begin
    select * into v_link from djm_os.opportunity_links where opportunity_id=new.id;
    if tg_op='INSERT' then
      v_changed:=jsonb_build_object('stage',new.stage,'club_name',new.club_name,'next_action',new.next_action,'next_action_due',new.next_action_due);
      insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,club_need_id,payload,source,confidence,occurred_at)
      values('PLAYER_OPPORTUNITY_CREATED',new.owner_id,v_link.person_id,v_link.organisation_id,new.player_id,v_link.club_need_id,v_changed,'player_opportunity',1,now());
    else
      if old.stage is distinct from new.stage then v_changed:=v_changed||jsonb_build_object('stage',new.stage); end if;
      if old.next_action is distinct from new.next_action then v_changed:=v_changed||jsonb_build_object('next_action',new.next_action); end if;
      if old.next_action_due is distinct from new.next_action_due then v_changed:=v_changed||jsonb_build_object('next_action_due',new.next_action_due); end if;
      if old.last_contacted_at is distinct from new.last_contacted_at then v_changed:=v_changed||jsonb_build_object('last_contacted_at',new.last_contacted_at); end if;
      if v_changed<>'{}'::jsonb then
        insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,club_need_id,payload,source,confidence,occurred_at)
        values('PLAYER_OPPORTUNITY_CHANGED',new.owner_id,v_link.person_id,v_link.organisation_id,new.player_id,v_link.club_need_id,v_changed,'player_opportunity',1,now());
      end if;
    end if;
  exception when others then
    raise warning 'DJM opportunity event bridge skipped for %: %',new.id,sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function djm_os.opportunity_event_bridge() from public,anon,authenticated;
drop trigger if exists trg_djm_opportunity_event_bridge on public.player_opportunities;
create trigger trg_djm_opportunity_event_bridge
after insert or update of stage,next_action,next_action_due,last_contacted_at on public.player_opportunities
for each row execute function djm_os.opportunity_event_bridge();

create or replace function public.djm_network_link_opportunity(p_opportunity_id uuid,p_organisation_id uuid default null,p_person_id uuid default null,p_club_need_id uuid default null)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
begin
  if not exists(select 1 from public.player_opportunities where id=p_opportunity_id) then raise exception 'Opportunity not found'; end if;
  insert into djm_os.opportunity_links(opportunity_id,organisation_id,person_id,club_need_id,confidence,linked_by)
  values(p_opportunity_id,p_organisation_id,p_person_id,p_club_need_id,1,auth.uid())
  on conflict(opportunity_id) do update set organisation_id=excluded.organisation_id,person_id=excluded.person_id,club_need_id=excluded.club_need_id,linked_by=auth.uid(),updated_at=now();
  return jsonb_build_object('opportunity_id',p_opportunity_id,'linked',true);
end;
$$;

create or replace function public.djm_network_opportunities(p_scope text default 'mine')
returns table(
  id uuid,player_id uuid,player_name text,club_name text,country text,contact_name text,contact_role text,stage text,
  summary text,next_action text,next_action_due date,owner_id uuid,owner_name text,last_contacted_at timestamptz,outcome_note text,
  organisation_id uuid,organisation_name text,person_id uuid,person_name text,club_need_id uuid,updated_at timestamptz
)
language sql stable security invoker set search_path=''
as $$
  select po.id,po.player_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player'),po.club_name,po.country,po.contact_name,po.contact_role,po.stage,
         po.summary,po.next_action,po.next_action_due,po.owner_id,tm.display_name,po.last_contacted_at,po.outcome_note,
         l.organisation_id,o.name,l.person_id,pe.full_name,l.club_need_id,po.updated_at
  from public.player_opportunities po
  join public.players p on p.id=po.player_id
  left join djm_os.opportunity_links l on l.opportunity_id=po.id
  left join djm_os.organisations o on o.id=l.organisation_id
  left join djm_os.people pe on pe.id=l.person_id
  left join djm_os.team_members tm on tm.user_id=po.owner_id
  where p_scope='all' or po.owner_id is null or po.owner_id=auth.uid()
  order by case when lower(po.stage) in ('closed','lost','placed','won') then 1 else 0 end,po.next_action_due asc nulls last,po.updated_at desc;
$$;

create or replace function public.djm_network_club_coverage()
returns table(
  organisation_id uuid,organisation_name text,country text,current_contacts bigint,strong_contacts bigint,last_interaction_at timestamptz,
  active_needs bigint,open_opportunities bigint,coverage_score smallint,coverage_label text
)
language sql stable security invoker set search_path=''
as $$
with base as (
  select o.id,o.name,o.country,
    (select count(distinct e.person_id) from djm_os.employments e where e.organisation_id=o.id and e.is_current=true) as current_contacts,
    (select count(distinct e.person_id) from djm_os.employments e join djm_os.relationships r on r.person_id=e.person_id where e.organisation_id=o.id and e.is_current=true and r.strength_score>=60) as strong_contacts,
    (select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=o.id) as last_interaction_at,
    (select count(*) from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')) as active_needs,
    (select count(*) from djm_os.opportunity_links l join public.player_opportunities po on po.id=l.opportunity_id where l.organisation_id=o.id and lower(po.stage) not in ('closed','lost','placed','won')) as open_opportunities
  from djm_os.organisations o
  where o.organisation_type='club'
), scored as (
  select b.*,
    least(100,
      least(40,b.current_contacts*15)
      +least(30,b.strong_contacts*15)
      +case when b.last_interaction_at>now()-interval '30 days' then 20 when b.last_interaction_at>now()-interval '90 days' then 10 else 0 end
      +case when b.active_needs>0 then 10 else 0 end
    )::smallint as score
  from base b
)
select s.id,s.name,s.country,s.current_contacts,s.strong_contacts,s.last_interaction_at,s.active_needs,s.open_opportunities,s.score,
  case when s.score>=75 then 'Strong' when s.score>=45 then 'Developing' else 'Thin' end
from scored s
order by s.score desc,s.name;
$$;

create or replace function public.djm_weekly_intelligence(p_weeks_back integer default 0)
returns jsonb
language sql stable security invoker set search_path=''
as $$
with bounds as (
  select date_trunc('week',now())-(greatest(0,p_weeks_back)*interval '1 week') as start_at,
         date_trunc('week',now())-(greatest(0,p_weeks_back)*interval '1 week')+interval '1 week' as end_at
)
select jsonb_build_object(
  'period',jsonb_build_object('start',b.start_at,'end',b.end_at),
  'interactions',(select count(*) from djm_os.interactions i where i.occurred_at>=b.start_at and i.occurred_at<b.end_at),
  'new_contacts',(select count(*) from djm_os.people p where p.created_at>=b.start_at and p.created_at<b.end_at),
  'new_needs',(select count(*) from djm_os.club_needs n where n.created_at>=b.start_at and n.created_at<b.end_at),
  'tasks_completed',(select count(*) from djm_os.tasks t where t.completed_at>=b.start_at and t.completed_at<b.end_at),
  'opportunity_moves',(select count(*) from djm_os.events e where e.event_type='PLAYER_OPPORTUNITY_CHANGED' and e.occurred_at>=b.start_at and e.occurred_at<b.end_at),
  'high_matches',(select count(*) from djm_os.player_matches m join djm_os.club_needs n on n.id=m.club_need_id where m.overall_score>=80 and n.status in ('active','open','confirmed')),
  'top_relationships',coalesce((select jsonb_agg(to_jsonb(x) order by x.strength_score desc) from (
    select p.id,p.full_name,r.strength_score,r.last_meaningful_at,o.name organisation_name,tm.display_name owner_name
    from djm_os.relationships r join djm_os.people p on p.id=r.person_id join djm_os.team_members tm on tm.user_id=r.team_member_id
    left join lateral(select e.organisation_id from djm_os.employments e where e.person_id=p.id and e.is_current=true order by e.created_at desc limit 1) ce on true
    left join djm_os.organisations o on o.id=ce.organisation_id
    order by r.strength_score desc limit 10
  ) x),'[]'::jsonb),
  'needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select n.id,o.name organisation_name,n.position,n.title,n.status,n.confidence,n.updated_at,
      (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) match_count
    from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
    where n.status in ('active','open','confirmed') order by n.updated_at desc limit 15
  ) x),'[]'::jsonb),
  'thin_clubs',coalesce((select jsonb_agg(to_jsonb(x) order by x.coverage_score asc) from (
    select * from public.djm_network_club_coverage() where coverage_score<45 limit 10
  ) x),'[]'::jsonb)
) from bounds b;
$$;

revoke execute on function public.djm_network_link_opportunity(uuid,uuid,uuid,uuid) from public,anon;
revoke execute on function public.djm_network_opportunities(text) from public,anon;
revoke execute on function public.djm_network_club_coverage() from public,anon;
revoke execute on function public.djm_weekly_intelligence(integer) from public,anon;
grant execute on function public.djm_network_link_opportunity(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.djm_network_opportunities(text) to authenticated;
grant execute on function public.djm_network_club_coverage() to authenticated;
grant execute on function public.djm_weekly_intelligence(integer) to authenticated;
notify pgrst,'reload schema';
