drop function if exists public.platform_server_operator_add_custom_domain(uuid,text,uuid,text);

create or replace function public.platform_server_operator_add_custom_domain(
  p_tenant_id uuid,
  p_hostname text,
  p_actor_user_id uuid,
  p_reserved_base_domain text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hostname text := regexp_replace(split_part(lower(trim(coalesce(p_hostname,''))), ':', 1), '\.$', '');
  v_reserved_base text := regexp_replace(lower(trim(coalesce(p_reserved_base_domain,''))), '^\.+|\.+$', '', 'g');
  v_plan_key text;
  v_row platform.tenant_domains%rowtype;
  v_label text;
begin
  if not exists(
    select 1 from platform.platform_admins a
    where a.user_id=p_actor_user_id and a.status='active'
  ) then raise exception 'platform_operator_access_required'; end if;

  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  select a.plan_key into v_plan_key
  from platform.tenant_plan_assignments a
  where a.tenant_id=p_tenant_id and a.status in ('trialing','active')
  order by a.effective_from desc
  limit 1;

  if v_plan_key is null or not exists(
    select 1 from platform.plan_features pf
    where pf.plan_key=v_plan_key and pf.feature_key='custom_domain' and pf.enabled
  ) then raise exception 'custom_domain_not_in_plan'; end if;

  if v_hostname='' or char_length(v_hostname)>253
     or v_hostname like '%/%' or v_hostname like '% %'
     or v_hostname !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
     or position('..' in v_hostname)>0
     or v_hostname like '%.vercel.app'
     or v_hostname like '%.supabase.co'
  then raise exception 'invalid_custom_domain'; end if;

  if v_hostname='redreamsystems.com'
     or v_hostname like '%.redreamsystems.com'
     or (
       v_reserved_base<>'' and (
         v_hostname=v_reserved_base
         or v_hostname like '%.' || v_reserved_base
       )
     )
  then raise exception 'managed_redream_domain_not_custom'; end if;

  foreach v_label in array string_to_array(v_hostname,'.') loop
    if char_length(v_label)<1 or char_length(v_label)>63
       or v_label !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'
    then raise exception 'invalid_custom_domain'; end if;
  end loop;

  if array_length(string_to_array(v_hostname,'.'),1)<2 then
    raise exception 'invalid_custom_domain';
  end if;

  select * into v_row
  from platform.tenant_domains d
  where lower(d.hostname)=v_hostname
  limit 1;

  if found then
    if v_row.tenant_id<>p_tenant_id or v_row.domain_type<>'custom' then
      raise exception 'hostname_already_registered';
    end if;

    if v_row.status='disabled' then
      update platform.tenant_domains
      set status='pending',is_primary=false,verified_at=null,updated_at=pg_catalog.now(),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'reactivated_at',pg_catalog.now(),
            'reactivated_by',p_actor_user_id,
            'provider','vercel'
          )
      where id=v_row.id
      returning * into v_row;

      insert into platform.audit_events(
        tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
      ) values (
        p_tenant_id,p_actor_user_id,'user','platform.domain.custom_reactivated','tenant_domain',v_row.id::text,
        to_jsonb(v_row),jsonb_build_object('source','platform_ops')
      );
    end if;

    return to_jsonb(v_row);
  end if;

  insert into platform.tenant_domains(
    tenant_id,hostname,domain_type,status,is_primary,metadata
  ) values (
    p_tenant_id,v_hostname,'custom','pending',false,
    jsonb_build_object(
      'provider','vercel',
      'requested_by',p_actor_user_id,
      'requested_at',pg_catalog.now(),
      'created_from','platform_ops'
    )
  ) returning * into v_row;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.domain.custom_requested','tenant_domain',v_row.id::text,
    to_jsonb(v_row),jsonb_build_object('source','platform_ops')
  );

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.platform_server_operator_add_custom_domain(
  p_tenant_id uuid,
  p_hostname text,
  p_actor_user_id uuid
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select public.platform_server_operator_add_custom_domain(
    p_tenant_id,
    p_hostname,
    p_actor_user_id,
    'redreamsystems.com'::text
  );
$function$;

revoke all on function public.platform_server_operator_add_custom_domain(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.platform_server_operator_add_custom_domain(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_operator_add_custom_domain(uuid,text,uuid,text) to service_role;
grant execute on function public.platform_server_operator_add_custom_domain(uuid,text,uuid) to service_role;;
