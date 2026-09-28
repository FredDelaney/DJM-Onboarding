begin;

create or replace function djm_os.seed_tell_djm_permission()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  insert into djm_os.tell_djm_permissions(
    tenant_id,
    user_id,
    permission_scope,
    is_enabled
  )
  select
    tm.tenant_id,
    new.user_id,
    case
      when lower(coalesce(new.role_title, '')) like '%admin%'
        then 'full'
      else 'scout'
    end,
    new.is_active
  from platform.tenant_memberships tm
  where tm.user_id = new.user_id
    and tm.status = 'active'
  on conflict (tenant_id, user_id)
  do update
  set permission_scope = excluded.permission_scope,
      is_enabled = excluded.is_enabled,
      updated_at = now();

  return new;
end;
$function$;

commit;
