create or replace function public.djm_delete_preview(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if p_entity_type='club' then return jsonb_build_object('entity_type','club','contacts',(select count(*) from djm_os.employments where organisation_id=p_entity_id),'needs',(select count(*) from djm_os.club_needs where organisation_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where organisation_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where organisation_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where organisation_id=p_entity_id));
 elsif p_entity_type='club_contact' then return jsonb_build_object('entity_type','club_contact','relationships',(select count(*) from djm_os.relationships where person_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where person_id=p_entity_id),'employments',(select count(*) from djm_os.employments where person_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where person_id=p_entity_id));
 elsif p_entity_type='recruitment_target' then return jsonb_build_object('entity_type','recruitment_target','interactions',(select count(*) from djm_os.recruitment_interactions where prospect_id=p_entity_id),'reports',(select count(*) from djm_os.scouting_reports where prospect_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where prospect_id=p_entity_id),'signed_player_id',(select signed_player_id from djm_os.scouting_prospects where id=p_entity_id));
 elsif p_entity_type='deal_room' then return jsonb_build_object('entity_type','deal_room','exists',exists(select 1 from djm_os.deal_rooms where id=p_entity_id));
 elsif p_entity_type='club_need' then return jsonb_build_object('entity_type','club_need','matches',(select count(*) from djm_os.player_matches where club_need_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where club_need_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where club_need_id=p_entity_id));
 else raise exception 'Unsupported entity type'; end if;
end $$;

create or replace function public.djm_delete_entity(p_entity_type text,p_entity_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare v_name text; v_linked uuid;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if not p_confirm then raise exception 'Deletion requires explicit confirmation'; end if;
 if p_entity_type='club' then select name into v_name from djm_os.organisations where id=p_entity_id; delete from djm_os.organisations where id=p_entity_id;
 elsif p_entity_type='club_contact' then select full_name into v_name from djm_os.people where id=p_entity_id; delete from djm_os.people where id=p_entity_id;
 elsif p_entity_type='recruitment_target' then select full_name,signed_player_id into v_name,v_linked from djm_os.scouting_prospects where id=p_entity_id; if v_linked is not null then raise exception 'This target is linked to a Signed Player. Remove the recruitment link first rather than deleting representation history.'; end if; delete from djm_os.freshness_queue where entity_type='recruitment_target' and entity_id=p_entity_id; delete from djm_os.scouting_prospects where id=p_entity_id;
 elsif p_entity_type='deal_room' then select title into v_name from djm_os.deal_rooms where id=p_entity_id; delete from djm_os.deal_rooms where id=p_entity_id;
 elsif p_entity_type='club_need' then select coalesce(title,position) into v_name from djm_os.club_needs where id=p_entity_id; delete from djm_os.club_needs where id=p_entity_id;
 else raise exception 'Unsupported entity type'; end if;
 insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at) values('ENTITY_DELETED',(select auth.uid()),jsonb_build_object('entity_type',p_entity_type,'deleted_id',p_entity_id,'name',v_name),'manual_delete',1,now());
 return jsonb_build_object('deleted',true,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $$;
