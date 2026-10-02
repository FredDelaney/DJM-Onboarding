revoke all on function public.djm_entity_archive_v1(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.djm_entity_patch_v1(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.djm_delete_preview(text,uuid) from public,anon,authenticated;
revoke all on function public.djm_delete_entity(text,uuid,boolean) from public,anon,authenticated;

grant execute on function public.djm_entity_archive_v1(text,uuid,boolean) to service_role;
grant execute on function public.djm_entity_patch_v1(text,uuid,jsonb) to service_role;
grant execute on function public.djm_delete_preview(text,uuid) to service_role;
grant execute on function public.djm_delete_entity(text,uuid,boolean) to service_role;

notify pgrst,'reload schema';
