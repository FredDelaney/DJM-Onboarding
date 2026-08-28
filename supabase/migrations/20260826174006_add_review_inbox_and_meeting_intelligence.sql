create table if not exists djm_os.review_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references djm_os.team_members(user_id) on delete set null,
  review_type text not null,
  title text not null,
  detail text,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  club_need_id uuid references djm_os.club_needs(id) on delete set null,
  capture_id uuid references djm_os.captures(id) on delete cascade,
  claim_id uuid references djm_os.claims(id) on delete cascade,
  confidence numeric(5,4),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check(status in ('open','approved','rejected','resolved','expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(capture_id,review_type),
  unique(claim_id,review_type)
);
create index if not exists review_items_owner_idx on djm_os.review_items(owner_user_id,status,created_at desc);
create index if not exists review_items_person_idx on djm_os.review_items(person_id,status);
create index if not exists review_items_org_idx on djm_os.review_items(organisation_id,status);

grant select,insert,update,delete on djm_os.review_items to authenticated;
alter table djm_os.review_items enable row level security;
drop policy if exists djm_team_select on djm_os.review_items;
drop policy if exists djm_team_insert on djm_os.review_items;
drop policy if exists djm_team_update on djm_os.review_items;
drop policy if exists djm_team_delete on djm_os.review_items;
create policy djm_team_select on djm_os.review_items for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.review_items for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.review_items for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.review_items for delete to authenticated using ((select djm_os.is_team_member()));

create or replace function djm_os.refresh_review_inbox()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_caps int:=0;v_claims int:=0;
begin
  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,capture_id,confidence,payload,status)
  select c.submitted_by,'capture_review',
         case when c.capture_type='image' then 'Review screenshot capture' when c.capture_type='audio' then 'Review voice capture' else 'Review captured item' end,
         coalesce(c.error_message,'Automatic extraction needs confirmation before it becomes trusted data.'),
         c.person_id,c.organisation_id,c.id,c.confidence,c.extracted_json,'open'
  from djm_os.captures c
  where c.status='needs_review'
  on conflict(capture_id,review_type) do nothing;
  get diagnostics v_caps=row_count;

  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,player_id,claim_id,confidence,payload,status)
  select coalesce(i.team_member_id,(select user_id from djm_os.team_members where is_active=true order by role='owner' desc,created_at limit 1)),
         'claim_review','Verify extracted intelligence',cl.claim_type||coalesce(': '||cl.claim_key,''),cl.person_id,cl.organisation_id,cl.player_id,cl.id,cl.confidence,cl.value_json,'open'
  from djm_os.claims cl
  left join djm_os.interactions i on i.id=cl.interaction_id
  where coalesce(cl.confidence,0)<0.8 and cl.last_verified_at is null
  on conflict(claim_id,review_type) do nothing;
  get diagnostics v_claims=row_count;

  return jsonb_build_object('captures_added',v_caps,'claims_added',v_claims);
end;
$$;
revoke all on function djm_os.refresh_review_inbox() from public,anon,authenticated;

create or replace function public.djm_network_review_inbox(p_scope text default 'mine')
returns table(
  id uuid,review_type text,title text,detail text,owner_user_id uuid,owner_name text,
  person_id uuid,person_name text,organisation_id uuid,organisation_name text,player_id uuid,club_need_id uuid,
  capture_id uuid,claim_id uuid,confidence numeric,payload jsonb,status text,created_at timestamptz
)
language sql stable security invoker set search_path=''
as $$
  select r.id,r.review_type,r.title,r.detail,r.owner_user_id,tm.display_name,
         r.person_id,p.full_name,r.organisation_id,o.name,r.player_id,r.club_need_id,r.capture_id,r.claim_id,r.confidence,r.payload,r.status,r.created_at
  from djm_os.review_items r
  left join djm_os.team_members tm on tm.user_id=r.owner_user_id
  left join djm_os.people p on p.id=r.person_id
  left join djm_os.organisations o on o.id=r.organisation_id
  where r.status='open' and (p_scope='all' or r.owner_user_id is null or r.owner_user_id=auth.uid())
  order by coalesce(r.confidence,0) asc,r.created_at;
$$;

create or replace function public.djm_network_resolve_review(p_review_id uuid,p_resolution text,p_note text default null)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_item djm_os.review_items%rowtype;v_res text;
begin
  v_res:=lower(trim(coalesce(p_resolution,'')));
  if v_res not in ('approved','rejected','resolved') then raise exception 'Resolution must be approved, rejected or resolved'; end if;
  select * into v_item from djm_os.review_items where id=p_review_id and status='open';
  if not found then raise exception 'Open review item not found'; end if;
  if v_item.owner_user_id is not null and v_item.owner_user_id<>auth.uid() then raise exception 'Only the assigned owner can resolve this item'; end if;

  update djm_os.review_items set status=v_res,resolved_at=now(),payload=payload||jsonb_build_object('resolution_note',nullif(trim(p_note),''),'resolved_by',auth.uid()) where id=p_review_id;
  if v_item.capture_id is not null then
    update djm_os.captures set status=case when v_res='approved' then 'processed' when v_res='rejected' then 'rejected' else 'resolved' end,processed_at=now() where id=v_item.capture_id;
  end if;
  if v_item.claim_id is not null and v_res='approved' then
    update djm_os.claims set last_verified_at=now() where id=v_item.claim_id;
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values('REVIEW_RESOLVED',auth.uid(),v_item.person_id,v_item.organisation_id,v_item.player_id,jsonb_build_object('review_id',p_review_id,'resolution',v_res,'note',nullif(trim(p_note),'')),'review_inbox',1,now());
  return jsonb_build_object('review_id',p_review_id,'status',v_res);
