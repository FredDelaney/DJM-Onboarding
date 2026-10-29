-- The authenticated Opportunities page uses this admin-scoped canonical reader.
-- Reuse its existing tenant/actor checks and the reviewed private projection.
-- Preserve the broader two-argument reader and every existing access contract.
do $repair$
declare
 target oid:=to_regprocedure('public.redream_autopilot_market(integer)');
 contract_before jsonb;contract_after jsonb;definition text;
 original_call text:='public.platform_server_demand_control_fast(v_tenant,v_limit);';
 corrected_call text:='public.platform_server_demand_control_fast(v_tenant,v_limit,auth.uid());';
begin
 if target is null or not exists(select 1 from pg_proc where oid=target and md5(prosrc)='0b2975b9a6cd2991a26f5c5f4299e143' and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then
  raise exception 'Unreviewed market reader source or security contract';
 end if;
 if has_function_privilege('anon',target,'execute') or not has_function_privilege('authenticated',target,'execute') or not has_function_privilege('service_role',target,'execute') then
  raise exception 'Unreviewed market reader execution contract';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('private.redream_admin_tenant()') and md5(prosrc)='0db09e5c8619595554b61e48681e8e69' and prosecdef and proconfig=array['search_path=""']) then
  raise exception 'Unreviewed selected-tenant administrator dependency';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.platform_server_demand_control_fast(uuid,integer,uuid)') and md5(prosrc)='e407c16a9fb32691a3387a51ecb19a78' and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then
  raise exception 'Unreviewed private salary projection dependency';
 end if;
 select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'mode',prosecdef,'path',proconfig,'volatility',provolatile,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)),pg_get_functiondef(oid) into contract_before,definition from pg_proc where oid=target;
 if (length(definition)-length(replace(definition,original_call,'')))/length(original_call)<>1 then
  raise exception 'Expected exactly one canonical market demand call';
 end if;
 execute replace(definition,original_call,corrected_call);
 select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'mode',prosecdef,'path',proconfig,'volatility',provolatile,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)) into contract_after from pg_proc where oid=target;
 if contract_before is distinct from contract_after then raise exception 'Market reader metadata changed';end if;
end $repair$;
