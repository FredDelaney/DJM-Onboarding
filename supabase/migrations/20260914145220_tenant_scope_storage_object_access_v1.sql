create or replace function private.safe_uuid(p_value text)
returns uuid
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_value is not null
      and p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then p_value::uuid
    else null
  end;
$$;

create or replace function private.storage_object_player_id(
  p_bucket_id text,
  p_name text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_existing_player_id uuid;
  v_folders text[];
  v_candidate uuid;
begin
  if p_bucket_id not in ('player-private', 'player-public') then
    return null;
  end if;

  select d.player_id
    into v_existing_player_id
  from public.player_documents d
  where d.bucket_id = p_bucket_id
    and d.object_path = p_name
  limit 1;

  if v_existing_player_id is not null then
    return v_existing_player_id;
  end if;

  v_folders := storage.foldername(p_name);

  if p_bucket_id = 'player-public'
    and coalesce(v_folders[1], '') = 'admin'
  then
    v_candidate := private.safe_uuid(v_folders[2]);

    if exists (
      select 1
      from public.players p
      where p.id = v_candidate
    ) then
      return v_candidate;
    end if;
  end if;

  if p_bucket_id = 'player-private'
    and coalesce(v_folders[2], '') like 'admin-%'
  then
    v_candidate := private.safe_uuid(
      substring(v_folders[2] from 7)
    );

    if exists (
      select 1
      from public.players p
      where p.id = v_candidate
    ) then
      return v_candidate;
    end if;
  end if;

  v_candidate := private.safe_uuid(v_folders[1]);

  if v_candidate is not null then
    select p.id
      into v_existing_player_id
    from public.players p
    where p.user_id = v_candidate
    limit 1;

    if v_existing_player_id is not null then
      return v_existing_player_id;
    end if;
  end if;

  return null;
end;
$$;

create or replace function private.can_view_player_storage_object(
  p_bucket_id text,
  p_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_owner_user_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  v_player_id := private.storage_object_player_id(
    p_bucket_id,
    p_name
  );

  if v_player_id is null then
    return false;
  end if;

  select p.user_id
    into v_owner_user_id
  from public.players p
  where p.id = v_player_id;

  if v_owner_user_id = p_user_id then
    return true;
  end if;

  return private.can_staff_view_player(v_player_id);
end;
$$;

create or replace function private.can_edit_player_storage_object(
  p_bucket_id text,
  p_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_owner_user_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  v_player_id := private.storage_object_player_id(
    p_bucket_id,
    p_name
  );

  if v_player_id is null then
    return false;
  end if;

  select p.user_id
    into v_owner_user_id
  from public.players p
  where p.id = v_player_id;

  if v_owner_user_id = p_user_id then
    return true;
  end if;

  return private.can_staff_edit_player(v_player_id);
end;
$$;

create or replace function private.is_legacy_djm_tenant_admin(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from platform.tenant_memberships m
      join platform.tenants t
        on t.id = m.tenant_id
       and t.status = 'active'
      where m.user_id = p_user_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
        and t.slug = 'djm-sports-management'
    );
$$;

revoke all on function private.safe_uuid(text) from public, anon;
revoke all on function private.storage_object_player_id(text, text) from public, anon;
revoke all on function private.can_view_player_storage_object(text, text, uuid) from public, anon;
revoke all on function private.can_edit_player_storage_object(text, text, uuid) from public, anon;
revoke all on function private.is_legacy_djm_tenant_admin(uuid) from public, anon;

grant execute on function private.safe_uuid(text) to authenticated;
grant execute on function private.storage_object_player_id(text, text) to authenticated;
grant execute on function private.can_view_player_storage_object(text, text, uuid) to authenticated;
grant execute on function private.can_edit_player_storage_object(text, text, uuid) to authenticated;
grant execute on function private.is_legacy_djm_tenant_admin(uuid) to authenticated;

drop policy if exists "admins delete managed player photos" on storage.objects;
drop policy if exists "admins read managed player photos" on storage.objects;
drop policy if exists "admins update managed player photos" on storage.objects;
drop policy if exists "admins upload managed player photos" on storage.objects;
drop policy if exists "users delete own private files" on storage.objects;
drop policy if exists "users delete own public media" on storage.objects;
drop policy if exists "users read own private files" on storage.objects;
drop policy if exists "users update own private files" on storage.objects;
drop policy if exists "users update own public media" on storage.objects;
drop policy if exists "users upload own private files" on storage.objects;
drop policy if exists "users upload own public media" on storage.objects;

create policy "tenant members read permitted private player files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-private'
  and private.can_view_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members upload permitted private player files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-private'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members update permitted private player files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-private'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
)
with check (
  bucket_id = 'player-private'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members delete permitted private player files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-private'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members read permitted public player media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-public'
  and private.can_view_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members upload permitted public player media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-public'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members update permitted public player media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-public'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
)
with check (
  bucket_id = 'player-public'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

create policy "tenant members delete permitted public player media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-public'
  and private.can_edit_player_storage_object(
    bucket_id,
    name,
    auth.uid()
  )
);

drop policy if exists "admins delete djm resources" on storage.objects;
drop policy if exists "admins update djm resources" on storage.objects;
drop policy if exists "admins upload djm resources" on storage.objects;

create policy "djm tenant admins upload legacy djm resources"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'djm-resources'
  and private.is_legacy_djm_tenant_admin(auth.uid())
);

create policy "djm tenant admins update legacy djm resources"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'djm-resources'
  and private.is_legacy_djm_tenant_admin(auth.uid())
)
with check (
  bucket_id = 'djm-resources'
  and private.is_legacy_djm_tenant_admin(auth.uid())
);

create policy "djm tenant admins delete legacy djm resources"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'djm-resources'
  and private.is_legacy_djm_tenant_admin(auth.uid())
);
