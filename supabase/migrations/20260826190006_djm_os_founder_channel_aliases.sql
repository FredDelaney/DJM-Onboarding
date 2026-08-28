alter table djm_os.team_members add column if not exists whatsapp_export_names text[] not null default '{}';
update djm_os.team_members set whatsapp_export_names=array['Jesse Edge','Jesse'] where lower(display_name)='jesse edge' and cardinality(whatsapp_export_names)=0;

create or replace function public.djm_my_identity()
returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object('user_id',tm.user_id,'display_name',tm.display_name,'timezone',tm.timezone,'whatsapp_export_names',tm.whatsapp_export_names,'role_title',tm.role_title)
from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active
$$;
revoke all on function public.djm_my_identity() from public,anon;
grant execute on function public.djm_my_identity() to authenticated;

create or replace function public.djm_set_whatsapp_export_names(p_names text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from djm_os.team_members where user_id=(select auth.uid()) and is_active) then raise exception 'DJM team access required'; end if;
 update djm_os.team_members set whatsapp_export_names=coalesce(p_names,'{}'::text[]),updated_at=now() where user_id=(select auth.uid());
 return public.djm_my_identity();
end $$;
revoke all on function public.djm_set_whatsapp_export_names(text[]) from public,anon;
grant execute on function public.djm_set_whatsapp_export_names(text[]) to authenticated;
