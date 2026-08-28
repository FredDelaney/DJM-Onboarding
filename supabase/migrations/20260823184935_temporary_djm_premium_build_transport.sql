create table if not exists private.djm_build_chunks (idx integer primary key, data text not null);
revoke all on table private.djm_build_chunks from public, anon, authenticated;
create or replace function public.get_djm_build_chunk(chunk_index integer, build_key text)
returns text
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
begin
  if build_key <> 'djm-premium-20260823' then
    raise exception 'not found';
  end if;
  return (select data from private.djm_build_chunks where idx=chunk_index);
end;
$$;
revoke all on function public.get_djm_build_chunk(integer,text) from public;
grant execute on function public.get_djm_build_chunk(integer,text) to anon, authenticated, service_role;
