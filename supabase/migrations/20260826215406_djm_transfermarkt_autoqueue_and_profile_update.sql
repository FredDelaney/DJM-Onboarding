create or replace function djm_os.queue_transfermarkt_refresh_on_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.linked_player_id is null and new.transfermarkt_url is not null and btrim(new.transfermarkt_url)<>'' and (tg_op='INSERT' or old.transfermarkt_url is distinct from new.transfermarkt_url) then
    insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,status,reason,next_check_at,source_hint,attempts,updated_at)
    values('recruitment_target',new.id,'transfermarkt_profile',95,'pending','Transfermarkt URL added or changed',now(),new.transfermarkt_url,0,now())
    on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,95),status='pending',reason=excluded.reason,next_check_at=now(),source_hint=excluded.source_hint,locked_at=null,completed_at=null,updated_at=now();
    new.transfermarkt_enrichment_status:='queued';
  end if;
  return new;
end $$;

drop trigger if exists scouting_prospects_transfermarkt_autoqueue on djm_os.scouting_prospects;
create trigger scouting_prospects_transfermarkt_autoqueue before insert or update of transfermarkt_url on djm_os.scouting_prospects for each row execute function djm_os.queue_transfermarkt_refresh_on_change();

create or replace function public.djm_recruitment_update_profile(p_prospect_id uuid,p_transfermarkt_url text default null,p_market_value numeric default null,p_market_value_currency text default null,p_whatsapp text default null,p_instagram_url text default null,p_email text default null,p_agent_status text default null,p_agent_name text default null,p_contract_expiry date default null,p_current_club text default null,p_current_country text default null,p_primary_position text default null,p_date_of_birth date default null,p_nationality text default null,p_preferred_foot text default null)
returns jsonb language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 update djm_os.scouting_prospects set
   transfermarkt_url=coalesce(nullif(btrim(p_transfermarkt_url),''),transfermarkt_url),
   market_value=coalesce(p_market_value,market_value),
   market_value_currency=coalesce(nullif(btrim(p_market_value_currency),''),market_value_currency),
   whatsapp=coalesce(nullif(btrim(p_whatsapp),''),whatsapp),
   instagram_url=coalesce(nullif(btrim(p_instagram_url),''),instagram_url),
   email=coalesce(nullif(lower(btrim(p_email)),''),email),
   agent_status=coalesce(nullif(btrim(p_agent_status),''),agent_status),
   agent_name=coalesce(nullif(btrim(p_agent_name),''),agent_name),
   contract_expiry=coalesce(p_contract_expiry,contract_expiry),
   current_club=coalesce(nullif(btrim(p_current_club),''),current_club),
   current_country=coalesce(nullif(btrim(p_current_country),''),current_country),
   primary_position=coalesce(nullif(btrim(p_primary_position),''),primary_position),
   date_of_birth=coalesce(p_date_of_birth,date_of_birth),
   nationality=coalesce(nullif(btrim(p_nationality),''),nationality),
   preferred_foot=coalesce(nullif(btrim(p_preferred_foot),''),preferred_foot),
   updated_at=now()
 where id=p_prospect_id and linked_player_id is null;
 if not found then raise exception 'Recruitment target not found'; end if;
 return jsonb_build_object('updated',true,'prospect_id',p_prospect_id);
end $$;
grant execute on function public.djm_recruitment_update_profile(uuid,text,numeric,text,text,text,text,text,text,date,text,text,text,date,text,text) to authenticated;
