create or replace function public.djm_attach_whatsapp_thread(p_thread_id uuid, p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_person_name text;
  v_org_id uuid;
  v_org_name text;
  v_existing_person uuid;
  v_existing_org uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.tenant_id, p.full_name
    into v_tenant_id, v_person_name
  from djm_os.people p
  where p.id = p_person_id
    and p.person_type = 'club_contact';

  if v_tenant_id is null then
    raise exception 'Club contact not found';
  end if;

  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id = m.tenant_id and t.status = 'active'
    where m.tenant_id = v_tenant_id
      and m.user_id = v_user_id
      and m.status = 'active'
      and m.role in ('owner','admin','agent','operations')
  ) then
    raise exception 'Tenant network access required';
  end if;

  select t.person_id, t.organisation_id
    into v_existing_person, v_existing_org
  from djm_os.conversation_threads t
  where t.id = p_thread_id
    and t.channel = 'whatsapp'
    and t.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'WhatsApp thread not found';
  end if;

  if v_existing_person is not null and not exists (
    select 1 from djm_os.people p
    where p.id = v_existing_person and p.tenant_id = v_tenant_id
  ) then
    raise exception 'Thread is linked to another tenant';
  end if;

  if v_existing_org is not null and not exists (
    select 1 from djm_os.organisations o
    where o.id = v_existing_org and o.tenant_id = v_tenant_id
  ) then
    raise exception 'Thread is linked to another tenant';
  end if;

  select e.organisation_id, o.name
    into v_org_id, v_org_name
  from djm_os.employments e
  join djm_os.organisations o
    on o.id = e.organisation_id
   and o.tenant_id = v_tenant_id
  where e.person_id = p_person_id
    and e.tenant_id = v_tenant_id
    and e.is_current = true
  order by e.updated_at desc nulls last, e.created_at desc
  limit 1;

  update djm_os.conversation_threads
  set person_id = p_person_id,
      organisation_id = v_org_id,
      thread_label = v_person_name,
      updated_at = now()
  where id = p_thread_id
    and owner_user_id = v_user_id;

  update djm_os.review_items
  set status = 'resolved', resolved_at = now()
  where tenant_id = v_tenant_id
    and review_type = 'thread_identity'
    and payload->>'thread_id' = p_thread_id::text
    and status = 'open';

  perform djm_os.thread_interaction_rollup(p_thread_id);

  return jsonb_build_object(
    'thread_id', p_thread_id,
    'person_id', p_person_id,
    'person_name', v_person_name,
    'organisation_id', v_org_id,
    'organisation_name', v_org_name,
    'tenant_id', v_tenant_id,
    'attached', true
  );
end
$function$;;
