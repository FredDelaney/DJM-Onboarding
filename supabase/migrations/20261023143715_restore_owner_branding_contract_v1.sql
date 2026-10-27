-- Restore only the proven missing live branding dependency. Reuse the canonical
-- owner-only writer unchanged; never replay its unrelated launch migration.
do $restore$
declare
  v_oid oid := to_regprocedure('public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text)');
begin
  if v_oid is null then
    execute $definition$
create or replace function public.platform_server_owner_update_branding(
  p_tenant_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_portal_name text,
  p_primary_color text,
  p_accent_color text,
  p_support_email text,
  p_website_url text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_display_name text:=nullif(pg_catalog.btrim(p_display_name),'');
  v_portal_name text:=nullif(pg_catalog.btrim(p_portal_name),'');
  v_primary text:=upper(pg_catalog.btrim(coalesce(p_primary_color,'')));
  v_accent text:=upper(pg_catalog.btrim(coalesce(p_accent_color,'')));
  v_email text:=nullif(lower(pg_catalog.btrim(p_support_email)),'');
  v_website text:=nullif(pg_catalog.btrim(p_website_url),'');
  v_phone text:=nullif(pg_catalog.btrim(p_phone),'');
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.role='owner' and m.status='active') then raise exception 'tenant_owner_access_required'; end if;
  if v_display_name is null or char_length(v_display_name)>120 then raise exception 'invalid_display_name'; end if;
  if v_portal_name is null or char_length(v_portal_name)>120 then raise exception 'invalid_portal_name'; end if;
  if v_primary !~ '^#[0-9A-F]{6}$' or v_accent !~ '^#[0-9A-F]{6}$' then raise exception 'invalid_brand_colour'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'invalid_support_email'; end if;
  if v_website is not null and v_website !~* '^https?://[^[:space:]]+$' then raise exception 'invalid_website_url'; end if;
  if v_phone is not null and char_length(v_phone)>50 then raise exception 'invalid_phone'; end if;

  select to_jsonb(b) into v_before from platform.tenant_branding b where b.tenant_id=p_tenant_id;

  update platform.tenant_branding
  set display_name=v_display_name,portal_name=v_portal_name,primary_color=v_primary,accent_color=v_accent,
      support_email=v_email,website_url=v_website,phone=v_phone,updated_at=now()
  where tenant_id=p_tenant_id;
  if not found then raise exception 'tenant_branding_not_found'; end if;

  select to_jsonb(b) into v_after from platform.tenant_branding b where b.tenant_id=p_tenant_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_user_id,'user','platform.owner.branding_updated','tenant_branding',p_tenant_id::text,v_before,v_after,jsonb_build_object('source','agency_launch'));

  return v_after;
end;
$function$;
$definition$;
    revoke all on function public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
    grant execute on function public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text) to service_role;
  else
    -- Staging already has this writer. Preserve its OID, definition, owner and ACL.
    if not exists(select 1 from pg_proc p where p.oid=v_oid
      and md5(p.prosrc)='57f28fb8730e57ef89babec7ff8c2d23'
      and p.prosecdef and p.provolatile='v' and p.prorettype='jsonb'::regtype
      and p.proconfig=array['search_path=""']::text[])
      or has_function_privilege('anon',v_oid,'execute')
      or has_function_privilege('authenticated',v_oid,'execute')
      or not has_function_privilege('service_role',v_oid,'execute') then
      raise exception 'Unexpected owner branding writer or grants; review drift before restoring.';
    end if;
  end if;
end;
$restore$;
