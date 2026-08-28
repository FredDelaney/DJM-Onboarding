create index if not exists idx_market_signals_created_by on djm_os.market_signals(created_by) where created_by is not null;
create index if not exists idx_market_signals_person on djm_os.market_signals(person_id) where person_id is not null;
create index if not exists idx_market_signals_player on djm_os.market_signals(player_id) where player_id is not null;
create index if not exists idx_market_signals_prospect on djm_os.market_signals(prospect_id) where prospect_id is not null;
create index if not exists idx_memories_created_by on djm_os.memories(created_by) where created_by is not null;
create index if not exists idx_relationship_edges_created_by on djm_os.relationship_edges(created_by) where created_by is not null;

create table if not exists djm_os.deal_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organisation_id uuid not null references djm_os.organisations(id) on delete cascade,
  source_person_id uuid references djm_os.people(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  prospect_id uuid references djm_os.scouting_prospects(id) on delete set null,
  club_need_id uuid references djm_os.club_needs(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  stage text not null default 'qualifying' check (stage in ('qualifying','contacted','interest','negotiating','offer','contracting','won','lost','paused')),
  status text not null default 'active' check (status in ('active','won','lost','paused')),
  expected_commission numeric check (expected_commission is null or expected_commission >= 0),
  currency text not null default 'EUR',
  probability smallint not null default 25 check (probability between 0 and 100),
  primary_blocker text,
  next_decision text,
  next_action_at timestamptz,
  last_meaningful_at timestamptz,
  source text,
  outcome_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(player_id, prospect_id) = 1)
);

create index if not exists idx_deal_rooms_active_next on djm_os.deal_rooms(status,next_action_at) where status='active';
create index if not exists idx_deal_rooms_org on djm_os.deal_rooms(organisation_id);
create index if not exists idx_deal_rooms_player on djm_os.deal_rooms(player_id) where player_id is not null;
create index if not exists idx_deal_rooms_prospect on djm_os.deal_rooms(prospect_id) where prospect_id is not null;
create index if not exists idx_deal_rooms_need on djm_os.deal_rooms(club_need_id) where club_need_id is not null;
create index if not exists idx_deal_rooms_owner on djm_os.deal_rooms(owner_user_id) where owner_user_id is not null;

alter table djm_os.deal_rooms enable row level security;
drop policy if exists team_deal_rooms_all on djm_os.deal_rooms;
create policy team_deal_rooms_all on djm_os.deal_rooms for all to authenticated
using ((select djm_os.is_team_member()))
with check ((select djm_os.is_team_member()));
grant select,insert,update,delete on djm_os.deal_rooms to authenticated;

create or replace function public.djm_deal_room_upsert(
  p_id uuid default null,
  p_title text default null,
  p_organisation_id uuid default null,
  p_source_person_id uuid default null,
  p_player_id uuid default null,
  p_prospect_id uuid default null,
  p_club_need_id uuid default null,
  p_stage text default 'qualifying',
  p_expected_commission numeric default null,
  p_currency text default 'EUR',
  p_probability smallint default 25,
  p_primary_blocker text default null,
  p_next_decision text default null,
  p_next_action_at timestamptz default null,
  p_source text default 'manual'
) returns jsonb language plpgsql set search_path='' as $$
declare v_id uuid; v_owner uuid := (select auth.uid());
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_id is null then
    if p_organisation_id is null then raise exception 'Club is required'; end if;
    if num_nonnulls(p_player_id,p_prospect_id) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
    insert into djm_os.deal_rooms(title,organisation_id,source_person_id,player_id,prospect_id,club_need_id,owner_user_id,stage,status,expected_commission,currency,probability,primary_blocker,next_decision,next_action_at,last_meaningful_at,source)
    values(coalesce(nullif(trim(p_title),''),'DJM deal'),p_organisation_id,p_source_person_id,p_player_id,p_prospect_id,p_club_need_id,v_owner,p_stage,'active',p_expected_commission,coalesce(nullif(trim(p_currency),''),'EUR'),greatest(0,least(100,coalesce(p_probability,25))),nullif(trim(p_primary_blocker),''),nullif(trim(p_next_decision),''),p_next_action_at,now(),coalesce(nullif(trim(p_source),''),'manual'))
    returning id into v_id;
  else
    update djm_os.deal_rooms set
      title=coalesce(nullif(trim(p_title),''),title),
      stage=coalesce(p_stage,stage),
      expected_commission=coalesce(p_expected_commission,expected_commission),
      currency=coalesce(nullif(trim(p_currency),''),currency),
      probability=greatest(0,least(100,coalesce(p_probability,probability))),
      primary_blocker=coalesce(nullif(trim(p_primary_blocker),''),primary_blocker),
      next_decision=coalesce(nullif(trim(p_next_decision),''),next_decision),
      next_action_at=coalesce(p_next_action_at,next_action_at),
      last_meaningful_at=now(),updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Deal room not found'; end if;
  end if;
  return jsonb_build_object('deal_room_id',v_id);
