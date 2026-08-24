drop policy if exists "admins upload managed player photos"
on storage.objects;

create policy "admins upload managed player photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-public'
  and (storage.foldername(name))[1] = 'admin'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "admins update managed player photos"
on storage.objects;

create policy "admins update managed player photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-public'
  and (storage.foldername(name))[1] = 'admin'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  bucket_id = 'player-public'
  and (storage.foldername(name))[1] = 'admin'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "admins delete managed player photos"
on storage.objects;

create policy "admins delete managed player photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-public'
  and (storage.foldername(name))[1] = 'admin'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);
