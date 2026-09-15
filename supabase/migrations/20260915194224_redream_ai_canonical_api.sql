-- Canonical ReDream AI API. Move each implementation once, preserve old callers
-- through invoker wrappers with identical argument defaults and restricted grants.
-- Historical tables, processing_version, source keys and media URIs stay unchanged.
do $canonical$
declare
  r record;
  v_new text;
  v_definition text;
  v_arguments text;
  v_call text;
  v_result text;
  v_role text;
begin
  for r in
    select p.oid,p.proname,p.proargnames,p.pronargs,
      pg_get_function_identity_arguments(p.oid) identity_args,
      pg_get_function_arguments(p.oid) all_args,
      pg_get_function_result(p.oid) result_type
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'djm_tell_%'
      -- Retired primary-user search APIs remain legacy-only, never current worker APIs.
      and p.proname not in ('djm_tell_resolve_entity','djm_tell_resolve_entity_typed','djm_tell_resolve_entity_typed_unscoped','djm_tell_vocabulary')
    order by p.proname,p.oid
  loop
    v_new := 'redream_ai_'||substring(r.proname from 10);
    execute format('alter function public.%I(%s) rename to %I',r.proname,r.identity_args,v_new);
    v_definition := pg_get_functiondef(r.oid);
    -- Rewrite callable identifiers, not persisted Tell source/idempotency keys.
    v_definition := replace(v_definition,'public.djm_tell_','public.redream_ai_');
    v_definition := replace(v_definition,'TELL_DJM_','REDREAM_AI_');
    v_definition := replace(v_definition,'Tell DJM','ReDream AI');
    v_definition := replace(v_definition,'DJM','ReDream');
    v_definition := replace(v_definition,'''/tell?workspace=''||t.slug||''&capture=''', '''/workspace/''||t.slug||''/capture?capture=''');
    execute v_definition;
    select string_agg(format('%I',arg),', ' order by ord) into v_call
    from unnest(r.proargnames) with ordinality as args(arg,ord) where ord<=r.pronargs;
    execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as %L',
      r.proname,r.all_args,r.result_type,
      format('select public.%I(%s)',v_new,coalesce(v_call,'')));
    execute format('comment on function public.%I(%s) is %L',r.proname,r.identity_args,
      'Deprecated compatibility alias. Delegates to public.'||v_new||'; tenant security is identical.');
    v_role := case when r.proname in (
      'djm_tell_current_access','djm_tell_enqueue_capture','djm_tell_receipt','djm_tell_budget_status',
      'djm_tell_undo_action','djm_tell_context_for_route','djm_tell_create_confirmed_club',
      'djm_tell_create_confirmed_contact','djm_tell_answer_question','djm_tell_retry_capture',
      'djm_tell_recent_captures','djm_tell_delete_capture'
    ) then 'authenticated' else 'service_role' end;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',r.proname,r.identity_args);
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',v_new,r.identity_args);
    execute format('grant execute on function public.%I(%s) to %I',r.proname,r.identity_args,v_role);
    execute format('grant execute on function public.%I(%s) to %I',v_new,r.identity_args,v_role);
  end loop;
end;
$canonical$;

create or replace function public.redream_ai_capture_workspace(p_capture_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_slug text; v_requested text;
begin
  if auth.uid() is null then raise exception 'Capture access denied' using errcode='42501'; end if;
  select t.slug into v_slug
  from djm_os.captures c join platform.tenants t on t.id=c.tenant_id
  join djm_os.tell_djm_permissions p on p.tenant_id=c.tenant_id and p.user_id=auth.uid() and p.is_enabled
  where c.id=p_capture_id and c.processing_version='tell_djm_v1'
    and private.user_has_staff_tenant_access(c.tenant_id,auth.uid())
    and (c.submitted_by=auth.uid() or p.permission_scope='full');
  v_requested := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-redream-workspace';
  if v_slug is null or (v_requested is not null and v_requested<>v_slug) then
    raise exception 'Capture access denied' using errcode='42501';
  end if;
  return v_slug;
end;
$$;
revoke all on function public.redream_ai_capture_workspace(uuid) from public,anon;
grant execute on function public.redream_ai_capture_workspace(uuid) to authenticated;
