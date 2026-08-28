insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('djm-resources','djm-resources',false,52428800,null)
on conflict (id) do nothing;

drop policy if exists "players read djm resources" on storage.objects;
create policy "players read djm resources" on storage.objects for select to authenticated using (bucket_id='djm-resources');
drop policy if exists "admins upload djm resources" on storage.objects;
create policy "admins upload djm resources" on storage.objects for insert to authenticated with check (bucket_id='djm-resources' and private.is_admin());
drop policy if exists "admins update djm resources" on storage.objects;
create policy "admins update djm resources" on storage.objects for update to authenticated using (bucket_id='djm-resources' and private.is_admin()) with check (bucket_id='djm-resources' and private.is_admin());
drop policy if exists "admins delete djm resources" on storage.objects;
create policy "admins delete djm resources" on storage.objects for delete to authenticated using (bucket_id='djm-resources' and private.is_admin());
