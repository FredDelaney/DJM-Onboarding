create or replace function public.djm_import_whatsapp_messages(
  p_source_name text,
  p_external_thread_id text,
  p_thread_label text,
  p_person_id uuid,
  p_organisation_id uuid,
  p_messages jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security invoker set search_path=public,djm_os as $$
declare v_thread uuid; v_batch uuid; v_item jsonb; v_count int:=0; v_dupes int:=0; v_before int; v_after int; v_result jsonb;
begin
  if not exists (select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if jsonb_typeof(p_messages) <> 'array' then raise exception 'messages must be a JSON array'; end if;
  v_thread:=public.djm_upsert_thread('whatsapp',p_external_thread_id,p_person_id,p_organisation_id,p_thread_label,coalesce(p_metadata,'{}'::jsonb));
  v_batch:=public.djm_create_import_batch('whatsapp_export',coalesce(nullif(p_source_name,''),'WhatsApp export'),null);
  select count(*) into v_before from djm_os.messages where thread_id=v_thread;
  for v_item in select value from jsonb_array_elements(p_messages) loop
    perform public.djm_store_message(
      v_thread,
      coalesce((v_item->>'sent_at')::timestamptz,now()),
      coalesce(v_item->>'direction','inbound'),
      nullif(v_item->>'raw_text',''),
      nullif(v_item->>'external_message_id',''),
      nullif(v_item->>'sender_label',''),
      coalesce(nullif(v_item->>'message_type',''),'text'),
      nullif(v_item->>'asset_uri',''),
      nullif(v_item->>'transcript_text',''),
      nullif(v_item->>'reply_to_external_id','')
    );
    v_count:=v_count+1;
  end loop;
  select count(*) into v_after from djm_os.messages where thread_id=v_thread;
  v_dupes:=greatest(v_count-(v_after-v_before),0);
  update djm_os.import_batches set status='completed',total_rows=v_count,processed_rows=v_count,duplicate_rows=v_dupes,summary=jsonb_build_object('thread_id',v_thread,'inserted_messages',v_after-v_before,'duplicate_messages',v_dupes,'metadata',coalesce(p_metadata,'{}'::jsonb)),completed_at=now() where id=v_batch;
  if p_person_id is null then
    insert into djm_os.review_items(owner_user_id,review_type,title,detail,capture_id,confidence,payload,status)
    values((select auth.uid()),'thread_identity','Link WhatsApp thread',coalesce(p_thread_label,'Imported WhatsApp thread')||' needs a person/club link.',null,0.95,jsonb_build_object('thread_id',v_thread,'batch_id',v_batch),'open')
    on conflict do nothing;
  end if;
  return jsonb_build_object('thread_id',v_thread,'batch_id',v_batch,'messages_received',v_count,'messages_inserted',v_after-v_before,'duplicates',v_dupes);
end $$;
revoke all on function public.djm_import_whatsapp_messages(text,text,text,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.djm_import_whatsapp_messages(text,text,text,uuid,uuid,jsonb,jsonb) to authenticated;
