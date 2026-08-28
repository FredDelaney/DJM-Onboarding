alter table djm_os.club_needs add column if not exists source_message_id uuid references djm_os.messages(id) on delete set null;
alter table djm_os.tasks add column if not exists source_message_id uuid references djm_os.messages(id) on delete set null;
create unique index if not exists djm_club_need_source_message_uidx on djm_os.club_needs(source_message_id) where source_message_id is not null;
create unique index if not exists djm_task_source_message_uidx on djm_os.tasks(source_message_id) where source_message_id is not null and task_type='commitment';
create index if not exists djm_club_need_source_message_idx on djm_os.club_needs(source_message_id);
create index if not exists djm_task_source_message_idx on djm_os.tasks(source_message_id);

create or replace function djm_os.process_message_rule_based(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m djm_os.messages%rowtype; t djm_os.conversation_threads%rowtype; v_text text; v_position text; v_need uuid; v_task uuid; v_review uuid;
begin
 select * into m from djm_os.messages where id=p_message_id; if not found then return jsonb_build_object('processed',false); end if;
 select * into t from djm_os.conversation_threads where id=m.thread_id; if not found then return jsonb_build_object('processed',false); end if;
 v_text:=trim(coalesce(m.transcript_text,m.raw_text,''));
 if v_text='' then update djm_os.messages set processing_status='stored' where id=m.id; return jsonb_build_object('processed',true,'text',false); end if;
 v_position:=djm_os.normalise_need_position(v_text);
 select id into v_need from djm_os.club_needs where source_message_id=m.id limit 1;
 if v_need is null and lower(m.direction) in ('incoming','inbound','received') and v_position is not null and v_text ~* '\m(need|looking|searching|want|require|after|looking for)\M' then
   if t.organisation_id is not null then
     insert into djm_os.club_needs(organisation_id,source_person_id,owner_user_id,title,position,profile_notes,status,confidence,confirmed_at,expires_at,source_message_id)
     values(t.organisation_id,t.person_id,t.owner_user_id,v_position||' requirement',v_position,left(v_text,1000),'active',0.74,m.sent_at,m.sent_at+interval '45 days',m.id)
     on conflict (source_message_id) where source_message_id is not null do update set organisation_id=excluded.organisation_id,source_person_id=excluded.source_person_id,owner_user_id=excluded.owner_user_id,position=excluded.position,profile_notes=excluded.profile_notes,updated_at=now()
     returning id into v_need;
     update djm_os.review_items set status='resolved',resolved_at=now() where review_type='need_missing_club' and payload->>'message_id'=m.id::text and status='open';
   else
     insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,confidence,payload,status)
     select t.owner_user_id,'need_missing_club','Club need detected but club is unknown','Link this WhatsApp thread to a club to activate the need.',t.person_id,0.74,jsonb_build_object('message_id',m.id,'thread_id',t.id,'position',v_position,'text',left(v_text,1000)),'open'
     where not exists(select 1 from djm_os.review_items r where r.review_type='need_missing_club' and r.payload->>'message_id'=m.id::text and r.status='open')
     returning id into v_review;
   end if;
 end if;
 select id into v_task from djm_os.tasks where source_message_id=m.id and task_type='commitment' limit 1;
 if v_task is null and lower(m.direction) in ('outgoing','outbound','sent') and v_text ~* '\m(i.ll|i will|we.ll|we will|i can|we can)\M' and v_text ~* '\m(send|call|speak|follow up|revert|get back|come back|check|ask)\M' then
   insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,due_at,status,priority,source,source_message_id)
   values(case when v_text ~* '\msend\M' then 'Follow through on promised send' when v_text ~* '\m(call|speak)\M' then 'Follow through on promised call' else 'Follow through on WhatsApp commitment' end,'commitment',t.owner_user_id,t.person_id,t.organisation_id,null,'open',5,'whatsapp_message',m.id)
   on conflict (source_message_id) where source_message_id is not null and task_type='commitment' do update set person_id=excluded.person_id,organisation_id=excluded.organisation_id,owner_user_id=excluded.owner_user_id,updated_at=now()
   returning id into v_task;
 elsif v_task is not null then
   update djm_os.tasks set person_id=coalesce(t.person_id,person_id),organisation_id=coalesce(t.organisation_id,organisation_id),updated_at=now() where id=v_task;
 end if;
 if t.person_id is null then
   insert into djm_os.review_items(owner_user_id,review_type,title,detail,confidence,payload,status)
   select t.owner_user_id,'thread_identity','Identify WhatsApp contact',coalesce(t.thread_label,'Unknown WhatsApp thread'),0.5,jsonb_build_object('thread_id',t.id),'open'
   where not exists(select 1 from djm_os.review_items r where r.review_type='thread_identity' and r.payload->>'thread_id'=t.id::text and r.status='open') returning id into v_review;
 end if;
 insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
 select 'MESSAGE_PROCESSED',t.owner_user_id,t.person_id,t.organisation_id,jsonb_build_object('message_id',m.id,'thread_id',t.id,'position',v_position,'club_need_id',v_need,'task_id',v_task),'whatsapp_message',1,m.sent_at
 where not exists(select 1 from djm_os.events e where e.event_type='MESSAGE_PROCESSED' and e.payload->>'message_id'=m.id::text and e.organisation_id is not distinct from t.organisation_id);
 update djm_os.messages set processing_status='processed',extracted_json=coalesce(extracted_json,'{}'::jsonb)||jsonb_build_object('position',v_position,'club_need_id',v_need,'task_id',v_task) where id=m.id;
 perform djm_os.thread_interaction_rollup(t.id);
 return jsonb_build_object('processed',true,'position',v_position,'club_need_id',v_need,'task_id',v_task,'review_id',v_review);
end $$;

create or replace function public.djm_link_thread(p_thread_id uuid,p_person_id uuid default null,p_organisation_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid; v_count int:=0; r record;
begin
 select owner_user_id into v_owner from djm_os.conversation_threads where id=p_thread_id; if not found or v_owner<>auth.uid() then raise exception 'Thread not found'; end if;
 update djm_os.conversation_threads set person_id=coalesce(p_person_id,person_id),organisation_id=coalesce(p_organisation_id,organisation_id),updated_at=now() where id=p_thread_id;
 update djm_os.review_items set status='resolved',resolved_at=now() where review_type='thread_identity' and payload->>'thread_id'=p_thread_id::text and status='open';
 for r in select id from djm_os.messages where thread_id=p_thread_id order by sent_at loop perform djm_os.process_message_rule_based(r.id); v_count:=v_count+1; end loop;
 perform djm_os.thread_interaction_rollup(p_thread_id);
 return jsonb_build_object('thread_id',p_thread_id,'person_id',p_person_id,'organisation_id',p_organisation_id,'linked',true,'messages_reprocessed',v_count);
end $$;
