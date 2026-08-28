drop policy if exists "temp build public read" on storage.objects;
drop policy if exists "temp build public update" on storage.objects;
drop policy if exists "temp build public upload" on storage.objects;
update storage.buckets set public=false where id='djm-build-temp';
drop function if exists public.get_djm_build_chunk(integer,text);
drop table if exists private.djm_build_chunks;
