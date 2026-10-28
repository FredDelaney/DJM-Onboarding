begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- Restore only the absent browser contracts over the current canonical writers.
-- Never replay the historical lifecycle/relationship migrations.
do $preflight$
declare spec record; fn regprocedure;
begin
 for spec in select * from (values
  ('public.djm_entity_patch_v1(text,uuid,jsonb)','5fb601fe896dd5702935db1772323001'),
  ('public.djm_entity_archive_v1(text,uuid,boolean)','ddbba5b7ff2b6cf38a95e6f5fc79806b'),
  ('public.djm_delete_entity(text,uuid,boolean)','204d2f566f8495a369a1ded689757389')
 ) x(signature,expected) loop
  fn:=to_regprocedure(spec.signature);
  if fn is null or not exists(select 1 from pg_proc where oid=fn and md5(prosrc)=spec.expected and prosecdef and proconfig=array['search_path=""'])
    or has_function_privilege('authenticated',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE')
    or not has_function_privilege('service_role',fn,'EXECUTE') then
   raise exception 'Unreviewed entity writer %',spec.signature;
  end if;
 end loop;
 if to_regprocedure('public.redream_entity_patch(text,uuid,jsonb)') is not null
  or to_regprocedure('public.redream_entity_archive(text,uuid,boolean)') is not null
  or to_regprocedure('public.redream_entity_delete(text,uuid,boolean)') is not null
  or to_regprocedure('private.redream_entity_management_access(text,uuid)') is not null then
  raise exception 'Entity entrypoints already exist; review rather than replace';
 end if;
end $preflight$;

create function private.redream_entity_management_access(p_entity_type text,p_entity_id uuid)
returns void language plpgsql security invoker set search_path='' as $access$
declare v_tenant uuid:=private.redream_admin_tenant();v_found uuid;
begin
 -- Authorise the request workspace before looking up or locking any record.
 case p_entity_type
  when 'player' then select id into v_found from public.players where id=p_entity_id and tenant_id=v_tenant for update;
  when 'club' then select id into v_found from djm_os.organisations where id=p_entity_id and tenant_id=v_tenant and organisation_type='club' for update;
  when 'club_contact' then select id into v_found from djm_os.people where id=p_entity_id and tenant_id=v_tenant and coalesce(person_type,'contact')<>'player' for update;
  when 'recruitment_target' then select id into v_found from djm_os.scouting_prospects where id=p_entity_id and tenant_id=v_tenant for update;
  when 'club_need' then select id into v_found from djm_os.club_needs where id=p_entity_id and tenant_id=v_tenant for update;
  when 'deal_room' then select id into v_found from djm_os.deal_rooms where id=p_entity_id and tenant_id=v_tenant for update;
  else raise exception 'Unsupported record type' using errcode='22023';
 end case;
 if v_found is null then raise exception 'Record is unavailable in this workspace' using errcode='42501';end if;
end $access$;
revoke all on function private.redream_entity_management_access(text,uuid) from public,anon,authenticated,service_role;

create function public.redream_entity_patch(p_entity_type text,p_entity_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $patch$
declare v_allowed text[];
begin
 perform private.redream_entity_management_access(p_entity_type,p_entity_id);
 -- Preserve the reviewed expected-version contract for club requests.
 if p_entity_type='club_need' then raise exception 'Use the current club request editor to save this brief' using errcode='22023';end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Changes must be an object' using errcode='22023';end if;
 v_allowed:=case p_entity_type
  when 'player' then array['first_name','last_name','preferred_name','primary_position','current_club','current_country','contract_expiry']
  when 'club' then array['name','country','city','website_url']
  when 'club_contact' then array['full_name','preferred_name','country','city','role_title']
  when 'recruitment_target' then array['full_name','primary_position','current_club','current_country','contract_expiry','transfermarkt_url']
  when 'deal_room' then array['title','next_action_text'] end;
 if exists(select 1 from jsonb_each(p_patch) x where not(x.key=any(v_allowed)) or jsonb_typeof(x.value) not in('string','null')) then
  raise exception 'Some changes are unsupported. Reload the record and try again' using errcode='22023';
 end if;
 return public.djm_entity_patch_v1(p_entity_type,p_entity_id,p_patch);
end $patch$;

create function public.redream_entity_archive(p_entity_type text,p_entity_id uuid,p_archived boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $archive$
begin
 perform private.redream_entity_management_access(p_entity_type,p_entity_id);
 if p_archived is null then raise exception 'Choose whether to archive or restore this record' using errcode='22023';end if;
 return public.djm_entity_archive_v1(p_entity_type,p_entity_id,p_archived);
end $archive$;

create function public.redream_entity_delete(p_entity_type text,p_entity_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $delete$
begin
 perform private.redream_entity_management_access(p_entity_type,p_entity_id);
 if p_confirm is distinct from true then raise exception 'Deletion requires explicit confirmation' using errcode='22023';end if;
 -- Retain canonical linked-representation protection, events and dependency handling.
 return public.djm_delete_entity(p_entity_type,p_entity_id,p_confirm);
end $delete$;

revoke all on function public.redream_entity_patch(text,uuid,jsonb),public.redream_entity_archive(text,uuid,boolean),public.redream_entity_delete(text,uuid,boolean) from public,anon;
grant execute on function public.redream_entity_patch(text,uuid,jsonb),public.redream_entity_archive(text,uuid,boolean),public.redream_entity_delete(text,uuid,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
