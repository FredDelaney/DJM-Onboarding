-- Restore a missing canonical Auth INSERT trigger without replacing a working
-- trigger, changing its function body or touching existing accounts.
do $repair$
declare
 expected oid := to_regprocedure('private.handle_new_user()');
 existing record;
begin
 if expected is null then raise exception 'Auth signup function is missing; trigger wiring was not changed';end if;
 select * into existing from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created' and not tgisinternal;
 if found then
  if existing.tgfoid=expected and existing.tgtype=5 and existing.tgenabled in ('O','A') and existing.tgqual is null and existing.tgnargs=0 then return;end if;
  raise exception 'Unexpected Auth signup trigger definition; existing wiring was preserved';
 end if;
 if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal and (tgtype::integer & 4)=4) then
  raise exception 'Other Auth INSERT trigger exists; review wiring before restoring the canonical trigger';
 end if;
 if position('verified_staff_invite_token_at_auth_insert_v2' in pg_get_functiondef(expected))=0 then
  raise exception 'Verified staff signup repair is required before restoring Auth trigger wiring';
 end if;
 create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
end;
$repair$;
