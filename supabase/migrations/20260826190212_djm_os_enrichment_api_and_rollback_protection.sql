create or replace function public.djm_rollback_import(p_batch_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b djm_os.import_batches%rowtype; v_messages int:=0; v_people int:=0; v_protected int:=0; r record; v_thread uuid;
begin
 select * into b from djm_os.import_batches where id=p_batch_id and submitted_by=(select auth.uid()); if not found then raise exception 'Import batch not found'; end if;
 if b.status='rolled_back' then return jsonb_build_object('batch_id',p_batch_id,'already_rolled_back',true); end if;
 if b.source_type='whatsapp_export' then
   for r in select id,thread_id from djm_os.messages where import_batch_id=p_batch_id loop
     delete from djm_os.tasks where source_message_id=r.id; delete from djm_os.club_needs where source_message_id=r.id; delete from djm_os.review_items where payload->>'message_id'=r.id::text; delete from djm_os.events where payload->>'message_id'=r.id::text; v_thread:=r.thread_id;
   end loop;
   delete from djm_os.messages where import_batch_id=p_batch_id; get diagnostics v_messages=row_count;
   if v_thread is not null then
     update djm_os.conversation_threads t set message_count=(select count(*) from djm_os.messages m where m.thread_id=t.id),first_message_at=(select min(sent_at) from djm_os.messages m where m.thread_id=t.id),last_message_at=(select max(sent_at) from djm_os.messages m where m.thread_id=t.id),updated_at=now() where t.id=v_thread;
     perform djm_os.thread_interaction_rollup(v_thread);
     if not exists(select 1 from djm_os.messages where thread_id=v_thread) then delete from djm_os.review_items where payload->>'thread_id'=v_thread::text; delete from djm_os.interactions where source_uri='thread:'||v_thread::text; delete from djm_os.conversation_threads where id=v_thread; end if;
   end if;
 elsif b.source_type='contacts' then
   for r in select distinct person_id from djm_os.import_rows where batch_id=p_batch_id and action='created' and person_id is not null loop
     if exists(select 1 from djm_os.import_rows ir where ir.person_id=r.person_id and ir.batch_id<>p_batch_id and ir.status='processed') or exists(select 1 from djm_os.conversation_threads where person_id=r.person_id) or exists(select 1 from djm_os.interactions where person_id=r.person_id) or exists(select 1 from djm_os.tasks where person_id=r.person_id) or exists(select 1 from djm_os.club_needs where source_person_id=r.person_id) then v_protected:=v_protected+1;
     else delete from djm_os.people where id=r.person_id; if found then v_people:=v_people+1; end if; end if;
   end loop;
 end if;
 update djm_os.import_batches set status='rolled_back',summary=coalesce(summary,'{}'::jsonb)||jsonb_build_object('rollback_at',now(),'messages_removed',v_messages,'created_people_removed',v_people,'protected_people_retained',v_protected) where id=p_batch_id;
 return jsonb_build_object('batch_id',p_batch_id,'messages_removed',v_messages,'created_people_removed',v_people,'protected_people_retained',v_protected,'rolled_back',true);
end $$;

create or replace function public.djm_enrichment_due(p_limit int default 25)
returns table(job_id uuid,entity_type text,entity_id uuid,entity_name text,check_type text,priority smallint,reason text,source_hint text,last_checked_at timestamptz,next_check_at timestamptz,current_context jsonb)
language sql security invoker set search_path='' as $$
select q.id,q.entity_type,q.entity_id,
case when q.entity_type='person' then p.full_name when q.entity_type='organisation' then o.name when q.entity_type='player' then trim(coalesce(pl.preferred_name,concat_ws(' ',pl.first_name,pl.last_name))) else q.entity_id::text end,
q.check_type,q.priority,q.reason,q.source_hint,q.last_checked_at,q.next_check_at,
case when q.entity_type='person' then jsonb_build_object('linkedin_url',p.linkedin_url,'current_employment',(select jsonb_build_object('club',oo.name,'role',e.role_title,'country',oo.country) from djm_os.employments e join djm_os.organisations oo on oo.id=e.organisation_id where e.person_id=p.id and e.is_current order by e.updated_at desc limit 1))
when q.entity_type='organisation' then jsonb_build_object('country',o.country,'website_url',o.website_url)
when q.entity_type='player' then jsonb_build_object('current_club',pl.current_club,'current_country',pl.current_country,'contract_expiry',pl.contract_expiry,'transfermarkt_url',pl.transfermarkt_url,'wyscout_url',pl.wyscout_url)
else '{}'::jsonb end
from djm_os.freshness_queue q
left join djm_os.people p on q.entity_type='person' and p.id=q.entity_id
left join djm_os.organisations o on q.entity_type='organisation' and o.id=q.entity_id
left join public.players pl on q.entity_type='player' and pl.id=q.entity_id
where q.status in ('queued','due') and coalesce(q.next_check_at,now())<=now() and exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active)
order by q.priority desc,coalesce(q.next_check_at,q.created_at),q.created_at limit greatest(1,least(coalesce(p_limit,25),100))
$$;
revoke all on function public.djm_enrichment_due(int) from public,anon;
grant execute on function public.djm_enrichment_due(int) to authenticated;

