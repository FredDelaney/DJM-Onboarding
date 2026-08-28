create or replace function private.unpublish_dossier_when_verification_is_lost()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.verification_status = 'verified'
     and (
       new.verification_status is distinct from 'verified'
       or new.verified_at is null
     ) then
    update public.player_public_profiles
    set published = false
    where player_id = new.id
      and published = true;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_unpublish_dossier_when_verification_is_lost on public.players;
create trigger trg_unpublish_dossier_when_verification_is_lost
after update of verification_status, verified_at on public.players
for each row
execute function private.unpublish_dossier_when_verification_is_lost();
