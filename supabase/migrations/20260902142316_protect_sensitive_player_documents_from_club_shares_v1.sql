create or replace function private.prevent_sensitive_player_document_share()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
begin
  if coalesce(new.club_shareable,false)
     and lower(coalesce(new.document_type,'')) in ('passport','visa','id','medical','contract','agreement') then
    new.club_shareable := false;
  end if;
  return new;
end;
$function$;

revoke execute on function private.prevent_sensitive_player_document_share() from public;
revoke execute on function private.prevent_sensitive_player_document_share() from anon;
revoke execute on function private.prevent_sensitive_player_document_share() from authenticated;

drop trigger if exists trg_prevent_sensitive_player_document_share on public.player_documents;
create trigger trg_prevent_sensitive_player_document_share
before insert or update of club_shareable, document_type
on public.player_documents
for each row
execute function private.prevent_sensitive_player_document_share();

update public.player_documents
set club_shareable = false
where coalesce(club_shareable,false)
  and lower(coalesce(document_type,'')) in ('passport','visa','id','medical','contract','agreement');
