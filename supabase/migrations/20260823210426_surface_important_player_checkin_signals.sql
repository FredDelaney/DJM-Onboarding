create or replace function private.surface_checkin_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_action text;
  v_priority text := 'high';
begin
  if nullif(trim(coalesce(new.support_request,'')),'') is not null then
    v_action := 'Player needs DJM: ' || left(trim(new.support_request),180);
  elsif new.club_situation_changed then
    v_action := 'Review player club / contract situation';
  elsif new.availability_status in ('unavailable','limited') then
    v_action := 'Review player availability: ' || new.availability_status;
  elsif new.fitness_status in ('injured','managing') then
    v_action := 'Review player fitness update: ' || replace(new.fitness_status,'_',' ');
  end if;

  if v_action is not null then
    update public.players
       set next_action = v_action,
           next_action_due = current_date,
           agency_priority = case when agency_priority='urgent' then 'urgent' else v_priority end,
           updated_at = now()
     where id = new.player_id;
  end if;
  return new;
end;
$$;

drop trigger if exists surface_checkin_signal on public.weekly_checkins;
create trigger surface_checkin_signal
after insert or update on public.weekly_checkins
for each row execute function private.surface_checkin_signal();
