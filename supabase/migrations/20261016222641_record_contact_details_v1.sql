-- Narrow, tenant-scoped contact projection. Personal player details never enter
-- public profiles, club snapshots or the general football profile DTO.
create or replace function public.redream_record_contact_details_v1(
  p_kind text,
  p_record_id uuid,
  p_patch jsonb default null,
  p_expected jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_values jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
  v_normalised text;
  v_method uuid;
  v_changed boolean := false;
begin
  if p_kind is null or p_kind not in ('player','recruitment_target','contact') or p_record_id is null then
    raise exception 'Unsupported contact record' using errcode='22023';
  end if;
  if p_kind in ('player','recruitment_target') and not private.user_is_tenant_admin(v_tenant,auth.uid()) then
    raise exception 'Contact access denied' using errcode='42501';
  end if;

  -- A parent lock serialises edits across both contact channels and missing
  -- private rows. Foreign and archived records are rejected before any write.
  if p_kind='player' then
    perform 1 from public.players where id=p_record_id and tenant_id=v_tenant and archived_at is null for update;
    if not found then raise exception 'Contact record not found' using errcode='42501'; end if;
    perform 1 from public.player_private where player_id=p_record_id for update;
    select jsonb_build_object('email',personal_email,'whatsapp',whatsapp) into v_values from public.player_private where player_id=p_record_id;
  elsif p_kind='recruitment_target' then
    select jsonb_build_object('email',email,'whatsapp',whatsapp) into v_values
    from djm_os.scouting_prospects where id=p_record_id and tenant_id=v_tenant and archived_at is null for update;
    if not found then raise exception 'Contact record not found' using errcode='42501'; end if;
  else
    perform 1 from djm_os.people where id=p_record_id and tenant_id=v_tenant and archived_at is null and coalesce(person_type,'contact')<>'player' for update;
    if not found then raise exception 'Contact record not found' using errcode='42501'; end if;
    select jsonb_build_object(
      'email',(select value from djm_os.contact_methods where tenant_id=v_tenant and person_id=p_record_id and channel='email' order by is_primary desc,is_verified desc nulls last,updated_at desc,id limit 1),
      'whatsapp',(select value from djm_os.contact_methods where tenant_id=v_tenant and person_id=p_record_id and channel='whatsapp' order by is_primary desc,is_verified desc nulls last,updated_at desc,id limit 1)
    ) into v_values;
  end if;
  v_values := coalesce(v_values,jsonb_build_object('email',null,'whatsapp',null));
  if p_patch is null then return v_values || jsonb_build_object('can_edit',true); end if;
  if jsonb_typeof(p_patch)<>'object' then raise exception 'Unsupported contact fields' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('email','whatsapp') or jsonb_typeof(p_patch->v_key) not in ('string','null') then
      raise exception 'Unsupported contact fields' using errcode='22023';
    end if;
    v_value := nullif(btrim(p_patch->>v_key),'');
    if v_value is not null then
      if v_key='email' then
        if length(v_value)>254 or v_value !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+$' then
          raise exception 'Enter a valid email address' using errcode='22023';
        end if;
      else
        if v_value !~ '^(\+|00)[0-9 ().-]+$' then
          raise exception 'Include the WhatsApp country code' using errcode='22023';
        end if;
        v_value := regexp_replace(regexp_replace(v_value,'^00','+'),'[ ().-]','','g');
        if v_value !~ '^\+[1-9][0-9]{7,14}$' then
          raise exception 'Use a complete WhatsApp number with its country code' using errcode='22023';
        end if;
      end if;
    end if;
    v_patch := v_patch || jsonb_build_object(v_key,v_value);
    if p_expected is null or jsonb_typeof(p_expected)<>'object' or not(p_expected ? v_key) then
      raise exception 'Reload contact details before saving' using errcode='40001';
    end if;
    -- An acknowledged-late save may be retried safely. A different concurrent
    -- edit must be reviewed, rather than overwritten with an old form.
    if v_values->v_key is distinct from p_expected->v_key and v_values->v_key is distinct from v_patch->v_key then
      raise exception 'Contact details changed. Load the latest details before saving.' using errcode='40001';
    end if;
    v_changed := v_changed or (v_values->v_key is distinct from v_patch->v_key);
  end loop;
  if not v_changed then return v_values || jsonb_build_object('can_edit',true); end if;

  if p_kind='player' then
    insert into public.player_private(player_id,personal_email,whatsapp)
    values(p_record_id,case when v_patch ? 'email' then v_patch->>'email' else v_values->>'email' end,case when v_patch ? 'whatsapp' then v_patch->>'whatsapp' else v_values->>'whatsapp' end)
    on conflict(player_id) do update set personal_email=excluded.personal_email,whatsapp=excluded.whatsapp,updated_at=now();
  elsif p_kind='recruitment_target' then
    update djm_os.scouting_prospects set
      email=case when v_patch ? 'email' then v_patch->>'email' else email end,
      whatsapp=case when v_patch ? 'whatsapp' then v_patch->>'whatsapp' else whatsapp end,
      updated_at=now() where id=p_record_id and tenant_id=v_tenant;
  else
    for v_key in select jsonb_object_keys(v_patch) loop
      if v_values->v_key is not distinct from v_patch->v_key then continue; end if;
      v_value := v_patch->>v_key;
      if v_value is null then
        -- Clearing a channel is explicit. Other channels and the person remain.
        delete from djm_os.contact_methods where tenant_id=v_tenant and person_id=p_record_id and channel=v_key;
      else
        v_normalised := case when v_key='email' then lower(v_value) else regexp_replace(v_value,'[^0-9]','','g') end;
        select id into v_method from djm_os.contact_methods where tenant_id=v_tenant and person_id=p_record_id and channel=v_key
          and coalesce(normalised_value,case when v_key='email' then lower(btrim(value)) else regexp_replace(value,'[^0-9]','','g') end)=v_normalised
          order by is_primary desc,updated_at desc,id limit 1;
        update djm_os.contact_methods set is_primary=false,updated_at=now() where tenant_id=v_tenant and person_id=p_record_id and channel=v_key and is_primary=true;
        if v_method is null then
          insert into djm_os.contact_methods(tenant_id,person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
          values(v_tenant,p_record_id,v_key,v_value,v_normalised,true,false,null);
        else
          update djm_os.contact_methods set value=v_value,normalised_value=v_normalised,is_primary=true,updated_at=now() where id=v_method and tenant_id=v_tenant and person_id=p_record_id;
        end if;
      end if;
    end loop;
  end if;
  insert into djm_os.events(tenant_id,event_type,actor_user_id,person_id,player_id,payload,source,confidence,occurred_at)
  values(v_tenant,'CONTACT_DETAILS_UPDATED',auth.uid(),case when p_kind='contact' then p_record_id else null end,case when p_kind='player' then p_record_id else null end,
    jsonb_build_object('record_kind',p_kind,'record_id',p_record_id,'channels',to_jsonb(array(select jsonb_object_keys(v_patch)))),'contact_details',1,now());
  return v_values || v_patch || jsonb_build_object('can_edit',true);
end;
$$;
revoke all on function public.redream_record_contact_details_v1(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.redream_record_contact_details_v1(text,uuid,jsonb,jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
