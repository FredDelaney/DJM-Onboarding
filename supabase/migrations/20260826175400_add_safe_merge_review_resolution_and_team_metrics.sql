create or replace function public.djm_link_thread(p_thread_id uuid,p_person_id uuid default null,p_organisation_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v_owner uuid; begin
 select owner_user_id into v_owner from djm_os.conversation_threads where id=p_thread_id; if not found or v_owner<>auth.uid() then raise exception 'Thread not found'; end if;
 update djm_os.conversation_threads set person_id=coalesce(p_person_id,person_id),organisation_id=coalesce(p_organisation_id,organisation_id),updated_at=now() where id=p_thread_id;
 update djm_os.review_items set status='resolved',resolved_at=now() where review_type='thread_identity' and payload->>'thread_id'=p_thread_id::text and status='open';
 perform djm_os.thread_interaction_rollup(p_thread_id);
 return jsonb_build_object('thread_id',p_thread_id,'person_id',p_person_id,'organisation_id',p_organisation_id,'linked',true);
end; $$;

create or replace function public.djm_resolve_review_item(p_review_id uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v text:=lower(trim(p_action)); begin
 if v not in ('resolved','dismissed','snoozed') then raise exception 'Invalid action'; end if;
 update djm_os.review_items set status=v,resolved_at=case when v in ('resolved','dismissed') then now() else null end where id=p_review_id and (owner_user_id is null or owner_user_id=auth.uid());
 if not found then raise exception 'Review item not found'; end if;
 return jsonb_build_object('review_id',p_review_id,'status',v);
end; $$;

create or replace function public.djm_merge_people(p_keep_id uuid,p_merge_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare r record; v_keep text; v_merge text; begin
 if p_keep_id=p_merge_id then raise exception 'Cannot merge same person'; end if;
 select full_name into v_keep from djm_os.people where id=p_keep_id; select full_name into v_merge from djm_os.people where id=p_merge_id;
 if v_keep is null or v_merge is null then raise exception 'Person not found'; end if;
 if not djm_os.is_team_member() then raise exception 'Not authorised'; end if;

 insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
 select p_keep_id,c.channel,c.value,c.normalised_value,false,c.is_verified,c.last_verified_at from djm_os.contact_methods c where c.person_id=p_merge_id
 on conflict(channel,normalised_value) where normalised_value is not null do nothing;
 delete from djm_os.contact_methods where person_id=p_merge_id;

 update djm_os.employments set person_id=p_keep_id where person_id=p_merge_id and not exists(select 1 from djm_os.employments e2 where e2.person_id=p_keep_id and e2.organisation_id=djm_os.employments.organisation_id and e2.is_current=djm_os.employments.is_current);
 delete from djm_os.employments where person_id=p_merge_id;

 for r in select * from djm_os.relationships where person_id=p_merge_id loop
   insert into djm_os.relationships(team_member_id,person_id,strength_score,access_score,trust_score,last_meaningful_at,first_known_at,relationship_notes)
   values(r.team_member_id,p_keep_id,r.strength_score,r.access_score,r.trust_score,r.last_meaningful_at,r.first_known_at,r.relationship_notes)
   on conflict(team_member_id,person_id) do update set strength_score=greatest(coalesce(djm_os.relationships.strength_score,0),coalesce(excluded.strength_score,0)),access_score=greatest(coalesce(djm_os.relationships.access_score,0),coalesce(excluded.access_score,0)),trust_score=greatest(coalesce(djm_os.relationships.trust_score,0),coalesce(excluded.trust_score,0)),last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),first_known_at=least(coalesce(djm_os.relationships.first_known_at,excluded.first_known_at),excluded.first_known_at),relationship_notes=concat_ws(E'\n',djm_os.relationships.relationship_notes,excluded.relationship_notes),updated_at=now();
 end loop;
 delete from djm_os.relationships where person_id=p_merge_id;

 update djm_os.interactions set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.claims set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.club_needs set source_person_id=p_keep_id where source_person_id=p_merge_id;
 update djm_os.tasks set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.events set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.captures set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.suggestions set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.meetings set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.booking_requests set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.review_items set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.conversation_threads set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.change_observations set entity_id=p_keep_id where entity_type='person' and entity_id=p_merge_id;
 update djm_os.relationship_snapshots set person_id=p_keep_id where person_id=p_merge_id and not exists(select 1 from djm_os.relationship_snapshots s where s.person_id=p_keep_id and s.team_member_id=djm_os.relationship_snapshots.team_member_id and s.calculated_at=djm_os.relationship_snapshots.calculated_at);
 delete from djm_os.relationship_snapshots where person_id=p_merge_id;

 insert into djm_os.events(event_type,actor_user_id,person_id,payload,source,confidence,occurred_at) values('CONTACT_MERGED',auth.uid(),p_keep_id,jsonb_build_object('kept_id',p_keep_id,'merged_id',p_merge_id,'kept_name',v_keep,'merged_name',v_merge),'network',1,now());
 delete from djm_os.people where id=p_merge_id;
 update djm_os.merge_candidates set status='merged',resolved_at=now(),resolved_by=auth.uid() where entity_type='person' and ((left_id=p_keep_id and right_id=p_merge_id) or (left_id=p_merge_id and right_id=p_keep_id));
 return jsonb_build_object('kept_id',p_keep_id,'merged_id',p_merge_id,'kept_name',v_keep,'merged_name',v_merge);
end; $$;

create or replace function public.djm_team_metrics(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path=''
as $$
 with d as (select greatest(1,least(coalesce(p_days,30),365)) days), members as (
   select tm.user_id,tm.display_name,
    (select count(*) from djm_os.interactions i,d where i.team_member_id=tm.user_id and i.occurred_at>=now()-(d.days||' days')::interval) interactions,
    (select count(distinct i.person_id) from djm_os.interactions i,d where i.team_member_id=tm.user_id and i.person_id is not null and i.occurred_at>=now()-(d.days||' days')::interval) relationships_touched,
    (select count(*) from djm_os.club_needs n,d where n.owner_user_id=tm.user_id and n.created_at>=now()-(d.days||' days')::interval) needs_created,
    (select count(*) from djm_os.tasks t,d where t.owner_user_id=tm.user_id and t.completed_at>=now()-(d.days||' days')::interval) tasks_completed,
    (select count(*) from djm_os.meetings m,d where m.owner_user_id=tm.user_id and m.starts_at>=now()-(d.days||' days')::interval and m.status not in ('cancelled')) meetings,
    (select round(avg(r.strength_score)::numeric,1) from djm_os.relationships r where r.team_member_id=tm.user_id) avg_relationship_strength,
    (select count(*) from djm_os.relationships r where r.team_member_id=tm.user_id and coalesce(r.strength_score,0)>=70) strong_relationships
   from djm_os.team_members tm where tm.is_active=true
 ) select jsonb_build_object('days',(select days from d),'team',coalesce(jsonb_agg(to_jsonb(members) order by members.display_name),'[]'::jsonb),'company',jsonb_build_object('people',(select count(*) from djm_os.people),'clubs',(select count(*) from djm_os.organisations where organisation_type='club'),'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),'open_tasks',(select count(*) from djm_os.tasks where status not in ('done','completed','cancelled')),'messages',(select count(*) from djm_os.messages),'prospects',(select count(*) from djm_os.scouting_prospects)) ) from members;
$$;

revoke execute on function public.djm_link_thread(uuid,uuid,uuid),public.djm_resolve_review_item(uuid,text),public.djm_merge_people(uuid,uuid),public.djm_team_metrics(integer) from public,anon;
grant execute on function public.djm_link_thread(uuid,uuid,uuid),public.djm_resolve_review_item(uuid,text),public.djm_merge_people(uuid,uuid),public.djm_team_metrics(integer) to authenticated;
notify pgrst,'reload schema';
