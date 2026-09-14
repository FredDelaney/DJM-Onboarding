drop policy if exists tenant_owner_delete on djm_os.conversation_threads;
drop policy if exists tenant_owner_insert on djm_os.conversation_threads;
drop policy if exists tenant_owner_update on djm_os.conversation_threads;

create policy tenant_owner_delete on djm_os.conversation_threads
for delete to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id = (select auth.uid())
);

create policy tenant_owner_insert on djm_os.conversation_threads
for insert to authenticated
with check (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id = (select auth.uid())
);

create policy tenant_owner_update on djm_os.conversation_threads
for update to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id = (select auth.uid())
)
with check (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id = (select auth.uid())
);

drop policy if exists tenant_thread_delete on djm_os.messages;
drop policy if exists tenant_thread_insert on djm_os.messages;
drop policy if exists tenant_thread_update on djm_os.messages;

create policy tenant_thread_delete on djm_os.messages
for delete to authenticated
using (
  exists (
    select 1
    from djm_os.conversation_threads t
    where t.id = messages.thread_id
      and t.owner_user_id = (select auth.uid())
      and private.user_has_staff_tenant_access(t.tenant_id)
  )
);

create policy tenant_thread_insert on djm_os.messages
for insert to authenticated
with check (
  exists (
    select 1
    from djm_os.conversation_threads t
    where t.id = messages.thread_id
      and t.owner_user_id = (select auth.uid())
      and private.user_has_staff_tenant_access(t.tenant_id)
  )
);

create policy tenant_thread_update on djm_os.messages
for update to authenticated
using (
  exists (
    select 1
    from djm_os.conversation_threads t
    where t.id = messages.thread_id
      and t.owner_user_id = (select auth.uid())
      and private.user_has_staff_tenant_access(t.tenant_id)
  )
)
with check (
  exists (
    select 1
    from djm_os.conversation_threads t
    where t.id = messages.thread_id
      and t.owner_user_id = (select auth.uid())
      and private.user_has_staff_tenant_access(t.tenant_id)
  )
);;
