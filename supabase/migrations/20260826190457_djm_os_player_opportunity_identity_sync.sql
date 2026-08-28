create or replace function djm_os.sync_opportunity_identity_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_person uuid; v_owner uuid;
begin
  v_owner:=coalesce(new.owner_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1));
  if djm_os.canonical_org_key(new.club_name) is not null then v_org:=djm_os.ensure_organisation(new.club_name,new.country); end if;
  if nullif(trim(coalesce(new.contact_name,'')),'') is not null then
    select p.id into v_person from djm_os.people p where lower(trim(p.full_name))=lower(trim(new.contact_name)) order by p.created_at limit 1;
    if v_person is null then
      insert into djm_os.people(full_name,person_type,source_confidence,last_verified_at) values(trim(new.contact_name),'club_contact',0.95,now()) returning id into v_person;
    end if;
    if v_org is not null then
      update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=v_person and is_current=true and organisation_id<>v_org;
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      select v_person,v_org,nullif(trim(new.contact_role),''),true,0.95,now()
      where not exists(select 1 from djm_os.employments e where e.person_id=v_person and e.organisation_id=v_org and e.is_current=true);
      if new.contact_role is not null then update djm_os.employments set role_title=coalesce(nullif(trim(new.contact_role),''),role_title),last_verified_at=now(),updated_at=now() where person_id=v_person and organisation_id=v_org and is_current=true; end if;
    end if;
    if v_owner is not null and exists(select 1 from djm_os.team_members where user_id=v_owner and is_active) then insert into djm_os.relationships(team_member_id,person_id,strength_score,first_known_at) values(v_owner,v_person,25,coalesce(new.created_at,now())) on conflict(team_member_id,person_id) do nothing; end if;
  end if;
  if v_org is not null then
    insert into djm_os.opportunity_links(opportunity_id,organisation_id,person_id,confidence,linked_by,created_at,updated_at)
    values(new.id,v_org,v_person,case when v_person is null then 0.9 else 0.95 end,v_owner,now(),now())
    on conflict(opportunity_id) do update set organisation_id=excluded.organisation_id,person_id=coalesce(excluded.person_id,djm_os.opportunity_links.person_id),confidence=excluded.confidence,linked_by=coalesce(excluded.linked_by,djm_os.opportunity_links.linked_by),updated_at=now();
  end if;
  return new;
end $$;

drop trigger if exists trg_djm_opportunity_identity_sync on public.player_opportunities;
create trigger trg_djm_opportunity_identity_sync after insert or update of club_name,country,contact_name,contact_role,owner_id on public.player_opportunities for each row execute function djm_os.sync_opportunity_identity_trigger();
