create or replace function public.djm_import_contacts(p_source_name text,p_contacts jsonb)
returns jsonb language plpgsql security invoker set search_path=public,djm_os as $$
declare v_batch uuid; v_item jsonb; v_result jsonb; v_count int:=0; v_created int:=0; v_updated int:=0; v_errors int:=0; v_person uuid; v_org uuid;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if jsonb_typeof(p_contacts)<>'array' then raise exception 'contacts must be a JSON array'; end if;
 v_batch:=public.djm_create_import_batch('contacts',coalesce(nullif(p_source_name,''),'contacts import'),null);
 for v_item in select value from jsonb_array_elements(p_contacts) loop
   v_count:=v_count+1;
   begin
     v_result:=public.djm_network_upsert_person(
       p_full_name=>coalesce(nullif(v_item->>'full_name',''),nullif(v_item->>'name','')),
       p_person_type=>coalesce(nullif(v_item->>'person_type',''),'club_contact'),
       p_whatsapp=>nullif(coalesce(v_item->>'whatsapp',v_item->>'phone'),''),
       p_email=>nullif(v_item->>'email',''),
       p_linkedin_url=>nullif(v_item->>'linkedin_url',''),
       p_country=>nullif(v_item->>'country',''),
       p_city=>nullif(v_item->>'city',''),
       p_club_name=>nullif(coalesce(v_item->>'club_name',v_item->>'organisation'),''),
       p_role_title=>nullif(coalesce(v_item->>'role_title',v_item->>'title'),''),
       p_club_country=>nullif(v_item->>'club_country','')
     );
     v_person:=(v_result->>'person_id')::uuid; v_org:=nullif(v_result->>'organisation_id','')::uuid;
     if coalesce((v_result->>'created')::boolean,false) then v_created:=v_created+1; else v_updated:=v_updated+1; end if;
     insert into djm_os.import_rows(batch_id,row_number,raw_json,status,person_id,organisation_id,match_confidence,processed_at)
     values(v_batch,v_count,v_item,'processed',v_person,v_org,1,now());
   exception when others then
     v_errors:=v_errors+1;
     insert into djm_os.import_rows(batch_id,row_number,raw_json,status,error_message,processed_at) values(v_batch,v_count,v_item,'error',left(sqlerrm,500),now());
   end;
 end loop;
 update djm_os.import_batches set status=case when v_errors>0 then 'completed_with_errors' else 'completed' end,total_rows=v_count,processed_rows=v_count,error_rows=v_errors,created_people=v_created,updated_people=v_updated,summary=jsonb_build_object('created_people',v_created,'updated_people',v_updated,'errors',v_errors),completed_at=now() where id=v_batch;
 return jsonb_build_object('batch_id',v_batch,'contacts_received',v_count,'created_people',v_created,'updated_people',v_updated,'errors',v_errors);
end $$;
revoke all on function public.djm_import_contacts(text,jsonb) from public,anon;
grant execute on function public.djm_import_contacts(text,jsonb) to authenticated;
