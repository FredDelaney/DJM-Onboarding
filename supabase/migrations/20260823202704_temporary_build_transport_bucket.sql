insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('djm-build-temp','djm-build-temp',true,1048576,array['text/plain'])
on conflict (id) do update set public=true,file_size_limit=1048576,allowed_mime_types=array['text/plain'];

drop policy if exists "temp build public read" on storage.objects;
create policy "temp build public read" on storage.objects for select to anon using (bucket_id='djm-build-temp');
drop policy if exists "temp build public upload" on storage.objects;
create policy "temp build public upload" on storage.objects for insert to anon with check (bucket_id='djm-build-temp' and name='premium-v2.b64');
drop policy if exists "temp build public update" on storage.objects;
create policy "temp build public update" on storage.objects for update to anon using (bucket_id='djm-build-temp' and name='premium-v2.b64') with check (bucket_id='djm-build-temp' and name='premium-v2.b64');
