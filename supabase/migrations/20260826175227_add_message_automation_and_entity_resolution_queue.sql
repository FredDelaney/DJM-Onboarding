create table if not exists djm_os.entity_resolution_queue (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  candidate_entity_type text,
  candidate_entity_id uuid,
  candidate_label text,
  confidence numeric(5,4),
  reason text,
  status text not null default 'open',
  owner_user_id uuid references djm_os.team_members(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references djm_os.team_members(user_id) on delete set null,
  unique(source_type,source_id,candidate_entity_type,candidate_entity_id)
);
create index if not exists entity_resolution_open_idx on djm_os.entity_resolution_queue(owner_user_id,status,confidence desc);
alter table djm_os.entity_resolution_queue enable row level security;
grant select,insert,update,delete on djm_os.entity_resolution_queue to authenticated;
create policy djm_team_select on djm_os.entity_resolution_queue for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.entity_resolution_queue for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.entity_resolution_queue for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.entity_resolution_queue for delete to authenticated using ((select djm_os.is_team_member()));

create or replace function djm_os.normalise_need_position(p_text text)
returns text language sql immutable security invoker set search_path=''
as $$ select case
 when p_text ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
 when p_text ~* '\m(right[- ]?foot(ed)? (centre|center)[- ]?back|rcb)\M' then 'RCB'
 when p_text ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
 when p_text ~* '\mleft[- ]?back|\mlb\M' then 'LB'
 when p_text ~* '\mright[- ]?back|\mrb\M' then 'RB'
 when p_text ~* '\mright winger|\mrw\M' then 'RW'
 when p_text ~* '\mleft winger|\mlw\M' then 'LW'
 when p_text ~* '\mwinger\M' then 'Winger'
 when p_text ~* '\mdefensive midfield(er)?|holding midfield(er)?|number 6|no\.? ?6\M' then '6'
 when p_text ~* '\mcentral midfield(er)?|number 8|no\.? ?8\M' then '8'
 when p_text ~* '\mattacking midfield(er)?|number 10|no\.? ?10\M' then '10'
 when p_text ~* '\mstriker|centre forward|center forward|\mcf\M' then 'ST'
 when p_text ~* '\mgoalkeeper|keeper|\mgk\M' then 'GK'
 else null end; $$;

create or replace function djm_os.process_message_rule_based(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare m djm_os.messages%rowtype; t djm_os.conversation_threads%rowtype; v_text text; v_position text; v_need uuid; v_task uuid; v_review uuid; begin
 select * into m from djm_os.messages where id=p_message_id; if not found then return jsonb_build_object('processed',false); end if;
 select * into t from djm_os.conversation_threads where id=m.thread_id; if not found then return jsonb_build_object('processed',false); end if;
 v_text:=trim(coalesce(m.transcript_text,m.raw_text,'')); if v_text='' then update djm_os.messages set processing_status='stored' where id=m.id; return jsonb_build_object('processed',true,'text',false); end if;
 v_position:=djm_os.normalise_need_position(v_text);
 if lower(m.direction) in ('incoming','inbound','received') and v_position is not null and v_text ~* '\m(need|looking|searching|want|require|after|looking for)\M' then
   if t.organisation_id is not null then
     insert into djm_os.club_needs(organisation_id,source_person_id,owner_user_id,title,position,profile_notes,status,confidence,confirmed_at,expires_at)
     values(t.organisation_id,t.person_id,t.owner_user_id,v_position||' requirement',v_position,left(v_text,1000),'active',0.74,m.sent_at,m.sent_at+interval '45 days') returning id into v_need;
   else
     insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,confidence,payload,status)
     values(t.owner_user_id,'need_missing_club','Club need detected but club is unknown','Link this WhatsApp thread to a club to activate the need.',t.person_id,0.74,jsonb_build_object('message_id',m.id,'position',v_position,'text',left(v_text,1000)),'open') returning id into v_review;
   end if;
 end if;
 if lower(m.direction) in ('outgoing','outbound','sent') and v_text ~* '\m(i.ll|i will|we.ll|we will|i can|we can)\M' and v_text ~* '\m(send|call|speak|follow up|revert|get back|come back|check|ask)\M' then
   insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,due_at,status,priority,source)
   values(case when v_text ~* '\msend\M' then 'Follow through on promised send' when v_text ~* '\m(call|speak)\M' then 'Follow through on promised call' else 'Follow through on WhatsApp commitment' end,'commitment',t.owner_user_id,t.person_id,t.organisation_id,null,'open',5,'whatsapp_message') returning id into v_task;
 end if;
 if t.person_id is null then
   insert into djm_os.review_items(owner_user_id,review_type,title,detail,confidence,payload,status)
   select t.owner_user_id,'thread_identity','Identify WhatsApp contact',coalesce(t.thread_label,'Unknown WhatsApp thread'),0.5,jsonb_build_object('thread_id',t.id),'open'
   where not exists(select 1 from djm_os.review_items r where r.review_type='thread_identity' and r.payload->>'thread_id'=t.id::text and r.status='open') returning id into v_review;
 end if;
 insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
 values('MESSAGE_PROCESSED',t.owner_user_id,t.person_id,t.organisation_id,jsonb_build_object('message_id',m.id,'thread_id',t.id,'position',v_position,'club_need_id',v_need,'task_id',v_task),'whatsapp_message',1,m.sent_at);
 update djm_os.messages set processing_status='processed',extracted_json=extracted_json||jsonb_build_object('position',v_position,'club_need_id',v_need,'task_id',v_task) where id=m.id;
 perform djm_os.thread_interaction_rollup(t.id);
 return jsonb_build_object('processed',true,'position',v_position,'club_need_id',v_need,'task_id',v_task,'review_id',v_review);
end; $$;
revoke all on function djm_os.process_message_rule_based(uuid) from public,anon,authenticated;

create or replace function djm_os.message_after_insert_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$ begin begin perform djm_os.process_message_rule_based(new.id); exception when others then update djm_os.messages set processing_status='needs_review' where id=new.id; raise warning 'DJM message processing failed for %: %',new.id,sqlerrm; end; return new; end; $$;
revoke all on function djm_os.message_after_insert_trigger() from public,anon,authenticated;
drop trigger if exists trg_djm_message_process on djm_os.messages;
create trigger trg_djm_message_process after insert on djm_os.messages for each row execute function djm_os.message_after_insert_trigger();

create or replace function public.djm_review_queue(p_limit integer default 50)
returns table(id uuid,review_type text,title text,detail text,person_id uuid,organisation_id uuid,player_id uuid,club_need_id uuid,capture_id uuid,claim_id uuid,confidence numeric,payload jsonb,created_at timestamptz)
language sql stable security invoker set search_path=''
as $$ select r.id,r.review_type,r.title,r.detail,r.person_id,r.organisation_id,r.player_id,r.club_need_id,r.capture_id,r.claim_id,r.confidence,r.payload,r.created_at from djm_os.review_items r where r.status='open' and (r.owner_user_id is null or r.owner_user_id=auth.uid()) order by coalesce(r.confidence,0.5) asc,r.created_at asc limit greatest(1,least(coalesce(p_limit,50),200)); $$;
revoke execute on function public.djm_review_queue(integer) from public,anon;
grant execute on function public.djm_review_queue(integer) to authenticated;
notify pgrst,'reload schema';