create or replace function public.djm_enrichment_submit(p_job_id uuid,p_observed jsonb,p_source_uri text,p_source_name text,p_confidence numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q djm_os.freshness_queue%rowtype; v_result jsonb; v_review uuid; v_org djm_os.organisations%rowtype;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 select * into q from djm_os.freshness_queue where id=p_job_id; if not found then raise exception 'Enrichment job not found'; end if;
 if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'Confidence must be between 0 and 1'; end if;
 if q.entity_type='person' and q.check_type in ('employment','role','contact_employment') and nullif(trim(p_observed->>'club_name'),'') is not null then
   v_result:=public.djm_record_employment_observation(q.entity_id,p_observed->>'club_name',p_observed->>'role_title',p_observed->>'country',p_source_uri,p_source_name,p_confidence);
 elsif q.entity_type='organisation' then
   select * into v_org from djm_os.organisations where id=q.entity_id;
   insert into djm_os.claims(organisation_id,claim_type,claim_key,value_json,confidence,last_verified_at,source_uri,created_at) values(q.entity_id,'organisation_verification',q.check_type,coalesce(p_observed,'{}'::jsonb),p_confidence,now(),p_source_uri,now());
   if p_confidence>=0.90 then
     update djm_os.organisations set country=coalesce(nullif(trim(p_observed->>'country'),''),country),website_url=coalesce(nullif(trim(p_observed->>'website_url'),''),website_url),last_verified_at=now(),updated_at=now() where id=q.entity_id;
     v_result:=jsonb_build_object('applied',true,'organisation_id',q.entity_id);
   else
     insert into djm_os.review_items(owner_user_id,review_type,title,detail,organisation_id,confidence,payload,status) values((select auth.uid()),'organisation_enrichment','Review organisation update','External enrichment returned a lower-confidence organisation update.',q.entity_id,p_confidence,jsonb_build_object('observed',p_observed,'source_uri',p_source_uri,'job_id',q.id),'open') returning id into v_review;
     v_result:=jsonb_build_object('applied',false,'review_id',v_review);
   end if;
 else
   insert into djm_os.review_items(owner_user_id,review_type,title,detail,player_id,confidence,payload,status) values((select auth.uid()),'external_enrichment','Review external data update','External enrichment result needs review before application.',case when q.entity_type='player' then q.entity_id else null end,p_confidence,jsonb_build_object('entity_type',q.entity_type,'entity_id',q.entity_id,'check_type',q.check_type,'observed',p_observed,'source_uri',p_source_uri,'job_id',q.id),'open') returning id into v_review;
   v_result:=jsonb_build_object('applied',false,'review_id',v_review);
 end if;
 update djm_os.freshness_queue set status='completed',last_checked_at=now(),completed_at=now(),result_json=jsonb_build_object('observed',p_observed,'source_uri',p_source_uri,'source_name',p_source_name,'confidence',p_confidence,'result',v_result),attempts=attempts+1,locked_at=null,updated_at=now() where id=q.id;
 return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('job_id',q.id,'completed',true);
end $$;
revoke all on function public.djm_enrichment_submit(uuid,jsonb,text,text,numeric) from public,anon;
grant execute on function public.djm_enrichment_submit(uuid,jsonb,text,text,numeric) to authenticated;
