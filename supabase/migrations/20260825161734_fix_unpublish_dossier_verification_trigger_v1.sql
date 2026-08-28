drop trigger if exists trg_unpublish_dossier_when_verification_is_lost on public.players;

create trigger trg_unpublish_dossier_when_verification_is_lost
after update on public.players
for each row
execute function private.unpublish_dossier_when_verification_is_lost();
