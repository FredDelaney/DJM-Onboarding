create or replace function djm_os.canonical_org_key(p_name text)
returns text language sql immutable as $$ select nullif(regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g'),'') $$;

update djm_os.organisations set canonical_key=djm_os.canonical_org_key(name),updated_at=now() where name<>'N/A';

create or replace function djm_os.ensure_organisation(p_name text,p_country text default null)
returns uuid language plpgsql security definer set search_path=djm_os,public as $$
declare v_id uuid; v_key text;
begin
  v_key:=djm_os.canonical_org_key(p_name);
  if v_key is null then return null; end if;
  select id into v_id from djm_os.organisations where canonical_key=v_key limit 1;
  if v_id is null then
    insert into djm_os.organisations(name,organisation_type,country,canonical_key,last_verified_at)
    values(trim(p_name),'club',nullif(trim(p_country),''),v_key,now()) returning id into v_id;
  else
    update djm_os.organisations set country=coalesce(country,nullif(trim(p_country),'')),name=coalesce(nullif(trim(p_name),''),name),updated_at=now() where id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.djm_network_upsert_person(p_full_name text,p_person_type text default 'club_contact',p_whatsapp text default null,p_email text default null,p_linkedin_url text default null,p_country text default null,p_city text default null,p_club_name text default null,p_role_title text default null,p_club_country text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_person_id uuid; v_org_id uuid; v_phone_norm text; v_email_norm text; v_created boolean:=false;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_full_name is null or length(trim(p_full_name))<2 then raise exception 'Name is required'; end if;
  v_phone_norm:=nullif(regexp_replace(coalesce(p_whatsapp,''),'[^0-9+]','','g'),'');
  v_email_norm:=nullif(lower(trim(coalesce(p_email,''))),'');
  if v_phone_norm is not null then select person_id into v_person_id from djm_os.contact_methods where channel='whatsapp' and normalised_value=v_phone_norm limit 1; end if;
  if v_person_id is null and v_email_norm is not null then select person_id into v_person_id from djm_os.contact_methods where channel='email' and normalised_value=v_email_norm limit 1; end if;
  if v_person_id is null then
    select id into v_person_id from djm_os.people where lower(trim(full_name))=lower(trim(p_full_name)) order by created_at limit 1;
  end if;
  if v_person_id is null then
    insert into djm_os.people(full_name,person_type,country,city,linkedin_url,source_confidence,last_verified_at)
    values(trim(p_full_name),coalesce(nullif(trim(p_person_type),''),'club_contact'),nullif(trim(p_country),''),nullif(trim(p_city),''),nullif(trim(p_linkedin_url),''),1,now()) returning id into v_person_id;
    v_created:=true;
  else
    update djm_os.people set full_name=coalesce(nullif(trim(p_full_name),''),full_name),country=coalesce(nullif(trim(p_country),''),country),city=coalesce(nullif(trim(p_city),''),city),linkedin_url=coalesce(nullif(trim(p_linkedin_url),''),linkedin_url),updated_at=now() where id=v_person_id;
  end if;
  if v_phone_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at) values(v_person_id,'whatsapp',trim(p_whatsapp),v_phone_norm,true,false,now())
    on conflict(channel,normalised_value) where normalised_value is not null do update set value=excluded.value,person_id=excluded.person_id,updated_at=now();
  end if;
  if v_email_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at) values(v_person_id,'email',trim(p_email),v_email_norm,true,false,now())
    on conflict(channel,normalised_value) where normalised_value is not null do update set value=excluded.value,person_id=excluded.person_id,updated_at=now();
  end if;
  if p_club_name is not null and djm_os.canonical_org_key(p_club_name) is not null then
    v_org_id:=djm_os.ensure_organisation(p_club_name,p_club_country);
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=v_person_id and is_current=true and organisation_id<>v_org_id;
    if not exists(select 1 from djm_os.employments where person_id=v_person_id and organisation_id=v_org_id and is_current=true) then
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at) values(v_person_id,v_org_id,nullif(trim(p_role_title),''),true,1,now());
    elsif p_role_title is not null then
      update djm_os.employments set role_title=coalesce(nullif(trim(p_role_title),''),role_title),updated_at=now(),last_verified_at=now() where person_id=v_person_id and organisation_id=v_org_id and is_current=true;
    end if;
  end if;
  insert into djm_os.relationships(team_member_id,person_id,first_known_at,strength_score) values((select auth.uid()),v_person_id,now(),case when v_created then 20 else 25 end) on conflict(team_member_id,person_id) do nothing;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at) values(case when v_created then 'CONTACT_CREATED' else 'CONTACT_UPDATED' end,(select auth.uid()),v_person_id,v_org_id,jsonb_build_object('name',trim(p_full_name),'created',v_created),'network',1,now());
  return jsonb_build_object('person_id',v_person_id,'organisation_id',v_org_id,'created',v_created);
end $$;

-- Repair the existing Player opportunity link using the corrected canonicalisation.
do $$ declare r record; v_org uuid; begin
 for r in select id,club_name,country from public.player_opportunities where djm_os.canonical_org_key(club_name) is not null loop
   v_org:=djm_os.ensure_organisation(r.club_name,r.country);
   update djm_os.opportunity_links set organisation_id=v_org where opportunity_id=r.id;
 end loop;
end $$;

delete from djm_os.organisations o where o.name='N/A' and not exists(select 1 from djm_os.employments e where e.organisation_id=o.id) and not exists(select 1 from djm_os.interactions i where i.organisation_id=o.id) and not exists(select 1 from djm_os.club_needs n where n.organisation_id=o.id) and not exists(select 1 from djm_os.opportunity_links l where l.organisation_id=o.id);