end;
$$;

create or replace function public.djm_network_meeting_brief(p_meeting_id uuid)
returns jsonb
language sql stable security invoker set search_path=''
as $$
with m as (
  select * from djm_os.meetings where id=p_meeting_id and (owner_user_id=auth.uid() or djm_os.is_team_member())
)
select jsonb_build_object(
  'meeting',(select to_jsonb(x) from (
    select m.id,m.title,m.starts_at,m.ends_at,m.status,m.person_id,p.full_name person_name,m.organisation_id,o.name organisation_name,o.country organisation_country,m.meeting_url,m.invitee_email,m.notes
    from m left join djm_os.people p on p.id=m.person_id left join djm_os.organisations o on o.id=m.organisation_id
  ) x),
  'relationship',coalesce((select jsonb_agg(to_jsonb(x) order by x.strength_score desc) from (
    select r.team_member_id,tm.display_name,r.strength_score,r.trust_score,r.access_score,r.last_meaningful_at,r.relationship_notes
    from m join djm_os.relationships r on r.person_id=m.person_id join djm_os.team_members tm on tm.user_id=r.team_member_id
  ) x),'[]'::jsonb),
  'recent_interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
    select i.id,i.occurred_at,i.channel,i.summary,tm.display_name team_member_name
    from m join djm_os.interactions i on (i.person_id=m.person_id or (m.organisation_id is not null and i.organisation_id=m.organisation_id))
    left join djm_os.team_members tm on tm.user_id=i.team_member_id
    order by i.occurred_at desc limit 8
  ) x),'[]'::jsonb),
  'active_needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select n.id,n.title,n.position,n.preferred_foot,n.status,n.confidence,n.profile_notes,n.updated_at,
      (select count(*) from djm_os.player_matches pm where pm.club_need_id=n.id and pm.status not in ('dismissed','rejected')) match_count
    from m join djm_os.club_needs n on n.organisation_id=m.organisation_id where n.status in ('active','open','confirmed')
  ) x),'[]'::jsonb),
  'open_tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.priority desc,x.due_at asc nulls last) from (
    select t.id,t.title,t.priority,t.due_at,t.status
    from m join djm_os.tasks t on (t.person_id=m.person_id or (m.organisation_id is not null and t.organisation_id=m.organisation_id))
    where t.status not in ('done','completed','cancelled')
  ) x),'[]'::jsonb),
  'opportunities',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select po.id,po.player_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player') player_name,po.stage,po.summary,po.next_action,po.next_action_due,po.updated_at
    from m join djm_os.opportunity_links l on l.organisation_id=m.organisation_id
    join public.player_opportunities po on po.id=l.opportunity_id join public.players p on p.id=po.player_id
    where lower(po.stage) not in ('closed','lost','placed','won')
  ) x),'[]'::jsonb)
);
$$;

create or replace function public.djm_network_complete_meeting(p_meeting_id uuid,p_summary text,p_next_action text default null,p_next_action_due timestamptz default null)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_m djm_os.meetings%rowtype;v_interaction uuid;v_task uuid;
begin
  select * into v_m from djm_os.meetings where id=p_meeting_id and owner_user_id=auth.uid();
  if not found then raise exception 'Meeting not found or not owned by you'; end if;
  if p_summary is null or length(trim(p_summary))<2 then raise exception 'Meeting summary is required'; end if;

  update djm_os.meetings set status='completed',notes=trim(p_summary),updated_at=now() where id=p_meeting_id;
  insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,organisation_id,source_external_id,source_type,raw_text,summary,confidence)
  values(v_m.starts_at,'meeting','completed',auth.uid(),v_m.person_id,v_m.organisation_id,p_meeting_id::text,'network_meeting',trim(p_summary),left(trim(p_summary),240),1)
  returning id into v_interaction;
  if v_m.person_id is not null then
    insert into djm_os.relationships(team_member_id,person_id,last_meaning_at,first_known_at,strength_score)
    values(auth.uid(),v_m.person_id,v_m.starts_at,v_m.starts_at,40)
    on conflict(team_member_id,person_id) do update set last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),updated_at=now();
  end if;
  if p_next_action is not null and length(trim(p_next_action))>1 then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(trim(p_next_action),'meeting_followup',auth.uid(),v_m.person_id,v_m.organisation_id,v_interaction,p_next_action_due,'open',4,'meeting') returning id into v_task;
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values('MEETING_COMPLETED',auth.uid(),v_m.person_id,v_m.organisation_id,v_interaction,jsonb_build_object('meeting_id',p_meeting_id,'task_id',v_task),'network',1,now());
  return jsonb_build_object('meeting_id',p_meeting_id,'interaction_id',v_interaction,'task_id',v_task);
end;
$$;

revoke execute on function public.djm_network_review_inbox(text) from public,anon;
revoke execute on function public.djm_network_resolve_review(uuid,text,text) from public,anon;
revoke execute on function public.djm_network_meeting_brief(uuid) from public,anon;
revoke execute on function public.djm_network_complete_meeting(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.djm_network_review_inbox(text) to authenticated;
grant execute on function public.djm_network_resolve_review(uuid,text,text) to authenticated;
grant execute on function public.djm_network_meeting_brief(uuid) to authenticated;
grant execute on function public.djm_network_complete_meeting(uuid,text,text,timestamptz) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname='djm-os-review-refresh';
select cron.schedule('djm-os-review-refresh','27 */2 * * *','select djm_os.refresh_review_inbox();');
notify pgrst,'reload schema';
