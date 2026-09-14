create or replace function private.enforce_public_profile_tenant_contact()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant_id uuid;
  v_support_email text;
  v_internal boolean := false;
begin
  select p.tenant_id
    into v_tenant_id
  from public.players p
  where p.id = new.player_id;

  if v_tenant_id is null then
    raise exception 'player_not_found';
  end if;

  select nullif(trim(b.support_email),''),
         coalesce((t.metadata->>'internal_tenant')::boolean,false)
    into v_support_email, v_internal
  from platform.tenants t
  left join platform.tenant_branding b on b.tenant_id=t.id
  where t.id=v_tenant_id;

  if not v_internal then
    if v_support_email is null then
      raise exception 'tenant_support_email_required';
    end if;

    if lower(trim(coalesce(new.contact_email,''))) <> lower(v_support_email) then
      raise exception 'tenant_contact_email_must_match_brand';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_public_profile_tenant_contact() from public, anon, authenticated;
grant execute on function private.enforce_public_profile_tenant_contact() to service_role;;
