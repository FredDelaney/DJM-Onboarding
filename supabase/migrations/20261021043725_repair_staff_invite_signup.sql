-- Preserve the player trigger body and its privacy checks. Staff accounts are
-- admitted only through server-owned claims plus a current database invitation.
do $repair$
declare
  v_definition text := pg_get_functiondef('private.handle_new_user()'::regprocedure);
  v_anchor text := $anchor$begin
  select a.role into assigned_role$anchor$;
  v_replacement text := $replacement$begin
  -- verified_agency_staff_signup_v1
  if new.raw_app_meta_data->>'invitation_kind' = 'agency_staff' then
    perform 1
    from platform.tenant_staff_invites i
    join platform.tenants t on t.id = i.tenant_id and t.status = 'active'
    where i.id::text = new.raw_app_meta_data->>'staff_invite_id'
      and i.tenant_id::text = new.raw_app_meta_data->>'invited_tenant_id'
      and lower(i.email) = lower(new.email)
      and i.role in ('admin','agent','operations','scout')
      and i.status = 'pending'
      and i.expires_at > now()
    for update of i;

    if not found then
      raise exception 'A valid agency staff invitation is required to create this account';
    end if;

    -- The legacy profile role has no tenant authority. Never elevate it using
    -- a staff invitation. The token-checked completion RPC grants membership.
    insert into public.profiles(id,email,display_name,role)
    values (
      new.id,new.email,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1)),
      'player'
    );
    return new;
  end if;

  select a.role into assigned_role$replacement$;
begin
  if position('verified_agency_staff_signup_v1' in v_definition) > 0 then
    return;
  end if;
  if (length(v_definition)-length(replace(v_definition,v_anchor,''))) <> length(v_anchor) then
    raise exception 'Unexpected handle_new_user definition; staff signup repair was not applied';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);
end;
$repair$;
