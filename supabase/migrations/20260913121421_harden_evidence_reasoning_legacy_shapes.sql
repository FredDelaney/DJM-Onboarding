do $$
declare
  v_oid oid;
  v_def text;
  v_old text := 'if jsonb_array_length(coalesce(v_match.reasoning->''evidence'',''[]''::jsonb))>=2 then v_corroboration:=least(100,v_corroboration+8); end if;';
  v_new text := 'if (case when jsonb_typeof(v_match.reasoning->''evidence'')=''array'' then jsonb_array_length(v_match.reasoning->''evidence'') when v_match.reasoning ? ''evidence'' then 1 else 0 end)>=2 then v_corroboration:=least(100,v_corroboration+8); end if;';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='platform' and p.proname='command_evidence_health'
    and pg_get_function_identity_arguments(p.oid)='p_tenant_id uuid, p_command jsonb';
  if v_oid is null then raise exception 'command_evidence_health_not_found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if position(v_old in v_def)=0 then raise exception 'expected_legacy_expression_not_found'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end $$;

revoke all on function platform.command_evidence_health(uuid,jsonb) from public,anon,authenticated;
grant execute on function platform.command_evidence_health(uuid,jsonb) to service_role;;