end $$;
grant execute on function public.djm_deal_room_upsert(uuid,text,uuid,uuid,uuid,uuid,uuid,text,numeric,text,smallint,text,text,timestamptz,text) to authenticated;

create or replace function public.djm_deal_rooms(p_status text default 'active')
returns table(id uuid,title text,organisation_id uuid,organisation_name text,player_id uuid,prospect_id uuid,player_name text,stage text,status text,expected_commission numeric,currency text,probability smallint,weighted_value numeric,primary_blocker text,next_decision text,next_action_at timestamptz,owner_name text,updated_at timestamptz)
language sql stable set search_path='' as $$
select d.id,d.title,d.organisation_id,o.name,
 d.player_id,d.prospect_id,
 coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) as player_name,
 d.stage,d.status,d.expected_commission,d.currency,d.probability,
 round(coalesce(d.expected_commission,0)*(d.probability::numeric/100),2) as weighted_value,
 d.primary_blocker,d.next_decision,d.next_action_at,tm.display_name,d.updated_at
from djm_os.deal_rooms d
join djm_os.organisations o on o.id=d.organisation_id
left join public.players p on p.id=d.player_id
left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
left join djm_os.team_members tm on tm.user_id=d.owner_user_id
where p_status is null or d.status=p_status
order by case when d.status='active' then 0 else 1 end, d.next_action_at nulls last, weighted_value desc, d.updated_at desc;
$$;
grant execute on function public.djm_deal_rooms(text) to authenticated;

create or replace function public.djm_deal_room(p_deal_room_id uuid)
returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object(
 'deal',(select to_jsonb(x) from (
   select d.*,o.name organisation_name,coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) player_name,tm.display_name owner_name
   from djm_os.deal_rooms d join djm_os.organisations o on o.id=d.organisation_id
   left join public.players p on p.id=d.player_id left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
   left join djm_os.team_members tm on tm.user_id=d.owner_user_id where d.id=p_deal_room_id
 ) x),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at nulls last) from (
   select id,title,due_at,status,priority from djm_os.tasks where club_need_id=(select club_need_id from djm_os.deal_rooms where id=p_deal_room_id) and status not in ('done','completed','cancelled')
 ) t),'[]'::jsonb)
);
$$;
grant execute on function public.djm_deal_room(uuid) to authenticated;

