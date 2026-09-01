-- Tell DJM V1 release hardening.
-- Existing non-Tell-DJM capture rows keep their current access model.
-- Tell DJM capture rows are additionally restricted to the submitter or full-access staff.

drop policy if exists tell_djm_capture_select_restrict on djm_os.captures;
create policy tell_djm_capture_select_restrict
on djm_os.captures
as restrictive
for select
to authenticated
using (
  processing_version is distinct from 'tell_djm_v1'
  or submitted_by = (select auth.uid())
  or exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.user_id = (select auth.uid())
      and p.permission_scope = 'full'
      and p.is_enabled = true
  )
);

drop policy if exists tell_djm_capture_insert_restrict on djm_os.captures;
create policy tell_djm_capture_insert_restrict
on djm_os.captures
as restrictive
for insert
to authenticated
with check (
  processing_version is distinct from 'tell_djm_v1'
  or (
    submitted_by = (select auth.uid())
    and exists (
      select 1
      from djm_os.tell_djm_permissions p
      where p.user_id = (select auth.uid())
        and p.is_enabled = true
    )
  )
  or exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.user_id = (select auth.uid())
      and p.permission_scope = 'full'
      and p.is_enabled = true
  )
);

drop policy if exists tell_djm_capture_update_restrict on djm_os.captures;
create policy tell_djm_capture_update_restrict
on djm_os.captures
as restrictive
for update
to authenticated
using (
  processing_version is distinct from 'tell_djm_v1'
  or submitted_by = (select auth.uid())
  or exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.user_id = (select auth.uid())
      and p.permission_scope = 'full'
      and p.is_enabled = true
  )
)
with check (
  processing_version is distinct from 'tell_djm_v1'
  or submitted_by = (select auth.uid())
  or exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.user_id = (select auth.uid())
      and p.permission_scope = 'full'
      and p.is_enabled = true
  )
);

drop policy if exists tell_djm_capture_delete_restrict on djm_os.captures;
create policy tell_djm_capture_delete_restrict
on djm_os.captures
as restrictive
for delete
to authenticated
using (
  processing_version is distinct from 'tell_djm_v1'
  or submitted_by = (select auth.uid())
  or exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.user_id = (select auth.uid())
      and p.permission_scope = 'full'
      and p.is_enabled = true
  )
);

notify pgrst, 'reload schema';
