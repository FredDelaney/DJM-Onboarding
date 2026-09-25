-- Tenant parity: scope the player Resource library to an agency and close
-- obsolete DJM Home RPCs that no active product screen needs.

alter table public.resources
  add column if not exists tenant_id uuid
  references platform.tenants(id)
  on delete cascade;

-- Every pre-SaaS resource in the current product belongs to the DJM tenant.
update public.resources r
set tenant_id=t.id
from platform.tenants t
where r.tenant_id is null
  and t.slug='djm-sports-management';

do $$
begin
  if exists(
    select 1
    from public.resources
    where tenant_id is null
  ) then
    raise exception 'resource_tenant_backfill_incomplete';
  end if;
end
$$;

alter table public.resources
  alter column tenant_id set not null;

create index if not exists resources_tenant_published_sort_idx
  on public.resources(tenant_id,published,sort_order);

-- Remove the last tenant-specific wording from the legacy seed data.
update public.resources
set
  title='Message your agency',
  updated_at=now()
where title='Message DJM'
  and tenant_id=(
    select id
    from platform.tenants
    where slug='djm-sports-management'
    limit 1
  );

drop policy if exists "admins delete resources" on public.resources;
drop policy if exists "admins insert resources" on public.resources;
drop policy if exists "admins update resources" on public.resources;
drop policy if exists "players read resources" on public.resources;

drop policy if exists "tenant admins delete resources" on public.resources;
drop policy if exists "tenant admins insert resources" on public.resources;
drop policy if exists "tenant admins update resources" on public.resources;
drop policy if exists "tenant resources read" on public.resources;

create policy "tenant admins delete resources"
on public.resources
for delete to authenticated
using (
  private.user_is_tenant_admin(tenant_id)
);

create policy "tenant admins insert resources"
on public.resources
for insert to authenticated
with check (
  private.user_is_tenant_admin(tenant_id)
);

create policy "tenant admins update resources"
on public.resources
for update to authenticated
using (
  private.user_is_tenant_admin(tenant_id)
)
with check (
  private.user_is_tenant_admin(tenant_id)
);

create policy "tenant resources read"
on public.resources
for select to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  or (
    published=true
    and audience in ('players','all')
    and exists (
      select 1
      from public.players p
      where p.user_id=auth.uid()
        and p.tenant_id=resources.tenant_id
    )
  )
);

-- The old file bucket has no live objects and is not used by the current
-- resource editor. Remove its literal-DJM authorisation surface.
drop policy if exists "djm tenant admins delete legacy djm resources"
  on storage.objects;
drop policy if exists "djm tenant admins update legacy djm resources"
  on storage.objects;
drop policy if exists "djm tenant admins upload legacy djm resources"
  on storage.objects;

drop function if exists private.is_legacy_djm_tenant_admin(uuid);

-- /djm now runs the shared AgencyOperatingWorkspace, so these old Home RPCs
-- are no longer client APIs. Retain service_role compatibility for now.
revoke all on function public.djm_home_item_controls()
  from public,anon,authenticated;
grant execute on function public.djm_home_item_controls()
  to service_role;

revoke all on function public.djm_home_set_item_control(
  text,text,timestamptz
)
  from public,anon,authenticated;
grant execute on function public.djm_home_set_item_control(
  text,text,timestamptz
)
  to service_role;

revoke all on function public.djm_complete_player_request(uuid)
  from public,anon,authenticated;
grant execute on function public.djm_complete_player_request(uuid)
  to service_role;

-- djm_command_center() and djm_network_set_task_status(uuid,text) remain
-- temporarily executable because active compatibility Settings/Network
-- screens still call them. They are not used by the canonical Agency Home.
