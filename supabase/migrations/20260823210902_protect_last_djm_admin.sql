create or replace function private.protect_admin_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  admin_count integer;
  actor_email text;
begin
  select email into actor_email from public.profiles where id=auth.uid();
  select count(*) into admin_count from public.admin_allowlist where role='admin';

  if tg_op='DELETE' then
    if lower(coalesce(actor_email,''))=lower(old.email) then
      raise exception 'You cannot remove your own DJM access';
    end if;
    if old.role='admin' and admin_count<=1 then
      raise exception 'DJM must always have at least one admin';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' then
    if lower(coalesce(actor_email,''))=lower(old.email) and new.role is distinct from old.role then
      raise exception 'You cannot change your own DJM role';
    end if;
    if old.role='admin' and new.role<>'admin' and admin_count<=1 then
      raise exception 'DJM must always have at least one admin';
    end if;
    new.email:=lower(trim(new.email));
    return new;
  end if;

  if tg_op='INSERT' then
    new.email:=lower(trim(new.email));
    return new;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_admin_allowlist on public.admin_allowlist;
create trigger protect_admin_allowlist before insert or update or delete on public.admin_allowlist for each row execute function private.protect_admin_allowlist();
