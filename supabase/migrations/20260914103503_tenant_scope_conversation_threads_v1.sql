alter table djm_os.conversation_threads add column if not exists tenant_id uuid;

update djm_os.conversation_threads t
set tenant_id = coalesce(
  (select p.tenant_id from djm_os.people p where p.id=t.person_id),
  (select o.tenant_id from djm_os.organisations o where o.id=t.organisation_id),
  private.primary_active_tenant_id(t.owner_user_id)
)
where t.tenant_id is null;

do $$
begin
  if exists(select 1 from djm_os.conversation_threads where tenant_id is null) then
    raise exception 'conversation_thread_tenant_backfill_incomplete';
  end if;
end $$;

alter table djm_os.conversation_threads
  alter column tenant_id set not null;

alter table djm_os.conversation_threads
  drop constraint if exists conversation_threads_owner_user_id_fkey,
  add constraint conversation_threads_owner_user_id_fkey
    foreign key(owner_user_id) references auth.users(id) on delete cascade;

alter table djm_os.conversation_threads
  drop constraint if exists conversation_threads_owner_user_id_channel_external_thread__key;

alter table djm_os.conversation_threads
  add constraint conversation_threads_owner_tenant_channel_external_key
    unique(owner_user_id, tenant_id, channel, external_thread_id);

alter table djm_os.conversation_threads
  drop constraint if exists conversation_threads_tenant_id_fkey,
  add constraint conversation_threads_tenant_id_fkey
    foreign key(tenant_id) references platform.tenants(id) on delete cascade;

create index if not exists conversation_threads_tenant_last_message_idx
  on djm_os.conversation_threads(tenant_id,last_message_at desc nulls last);

create or replace function djm_os.enforce_conversation_thread_tenant_links()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.person_id is not null and not exists(
    select 1 from djm_os.people p where p.id=new.person_id and p.tenant_id=new.tenant_id
  ) then
    raise exception 'Thread contact must belong to the same tenant';
  end if;

  if new.organisation_id is not null and not exists(
    select 1 from djm_os.organisations o where o.id=new.organisation_id and o.tenant_id=new.tenant_id
  ) then
    raise exception 'Thread organisation must belong to the same tenant';
  end if;

  return new;
end;
$function$;

revoke all on function djm_os.enforce_conversation_thread_tenant_links() from public, anon, authenticated;
grant execute on function djm_os.enforce_conversation_thread_tenant_links() to service_role;

drop trigger if exists enforce_conversation_thread_tenant_links on djm_os.conversation_threads;
create trigger enforce_conversation_thread_tenant_links
before insert or update of tenant_id,person_id,organisation_id
on djm_os.conversation_threads
for each row execute function djm_os.enforce_conversation_thread_tenant_links();

drop policy if exists djm_team_select on djm_os.conversation_threads;
drop policy if exists djm_team_insert on djm_os.conversation_threads;
drop policy if exists djm_team_update on djm_os.conversation_threads;
drop policy if exists djm_team_delete on djm_os.conversation_threads;

create policy tenant_staff_select on djm_os.conversation_threads
for select to authenticated
using (private.user_has_staff_tenant_access(tenant_id));

create policy tenant_owner_insert on djm_os.conversation_threads
for insert to authenticated
with check (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id=auth.uid()
);

create policy tenant_owner_update on djm_os.conversation_threads
for update to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id=auth.uid()
)
with check (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id=auth.uid()
);

create policy tenant_owner_delete on djm_os.conversation_threads
for delete to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and owner_user_id=auth.uid()
);

drop policy if exists djm_team_select on djm_os.messages;
drop policy if exists djm_team_insert on djm_os.messages;
drop policy if exists djm_team_update on djm_os.messages;
drop policy if exists djm_team_delete on djm_os.messages;

create policy tenant_thread_select on djm_os.messages
for select to authenticated
using (exists(
  select 1 from djm_os.conversation_threads t
  where t.id=messages.thread_id
    and private.user_has_staff_tenant_access(t.tenant_id)
));

create policy tenant_thread_insert on djm_os.messages
for insert to authenticated
with check (exists(
  select 1 from djm_os.conversation_threads t
  where t.id=messages.thread_id
    and t.owner_user_id=auth.uid()
    and private.user_has_staff_tenant_access(t.tenant_id)
));

create policy tenant_thread_update on djm_os.messages
for update to authenticated
using (exists(
  select 1 from djm_os.conversation_threads t
  where t.id=messages.thread_id
    and t.owner_user_id=auth.uid()
    and private.user_has_staff_tenant_access(t.tenant_id)
))
with check (exists(
  select 1 from djm_os.conversation_threads t
  where t.id=messages.thread_id
    and t.owner_user_id=auth.uid()
    and private.user_has_staff_tenant_access(t.tenant_id)
));