create or replace function public.djm_deal_room_set_stage(p_deal_room_id uuid,p_stage text,p_probability smallint default null,p_outcome_reason text default null)
returns jsonb language plpgsql set search_path='' as $$
declare v_status text;begin
 if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
 if p_stage not in ('qualifying','contacted','interest','negotiating','offer','contracting','won','lost','paused') then raise exception 'Invalid deal stage'; end if;
 v_status:=case when p_stage='won' then 'won' when p_stage='lost' then 'lost' when p_stage='paused' then 'paused' else 'active' end;
 update djm_os.deal_rooms set stage=p_stage,status=v_status,probability=case when p_stage='won' then 100 when p_stage='lost' then 0 else coalesce(p_probability,probability) end,outcome_reason=coalesce(nullif(trim(p_outcome_reason),''),outcome_reason),last_meaningful_at=now(),updated_at=now() where id=p_deal_room_id;
 return jsonb_build_object('ok',true,'status',v_status);
end $$;
grant execute on function public.djm_deal_room_set_stage(uuid,text,smallint,text) to authenticated;

create or replace function public.djm_contact_readiness(p_person_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_last timestamptz;v_outbound14 integer:=0;v_inbound14 integer:=0;v_strength integer:=0;v_access integer:=0;v_channel text;v_state text;v_reason text;
begin
 select max(occurred_at),count(*) filter(where direction='outbound' and occurred_at>=now()-interval '14 days'),count(*) filter(where direction='inbound' and occurred_at>=now()-interval '14 days') into v_last,v_outbound14,v_inbound14 from djm_os.interactions where person_id=p_person_id;
 select coalesce(max(strength_score),0),coalesce(max(access_score),0) into v_strength,v_access from djm_os.relationships where person_id=p_person_id;
 select channel into v_channel from djm_os.contact_methods where person_id=p_person_id and channel in ('whatsapp','phone','email','linkedin') order by case channel when 'whatsapp' then 1 when 'phone' then 2 when 'email' then 3 else 4 end,is_primary desc limit 1;
 if v_outbound14>=3 and v_inbound14=0 then v_state:='red';v_reason:='Multiple recent outbound attempts without a reply. Do not chase now.';
 elsif v_last is not null and v_last>=now()-interval '3 days' and v_inbound14=0 and v_outbound14>0 then v_state:='amber';v_reason:='Recent outbound contact. Give the relationship space unless there is a genuine deadline.';
 elsif v_strength>=65 or v_access>=70 then v_state:='green';v_reason:='Relationship/access is strong enough for a purposeful approach.';
 else v_state:='amber';v_reason:='Approach relationship-first and only with a clear reason to contact.'; end if;
 return jsonb_build_object('state',v_state,'reason',v_reason,'preferred_channel',coalesce(v_channel,'unknown'),'relationship_strength',v_strength,'access',v_access,'recent_outbound',v_outbound14,'recent_inbound',v_inbound14,'last_interaction_at',v_last);
end $$;
grant execute on function public.djm_contact_readiness(uuid) to authenticated;

create or replace function djm_os.refresh_relationship_graph() returns integer language plpgsql set search_path='' as $$
declare v_count integer:=0;v_rows integer;begin
 insert into djm_os.relationship_edges(from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_kind,observed_at,status,created_by)
 select 'team_member',r.team_member_id,'person',r.person_id,'knows',coalesce(r.strength_score,50),0.95,'djm_relationship',now(),'active',r.team_member_id from djm_os.relationships r
 on conflict(from_type,from_id,to_type,to_id,relation_type) do update set strength=excluded.strength,confidence=excluded.confidence,observed_at=now(),status='active',updated_at=now();
 get diagnostics v_rows=row_count;v_count:=v_count+v_rows;
 insert into djm_os.relationship_edges(from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_kind,observed_at,status)
 select 'person',e.person_id,'club',e.organisation_id,'works_at',90,coalesce(e.confidence,0.8),'employment',now(),'active' from djm_os.employments e where e.is_current=true
 on conflict(from_type,from_id,to_type,to_id,relation_type) do update set strength=excluded.strength,confidence=excluded.confidence,observed_at=now(),status='active',updated_at=now();
 get diagnostics v_rows=row_count;v_count:=v_count+v_rows;
 return v_count;
end $$;

select djm_os.refresh_relationship_graph();
