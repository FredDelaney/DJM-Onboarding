create or replace function djm_os.clean_recruitment_player_name()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.full_name is not null then
    new.full_name := btrim(regexp_replace(new.full_name, '^\s*#\s*\d{1,3}\s+', '', 'i'));
  end if;
  return new;
end
$function$;

drop trigger if exists trg_clean_recruitment_player_name on djm_os.scouting_prospects;
create trigger trg_clean_recruitment_player_name
before insert or update of full_name on djm_os.scouting_prospects
for each row
execute function djm_os.clean_recruitment_player_name();
