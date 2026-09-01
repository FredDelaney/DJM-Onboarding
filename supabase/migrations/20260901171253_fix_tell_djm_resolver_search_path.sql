-- Fix Tell DJM entity resolution when function search_path is locked down.
-- pg_trgm is installed in the extensions schema, so similarity() must be schema-qualified.

do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'djm_tell_resolve_entity'
  limit 1;

  if v_oid is null then
    raise exception 'public.djm_tell_resolve_entity not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_def := replace(v_def, 'similarity(', 'extensions.similarity(');
  execute v_def;
end
$$;

notify pgrst, 'reload schema';
