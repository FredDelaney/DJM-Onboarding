create or replace function public.platform_server_user_access(p_user_id uuid, p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with membership as (
  select m.role,m.status,m.is_primary,m.joined_at
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.user_id=p_user_id and m.tenant_id=p_tenant_id
  limit 1
), permissions as (
  select coalesce(jsonb_object_agg(pc.permission_key,coalesce(rp.allowed,false) order by pc.permission_key),'{}'::jsonb) as value
  from platform.permission_catalog pc
  left join membership m on true
  left join platform.role_permissions rp on rp.role=m.role and rp.permission_key=pc.permission_key
)
select case when not exists(select 1 from membership) then
  jsonb_build_object('allowed',false,'reason','membership_not_found','tenant_id',p_tenant_id,'user_id',p_user_id)
else
  jsonb_build_object(
    'allowed',(select status='active' from membership),
    'reason',case when (select status from membership)='active' then 'active_membership' else 'membership_not_active' end,
    'tenant_id',p_tenant_id,
    'user_id',p_user_id,
    'role',(select role from membership),
    'membership_status',(select status from membership),
    'is_primary',(select is_primary from membership),
    'permissions',(select value from permissions)
  )
end;
$$;

create or replace function public.platform_server_support_access(p_support_user_id uuid, p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with admin as (
  select role,status from platform.platform_admins where user_id=p_support_user_id and status='active'
), grants as (
  select g.id,g.reason,g.scope,g.starts_at,g.expires_at
  from platform.support_access_grants g
  join admin a on true
  where g.support_user_id=p_support_user_id
    and g.tenant_id=p_tenant_id
    and g.revoked_at is null
    and g.starts_at<=now()
    and g.expires_at>now()
  order by g.expires_at asc
)
select case
  when not exists(select 1 from admin) then jsonb_build_object('allowed',false,'reason','platform_admin_not_active')
  when not exists(select 1 from grants) then jsonb_build_object('allowed',false,'reason','tenant_support_grant_required','platform_role',(select role from admin))
  else jsonb_build_object(
    'allowed',true,
    'reason','time_limited_support_grant',
    'platform_role',(select role from admin),
    'grants',(select jsonb_agg(jsonb_build_object('id',id,'reason',reason,'scope',scope,'starts_at',starts_at,'expires_at',expires_at)) from grants)
  )
end;
$$;

revoke all on function public.platform_server_user_access(uuid,uuid) from public, anon, authenticated;
revoke all on function public.platform_server_support_access(uuid,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_user_access(uuid,uuid) to service_role;
grant execute on function public.platform_server_support_access(uuid,uuid) to service_role;
