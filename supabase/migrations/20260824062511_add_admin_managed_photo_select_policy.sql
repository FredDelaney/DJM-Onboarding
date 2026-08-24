drop policy if exists "admins read managed player photos"
on storage.objects;

create policy "admins read managed player photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-public'
  and (storage.foldername(name))[1] = 'admin'
  and private.is_admin()
);
