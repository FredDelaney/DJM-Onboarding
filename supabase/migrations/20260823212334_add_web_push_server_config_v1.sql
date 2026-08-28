create table if not exists private.web_push_config (
  singleton boolean primary key default true check (singleton),
  subject text not null,
  public_key text not null,
  private_key text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.get_web_push_config()
returns table(subject text, public_key text, private_key text)
language sql
stable
security definer
set search_path=private,pg_catalog
as $$ select subject,public_key,private_key from private.web_push_config where singleton=true limit 1 $$;
revoke all on function public.get_web_push_config() from public,anon,authenticated;
grant execute on function public.get_web_push_config() to service_role;
