alter table djm_os.scouting_prospects add column if not exists transfermarkt_enrichment_status text not null default 'never' check (transfermarkt_enrichment_status in ('never','queued','verified','review','failed')); alter table djm_os.scouting_prospects add column if not exists transfermarkt_checked_at timestamptz; alter table djm_os.scouting_prospects add column if not exists transfermarkt_snapshot jsonb not null default '{}'::jsonb; alter table djm_os.scouting_prospects add column if not exists market_value_verified_at timestamptz;

create or replace function public.djm_recruitment_request_transfermarkt_refresh(p_prospect_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare v_url text;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 select transfermarkt_url into v_url from djm_os.scouting_prospects where id=p_prospect_id and linked_player_id is null;
 if v_url is null or btrim(v_url)='' then raise exception 'Add a Transfermarkt URL first'; end if;
 insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,status,reason,next_check_at,source_hint,attempts,updated_at)
 values('recruitment_target',p_prospect_id,'transfermarkt_profile',95,'pending','User requested Transfermarkt profile refresh',now(),v_url,0,now())
 on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,95),status='pending',reason=excluded.reason,next_check_at=now(),source_hint=excluded.source_hint,locked_at=null,completed_at=null,updated_at=now();
 update djm_os.scouting_prospects set transfermarkt_enrichment_status='queued',updated_at=now() where id=p_prospect_id;
 return jsonb_build_object('queued',true,'prospect_id',p_prospect_id,'source_url',v_url);
end $$;

grant execute on function public.djm_recruitment_request_transfermarkt_refresh(uuid) to authenticated;

create or replace function public.djm_recruitment_apply_transfermarkt(p_prospect_id uuid,p_source_url text,p_observed_at timestamptz,p_confidence numeric,p_date_of_birth date default null,p_nationality text default null,p_current_club text default null,p_current_country text default null,p_primary_position text default null,p_preferred_foot text default null,p_contract_expiry date default null,p_market_value numeric default null,p_market_value_currency text default null,p_agent_name text default null,p_snapshot jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_confidence < 0.80 then
   update djm_os.scouting_prospects set transfermarkt_enrichment_status='review',transfermarkt_checked_at=coalesce(p_observed_at,now()),transfermarkt_snapshot=coalesce(p_snapshot,'{}'::jsonb),updated_at=now() where id=p_prospect_id;
   return jsonb_build_object('applied',false,'review',true);
 end if;
 update djm_os.scouting_prospects set
   date_of_birth=coalesce(p_date_of_birth,date_of_birth),
   nationality=coalesce(nullif(btrim(p_nationality),''),nationality),
   current_club=coalesce(nullif(btrim(p_current_club),''),current_club),
   current_country=coalesce(nullif(btrim(p_current_country),''),current_country),
   primary_position=coalesce(nullif(btrim(p_primary_position),''),primary_position),
   preferred_foot=coalesce(nullif(btrim(p_preferred_foot),''),preferred_foot),
   contract_expiry=coalesce(p_contract_expiry,contract_expiry),
   market_value=coalesce(p_market_value,market_value),
   market_value_currency=coalesce(nullif(btrim(p_market_value_currency),''),market_value_currency),
   agent_name=coalesce(nullif(btrim(p_agent_name),''),agent_name),
   transfermarkt_url=coalesce(nullif(btrim(p_source_url),''),transfermarkt_url),
   transfermarkt_enrichment_status='verified',
   transfermarkt_checked_at=coalesce(p_observed_at,now()),
   transfermarkt_snapshot=coalesce(p_snapshot,'{}'::jsonb),
   market_value_verified_at=case when p_market_value is not null then coalesce(p_observed_at,now()) else market_value_verified_at end,
   source_confidence=greatest(coalesce(source_confidence,0),least(p_confidence,1)),last_verified_at=coalesce(p_observed_at,now()),updated_at=now()
 where id=p_prospect_id;
 return jsonb_build_object('applied',true,'prospect_id',p_prospect_id);
end $$;
revoke all on function public.djm_recruitment_apply_transfermarkt(uuid,text,timestamptz,numeric,date,text,text,text,text,text,date,numeric,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.djm_recruitment_apply_transfermarkt(uuid,text,timestamptz,numeric,date,text,text,text,text,text,date,numeric,text,text,jsonb) to service_role;

create or replace function public.djm_delete_preview(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if p_entity_type='club' then return jsonb_build_object('entity_type','club','contacts',(select count(*) from djm_os.employments where organisation_id=p_entity_id),'needs',(select count(*) from djm_os.club_needs where organisation_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where organisation_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where organisation_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where organisation_id=p_entity_id));
 elsif p_entity_type='club_contact' then return jsonb_build_object('entity_type','club_contact','relationships',(select count(*) from djm_os.relationships where person_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where person_id=p_entity_id),'employments',(select count(*) from djm_os.employments where person_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where person_id=p_entity_id));
 elsif p_entity_type='recruitment_target' then return jsonb_build_object('entity_type','recruitment_target','interactions',(select count(*) from djm_os.recruitment_interactions where prospect_id=p_entity_id),'reports',(select count(*) from djm_os.scouting_reports where prospect_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where prospect_id=p_entity_id),'signed_player_id',(select signed_player_id from djm_os.scouting_prospects where id=p_entity_id));
 elsif p_entity_type='deal_room' then return jsonb_build_object('entity_type','deal_room','exists',exists(select 1 from djm_os.deal_rooms where id=p_entity_id));
 else raise exception 'Unsupported entity type'; end if;
end $$;
grant execute on function public.djm_delete_preview(text,uuid) to authenticated;

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
 else raise exception 'Unsupported entity type'; end if;
 insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at) values('ENTITY_DELETED',(select auth.uid()),jsonb_build_object('entity_type',p_entity_type,'deleted_id',p_entity_id,'name',v_name),'manual_delete',1,now());
 return jsonb_build_object('deleted',true,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $$;
grant execute on function public.djm_delete_entity(text,uuid,boolean) to authenticated;
