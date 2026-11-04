begin;

alter table djm_os.club_needs add column request_preferences jsonb not null default '{}'::jsonb;

-- Keep the editor's additional preferences separate from confirmed recruitment constraints.
create function private.save_club_request_preferences(
  p_tenant_id uuid, p_actor uuid, p_need_id uuid, p_patch jsonb
) returns void language plpgsql set search_path='' as $$
declare
  need djm_os.club_needs%rowtype;
  preferences jsonb;
  amount text;
  maximum numeric;
  item text;
  members uuid[];
begin
  if jsonb_typeof(p_patch) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_patch) key
    where key not in ('window_preference','player_origin','loan_option','transfer_budget_min','salary_budget_min','assigned_user_ids')
  ) then
    raise exception 'Check the request preferences' using errcode='22023';
  end if;
  select * into need from djm_os.club_needs
    where id=p_need_id and tenant_id=p_tenant_id and archived_at is null for update;
  if not found then raise exception 'This request is unavailable' using errcode='42501'; end if;

  preferences := need.request_preferences || p_patch;
  if coalesce(nullif(preferences->>'window_preference',''),'unspecified') not in ('winter','summer','unspecified')
    or coalesce(nullif(preferences->>'player_origin',''),'any') not in ('domestic','international','any')
    or coalesce(nullif(preferences->>'loan_option',''),'') not in ('','true') then
    raise exception 'Check the window, origin and deal type' using errcode='22023';
  end if;
  if preferences->>'loan_option'='true' and need.transfer_type is distinct from 'loan' then
    raise exception 'Choose Loan for a request with a purchase option' using errcode='22023';
  end if;

  foreach item in array array['transfer_budget_min','salary_budget_min'] loop
    amount := nullif(btrim(preferences->>item),'');
    maximum := case when item='transfer_budget_min' then need.transfer_budget else need.salary_budget end;
    if amount is null then continue; end if;
    if amount !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' or length(split_part(amount,'.',2)) > coalesce(private.invoice_currency_minor_unit_v1(need.currency),4) then
      raise exception 'Check budget minimums and currency precision' using errcode='22023';
    end if;
    if maximum is not null and amount::numeric > maximum then
      raise exception 'A minimum budget cannot exceed the maximum' using errcode='22023';
    end if;
  end loop;

  if p_patch ? 'assigned_user_ids' then
    if jsonb_typeof(p_patch->'assigned_user_ids') is distinct from 'array'
      or jsonb_array_length(p_patch->'assigned_user_ids') > 100 then
      raise exception 'Choose up to 100 agency team members' using errcode='22023';
    end if;
    select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into members
      from jsonb_array_elements_text(p_patch->'assigned_user_ids');
    if exists (
      select 1 from unnest(members) as assigned(id)
      where not exists (select 1 from platform.tenant_memberships m
        where m.tenant_id=p_tenant_id and m.user_id=assigned.id and m.status='active'
          and m.role in ('owner','admin','agent','operations','scout','staff','analyst'))
    ) then
      raise exception 'Choose active staff from this agency' using errcode='22023';
    end if;
    preferences := preferences || jsonb_build_object('assigned_user_ids',members);
  end if;
  preferences := jsonb_strip_nulls(preferences);
  if preferences is distinct from need.request_preferences then
    update djm_os.club_needs set request_preferences=preferences, updated_at=clock_timestamp()
      where id=p_need_id and tenant_id=p_tenant_id;
    insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
      values(p_tenant_id,p_actor,'user','club_request.preferences_saved','club_need',p_need_id::text,preferences,'{}');
  end if;
end;
$$;

create function public.redream_club_need_patch_v2(
  p_need_id uuid, p_expected_updated_at timestamptz, p_patch jsonb, p_preferences jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  tenant uuid := private.redream_request_tenant();
  actor uuid := auth.uid();
  revision timestamptz;
  receipt jsonb;
begin
  if not coalesce(private.user_is_tenant_admin(tenant,actor),false) then
    raise exception 'This request is unavailable' using errcode='42501';
  end if;
  select updated_at into revision from djm_os.club_needs
    where id=p_need_id and tenant_id=tenant and archived_at is null for update;
  if not found then raise exception 'This request is unavailable' using errcode='42501'; end if;
  if p_expected_updated_at is null or revision is distinct from p_expected_updated_at then
    raise exception 'This request changed. Reopen it before saving.' using errcode='40001';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'Check the request fields' using errcode='22023';
  end if;
  if p_patch <> '{}'::jsonb then
    receipt := public.redream_club_need_patch(p_need_id,p_expected_updated_at,p_patch);
  else
    receipt := jsonb_build_object('id',p_need_id,'entity_type','club_need','ok',true,'brief_version',1);
  end if;
  perform private.save_club_request_preferences(tenant,actor,p_need_id,p_preferences);
  return receipt || jsonb_build_object('preferences_version',1);
end;
$$;

create function public.platform_server_create_club_need_v2(p_tenant_id uuid,p_actor_user_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
  if not coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false) then
    raise exception 'Agency administrator access required' using errcode='42501';
  end if;
  receipt := public.platform_server_agency_create_club_need_brief(p_tenant_id,p_actor_user_id,p_request-'preferences');
  perform private.save_club_request_preferences(p_tenant_id,p_actor_user_id,(receipt->>'club_need_id')::uuid,p_request->'preferences');
  return receipt || jsonb_build_object('preferences_version',1);
end;
$$;

create function public.redream_club_request_preferences(p_need_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid := private.redream_request_tenant();
begin
  if not coalesce(private.user_is_tenant_admin(tenant,auth.uid()),false) then
    raise exception 'Agency administrator access required' using errcode='42501';
  end if;
  if coalesce(cardinality(p_need_ids),0)>251 then raise exception 'Too many requests' using errcode='22023'; end if;
  return jsonb_build_object(
    'records',coalesce((select jsonb_object_agg(n.id,jsonb_build_object('preferences',n.request_preferences,'updated_at',n.updated_at))
      from djm_os.club_needs n where n.tenant_id=tenant and n.id=any(p_need_ids) and n.archived_at is null),'{}'::jsonb),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(btrim(p.display_name),''),'Team member'))
        order by p.display_name,m.user_id)
      from platform.tenant_memberships m left join public.profiles p on p.id=m.user_id
      where m.tenant_id=tenant and m.status='active' and m.role in ('owner','admin','agent','operations','scout','staff','analyst')),'[]'::jsonb)
  );
end;
$$;

revoke all on function private.save_club_request_preferences(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.redream_club_need_patch_v2(uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.platform_server_create_club_need_v2(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.redream_club_request_preferences(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.redream_club_need_patch_v2(uuid,timestamptz,jsonb,jsonb),public.redream_club_request_preferences(uuid[]) to authenticated;
grant execute on function public.platform_server_create_club_need_v2(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
