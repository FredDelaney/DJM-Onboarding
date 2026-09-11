-- DJM Player staging Storage bootstrap
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 008_application_permissions.sql.
--
-- Recreates only Storage configuration required by DJM:
--   5 bucket definitions
--   15 app-specific policies on storage.objects
--
-- No Storage objects/files are copied.
-- Production Storage body MD5: a3564b060b70addfebc9983b6649f1c2
--
-- Policies depend on recovered application helpers such as private.is_admin(),
-- so this file intentionally comes after the application function/permission layers.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('djm-build-temp', 'djm-build-temp', 'f', 1048576, '{text/plain}'::text[]) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('djm-network-captures', 'djm-network-captures', 'f', 12582912, '{audio/webm,audio/mp4,audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/m4a}'::text[]) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('djm-resources', 'djm-resources', 'f', 52428800, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('player-private', 'player-private', 'f', 26214400, '{image/jpeg,image/png,image/webp,application/pdf,video/mp4,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'::text[]) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('player-public', 'player-public', 't', 20971520, '{image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf}'::text[]) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "admins delete djm resources" on storage.objects;
create policy "admins delete djm resources" on storage.objects as permissive for delete to authenticated
using (((bucket_id = 'djm-resources'::text) AND private.is_admin()));

drop policy if exists "admins delete managed player photos" on storage.objects;
create policy "admins delete managed player photos" on storage.objects as permissive for delete to authenticated
using (((bucket_id = 'player-public'::text) AND ((storage.foldername(name))[1] = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));

drop policy if exists "admins read managed player photos" on storage.objects;
create policy "admins read managed player photos" on storage.objects as permissive for select to authenticated
using (((bucket_id = 'player-public'::text) AND ((storage.foldername(name))[1] = 'admin'::text) AND private.is_admin()));

drop policy if exists "admins update djm resources" on storage.objects;
create policy "admins update djm resources" on storage.objects as permissive for update to authenticated
using (((bucket_id = 'djm-resources'::text) AND private.is_admin()))
with check (((bucket_id = 'djm-resources'::text) AND private.is_admin()));

drop policy if exists "admins update managed player photos" on storage.objects;
create policy "admins update managed player photos" on storage.objects as permissive for update to authenticated
using (((bucket_id = 'player-public'::text) AND ((storage.foldername(name))[1] = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))))
with check (((bucket_id = 'player-public'::text) AND ((storage.foldername(name))[1] = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));

drop policy if exists "admins upload djm resources" on storage.objects;
create policy "admins upload djm resources" on storage.objects as permissive for insert to authenticated
with check (((bucket_id = 'djm-resources'::text) AND private.is_admin()));

drop policy if exists "admins upload managed player photos" on storage.objects;
create policy "admins upload managed player photos" on storage.objects as permissive for insert to authenticated
with check (((bucket_id = 'player-public'::text) AND ((storage.foldername(name))[1] = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));

drop policy if exists "players read djm resources" on storage.objects;
create policy "players read djm resources" on storage.objects as permissive for select to authenticated
using ((bucket_id = 'djm-resources'::text));

drop policy if exists "users delete own private files" on storage.objects;
create policy "users delete own private files" on storage.objects as permissive for delete to authenticated
using (((bucket_id = 'player-private'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

drop policy if exists "users delete own public media" on storage.objects;
create policy "users delete own public media" on storage.objects as permissive for delete to authenticated
using (((bucket_id = 'player-public'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

drop policy if exists "users read own private files" on storage.objects;
create policy "users read own private files" on storage.objects as permissive for select to authenticated
using (((bucket_id = 'player-private'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

drop policy if exists "users update own private files" on storage.objects;
create policy "users update own private files" on storage.objects as permissive for update to authenticated
using (((bucket_id = 'player-private'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))))
with check (((bucket_id = 'player-private'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

drop policy if exists "users update own public media" on storage.objects;
create policy "users update own public media" on storage.objects as permissive for update to authenticated
using (((bucket_id = 'player-public'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))))
with check (((bucket_id = 'player-public'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

drop policy if exists "users upload own private files" on storage.objects;
create policy "users upload own private files" on storage.objects as permissive for insert to authenticated
with check (((bucket_id = 'player-private'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

drop policy if exists "users upload own public media" on storage.objects;
create policy "users upload own public media" on storage.objects as permissive for insert to authenticated
with check (((bucket_id = 'player-public'::text) AND (private.is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));

commit;