create policy tenant_thread_delete on djm_os.messages
for delete to authenticated
using (exists(
  select 1 from djm_os.conversation_threads t
  where t.id=messages.thread_id
    and t.owner_user_id=auth.uid()
    and private.user_has_staff_tenant_access(t.tenant_id)
));

create or replace function public.djm_upsert_thread(
  p_channel text,
  p_external_thread_id text,
  p_person_id uuid default null,
  p_organisation_id uuid default null,
  p_thread_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  v_id uuid;
  v_uid uuid:=auth.uid();
  v_tenant uuid;
  v_person_tenant uuid;
  v_org_tenant uuid;
  v_explicit_tenant uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  if nullif(trim(coalesce(p_metadata->>'tenant_id','')),'') is not null then
    v_explicit_tenant := (p_metadata->>'tenant_id')::uuid;
  end if;

  if p_person_id is not null then
    select p.tenant_id into v_person_tenant from djm_os.people p where p.id=p_person_id;
    if v_person_tenant is null then raise exception 'Contact not found'; end if;
  end if;

  if p_organisation_id is not null then
    select o.tenant_id into v_org_tenant from djm_os.organisations o where o.id=p_organisation_id;
    if v_org_tenant is null then raise exception 'Organisation not found'; end if;
  end if;

  v_tenant := coalesce(v_person_tenant,v_org_tenant,v_explicit_tenant,private.primary_active_tenant_id(v_uid));
  if v_tenant is null then raise exception 'Active agency workspace required'; end if;

  if v_person_tenant is not null and v_person_tenant<>v_tenant then raise exception 'Contact belongs to another tenant'; end if;
  if v_org_tenant is not null and v_org_tenant<>v_tenant then raise exception 'Organisation belongs to another tenant'; end if;
  if v_explicit_tenant is not null and v_explicit_tenant<>v_tenant then raise exception 'Requested tenant does not match linked identity'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_uid) then raise exception 'Agency staff access required'; end if;

  insert into djm_os.conversation_threads(
    tenant_id,channel,owner_user_id,person_id,organisation_id,external_thread_id,thread_label,source_metadata
  )
  values(
    v_tenant,lower(trim(p_channel)),v_uid,p_person_id,p_organisation_id,
    nullif(trim(coalesce(p_external_thread_id,'')),''),nullif(trim(coalesce(p_thread_label,'')),''),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(owner_user_id,tenant_id,channel,external_thread_id)
  do update set
    person_id=coalesce(excluded.person_id,djm_os.conversation_threads.person_id),
    organisation_id=coalesce(excluded.organisation_id,djm_os.conversation_threads.organisation_id),
    thread_label=coalesce(excluded.thread_label,djm_os.conversation_threads.thread_label),
    source_metadata=djm_os.conversation_threads.source_metadata||excluded.source_metadata,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.djm_link_thread(p_thread_id uuid, p_person_id uuid default null, p_organisation_id uuid default null)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_owner uuid;
  v_tenant uuid;
  v_count int:=0;
  v_person_tenant uuid;
  v_org_tenant uuid;
  r record;
begin
  select t.owner_user_id,t.tenant_id into v_owner,v_tenant
  from djm_os.conversation_threads t where t.id=p_thread_id;
  if not found or v_owner<>auth.uid() then raise exception 'Thread not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;

  if p_person_id is not null then
    select p.tenant_id into v_person_tenant from djm_os.people p where p.id=p_person_id;
    if v_person_tenant is null or v_person_tenant<>v_tenant then raise exception 'Contact belongs to another tenant'; end if;
  end if;

  if p_organisation_id is not null then
    select o.tenant_id into v_org_tenant from djm_os.organisations o where o.id=p_organisation_id;
    if v_org_tenant is null or v_org_tenant<>v_tenant then raise exception 'Organisation belongs to another tenant'; end if;
  end if;

  update djm_os.conversation_threads
  set person_id=coalesce(p_person_id,person_id),
      organisation_id=coalesce(p_organisation_id,organisation_id),
      updated_at=now()
  where id=p_thread_id and owner_user_id=auth.uid() and tenant_id=v_tenant;

  update djm_os.review_items
  set status='resolved',resolved_at=now()
  where tenant_id=v_tenant
    and review_type='thread_identity'
    and payload->>'thread_id'=p_thread_id::text
    and status='open';

  for r in select id from djm_os.messages where thread_id=p_thread_id order by sent_at loop
    perform djm_os.process_message_rule_based(r.id);
    v_count:=v_count+1;
  end loop;

  perform djm_os.thread_interaction_rollup(p_thread_id);
  return jsonb_build_object('thread_id',p_thread_id,'tenant_id',v_tenant,'person_id',p_person_id,'organisation_id',p_organisation_id,'linked',true,'messages_reprocessed',v_count);
end;
$function$;

create or replace function public.djm_store_message(
  p_thread_id uuid,
  p_sent_at timestamp with time zone,
  p_direction text,
  p_raw_text text default null,
  p_external_message_id text default null,
  p_sender_label text default null,
  p_message_type text default 'text',
  p_asset_uri text default null,
  p_transcript_text text default null,
  p_reply_to_external_id text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_id uuid; v_hash text; v_new boolean:=false; begin
  if not exists(
    select 1 from djm_os.conversation_threads t
    where t.id=p_thread_id
      and t.owner_user_id=auth.uid()
      and private.user_has_staff_tenant_access(t.tenant_id)
  ) then raise exception 'Thread not found'; end if;

  v_hash:=encode(extensions.digest(coalesce(p_external_message_id,'')||'|'||coalesce(p_sent_at::text,'')||'|'||coalesce(p_direction,'')||'|'||coalesce(p_raw_text,'')||'|'||coalesce(p_transcript_text,''),'sha256'),'hex');
  insert into djm_os.messages(thread_id,external_message_id,message_hash,sent_at,direction,sender_label,raw_text,message_type,asset_uri,transcript_text,reply_to_external_id)
  values(p_thread_id,nullif(trim(coalesce(p_external_message_id,'')),''),v_hash,coalesce(p_sent_at,now()),lower(trim(p_direction)),nullif(trim(coalesce(p_sender_label,'')),''),p_raw_text,coalesce(nullif(lower(trim(p_message_type)),''),'text'),p_asset_uri,p_transcript_text,p_reply_to_external_id)
  on conflict(thread_id,message_hash) where message_hash is not null do nothing returning id into v_id;
  if v_id is not null then
    v_new:=true;
    update djm_os.conversation_threads
    set first_message_at=least(coalesce(first_message_at,p_sent_at),p_sent_at),
        last_message_at=greatest(coalesce(last_message_at,p_sent_at),p_sent_at),
        message_count=message_count+1,
        updated_at=now()
    where id=p_thread_id and owner_user_id=auth.uid();
  end if;
  return jsonb_build_object('message_id',v_id,'created',v_new,'duplicate',not v_new);
end;
$function$;

create or replace function public.djm_thread_messages(p_thread_id uuid, p_before timestamp with time zone default null, p_limit integer default 100)
returns table(id uuid, sent_at timestamp with time zone, direction text, sender_label text, raw_text text, message_type text, asset_uri text, transcript_text text, processing_status text)
language sql
stable
set search_path to ''
as $function$
  select m.id,m.sent_at,m.direction,m.sender_label,m.raw_text,m.message_type,m.asset_uri,m.transcript_text,m.processing_status
  from djm_os.messages m
  join djm_os.conversation_threads t on t.id=m.thread_id
  where m.thread_id=p_thread_id
    and (p_before is null or m.sent_at<p_before)
    and t.owner_user_id=auth.uid()
    and private.user_has_staff_tenant_access(t.tenant_id)
  order by m.sent_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$function$;

create or replace function public.djm_attach_whatsapp_thread(p_thread_id uuid, p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_tenant_id uuid;
  v_person_tenant uuid;
  v_person_name text;
  v_org_id uuid;
  v_org_name text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select t.tenant_id into v_tenant_id
  from djm_os.conversation_threads t
  where t.id=p_thread_id and t.channel='whatsapp' and t.owner_user_id=v_user_id
  for update;
  if v_tenant_id is null then raise exception 'WhatsApp thread not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant_id,v_user_id) then raise exception 'Tenant network access required'; end if;

  select p.tenant_id,p.full_name into v_person_tenant,v_person_name
  from djm_os.people p
  where p.id=p_person_id and p.person_type='club_contact';
  if v_person_tenant is null or v_person_tenant<>v_tenant_id then raise exception 'Club contact not found for tenant'; end if;

  select e.organisation_id,o.name into v_org_id,v_org_name
  from djm_os.employments e
  join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=v_tenant_id
  where e.person_id=p_person_id and e.tenant_id=v_tenant_id and e.is_current=true
  order by e.updated_at desc nulls last,e.created_at desc
  limit 1;

  update djm_os.conversation_threads
  set person_id=p_person_id,organisation_id=v_org_id,thread_label=v_person_name,updated_at=now()
  where id=p_thread_id and tenant_id=v_tenant_id and owner_user_id=v_user_id;

  update djm_os.review_items
  set status='resolved',resolved_at=now()
  where tenant_id=v_tenant_id
    and review_type='thread_identity'
    and payload->>'thread_id'=p_thread_id::text
    and status='open';

  perform djm_os.thread_interaction_rollup(p_thread_id);
  return jsonb_build_object('thread_id',p_thread_id,'tenant_id',v_tenant_id,'person_id',p_person_id,'person_name',v_person_name,'organisation_id',v_org_id,'organisation_name',v_org_name,'attached',true);
end;
$function$;;
