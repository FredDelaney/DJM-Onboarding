alter table djm_os.messages add column if not exists import_batch_id uuid references djm_os.import_batches(id) on delete set null;
alter table djm_os.import_rows add column if not exists action text;
create index if not exists messages_import_batch_idx on djm_os.messages(import_batch_id);

create or replace function public.djm_import_whatsapp_messages(
  p_source_name text,p_external_thread_id text,p_thread_label text,p_person_id uuid,p_organisation_id uuid,p_messages jsonb,p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path=public,djm_os as $$
declare v_thread uuid; v_batch uuid; v_item jsonb; v_count int:=0; v_dupes int:=0; v_inserted int:=0; v_result jsonb; v_mid uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if jsonb_typeof(p_messages)<>'array' then raise exception 'messages must be a JSON array'; end if;
  v_thread:=public.djm_upsert_thread('whatsapp',p_external_thread_id,p_person_id,p_organisation_id,p_thread_label,coalesce(p_metadata,'{}'::jsonb));
  v_batch:=public.djm_create_import_batch('whatsapp_export',coalesce(nullif(p_source_name,''),'WhatsApp export'),null);
  for v_item in select value from jsonb_array_elements(p_messages) loop
    v_count:=v_count+1;
    v_result:=public.djm_store_message(v_thread,coalesce((v_item->>'sent_at')::timestamptz,now()),coalesce(v_item->>'direction','inbound'),nullif(v_item->>'raw_text',''),nullif(v_item->>'external_message_id',''),nullif(v_item->>'sender_label',''),coalesce(nullif(v_item->>'message_type',''),'text'),nullif(v_item->>'asset_uri',''),nullif(v_item->>'transcript_text',''),nullif(v_item->>'reply_to_external_id',''));
    if coalesce((v_result->>'created')::boolean,false) then
      v_mid:=(v_result->>'message_id')::uuid; update djm_os.messages set import_batch_id=v_batch where id=v_mid; v_inserted:=v_inserted+1;
    else v_dupes:=v_dupes+1; end if;
  end loop;
  update djm_os.import_batches set status='completed',total_rows=v_count,processed_rows=v_count,duplicate_rows=v_dupes,summary=jsonb_build_object('thread_id',v_thread,'inserted_messages',v_inserted,'duplicate_messages',v_dupes,'metadata',coalesce(p_metadata,'{}'::jsonb)),completed_at=now() where id=v_batch;
  if p_person_id is null then
    insert into djm_os.review_items(owner_user_id,review_type,title,detail,confidence,payload,status)
    select (select auth.uid()),'thread_identity','Link WhatsApp thread',coalesce(p_thread_label,'Imported WhatsApp thread')||' needs a person/club link.',0.95,jsonb_build_object('thread_id',v_thread,'batch_id',v_batch),'open'
    where not exists(select 1 from djm_os.review_items r where r.review_type='thread_identity' and r.payload->>'thread_id'=v_thread::text and r.status='open');
  end if;
  return jsonb_build_object('thread_id',v_thread,'batch_id',v_batch,'messages_received',v_count,'messages_inserted',v_inserted,'duplicates',v_dupes);
end $$;

create or replace function public.djm_import_contacts(p_source_name text,p_contacts jsonb)
returns jsonb language plpgsql security invoker set search_path=public,djm_os as $$
declare v_batch uuid; v_item jsonb; v_result jsonb; v_count int:=0; v_created int:=0; v_updated int:=0; v_errors int:=0; v_person uuid; v_org uuid; v_action text;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if jsonb_typeof(p_contacts)<>'array' then raise exception 'contacts must be a JSON array'; end if;
 v_batch:=public.djm_create_import_batch('contacts',coalesce(nullif(p_source_name,''),'contacts import'),null);
 for v_item in select value from jsonb_array_elements(p_contacts) loop
   v_count:=v_count+1;
   begin
     v_result:=public.djm_network_upsert_person(coalesce(nullif(v_item->>'full_name',''),nullif(v_item->>'name','')),coalesce(nullif(v_item->>'person_type',''),'club_contact'),nullif(coalesce(v_item->>'whatsapp',v_item->>'phone'),''),nullif(v_item->>'email',''),nullif(v_item->>'linkedin_url',''),nullif(v_item->>'country',''),nullif(v_item->>'city',''),nullif(coalesce(v_item->>'club_name',v_item->>'organisation'),''),nullif(coalesce(v_item->>'role_title',v_item->>'title'),''),nullif(v_item->>'club_country',''));
     v_person:=(v_result->>'person_id')::uuid; v_org:=nullif(v_result->>'organisation_id','')::uuid; v_action:=case when coalesce((v_result->>'created')::boolean,false) then 'created' else 'updated' end;
     if v_action='created' then v_created:=v_created+1; else v_updated:=v_updated+1; end if;
     insert into djm_os.import_rows(batch_id,row_number,raw_json,status,person_id,organisation_id,match_confidence,processed_at,action) values(v_batch,v_count,v_item,'processed',v_person,v_org,1,now(),v_action);
   exception when others then v_errors:=v_errors+1; insert into djm_os.import_rows(batch_id,row_number,raw_json,status,error_message,processed_at,action) values(v_batch,v_count,v_item,'error',left(sqlerrm,500),now(),'error'); end;
 end loop;
 update djm_os.import_batches set status=case when v_errors>0 then 'completed_with_errors' else 'completed' end,total_rows=v_count,processed_rows=v_count,error_rows=v_errors,created_people=v_created,updated_people=v_updated,summary=jsonb_build_object('created_people',v_created,'updated_people',v_updated,'errors',v_errors),completed_at=now() where id=v_batch;
 return jsonb_build_object('batch_id',v_batch,'contacts_received',v_count,'created_people',v_created,'updated_people',v_updated,'errors',v_errors);
end $$;

create or replace function public.djm_rollback_import(p_batch_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b djm_os.import_batches%rowtype; v_messages int:=0; v_people int:=0; v_protected int:=0; r record; v_thread uuid;
begin
 select * into b from djm_os.import_batches where id=p_batch_id and submitted_by=(select auth.uid()); if not found then raise exception 'Import batch not found'; end if;
 if b.status='rolled_back' then return jsonb_build_object('batch_id',p_batch_id,'already_rolled_back',true); end if;
 if b.source_type='whatsapp_export' then
   for r in select id,thread_id from djm_os.messages where import_batch_id=p_batch_id loop
     delete from djm_os.tasks where source_message_id=r.id;
     delete from djm_os.club_needs where source_message_id=r.id;
     delete from djm_os.review_items where payload->>'message_id'=r.id::text;
     delete from djm_os.events where payload->>'message_id'=r.id::text;
     v_thread:=r.thread_id;
   end loop;
   delete from djm_os.messages where import_batch_id=p_batch_id; get diagnostics v_messages=row_count;
   if v_thread is not null then
     update djm_os.conversation_threads t set message_count=(select count(*) from djm_os.messages m where m.thread_id=t.id),first_message_at=(select min(sent_at) from djm_os.messages m where m.thread_id=t.id),last_message_at=(select max(sent_at) from djm_os.messages m where m.thread_id=t.id),updated_at=now() where t.id=v_thread;
     perform djm_os.thread_interaction_rollup(v_thread);
     if not exists(select 1 from djm_os.messages where thread_id=v_thread) then delete from djm_os.review_items where payload->>'thread_id'=v_thread::text; delete from djm_os.interactions where source_uri='thread:'||v_thread::text; delete from djm_os.conversation_threads where id=v_thread; end if;
   end if;
 elsif b.source_type='contacts' then
   for r in select distinct person_id from djm_os.import_rows where batch_id=p_batch_id and action='created' and person_id is not null loop
     if exists(select 1 from djm_os.conversation_threads where person_id=r.person_id) or exists(select 1 from djm_os.interactions where person_id=r.person_id) or exists(select 1 from djm_os.tasks where person_id=r.person_id) or exists(select 1 from djm_os.club_needs where source_person_id=r.person_id) then v_protected:=v_protected+1;
     else delete from djm_os.people where id=r.person_id; if found then v_people:=v_people+1; end if; end if;
   end loop;
 end if;
 update djm_os.import_batches set status='rolled_back',summary=coalesce(summary,'{}'::jsonb)||jsonb_build_object('rollback_at',now(),'messages_removed',v_messages,'created_people_removed',v_people,'protected_people_retained',v_protected) where id=p_batch_id;
 return jsonb_build_object('batch_id',p_batch_id,'messages_removed',v_messages,'created_people_removed',v_people,'protected_people_retained',v_protected,'rolled_back',true);
end $$;
revoke all on function public.djm_rollback_import(uuid) from public,anon;
grant execute on function public.djm_rollback_import(uuid) to authenticated;
