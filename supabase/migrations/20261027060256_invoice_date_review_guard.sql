begin;

-- Extend only the existing invoice review gate. Draft save, tenant/role guards,
-- immutable recipient snapshots, payment/manual provenance and all grants stay intact.
do $patch$
declare
  target regprocedure := 'public.redream_documents(text,text,uuid,integer,jsonb)'::regprocedure;
  original pg_proc%rowtype;
  updated pg_proc%rowtype;
  definition text;
  patched text;
  anchor text := $anchor$  if doc.kind='invoice' then
$anchor$;
  addition text := $addition$    -- Drafts stay editable; external/manual lifecycle actions require real ordered dates.
    if coalesce(doc.content->'fields'->>'issue_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(doc.content->'fields'->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Use valid invoice dates';
    end if;
    begin
      perform (doc.content->'fields'->>'issue_date')::date;
      perform (doc.content->'fields'->>'due_date')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Use valid invoice dates';
    end;
    if (doc.content->'fields'->>'due_date')::date < (doc.content->'fields'->>'issue_date')::date then
      raise exception 'Due date must be on or after the issue date';
    end if;
$addition$;
begin
  select * into strict original from pg_proc where oid=target;
  if not original.prosecdef or original.proconfig is distinct from array['search_path=""']::text[]
    or original.provolatile<>'v' then raise exception 'Unexpected document writer security settings'; end if;
  if md5(original.prosrc)='3bd8623f7cb0bac0a722f7dcb389abc2' then return; end if;
  if md5(original.prosrc)<>'fd0101533fcf451d7b82ee66df4f3be6' then
    raise exception 'Unexpected redream_documents source; review before invoice date patch';
  end if;
  if (length(original.prosrc)-length(replace(original.prosrc,anchor,'')))/length(anchor)<>1 then
    raise exception 'Expected one invoice review anchor';
  end if;
  patched:=replace(original.prosrc,anchor,anchor||addition);
  if md5(patched)<>'3bd8623f7cb0bac0a722f7dcb389abc2' then raise exception 'Unexpected invoice date patch result'; end if;
  definition:=pg_get_functiondef(target);
  execute replace(definition,original.prosrc,patched);
  select * into strict updated from pg_proc where oid=target;
  if updated.proowner<>original.proowner or updated.proacl is distinct from original.proacl
    or updated.proconfig is distinct from original.proconfig or updated.prosecdef<>original.prosecdef
    or updated.provolatile<>original.provolatile or md5(updated.prosrc)<>'3bd8623f7cb0bac0a722f7dcb389abc2' then
    raise exception 'Invoice date patch changed the writer contract';
  end if;
end $patch$;

commit;
