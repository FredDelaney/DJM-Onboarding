-- Keep tenant resolver internals and tenant vocabulary service-only.
revoke all on function public.djm_tell_resolve_entity_typed_unscoped(uuid,text,text,text) from public;
revoke execute on function public.djm_tell_resolve_entity_typed_unscoped(uuid,text,text,text) from anon,authenticated;
grant execute on function public.djm_tell_resolve_entity_typed_unscoped(uuid,text,text,text) to service_role;

revoke all on function public.djm_tell_resolve_entity_typed(uuid,text,text,text) from public;
revoke execute on function public.djm_tell_resolve_entity_typed(uuid,text,text,text) from anon,authenticated;
grant execute on function public.djm_tell_resolve_entity_typed(uuid,text,text,text) to service_role;

revoke all on function public.djm_tell_vocabulary(integer,uuid) from public;
revoke execute on function public.djm_tell_vocabulary(integer,uuid) from anon,authenticated;
grant execute on function public.djm_tell_vocabulary(integer,uuid) to service_role;;
