create or replace function djm_os.detach_retained_football_intelligence_before_player_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update djm_os.scouting_prospects
  set
    signed_player_id = case when signed_player_id = old.id then null else signed_player_id end,
    linked_player_id = case when linked_player_id = old.id then null else linked_player_id end,
    updated_at = now()
  where signed_player_id = old.id
     or linked_player_id = old.id;

  update djm_os.football_intelligence_subjects
  set
    player_id = null,
    representation_status = 'prospect',
    updated_at = now()
  where player_id = old.id
    and prospect_id is not null;

  return old;
end;
$function$;

revoke execute on function djm_os.detach_retained_football_intelligence_before_player_delete() from public;
revoke execute on function djm_os.detach_retained_football_intelligence_before_player_delete() from anon;
revoke execute on function djm_os.detach_retained_football_intelligence_before_player_delete() from authenticated;

drop trigger if exists trg_detach_retained_football_intelligence_before_player_delete on public.players;
create trigger trg_detach_retained_football_intelligence_before_player_delete
before delete on public.players
for each row
execute function djm_os.detach_retained_football_intelligence_before_player_delete();
