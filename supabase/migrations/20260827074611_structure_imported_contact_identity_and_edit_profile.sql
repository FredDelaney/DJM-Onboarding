create or replace function djm_os.infer_contact_label(p_label text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_label text := regexp_replace(trim(coalesce(p_label,'')), '\s+', ' ', 'g');
  v_base text;
  v_org_name text;
  v_person_name text;
  v_role text;
  v_confidence numeric := 0;
  v_review boolean := false;
  v_parts text[];
  v_words text[];
begin
  if v_label = '' then return jsonb_build_object('name',null,'club_name',null,'role_title',null,'confidence',0,'needs_review',true); end if;

  v_parts := regexp_split_to_array(v_label, '\s+-\s+');
  v_base := trim(v_parts[1]);

  if v_base ~* '\m(sporting director|sports director|director of football|head coach|assistant coach|assistant manager|head of recruitment|recruitment director|chief executive|ceo|general manager|academy director|technical director)\M' then
    v_role := case
      when v_base ~* '\mdirector of football\M' then 'Director of Football'
      when v_base ~* '\msporting director\M|\msports director\M' then 'Sporting Director'
      when v_base ~* '\mhead coach\M' then 'Head Coach'
      when v_base ~* '\massistant coach\M' then 'Assistant Coach'
      when v_base ~* '\massistant manager\M' then 'Assistant Manager'
      when v_base ~* '\mhead of recruitment\M' then 'Head of Recruitment'
      when v_base ~* '\mrecruitment director\M' then 'Recruitment Director'
      when v_base ~* '\mtechnical director\M' then 'Technical Director'
      when v_base ~* '\macademy director\M' then 'Academy Director'
      when v_base ~* '\mchief executive\M|\mceo\M' then 'CEO'
      when v_base ~* '\mgeneral manager\M' then 'General Manager'
      else null end;
    v_base := regexp_replace(v_base, '\s*(sporting director|sports director|director of football|head coach|assistant coach|assistant manager|head of recruitment|recruitment director|chief executive|ceo|general manager|academy director|technical director)\s*$', '', 'i');
  elsif v_base ~* '\sSD$' then
    v_role := 'Sporting Director';
    v_base := regexp_replace(v_base, '\sSD$', '', 'i');
  elsif v_base ~* '\sHC$' then
    v_role := 'Head Coach';
    v_base := regexp_replace(v_base, '\sHC$', '', 'i');
  end if;

  select o.name into v_org_name
  from djm_os.organisations o
  where length(o.name) >= 2 and v_base ilike '%' || o.name || '%'
  order by length(o.name) desc
  limit 1;

  if v_org_name is not null then
    v_person_name := trim(regexp_replace(v_base, regexp_replace(v_org_name,'([\\.\\+\\*\\?\\[\\]\\(\\)\\{\\}\\^\\$\\|\\-])','\\\1','g') || '$', '', 'i'));
    if length(v_person_name) >= 2 then
      v_confidence := 0.93;
    else
      v_person_name := v_label;
      v_org_name := null;
      v_confidence := 0;
      v_review := true;
    end if;
  elsif array_length(v_parts,1) >= 2 then
    v_words := regexp_split_to_array(v_base, '\s+');
    if array_length(v_words,1) >= 4 then
      v_person_name := v_words[1] || ' ' || v_words[2];
      v_org_name := array_to_string(v_words[3:array_length(v_words,1)], ' ');
      v_confidence := 0.72;
      v_review := true;
    else
      v_person_name := v_base;
      v_confidence := 0.45;
      v_review := true;
    end if;
  else
    v_person_name := v_label;
    v_confidence := 0.4;
  end if;

  return jsonb_build_object(
    'name', nullif(trim(v_person_name),''),
    'club_name', nullif(trim(v_org_name),''),
    'role_title', v_role,
    'confidence', v_confidence,
    'needs_review', v_review,
    'raw_label', v_label
  );
end
$function$;

create or replace function public.djm_network_upsert_person(
  p_full_name text,
  p_person_type text default 'club_contact',
  p_whatsapp text default null,
  p_email text default null,
  p_linkedin_url text default null,
  p_country text default null,
  p_city text default null,
  p_club_name text default null,
  p_role_title text default null,
  p_club_country text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_person_id uuid;
  v_org_id uuid;
  v_phone_norm text;
  v_email_norm text;
  v_created boolean := false;
  v_name text := nullif(trim(p_full_name),'');
  v_club text := nullif(trim(p_club_name),'');
  v_role text := nullif(trim(p_role_title),'');
  v_inferred jsonb;
  v_inferred_conf numeric := 0;
  v_needs_review boolean := false;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'Name is required'; end if;

  if v_club is null and v_name ~ '\s+-\s+' then
    v_inferred := djm_os.infer_contact_label(v_name);
    v_inferred_conf := coalesce((v_inferred->>'confidence')::numeric,0);
    v_needs_review := coalesce((v_inferred->>'needs_review')::boolean,false);
    if v_inferred_conf >= 0.70 then
      v_name := coalesce(nullif(v_inferred->>'name',''),v_name);
      v_club := nullif(v_inferred->>'club_name','');
      v_role := coalesce(v_role,nullif(v_inferred->>'role_title',''));
    end if;
  end if;

  v_phone_norm:=nullif(regexp_replace(coalesce(p_whatsapp,''),'[^0-9+]','','g'),'');
  v_email_norm:=nullif(lower(trim(coalesce(p_email,''))),'');
  if v_phone_norm is not null then select person_id into v_person_id from djm_os.contact_methods where channel='whatsapp' and normalised_value=v_phone_norm limit 1; end if;
  if v_person_id is null and v_email_norm is not null then select person_id into v_person_id from djm_os.contact_methods where channel='email' and normalised_value=v_email_norm limit 1; end if;
  if v_person_id is null then select id into v_person_id from djm_os.people where lower(trim(full_name))=lower(v_name) order by created_at limit 1; end if;

  if v_person_id is null then
    insert into djm_os.people(full_name,person_type,country,city,linkedin_url,source_confidence,last_verified_at)
    values(v_name,coalesce(nullif(trim(p_person_type),''),'club_contact'),nullif(trim(p_country),''),nullif(trim(p_city),''),nullif(trim(p_linkedin_url),''),case when v_inferred_conf>0 then v_inferred_conf else 1 end,now()) returning id into v_person_id;
    v_created:=true;
  else
    update djm_os.people
    set full_name=coalesce(v_name,full_name),country=coalesce(nullif(trim(p_country),''),country),city=coalesce(nullif(trim(p_city),''),city),linkedin_url=coalesce(nullif(trim(p_linkedin_url),''),linkedin_url),updated_at=now()
    where id=v_person_id;
  end if;

  if v_phone_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
    values(v_person_id,'whatsapp',trim(p_whatsapp),v_phone_norm,true,false,now())
    on conflict(channel,normalised_value) where normalised_value is not null do update set value=excluded.value,person_id=excluded.person_id,updated_at=now();
  end if;
  if v_email_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
    values(v_person_id,'email',trim(p_email),v_email_norm,true,false,now())
    on conflict(channel,normalised_value) where normalised_value is not null do update set value=excluded.value,person_id=excluded.person_id,updated_at=now();
  end if;

  if v_club is not null and djm_os.canonical_org_key(v_club) is not null then
    v_org_id:=djm_os.ensure_organisation(v_club,p_club_country);
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=v_person_id and is_current=true and organisation_id<>v_org_id;
    if not exists(select 1 from djm_os.employments where person_id=v_person_id and organisation_id=v_org_id and is_current=true) then
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      values(v_person_id,v_org_id,v_role,true,case when v_inferred_conf>0 then v_inferred_conf else 1 end,now());
    elsif v_role is not null then
      update djm_os.employments set role_title=coalesce(v_role,role_title),updated_at=now(),last_verified_at=now() where person_id=v_person_id and organisation_id=v_org_id and is_current=true;
    end if;
  end if;

  insert into djm_os.relationships(team_member_id,person_id,first_known_at,strength_score)
  values((select auth.uid()),v_person_id,now(),case when v_created then 20 else 25 end)
  on conflict(team_member_id,person_id) do nothing;

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values(case when v_created then 'CONTACT_CREATED' else 'CONTACT_UPDATED' end,(select auth.uid()),v_person_id,v_org_id,
    jsonb_build_object('name',v_name,'created',v_created,'inferred',v_inferred_conf>0,'inference_confidence',v_inferred_conf,'needs_review',v_needs_review,'raw_name',p_full_name),'network',case when v_inferred_conf>0 then v_inferred_conf else 1 end,now());

  if v_needs_review and v_created then
    insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,confidence,payload,status)
    values((select auth.uid()),'contact_identity','Review imported contact','Check the contact name, club and role inferred from the WhatsApp saved name.',v_person_id,v_org_id,v_inferred_conf,
      jsonb_build_object('raw_label',p_full_name,'inferred_name',v_name,'inferred_club',v_club,'inferred_role',v_role),'open');
  end if;

  return jsonb_build_object('person_id',v_person_id,'organisation_id',v_org_id,'created',v_created,'inferred',v_inferred_conf>0,'needs_review',v_needs_review);
end
$function$;

create or replace function public.djm_network_update_contact_profile(
  p_person_id uuid,
  p_full_name text,
  p_preferred_name text default null,
  p_country text default null,
  p_city text default null,
  p_club_name text default null,
  p_club_country text default null,
  p_role_title text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_old_org uuid;
  v_name text := nullif(trim(p_full_name),'');
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'Name is required'; end if;
  if not exists(select 1 from djm_os.people p where p.id=p_person_id and coalesce(p.person_type,'club_contact')<>'player') then raise exception 'Club contact not found'; end if;

  update djm_os.people
  set full_name=v_name,
      preferred_name=nullif(trim(p_preferred_name),''),
      country=nullif(trim(p_country),''),
      city=nullif(trim(p_city),''),
      updated_at=now(),
      last_verified_at=now()
  where id=p_person_id;

  select organisation_id into v_old_org from djm_os.employments where person_id=p_person_id and is_current=true order by updated_at desc limit 1;

  if nullif(trim(p_club_name),'') is not null then
    v_org_id := djm_os.ensure_organisation(trim(p_club_name),nullif(trim(p_club_country),''));
    update djm_os.employments
    set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now()
    where person_id=p_person_id and is_current=true and organisation_id<>v_org_id;

    if exists(select 1 from djm_os.employments where person_id=p_person_id and organisation_id=v_org_id and is_current=true) then
      update djm_os.employments set role_title=nullif(trim(p_role_title),''),last_verified_at=now(),updated_at=now() where person_id=p_person_id and organisation_id=v_org_id and is_current=true;
    else
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      values(p_person_id,v_org_id,nullif(trim(p_role_title),''),true,1,now());
    end if;
  else
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=p_person_id and is_current=true;
    v_org_id := null;
  end if;

  update djm_os.conversation_threads
  set person_id=p_person_id,
      organisation_id=v_org_id,
      thread_label=v_name,
      updated_at=now()
  where person_id=p_person_id;

  update djm_os.interactions set organisation_id=v_org_id where person_id=p_person_id and (organisation_id is null or organisation_id=v_old_org);

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('CONTACT_PROFILE_UPDATED',v_uid,p_person_id,v_org_id,jsonb_build_object('name',v_name,'club',nullif(trim(p_club_name),''),'role',nullif(trim(p_role_title),'')),'network',1,now());

  return jsonb_build_object('person_id',p_person_id,'organisation_id',v_org_id,'full_name',v_name,'club_name',nullif(trim(p_club_name),''),'role_title',nullif(trim(p_role_title),''));
end
$function$;

grant execute on function public.djm_network_update_contact_profile(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.djm_network_upsert_person(text,text,text,text,text,text,text,text,text,text) to authenticated;
