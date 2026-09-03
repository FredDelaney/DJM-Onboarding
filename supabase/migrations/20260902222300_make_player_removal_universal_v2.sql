create or replace function djm_os.detach_retained_football_intelligence_before_player_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prospect_id uuid;
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(old.preferred_name), ''),
    nullif(trim(concat_ws(' ', old.first_name, old.last_name)), ''),
    'Former DJM player'
  );

  select sp.id
  into v_prospect_id
  from djm_os.scouting_prospects sp
  where sp.signed_player_id = old.id
     or sp.linked_player_id = old.id
  order by sp.updated_at desc
  limit 1;

  if v_prospect_id is null
     and exists (
       select 1
       from djm_os.football_intelligence_subjects s
       where s.player_id = old.id
         and s.prospect_id is null
     ) then
    insert into djm_os.scouting_prospects(
      linked_player_id,
      full_name,
      date_of_birth,
      nationality,
      current_club,
      current_country,
      primary_position,
      transfermarkt_url,
      wyscout_url,
      canonical_key,
      source,
      recruitment_source,
      notes
    ) values (
      old.id,
      v_name,
      old.date_of_birth,
      nullif(array_to_string(old.nationalities, ', '), ''),
      old.current_club,
      old.current_country,
      old.primary_position,
      old.transfermarkt_url,
      old.wyscout_url,
      coalesce(
        nullif(old.football_provider_ids->>'canonical', ''),
        lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'))
      ),
      'player_removal_archive',
      'former_signed_player',
      'Retained automatically when the signed DJM player record was removed.'
    )
    returning id into v_prospect_id;
  end if;

  update djm_os.football_intelligence_subjects
  set
    prospect_id = coalesce(prospect_id, v_prospect_id),
    player_id = null,
    representation_status = 'prospect',
    updated_at = now()
  where player_id = old.id
    and (prospect_id is not null or v_prospect_id is not null);

  update djm_os.scouting_prospects
  set
    signed_player_id = case when signed_player_id = old.id then null else signed_player_id end,
    linked_player_id = case when linked_player_id = old.id then null else linked_player_id end,
    updated_at = now()
  where signed_player_id = old.id
     or linked_player_id = old.id;

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
