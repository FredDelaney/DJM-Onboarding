drop policy if exists tenant_notification_select on djm_os.notifications;
create policy tenant_notification_select on djm_os.notifications
for select to authenticated
using ((user_id = (select auth.uid())) and private.user_has_active_tenant_membership(tenant_id));

drop policy if exists tenant_notification_update on djm_os.notifications;
create policy tenant_notification_update on djm_os.notifications
for update to authenticated
using ((user_id = (select auth.uid())) and private.user_has_active_tenant_membership(tenant_id))
with check ((user_id = (select auth.uid())) and private.user_has_active_tenant_membership(tenant_id));

drop policy if exists tell_djm_actions_select on djm_os.tell_djm_actions;
create policy tell_djm_actions_select on djm_os.tell_djm_actions
for select to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id = tell_djm_actions.capture_id
      and c.tenant_id = tell_djm_actions.tenant_id
      and c.submitted_by = (select auth.uid())
  )
  or private.user_has_tell_djm_full(tenant_id)
);

drop policy if exists tell_djm_actions_update on djm_os.tell_djm_actions;
create policy tell_djm_actions_update on djm_os.tell_djm_actions
for update to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id = tell_djm_actions.capture_id
      and c.tenant_id = tell_djm_actions.tenant_id
      and c.submitted_by = (select auth.uid())
  )
  or private.user_has_tell_djm_full(tenant_id)
)
with check (
  exists (
    select 1 from djm_os.captures c
    where c.id = tell_djm_actions.capture_id
      and c.tenant_id = tell_djm_actions.tenant_id
      and c.submitted_by = (select auth.uid())
  )
  or private.user_has_tell_djm_full(tenant_id)
);

drop policy if exists tell_djm_aliases_delete on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_delete on djm_os.tell_djm_aliases
for delete to authenticated
using (private.user_has_staff_tenant_access(tenant_id) and ((owner_user_id = (select auth.uid())) or private.user_has_tell_djm_full(tenant_id)));

drop policy if exists tell_djm_aliases_insert on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_insert on djm_os.tell_djm_aliases
for insert to authenticated
with check (private.user_has_staff_tenant_access(tenant_id) and ((owner_user_id = (select auth.uid())) or private.user_has_tell_djm_full(tenant_id)));

drop policy if exists tell_djm_aliases_select on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_select on djm_os.tell_djm_aliases
for select to authenticated
using (private.user_has_staff_tenant_access(tenant_id) and ((owner_user_id = (select auth.uid())) or (owner_user_id is null) or private.user_has_tell_djm_full(tenant_id)));

drop policy if exists tell_djm_aliases_update on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_update on djm_os.tell_djm_aliases
for update to authenticated
using (private.user_has_staff_tenant_access(tenant_id) and ((owner_user_id = (select auth.uid())) or private.user_has_tell_djm_full(tenant_id)))
with check (private.user_has_staff_tenant_access(tenant_id) and ((owner_user_id = (select auth.uid())) or private.user_has_tell_djm_full(tenant_id)));

drop policy if exists tell_djm_permissions_select on djm_os.tell_djm_permissions;
create policy tell_djm_permissions_select on djm_os.tell_djm_permissions
for select to authenticated
using ((user_id = (select auth.uid())) or private.user_is_tenant_admin(tenant_id));

drop policy if exists tell_djm_questions_select on djm_os.tell_djm_questions;
create policy tell_djm_questions_select on djm_os.tell_djm_questions
for select to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id = tell_djm_questions.capture_id
      and c.tenant_id = tell_djm_questions.tenant_id
      and c.submitted_by = (select auth.uid())
  )
  or private.user_has_tell_djm_full(tenant_id)
);

drop policy if exists tell_djm_questions_update on djm_os.tell_djm_questions;
create policy tell_djm_questions_update on djm_os.tell_djm_questions
for update to authenticated
using (
  exists (
    select 1 from djm_os.captures c
    where c.id = tell_djm_questions.capture_id
      and c.tenant_id = tell_djm_questions.tenant_id
      and c.submitted_by = (select auth.uid())
  )
  or private.user_has_tell_djm_full(tenant_id)
)
with check (
  exists (
    select 1 from djm_os.captures c
    where c.id = tell_djm_questions.capture_id
      and c.tenant_id = tell_djm_questions.tenant_id
      and c.submitted_by = (select auth.uid())
  )
  or private.user_has_tell_djm_full(tenant_id)
);;
